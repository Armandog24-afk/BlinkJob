-- BlinkJob — 010: the worker jobs feed needs to show the employer name and location address
-- for published jobs, but `companies_member_read` / `company_locations_read` (006) only let
-- company members see those rows. Add narrow public-read policies scoped to companies/locations
-- that are actually referenced by at least one published job.

create policy companies_public_read_via_published_job on companies for select
  using (
    exists (select 1 from jobs j where j.company_id = companies.id and j.status = 'published')
  );

create policy company_locations_public_read_via_published_job on company_locations for select
  using (
    exists (select 1 from jobs j where j.location_id = company_locations.id and j.status = 'published')
  );
