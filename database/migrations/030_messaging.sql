-- BlinkJob — 030: M21 (chat contestuale azienda-lavoratore — PRD sez. 22 "MSG-001..004").
-- Una conversazione per coppia (job, worker) — stessa chiave di `applications` (unique job_id,
-- worker_id, 003): la chat è "contestuale" a una candidatura/incarico, non un DM libero fra
-- estranei. Può essere creata solo se esiste già una candidatura per quella coppia (get_or_create_
-- conversation lo verifica), così non diventa un canale di contatto diretto prima che l'azienda
-- abbia davvero valutato il lavoratore.
--
-- Mascheramento contatti (MSG-002, "should have"): euristica via regex su email e sequenze
-- numeriche lunghe (telefoni), non un NLP dedicato — stesso compromesso "reale ma non perfetto"
-- già documentato per BlinkNow (025) e i KPI (029). Falsi positivi/negativi possibili, ma copre il
-- caso comune (scambiarsi email/numero per uscire dalla piattaforma).

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  worker_id uuid not null references worker_profiles(user_id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id),
  body text not null,
  contains_masked_contact boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  reporter_id uuid not null references users(id),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table conversations enable row level security;
alter table messages enable row level security;
alter table message_reports enable row level security;

drop policy if exists conversations_read on conversations;
create policy conversations_read on conversations for select
  using (worker_id = auth.uid() or is_company_member(company_id));

drop policy if exists messages_read on messages;
create policy messages_read on messages for select
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id and (c.worker_id = auth.uid() or is_company_member(c.company_id))
  ));

drop policy if exists message_reports_read on message_reports;
create policy message_reports_read on message_reports for select
  using (reporter_id = auth.uid() or is_admin_or_support());

-- Nessuna policy insert diretta: creazione conversazione, invio messaggio e segnalazione passano
-- tutte da RPC security definer (stesso motivo di notify_on_* in 022 — serve validare
-- l'appartenenza/candidatura e, per i messaggi, applicare il mascheramento in modo atomico).

create or replace function public.get_or_create_conversation(p_job_id uuid, p_worker_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job jobs%rowtype;
  v_conversation_id uuid;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found then
    raise exception 'Job not found';
  end if;

  if not (auth.uid() = p_worker_id or is_company_member(v_job.company_id)) then
    raise exception 'Not authorized to open this conversation';
  end if;

  if not exists (
    select 1 from applications where job_id = p_job_id and worker_id = p_worker_id
  ) then
    raise exception 'Nessuna candidatura trovata per questo incarico e lavoratore';
  end if;

  select id into v_conversation_id from conversations
  where job_id = p_job_id and worker_id = p_worker_id;

  if v_conversation_id is null then
    insert into conversations (job_id, worker_id, company_id)
    values (p_job_id, p_worker_id, v_job.company_id)
    returning id into v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$;

create or replace function public.send_message(p_conversation_id uuid, p_body text)
returns messages
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_conversation conversations%rowtype;
  v_body text;
  v_masked boolean := false;
  v_message messages%rowtype;
begin
  select * into v_conversation from conversations where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found';
  end if;

  if not (v_conversation.worker_id = auth.uid() or is_company_member(v_conversation.company_id)) then
    raise exception 'Not authorized to post in this conversation';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'Message body cannot be empty';
  end if;

  v_body := regexp_replace(v_body, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contatto rimosso]', 'g');
  v_body := regexp_replace(v_body, '(\+?[0-9][0-9 .-]{7,}[0-9])', '[contatto rimosso]', 'g');
  v_masked := v_body <> trim(p_body);

  insert into messages (conversation_id, sender_id, body, contains_masked_contact)
  values (p_conversation_id, auth.uid(), v_body, v_masked)
  returning * into v_message;

  if auth.uid() = v_conversation.worker_id then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'message_received',
      jsonb_build_object('conversation_id', p_conversation_id, 'job_id', v_conversation.job_id)
    from company_members cm
    where cm.company_id = v_conversation.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_conversation.worker_id, 'message_received',
      jsonb_build_object('conversation_id', p_conversation_id, 'job_id', v_conversation.job_id)
    );
  end if;

  return v_message;
end;
$$;

create or replace function public.report_message(p_message_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_conversation conversations%rowtype;
begin
  select c.* into v_conversation
  from messages m join conversations c on c.id = m.conversation_id
  where m.id = p_message_id;

  if not found then
    raise exception 'Message not found';
  end if;

  if not (v_conversation.worker_id = auth.uid() or is_company_member(v_conversation.company_id)) then
    raise exception 'Not authorized to report this message';
  end if;

  insert into message_reports (message_id, reporter_id, reason)
  values (p_message_id, auth.uid(), nullif(trim(coalesce(p_reason, '')), ''));
end;
$$;

revoke all on function public.get_or_create_conversation(uuid, uuid) from public;
revoke all on function public.send_message(uuid, text) from public;
revoke all on function public.report_message(uuid, text) from public;
grant execute on function public.get_or_create_conversation(uuid, uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.report_message(uuid, text) to authenticated;
