-- BlinkJob — 006: Row Level Security policies
-- Defense in depth: application code enforces RBAC too, but RLS is the last line of defense.

create or replace function current_user_role() returns user_role as $$
  select role from users where id = auth.uid();
$$ language sql stable security definer;

create or replace function is_admin_or_support() returns boolean as $$
  select current_user_role() in ('admin', 'support');
$$ language sql stable;

create or replace function is_company_member(target_company_id uuid) returns boolean as $$
  select exists (
    select 1 from company_members
    where company_id = target_company_id and user_id = auth.uid()
  );
$$ language sql stable security definer;

alter table users enable row level security;
alter table worker_profiles enable row level security;
alter table worker_skills enable row level security;
alter table worker_availability enable row level security;
alter table companies enable row level security;
alter table company_members enable row level security;
alter table company_locations enable row level security;
alter table jobs enable row level security;
alter table job_requirements enable row level security;
alter table applications enable row level security;
alter table assignments enable row level security;
alter table check_events enable row level security;
alter table payments enable row level security;
alter table reviews enable row level security;
alter table disputes enable row level security;
alter table notifications enable row level security;
alter table audit_events enable row level security;
alter table feature_flags enable row level security;

-- users: self read/update; admin/support read all.
create policy users_select_self_or_staff on users for select
  using (id = auth.uid() or is_admin_or_support());
create policy users_update_self on users for update
  using (id = auth.uid());

-- worker_profiles: owner full access; companies see profiles only via application/assignment link; staff sees all.
create policy worker_profiles_owner on worker_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy worker_profiles_staff_read on worker_profiles for select
  using (is_admin_or_support());
create policy worker_profiles_company_read on worker_profiles for select
  using (
    exists (
      select 1 from applications a
      join jobs j on j.id = a.job_id
      where a.worker_id = worker_profiles.user_id and is_company_member(j.company_id)
    )
  );

create policy worker_skills_owner on worker_skills for all
  using (worker_id = auth.uid()) with check (worker_id = auth.uid());
create policy worker_availability_owner on worker_availability for all
  using (worker_id = auth.uid()) with check (worker_id = auth.uid());

-- companies: members read/update their own company; staff sees all; anyone authenticated can insert (signup flow).
create policy companies_member_read on companies for select
  using (is_company_member(id) or is_admin_or_support());
create policy companies_member_update on companies for update
  using (is_company_member(id));
create policy companies_insert on companies for insert
  with check (auth.uid() is not null);

create policy company_members_read on company_members for select
  using (is_company_member(company_id) or is_admin_or_support());
create policy company_members_manage on company_members for all
  using (is_company_member(company_id)) with check (is_company_member(company_id));

create policy company_locations_read on company_locations for select
  using (is_company_member(company_id) or is_admin_or_support());
create policy company_locations_manage on company_locations for all
  using (is_company_member(company_id)) with check (is_company_member(company_id));

-- jobs: published jobs are public read; drafts only visible to owning company; staff sees all.
create policy jobs_public_read on jobs for select
  using (status = 'published' or is_company_member(company_id) or is_admin_or_support());
create policy jobs_company_manage on jobs for all
  using (is_company_member(company_id)) with check (is_company_member(company_id));

create policy job_requirements_read on job_requirements for select
  using (
    exists (select 1 from jobs j where j.id = job_id and (j.status = 'published' or is_company_member(j.company_id)))
  );
create policy job_requirements_manage on job_requirements for all
  using (exists (select 1 from jobs j where j.id = job_id and is_company_member(j.company_id)));

-- applications: worker sees own; company sees applications to its jobs; staff sees all.
create policy applications_worker_read on applications for select
  using (worker_id = auth.uid());
create policy applications_worker_insert on applications for insert
  with check (worker_id = auth.uid());
create policy applications_worker_update on applications for update
  using (worker_id = auth.uid());
create policy applications_company_read on applications for select
  using (exists (select 1 from jobs j where j.id = job_id and is_company_member(j.company_id)));
create policy applications_company_update on applications for update
  using (exists (select 1 from jobs j where j.id = job_id and is_company_member(j.company_id)));
create policy applications_staff on applications for select
  using (is_admin_or_support());

-- assignments: worker and company involved can read; only company/staff can update status.
create policy assignments_worker_read on assignments for select
  using (worker_id = auth.uid());
create policy assignments_company_read on assignments for select
  using (exists (select 1 from jobs j where j.id = job_id and is_company_member(j.company_id)));
create policy assignments_staff on assignments for select
  using (is_admin_or_support());
create policy assignments_company_update on assignments for update
  using (exists (select 1 from jobs j where j.id = job_id and is_company_member(j.company_id)));

create policy check_events_participants on check_events for select
  using (
    exists (
      select 1 from assignments a
      join jobs j on j.id = a.job_id
      where a.id = assignment_id and (a.worker_id = auth.uid() or is_company_member(j.company_id) or is_admin_or_support())
    )
  );
create policy check_events_worker_insert on check_events for insert
  with check (exists (select 1 from assignments a where a.id = assignment_id and a.worker_id = auth.uid()));

-- payments: no direct client access; server-side (service role) only, staff can read.
create policy payments_staff_read on payments for select
  using (is_admin_or_support());
create policy payments_participants_read on payments for select
  using (
    exists (
      select 1 from assignments a
      join jobs j on j.id = a.job_id
      where a.id = assignment_id and (a.worker_id = auth.uid() or is_company_member(j.company_id))
    )
  );

-- reviews: participants of the assignment can insert their own; published reviews readable by both parties + staff.
create policy reviews_read on reviews for select
  using (
    author_id = auth.uid() or recipient_id = auth.uid() or is_admin_or_support()
    or (moderation_status = 'published')
  );
create policy reviews_insert on reviews for insert
  with check (author_id = auth.uid());

-- disputes: participants and staff.
create policy disputes_participants on disputes for select
  using (
    opened_by = auth.uid() or is_admin_or_support()
    or exists (
      select 1 from assignments a join jobs j on j.id = a.job_id
      where a.id = assignment_id and (a.worker_id = auth.uid() or is_company_member(j.company_id))
    )
  );
create policy disputes_insert on disputes for insert
  with check (opened_by = auth.uid());
create policy disputes_staff_update on disputes for update
  using (is_admin_or_support());

-- notifications: only the recipient.
create policy notifications_owner on notifications for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_events: append-only, staff read only, no update/delete policy defined (denied by default).
create policy audit_events_staff_read on audit_events for select
  using (is_admin_or_support());
create policy audit_events_insert on audit_events for insert
  with check (true);

-- feature_flags: public read (needed by client to gate UI), staff-only write.
create policy feature_flags_read on feature_flags for select using (true);
create policy feature_flags_staff_write on feature_flags for all
  using (is_admin_or_support()) with check (is_admin_or_support());
