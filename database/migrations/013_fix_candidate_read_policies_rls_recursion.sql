-- BlinkJob — 013: fixes migration 012, which did not work as intended.
-- An RLS policy's USING clause is evaluated under the QUERYING user's own permissions on every
-- table it touches — including tables referenced only inside a correlated subquery. 012's
-- `exists (... join worker_profiles wp ...)` subquery was therefore itself subject to
-- worker_profiles' RLS (owner-only, or via an existing application/assignment — neither holds
-- pre-application), so it silently matched zero rows and the policy always denied access.
-- Wrapping the whole eligibility check in a SECURITY DEFINER function (same pattern as
-- is_company_member/is_admin_or_support) evaluates it with elevated privilege exactly once,
-- avoiding the recursive RLS problem.

create or replace function public.is_geo_candidate_for_company_job(p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from jobs j
    join company_locations cl on cl.id = j.location_id
    join worker_profiles wp on wp.user_id = p_worker_id
    where j.status = 'published'
      and is_company_member(j.company_id)
      and wp.home_location is not null
      and ST_Distance(wp.home_location, cl.location) / 1000.0 <= wp.operating_radius_km
  );
$$;

drop policy if exists worker_skills_company_candidate_read on worker_skills;
create policy worker_skills_company_candidate_read on worker_skills for select
  using (is_geo_candidate_for_company_job(worker_id));

drop policy if exists worker_availability_company_candidate_read on worker_availability;
create policy worker_availability_company_candidate_read on worker_availability for select
  using (is_geo_candidate_for_company_job(worker_id));
