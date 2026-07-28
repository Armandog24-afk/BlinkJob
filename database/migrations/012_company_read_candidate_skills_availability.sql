-- BlinkJob — 012: `worker_skills_owner` / `worker_availability_owner` (006) only let the worker
-- themselves read their own skills/availability. The company-side candidates view (M4) needs to
-- read exactly those fields for workers who are legitimate geo-eligible candidates for one of the
-- company's own published jobs — narrower than "any company can see any worker", scoped to an
-- actual, checkable eligibility relationship (published job + within the worker's own radius).

create policy worker_skills_company_candidate_read on worker_skills for select
  using (
    exists (
      select 1 from jobs j
      join company_locations cl on cl.id = j.location_id
      join worker_profiles wp on wp.user_id = worker_skills.worker_id
      where j.status = 'published'
        and is_company_member(j.company_id)
        and wp.home_location is not null
        and ST_Distance(wp.home_location, cl.location) / 1000.0 <= wp.operating_radius_km
    )
  );

create policy worker_availability_company_candidate_read on worker_availability for select
  using (
    exists (
      select 1 from jobs j
      join company_locations cl on cl.id = j.location_id
      join worker_profiles wp on wp.user_id = worker_availability.worker_id
      where j.status = 'published'
        and is_company_member(j.company_id)
        and wp.home_location is not null
        and ST_Distance(wp.home_location, cl.location) / 1000.0 <= wp.operating_radius_km
    )
  );
