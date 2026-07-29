-- BlinkJob — 025: M16 (BlinkNow completo — PRD sez. 9.1, requisiti BNW-001..006).
-- 023 implementava solo il meccanismo (flag → urgenza → boost matching → notifica opt-in),
-- documentando esplicitamente che pricing/SLA/ondate/lista d'attesa/rimborso mancavano perché
-- richiedevano numeri di business non ancora decisi. Qui si costruisce il resto, con valori v1
-- hardcoded (stesso pattern di `calculate_platform_fee_cents`, 018) finché il founder non decide
-- pricing reali — la struttura resta la stessa, cambiano solo le costanti.
--
-- Semplificazioni MVP documentate (deliberate, non dimenticanze):
-- 1. "Distribuzione a ondate" (BNW-002): il PRD non impone che le ondate siano scaglionate nel
--    tempo, solo che "ogni ondata registri raggio, destinatari e conversioni". Questo stack non
--    ha uno scheduler in background (nessun cron/worker) — le ondate vengono quindi calcolate e
--    notificate tutte insieme alla pubblicazione, ma REGISTRATE separatamente per raggio, cosa
--    che soddisfa il criterio di accettazione letterale. Un vero scaglionamento temporale richiede
--    un job scheduler (fuori scope di questa migration, richiede infrastruttura aggiuntiva).
-- 2. BNW-006 (rimborso automatico): senza scheduler, la regola di rimborso è esposta come RPC
--    (`process_blinknow_refunds`) invocabile dal pannello admin invece che da un vero cron.
-- 3. BNW-004 (lista d'attesa automatica): il ranking completo (disponibilità/competenze/
--    affidabilità) vive in TypeScript (`lib/matching/engine.ts`), non duplicato qui in PL/pgSQL.
--    Il candidato successivo è scelto per distanza (proxy deterministico, stesso ordine di
--    idoneità geografica già usato da `candidate_workers_for_job`), non per punteggio completo.
-- 4. Fee flat v1 (nessuna variazione per città/categoria): il PRD lascia SLA/pricing "per città/
--    categoria" a una decisione del founder — finché non arriva, un valore unico è la scelta più
--    semplice (CLAUDE.md: "usa la soluzione più semplice quando manca una decisione").

alter table jobs add column if not exists blinknow_fee_cents int;
alter table jobs add column if not exists blinknow_fee_status text
  check (blinknow_fee_status in ('none', 'pending', 'refunded'))
  not null default 'none';
alter table jobs add column if not exists blinknow_response_deadline timestamptz;

create or replace function public.calculate_blinknow_fee_cents()
returns int
language sql
immutable
set search_path = public, extensions
as $$
  -- v1: fee flat, nessuna variazione per città/categoria (non ancora decisa dal founder).
  select 1500;
$$;

-- Livello BlinkPoints di un utente, dedotto dal totale punti — soglie v1 hardcoded, tenute
-- allineate manualmente a lib/points/levels.ts (stesso pattern di calculate_platform_fee_cents
-- duplicato in lib/payments/fees.ts per i test unitari, 018).
create or replace function public.worker_points_level(p_user_id uuid)
returns smallint
language sql
stable
set search_path = public, extensions
as $$
  select case
    when coalesce((select sum(points) from points_ledger where user_id = p_user_id), 0) >= 600 then 3
    when coalesce((select sum(points) from points_ledger where user_id = p_user_id), 0) >= 300 then 2
    when coalesce((select sum(points) from points_ledger where user_id = p_user_id), 0) >= 100 then 1
    else 0
  end;
$$;

