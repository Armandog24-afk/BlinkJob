-- BlinkJob — 022: M12 (notifiche in-app — gap MVP must-have).
-- La tabella `notifications` esiste dalla 005 con RLS `notifications_owner` (005/006), ma nessun
-- codice applicativo la scrive: nessuna delle transizioni costruite in M2-M9 emette una notifica.
-- `notifications_owner` (using/with check su user_id = auth.uid()) non permette comunque a un
-- utente di notificare un ALTRO utente (es. l'azienda deve notificare il lavoratore quando
-- conferma la candidatura) — quindi l'emissione non può essere un insert diretto dal client,
-- deve avvenire dentro le funzioni security definer che già gestiscono ogni transizione
-- (bypassano la RLS), o in trigger per gli insert non ancora incapsulati in una RPC
-- (candidature, recensioni). Stesso pattern idempotente delle migration precedenti:
-- create or replace function, drop/create trigger.

-- Candidature/inviti: nessuna RPC li incapsula (insert diretto via applications_worker_insert /
-- applications_company_invite_insert), quindi qui serve un trigger.
create or replace function public.notify_on_application_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
begin
  select * into v_job from jobs where id = new.job_id;

  if new.type = 'application' then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'application_received',
      jsonb_build_object('job_id', v_job.id, 'job_title', v_job.title, 'application_id', new.id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      new.worker_id, 'invite_received',
      jsonb_build_object('job_id', v_job.id, 'job_title', v_job.title, 'application_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_application_insert on applications;
create trigger trg_notify_on_application_insert
  after insert on applications
  for each row execute function notify_on_application_insert();

-- Recensioni: idem, insert diretto (reviews_insert, 019), non una RPC.
create or replace function public.notify_on_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, event_type, payload)
  values (
    new.recipient_id, 'review_received',
    jsonb_build_object('assignment_id', new.assignment_id, 'rating', new.rating_dimensions->>'overall')
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_on_review_insert on reviews;
create trigger trg_notify_on_review_insert
  after insert on reviews
  for each row execute function notify_on_review_insert();

-- Da qui in poi: transizioni già incapsulate in RPC security definer (014/016/017/018/020),
-- ridefinite per aggiungere l'emissione della notifica nello stesso passaggio atomico.

create or replace function public.confirm_candidate(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_application applications%rowtype;
  v_location company_locations%rowtype;
  v_confirmed_count int;
  v_assignment_id uuid;
  v_snapshot jsonb;
begin
  select * into v_application from applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;

  select * into v_job from jobs where id = v_application.job_id;

  if not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to confirm this application';
  end if;

  if v_application.status not in ('sent', 'viewed', 'shortlisted', 'info_requested') then
    raise exception 'Application is not in a confirmable state (status: %)', v_application.status;
  end if;

  select count(*) into v_confirmed_count
  from assignments
  where job_id = v_job.id and status <> 'canceled';

  if v_confirmed_count >= v_job.positions_count then
    raise exception 'All positions for this job are already filled';
  end if;

  select * into v_location from company_locations where id = v_job.location_id;

  v_snapshot := jsonb_build_object(
    'job_title', v_job.title,
    'pay_amount_cents', v_job.pay_amount_cents,
    'pay_currency', v_job.pay_currency,
    'starts_at', v_job.starts_at,
    'ends_at', v_job.ends_at,
    'location_label', v_location.label,
    'location_address', v_location.address,
    'job_version', v_job.version
  );

  update applications set status = 'accepted' where id = p_application_id;

  insert into assignments (application_id, job_id, worker_id, status, confirmed_terms_snapshot)
  values (p_application_id, v_job.id, v_application.worker_id, 'confirmed', v_snapshot)
  returning id into v_assignment_id;

  insert into notifications (user_id, event_type, payload)
  values (
    v_application.worker_id, 'application_accepted',
    jsonb_build_object('job_title', v_job.title, 'assignment_id', v_assignment_id)
  );

  return v_assignment_id;
end;
$$;

create or replace function public.accept_invite(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_application applications%rowtype;
  v_location company_locations%rowtype;
  v_confirmed_count int;
  v_assignment_id uuid;
  v_snapshot jsonb;
begin
  select * into v_application from applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;

  if v_application.worker_id <> auth.uid() then
    raise exception 'Not authorized to accept this invite';
  end if;

  if v_application.type <> 'invite' or v_application.status <> 'sent' then
    raise exception 'Invite is not in an acceptable state (status: %)', v_application.status;
  end if;

  select * into v_job from jobs where id = v_application.job_id;

  select count(*) into v_confirmed_count
  from assignments
  where job_id = v_job.id and status <> 'canceled';

  if v_confirmed_count >= v_job.positions_count then
    raise exception 'All positions for this job are already filled';
  end if;

  select * into v_location from company_locations where id = v_job.location_id;

  v_snapshot := jsonb_build_object(
    'job_title', v_job.title,
    'pay_amount_cents', v_job.pay_amount_cents,
    'pay_currency', v_job.pay_currency,
    'starts_at', v_job.starts_at,
    'ends_at', v_job.ends_at,
    'location_label', v_location.label,
    'location_address', v_location.address,
    'job_version', v_job.version
  );

  update applications set status = 'accepted' where id = p_application_id;

  insert into assignments (application_id, job_id, worker_id, status, confirmed_terms_snapshot)
  values (p_application_id, v_job.id, v_application.worker_id, 'confirmed', v_snapshot)
  returning id into v_assignment_id;

  insert into notifications (user_id, event_type, payload)
  select cm.user_id, 'invite_accepted',
    jsonb_build_object('job_title', v_job.title, 'assignment_id', v_assignment_id)
  from company_members cm
  where cm.company_id = v_job.company_id;

  return v_assignment_id;
end;
$$;

create or replace function public.check_in_assignment(
  p_assignment_id uuid,
  p_method check_event_method default 'manual',
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
begin
  select * into v_assignment from assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found';
  end if;

  if v_assignment.worker_id <> auth.uid() then
    raise exception 'Not authorized to check in on this assignment';
  end if;

  if v_assignment.status <> 'confirmed' then
    raise exception 'Assignment is not in a checkable-in state (status: %)', v_assignment.status;
  end if;

  insert into check_events (assignment_id, type, method, note)
  values (p_assignment_id, 'check_in', p_method, p_note);

  update assignments set status = 'in_progress' where id = p_assignment_id;

  select * into v_job from jobs where id = v_assignment.job_id;
  insert into notifications (user_id, event_type, payload)
  select cm.user_id, 'assignment_checked_in',
    jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
  from company_members cm
  where cm.company_id = v_job.company_id;
end;
$$;

create or replace function public.confirm_assignment_completion(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
  v_gross int;
  v_fee int;
  v_confirmed_by_worker boolean;
begin
  select * into v_assignment from assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found';
  end if;

  select * into v_job from jobs where id = v_assignment.job_id;

  if v_assignment.worker_id <> auth.uid() and not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to confirm completion of this assignment';
  end if;

  if v_assignment.status <> 'in_progress' then
    raise exception 'Assignment is not in progress (status: %)', v_assignment.status;
  end if;

  if not exists (
    select 1 from check_events where assignment_id = p_assignment_id and type = 'check_out'
  ) then
    raise exception 'Cannot confirm completion before check-out';
  end if;

  v_confirmed_by_worker := v_assignment.worker_id = auth.uid();

  update assignments set status = 'completed' where id = p_assignment_id;

  v_gross := (v_assignment.confirmed_terms_snapshot->>'pay_amount_cents')::int;
  v_fee := calculate_platform_fee_cents(v_gross);

  insert into payments (
    assignment_id, gross_amount_cents, platform_fee_cents, fee_version, net_amount_cents,
    currency, status, provider
  )
  values (
    p_assignment_id, v_gross, v_fee, 'v1', v_gross - v_fee,
    coalesce(v_assignment.confirmed_terms_snapshot->>'pay_currency', 'EUR'), 'pending', 'tracked_ledger'
  );

  -- Notifica la controparte (chi ha confermato lo sa già).
  if v_confirmed_by_worker then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'assignment_completed',
      jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_assignment.worker_id, 'assignment_completed',
      jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
    );
  end if;
end;
$$;

create or replace function public.mark_payment_paid(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments%rowtype;
  v_job jobs%rowtype;
  v_worker_id uuid;
begin
  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;

  select j.* into v_job
  from assignments a join jobs j on j.id = a.job_id where a.id = v_payment.assignment_id;
  select worker_id into v_worker_id from assignments where id = v_payment.assignment_id;

  if not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to mark this payment as paid';
  end if;

  if v_payment.status <> 'confirmed' then
    raise exception 'Payment is not confirmed (status: %)', v_payment.status;
  end if;

  update payments set status = 'paid' where id = p_payment_id;

  insert into notifications (user_id, event_type, payload)
  values (
    v_worker_id, 'payment_paid',
    jsonb_build_object('job_title', v_job.title, 'net_amount_cents', v_payment.net_amount_cents)
  );
end;
$$;

create or replace function public.open_dispute(p_assignment_id uuid, p_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute_id uuid;
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
  v_opened_by_worker boolean;
begin
  select * into v_assignment from assignments where id = p_assignment_id;
  select * into v_job from jobs where id = v_assignment.job_id;

  if not (v_assignment.worker_id = auth.uid() or is_company_member(v_job.company_id)) then
    raise exception 'Not authorized to open a dispute for this assignment';
  end if;

  v_opened_by_worker := v_assignment.worker_id = auth.uid();

  insert into disputes (assignment_id, opened_by, type, status)
  values (p_assignment_id, auth.uid(), p_type, 'open')
  returning id into v_dispute_id;

  if v_opened_by_worker then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'dispute_opened',
      jsonb_build_object('job_title', v_job.title, 'dispute_id', v_dispute_id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_assignment.worker_id, 'dispute_opened',
      jsonb_build_object('job_title', v_job.title, 'dispute_id', v_dispute_id)
    );
  end if;

  return v_dispute_id;
end;
$$;

create or replace function public.resolve_dispute(p_dispute_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute disputes%rowtype;
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  select * into v_dispute from disputes where id = p_dispute_id;
  select * into v_assignment from assignments where id = v_dispute.assignment_id;
  select * into v_job from jobs where id = v_assignment.job_id;

  update disputes set status = 'resolved', resolution = p_resolution where id = p_dispute_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_resolve_dispute', 'dispute', p_dispute_id, jsonb_build_object('resolution', p_resolution));

  insert into notifications (user_id, event_type, payload)
  values (
    v_assignment.worker_id, 'dispute_resolved',
    jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id, 'resolution', p_resolution)
  );
  insert into notifications (user_id, event_type, payload)
  select cm.user_id, 'dispute_resolved',
    jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id, 'resolution', p_resolution)
  from company_members cm
  where cm.company_id = v_job.company_id;
end;
$$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status user_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  update users set status = p_status where id = p_user_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_set_user_status', 'user', p_user_id, jsonb_build_object('status', p_status));

  insert into notifications (user_id, event_type, payload)
  values (p_user_id, 'account_status_changed', jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_set_company_status(p_company_id uuid, p_status company_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  update companies set status = p_status where id = p_company_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_set_company_status', 'company', p_company_id, jsonb_build_object('status', p_status));

  insert into notifications (user_id, event_type, payload)
  select cm.user_id, 'company_status_changed', jsonb_build_object('status', p_status)
  from company_members cm
  where cm.company_id = p_company_id;
end;
$$;

-- "Segna come letta" non richiede una RPC: la policy notifications_owner (006) già permette
-- al destinatario di aggiornare le proprie righe (using/with check su user_id = auth.uid()) —
-- un update diretto dal client via supabase-js basta, stesso ragionamento di 014 per l'insert
-- di invito diretto.
