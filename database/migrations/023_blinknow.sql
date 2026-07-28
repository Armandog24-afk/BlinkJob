-- BlinkJob — 023: M13 (BlinkNow — modalità urgente, PRD sez. 9.1 / EPIC 11).
-- Ambito volutamente limitato a ciò che TECH_ARCHITECTURE.md (sez. 7) dichiara come già
-- predisposto: campo `urgency_tier` su jobs + feature flag `blinknow_enabled` — "pricing e SLA
-- aggiuntivi non implementati ora". Il PRD descrive BlinkNow come feature post-MVP con
-- dipendenze operative reali (SLA per città/categoria, on-call, distribuzione a cerchi
-- concentrici, fee premium) che il founder non ha ancora deciso (roadmap sez. 24, OQ-07):
-- costruire quella parte ora significherebbe inventare numeri di business. Qui si implementa
-- solo il meccanismo (flag → urgenza → boost di matching → notifica opt-in), non il pricing.
--
-- Niente gating per città: né `jobs` né `company_locations` hanno un campo città strutturato
-- (solo geography point + label libera) — `feature_flags.enabled_cities` resta quindi non
-- utilizzato in questa fase, gating solo su categoria. Documentato, non un bug.

alter table worker_profiles add column if not exists blinknow_opt_in boolean not null default false;

create or replace function public.is_blinknow_enabled_for_job(p_category text)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select enabled_globally or p_category = any(enabled_categories)
     from feature_flags where key = 'blinknow_enabled'),
    false
  );
$$;

-- Solo su bozze: evitare di dover gestire il caso "urgenza attivata dopo la pubblicazione"
-- (ri-notifica, cambio SLA a candidature già in corso) è la semplificazione scelta qui.
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
  end if;

  update jobs
  set urgency_tier = (case when p_enabled then 'blinknow' else 'standard' end)::urgency_tier
  where id = p_job_id;
end;
$$;

-- applications/reviews (M12) usano trigger per lo stesso motivo: la pubblicazione di un job è
-- un update diretto dal client (jobs_company_manage, 006), non una RPC — quindi la notifica non
-- può vivere in una funzione che quello statement non attraversa mai.
create or replace function public.notify_on_blinknow_job_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location company_locations%rowtype;
begin
  if new.status = 'published' and new.urgency_tier = 'blinknow'
     and (old.status is distinct from new.status or old.urgency_tier is distinct from new.urgency_tier) then

    select * into v_location from company_locations where id = new.location_id;

    insert into notifications (user_id, event_type, payload)
    select wp.user_id, 'blinknow_job_available',
      jsonb_build_object('job_id', new.id, 'job_title', new.title)
    from worker_profiles wp
    join users u on u.id = wp.user_id
    where wp.blinknow_opt_in = true
      and wp.home_location is not null
      and u.status not in ('suspended', 'blocked')
      and ST_Distance(wp.home_location, v_location.location) / 1000.0 <= wp.operating_radius_km;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_blinknow_job_published on jobs;
create trigger trg_notify_on_blinknow_job_published
  after update on jobs
  for each row execute function notify_on_blinknow_job_published();

create or replace function public.admin_set_feature_flag(p_key text, p_enabled_globally boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  update feature_flags set enabled_globally = p_enabled_globally where key = p_key;
  if not found then
    raise exception 'Unknown feature flag: %', p_key;
  end if;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_set_feature_flag', 'feature_flag', null,
    jsonb_build_object('key', p_key, 'enabled_globally', p_enabled_globally));
end;
$$;

revoke all on function public.set_job_blinknow(uuid, boolean) from public;
revoke all on function public.admin_set_feature_flag(text, boolean) from public;
grant execute on function public.set_job_blinknow(uuid, boolean) to authenticated;
grant execute on function public.admin_set_feature_flag(text, boolean) to authenticated;

-- Nota: `feature_flags` ha già RLS + policy di lettura pubblica (`feature_flags_read`) e scrittura
-- staff (`feature_flags_staff_write`) da 006 — quest'ultima permetterebbe anche un update diretto
-- dal client admin, ma si passa comunque per `admin_set_feature_flag` per ottenere l'audit log,
-- stesso pattern delle altre azioni admin (020).