-- BNW-001: attivazione con fee e SLA (countdown) espliciti, confermati contestualmente
-- dall'azienda (il pulsante "Attiva BlinkNow" nella UI mostra fee e scadenza prima del click).
create or replace function public.set_job_blinknow(p_job_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_company companies%rowtype;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found then
    raise exception 'Job not found';
  end if;

  if not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to modify this job';
  end if;

  if v_job.status <> 'draft' then
    raise exception 'BlinkNow can only be toggled while the job is a draft (status: %)', v_job.status;
  end if;

  if p_enabled then
    select * into v_company from companies where id = v_job.company_id;
    if v_company.status <> 'active' then
      raise exception 'Only verified (active) companies can activate BlinkNow';
    end if;
    if not is_blinknow_enabled_for_job(v_job.category) then
      raise exception 'BlinkNow is not enabled for this job category yet';
    end if;

    update jobs
    set urgency_tier = 'blinknow',
        blinknow_fee_cents = calculate_blinknow_fee_cents(),
        blinknow_fee_status = 'pending',
        blinknow_response_deadline = least(v_job.starts_at, now() + interval '6 hours')
    where id = p_job_id;
  else
    update jobs
    set urgency_tier = 'standard',
        blinknow_fee_cents = null,
        blinknow_fee_status = 'none',
        blinknow_response_deadline = null
    where id = p_job_id;
  end if;
end;
$$;

-- BNW-002: distribuzione a cerchi concentrici. Bande di distanza assolute dal luogo
-- dell'incarico (v1: 5/15/30 km, non ancora configurabili per città/categoria); i lavoratori con
-- un livello BlinkPoints più alto vengono promossi a un'ondata precedente (perk non monetario,
-- PTS-003-compliant: dipende da azioni verificate, non da acquisti). Ogni destinatario viene
-- registrato con la propria ondata/raggio nel payload della notifica — le conversioni si
-- calcolano a posteriori confrontando `created_at` con le candidature successive (query in
-- `blinknow_wave_stats`), senza bisogno di una tabella/trigger aggiuntivi.
create or replace function public.notify_on_blinknow_job_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location company_locations%rowtype;
  v_worker record;
  v_distance_km numeric;
  v_band smallint;
  v_wave smallint;
