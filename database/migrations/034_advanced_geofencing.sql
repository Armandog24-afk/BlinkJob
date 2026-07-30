-- BlinkJob — 034: M26 (matching avanzato, parte 1: geofencing — PRD sez. 11).
-- Finora il raggio di ricerca era determinato solo dal lavoratore (`worker_profiles.
-- operating_radius_km`). Alcune aziende hanno invece un vincolo proprio (es. "solo entro 5 km,
-- niente rimborso trasferta") più stretto del raggio che il lavoratore accetterebbe in generale:
-- `jobs.max_distance_km` (opzionale) restringe ulteriormente, senza sostituire, il raggio del
-- lavoratore — vince sempre il più stringente dei due.

alter table jobs add column if not exists max_distance_km numeric check (max_distance_km > 0);

create or replace function public.candidate_workers_for_job(p_job_id uuid)
returns table (
  worker_id uuid,
  full_name text,
  distance_km numeric,
  operating_radius_km numeric,
  reliability_score numeric,
  status user_status
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from jobs j
    where j.id = p_job_id and (is_company_member(j.company_id) or is_admin_or_support())
  ) then
    raise exception 'Not authorized to view candidates for this job';
  end if;

  return query
    select
      wp.user_id,
      u.full_name,
      (ST_Distance(wp.home_location, cl.location) / 1000.0)::numeric as distance_km,
      wp.operating_radius_km,
      wp.reliability_score,
      u.status
    from worker_profiles wp
    join users u on u.id = wp.user_id
    join jobs j on j.id = p_job_id
    join company_locations cl on cl.id = j.location_id
    where wp.home_location is not null
      and u.status not in ('suspended', 'blocked')
      and ST_Distance(wp.home_location, cl.location) / 1000.0
        <= least(wp.operating_radius_km, coalesce(j.max_distance_km, wp.operating_radius_km));
end;
$$;

create or replace function public.candidate_jobs_for_worker(p_worker_id uuid)
returns table (job_id uuid, distance_km numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker_id <> auth.uid() and not is_admin_or_support() then
    raise exception 'Not authorized to view candidate jobs for this worker';
  end if;

  return query
    select
      j.id,
      (ST_Distance(wp.home_location, cl.location) / 1000.0)::numeric as distance_km
    from jobs j
    join company_locations cl on cl.id = j.location_id
    join worker_profiles wp on wp.user_id = p_worker_id
    where j.status = 'published'
      and wp.home_location is not null
      and ST_Distance(wp.home_location, cl.location) / 1000.0
        <= least(wp.operating_radius_km, coalesce(j.max_distance_km, wp.operating_radius_km));
end;
$$;

revoke all on function public.candidate_workers_for_job(uuid) from public;
revoke all on function public.candidate_jobs_for_worker(uuid) from public;
grant execute on function public.candidate_workers_for_job(uuid) to authenticated;
grant execute on function public.candidate_jobs_for_worker(uuid) to authenticated;
