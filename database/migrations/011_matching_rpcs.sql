-- BlinkJob — 011: geo hard-filter helpers for the matching engine (M4).
-- Distance is computed in Postgres/PostGIS (accurate, indexed via the existing GiST indexes)
-- and returned in km; the deterministic scoring itself lives in application code
-- (lib/matching/engine.ts) so it stays reviewable/testable rather than opaque SQL.

-- SECURITY DEFINER bypasses RLS internally, so each function re-checks authorization itself:
-- only the owning company's members (or staff) may list candidates for a job, and only the
-- worker themselves (or staff) may list candidate jobs for their own profile.

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
      and ST_Distance(wp.home_location, cl.location) / 1000.0 <= wp.operating_radius_km;
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
      and ST_Distance(wp.home_location, cl.location) / 1000.0 <= wp.operating_radius_km;
end;
$$;

revoke all on function public.candidate_workers_for_job(uuid) from public;
revoke all on function public.candidate_jobs_for_worker(uuid) from public;
grant execute on function public.candidate_workers_for_job(uuid) to authenticated;
grant execute on function public.candidate_jobs_for_worker(uuid) to authenticated;