begin
  if new.status = 'published' and new.urgency_tier = 'blinknow'
     and (old.status is distinct from new.status or old.urgency_tier is distinct from new.urgency_tier) then

    select * into v_location from company_locations where id = new.location_id;

    for v_worker in
      select wp.user_id, ST_Distance(wp.home_location, v_location.location) / 1000.0 as distance_km
      from worker_profiles wp
      join users u on u.id = wp.user_id
      where wp.blinknow_opt_in = true
        and wp.home_location is not null
        and u.status not in ('suspended', 'blocked')
        and ST_Distance(wp.home_location, v_location.location) / 1000.0 <= wp.operating_radius_km
    loop
      v_distance_km := v_worker.distance_km;
      v_band := case
        when v_distance_km <= 5 then 1
        when v_distance_km <= 15 then 2
        when v_distance_km <= 30 then 3
        else 4
      end;
      v_wave := greatest(1, v_band - worker_points_level(v_worker.user_id));

      insert into notifications (user_id, event_type, payload)
      values (
        v_worker.user_id, 'blinknow_job_available',
        jsonb_build_object(
          'job_id', new.id, 'job_title', new.title,
          'wave_number', v_wave, 'distance_km', round(v_distance_km, 1)
        )
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_blinknow_job_published on jobs;
create trigger trg_notify_on_blinknow_job_published
  after update on jobs
  for each row execute function notify_on_blinknow_job_published();

-- BNW-002/BNW-005: statistiche per ondata (raggio implicito nel numero d'onda, destinatari,
-- conversioni) per il pannello operativo admin e per la pagina incarico dell'azienda.
create or replace function public.blinknow_wave_stats(p_job_id uuid)
returns table (wave_number int, notified_count bigint, applied_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from jobs j where j.id = p_job_id and (is_company_member(j.company_id) or is_admin_or_support())
  ) then
    raise exception 'Not authorized to view BlinkNow stats for this job';
  end if;

  return query
    select
      (n.payload->>'wave_number')::int as wave_number,
      count(*) as notified_count,
      count(*) filter (
        where exists (
          select 1 from applications a
          where a.job_id = p_job_id and a.worker_id = n.user_id and a.created_at >= n.created_at
        )
      ) as applied_count
    from notifications n
    where n.event_type = 'blinknow_job_available'
      and n.payload->>'job_id' = p_job_id::text
    group by (n.payload->>'wave_number')::int
    order by wave_number;
end;
$$;

-- BNW-004: lista d'attesa automatica. Alla cancellazione di un assignment su un incarico
-- BlinkNow ancora pubblicato, scaduto il quale restano posizioni scoperte, invita subito il
-- prossimo candidato geo-idoneo non ancora coinvolto (nessuna candidatura/invito precedente per
-- questo incarico) — l'invito richiede comunque l'accettazione del lavoratore
-- (`accept_invite`, 016) o la conferma dell'azienda: automatizziamo "chi è il prossimo", non la
-- conferma finale, restando coerenti con la supervisione umana richiesta altrove nel PRD (sez. 9.2).
create or replace function public.cancel_assignment(p_assignment_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
  v_location company_locations%rowtype;
  v_confirmed_count int;
  v_next_worker_id uuid;
begin
  select * into v_assignment from assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found';
  end if;

  select * into v_job from jobs where id = v_assignment.job_id;

  if v_assignment.worker_id <> auth.uid() and not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to cancel this assignment';
  end if;

  if v_assignment.status not in ('confirmed', 'in_progress') then
    raise exception 'Assignment can no longer be canceled (status: %)', v_assignment.status;
  end if;

  update assignments set status = 'canceled' where id = p_assignment_id;

  if p_note is not null then
    insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
    values (auth.uid(), 'assignment_canceled', 'assignment', p_assignment_id, jsonb_build_object('note', p_note));
  end if;

  if v_job.urgency_tier = 'blinknow' and v_job.status = 'published'
     and (v_job.blinknow_response_deadline is null or now() < v_job.blinknow_response_deadline) then

    select count(*) into v_confirmed_count from assignments where job_id = v_job.id and status <> 'canceled';

    if v_confirmed_count < v_job.positions_count then
      select * into v_location from company_locations where id = v_job.location_id;

      select wp.user_id into v_next_worker_id
      from worker_profiles wp
      join users u on u.id = wp.user_id
      where wp.home_location is not null
        and u.status not in ('suspended', 'blocked')
        and ST_Distance(wp.home_location, v_location.location) / 1000.0 <= wp.operating_radius_km
        and not exists (
          select 1 from applications a where a.job_id = v_job.id and a.worker_id = wp.user_id
        )
      order by ST_Distance(wp.home_location, v_location.location) asc
      limit 1;

      if v_next_worker_id is not null then
        insert into applications (job_id, worker_id, type, status)
        values (v_job.id, v_next_worker_id, 'invite', 'sent');

        insert into notifications (user_id, event_type, payload)
        values (
          v_next_worker_id, 'blinknow_waitlist_invite',
          jsonb_build_object('job_id', v_job.id, 'job_title', v_job.title)
        );
      end if;
    end if;
  end if;
end;
$$;

-- BNW-006: rimborso automatico della fee se, scaduta la finestra di risposta, nessuna posizione
-- risulta coperta. Senza uno scheduler in background, esposto come RPC invocabile dal pannello
-- admin (`process_blinknow_refunds`) invece che da un vero cron.
create or replace function public.process_blinknow_refunds()
returns table (job_id uuid, refunded_cents int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  return query
    with overdue as (
      select j.id, j.blinknow_fee_cents
      from jobs j
      where j.urgency_tier = 'blinknow'
        and j.blinknow_fee_status = 'pending'
        and j.blinknow_response_deadline is not null
        and j.blinknow_response_deadline < now()
        and not exists (select 1 from assignments a where a.job_id = j.id and a.status <> 'canceled')
    ),
    updated as (
      update jobs set blinknow_fee_status = 'refunded'
      where id in (select id from overdue)
      returning id, blinknow_fee_cents
    )
    select updated.id, updated.blinknow_fee_cents from updated;
end;
$$;

revoke all on function public.set_job_blinknow(uuid, boolean) from public;
revoke all on function public.blinknow_wave_stats(uuid) from public;
revoke all on function public.cancel_assignment(uuid, text) from public;
revoke all on function public.process_blinknow_refunds() from public;
grant execute on function public.set_job_blinknow(uuid, boolean) to authenticated;
grant execute on function public.blinknow_wave_stats(uuid) to authenticated;
grant execute on function public.cancel_assignment(uuid, text) to authenticated;
grant execute on function public.process_blinknow_refunds() to authenticated;
