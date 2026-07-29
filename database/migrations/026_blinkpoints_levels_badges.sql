-- BlinkJob — 026: M17 (BlinkPoints — livelli, ricompense non monetarie, badge — PRD PTS-002).
-- 024 implementava solo il ledger (PTS-001/003/004): punti assegnati, mai riscattabili. Qui si
-- aggiunge PTS-002 ("livelli e badge configurabili, regole versionate") con ricompense
-- deliberatamente NON monetarie: priorità nelle ondate BlinkNow (025) e un piccolo boost di
-- visibilità nel matching, mai un aumento di `reliability_score` (che resta derivato solo dalle
-- recensioni, 019 — PTS-003 "nessun pay-to-rank" resta rispettato per costruzione). PTS-005
-- (marketplace ricompense reali/monetarie) resta esplicitamente fuori scope: il PRD lo vieta
-- "solo dopo analisi fiscale e antifrode" — nessuna riga qui introduce denaro reale o sconti.
--
-- Semplificazioni MVP documentate:
-- 1. Soglie livello (100/300/600 punti) e valori badge hardcoded qui, tenute allineate a mano a
--    lib/points/levels.ts — stesso pattern già accettato per calculate_platform_fee_cents/
--    lib/payments/fees.ts (018) e worker_points_level (025).
-- 2. `worker_badges` è append-only per lo stesso motivo di `points_ledger` (PTS-001): un catalogo
--    di eventi verificabili, non un contenuto editabile.

-- Il matching lato azienda (features/matching/queries.ts) calcola il livello BlinkPoints dei
-- candidati per il boost di visibilità (lib/matching/engine.ts) — `points_ledger_owner_read`
-- (021) permette solo la lettura dei propri punti, quindi senza questa policy la query
-- restituirebbe righe vuote per ogni candidato e il livello risulterebbe sempre 0 lato azienda.
-- Stesso schema di `worker_badges_company_read_via_candidate` più sotto.
drop policy if exists points_ledger_company_read_via_candidate on points_ledger;
create policy points_ledger_company_read_via_candidate on points_ledger for select
  using (is_geo_candidate_for_company_job(user_id));

create table if not exists worker_badges (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references worker_profiles(user_id) on delete cascade,
  badge_key text not null,
  awarded_at timestamptz not null default now(),
  unique (worker_id, badge_key)
);

alter table worker_badges enable row level security;

drop policy if exists worker_badges_owner_read on worker_badges;
create policy worker_badges_owner_read on worker_badges for select
  using (worker_id = auth.uid() or is_admin_or_support());

-- I badge di un lavoratore sono un segnale di fiducia pensato anche per l'azienda che valuta un
-- candidato (mostrato nella lista candidati, 003/011) — stesso ragionamento di
-- `worker_profiles_company_read` (006): lettura per l'azienda solo sui candidati geo-idonei ai
-- propri incarichi pubblicati, mai un elenco libero di tutti i lavoratori.
drop policy if exists worker_badges_company_read_via_candidate on worker_badges;
create policy worker_badges_company_read_via_candidate on worker_badges for select
  using (is_geo_candidate_for_company_job(worker_id));

create or replace function public.award_badge(p_user_id uuid, p_badge_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select enabled_globally from feature_flags where key = 'blinkpoints_enabled'), false) then
    return;
  end if;

  insert into worker_badges (worker_id, badge_key)
  values (p_user_id, p_badge_key)
  on conflict (worker_id, badge_key) do nothing;
end;
$$;

-- Profilo completo: ora assegna anche il badge, oltre ai punti già esistenti (024).
create or replace function public.award_points_on_profile_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completeness_score = 100 and (tg_op = 'INSERT' or old.completeness_score < 100) then
    perform award_points(new.user_id, 50, 'profile_completed_badge', 'worker_profiles', new.user_id);
    perform award_badge(new.user_id, 'profilo_completo');
  end if;
  return new;
end;
$$;

-- Recensioni: 024 premiava solo chi SCRIVE una recensione. Qui si aggiunge un badge per chi la
-- RICEVE per la prima volta (costruzione della propria reputazione), senza toccare i punti
-- esistenti né introdurre un incentivo sul voto (il badge non dipende dal rating).
create or replace function public.award_points_on_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_review_count int;
begin
  perform award_points(new.author_id, 5, 'review_contributed', 'review', new.id);

  select count(*) into v_recipient_review_count
  from reviews where recipient_id = new.recipient_id and moderation_status = 'published';

  if v_recipient_review_count = 1 and exists (select 1 from worker_profiles where user_id = new.recipient_id) then
    perform award_badge(new.recipient_id, 'prima_recensione_ricevuta');
  end if;

  return new;
end;
$$;

-- Affidabilità 5 stelle: badge quando la media raggiunge 5.0 con almeno 3 recensioni pubblicate
-- (evita che un singolo voto fortunato lo assegni). Ridefinisce 019's trigger function.
create or replace function public.recompute_worker_reliability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg numeric;
  v_count int;
begin
  if exists (select 1 from worker_profiles where user_id = new.recipient_id) then
    select round(avg((rating_dimensions->>'overall')::numeric), 1), count(*)
    into v_avg, v_count
    from reviews
    where recipient_id = new.recipient_id and moderation_status = 'published';

    update worker_profiles set reliability_score = coalesce(v_avg, 0) where user_id = new.recipient_id;

    if v_avg = 5 and v_count >= 3 then
      perform award_badge(new.recipient_id, 'affidabile_5_stelle');
    end if;
  end if;
  return new;
end;
$$;

-- Dieci incarichi completati: ridefinisce 024's confirm_assignment_completion per aggiungere il
-- controllo soglia nello stesso passaggio atomico (nessun'altra logica cambiata).
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
  v_completed_count int;
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

  perform award_points(v_assignment.worker_id, 20, 'assignment_completed_no_issues', 'assignment', p_assignment_id);

  select count(*) into v_completed_count
  from assignments where worker_id = v_assignment.worker_id and status = 'completed';
  if v_completed_count >= 10 then
    perform award_badge(v_assignment.worker_id, 'dieci_incarichi_completati');
  end if;

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

-- Badge di livello: assegnati al superamento di una soglia punti. Valutati ad ogni movimento del
-- ledger (append-only, 024) invece che con un cron, coerente col resto di questa migration.
create or replace function public.award_level_badges_on_points_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level smallint;
begin
  v_level := worker_points_level(new.user_id);
  if v_level >= 1 then perform award_badge(new.user_id, 'livello_argento'); end if;
  if v_level >= 2 then perform award_badge(new.user_id, 'livello_oro'); end if;
  if v_level >= 3 then perform award_badge(new.user_id, 'livello_platino'); end if;
  return new;
end;
$$;

drop trigger if exists trg_award_level_badges_on_points_change on points_ledger;
create trigger trg_award_level_badges_on_points_change
  after insert on points_ledger
  for each row execute function award_level_badges_on_points_change();

revoke all on function public.award_badge(uuid, text) from public;
grant execute on function public.award_badge(uuid, text) to authenticated;
