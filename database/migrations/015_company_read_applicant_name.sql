-- BlinkJob — 015: the company-side "Candidature e inviti" list needs the applicant's display
-- name, but `users_select_self_or_staff` (006) only lets a user read their own row (or staff
-- read any). Mirrors the existing `worker_profiles_company_read` pattern (006), just for `users`:
-- a company can read the name of anyone who has an application against one of its own jobs.

create policy users_company_applicant_read on users for select
  using (
    exists (
      select 1 from applications a
      join jobs j on j.id = a.job_id
      where a.worker_id = users.id and is_company_member(j.company_id)
    )
  );
