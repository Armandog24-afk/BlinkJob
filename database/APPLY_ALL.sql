-- ===================================================================
-- FILE: migrations/001_extensions_and_enums.sql
-- ===================================================================
-- BlinkJob — 001: extensions and enum types
-- Requires Supabase/Postgres with postgis available.

create extension if not exists "uuid-ossp";
create extension if not exists postgis;
create extension if not exists pgcrypto;

do $$ begin
  create type user_role as enum ('worker', 'recruiter', 'company_owner', 'support', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum ('incomplete', 'pending_verification', 'active', 'suspended', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_tier as enum ('t0', 't1', 't2', 't3');
exception when duplicate_object then null; end $$;

do $$ begin
  create type skill_level as enum ('base', 'intermedio', 'avanzato');
exception when duplicate_object then null; end $$;

do $$ begin
  create type company_status as enum ('pending_verification', 'active', 'limited', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type company_member_role as enum ('owner', 'recruiter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum (
    'draft', 'published', 'in_selection', 'confirmed',
    'in_progress', 'completed', 'disputed', 'canceled', 'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type urgency_tier as enum ('standard', 'blinknow');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_type as enum ('application', 'invite');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum (
    'sent', 'viewed', 'shortlisted', 'info_requested',
    'accepted', 'rejected', 'withdrawn', 'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type assignment_status as enum ('confirmed', 'in_progress', 'completed', 'disputed', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type check_event_type as enum ('check_in', 'check_out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type check_event_method as enum ('gps', 'manual', 'qr');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('draft', 'pending', 'confirmed', 'paid', 'refunded', 'disputed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type moderation_status as enum ('pending', 'published', 'hidden');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_status as enum ('open', 'collecting', 'deciding', 'resolved', 'appealed', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_channel as enum ('in_app', 'email');
exception when duplicate_object then null; end $$;

do $$ begin
  create type skill_taxonomy_status as enum ('active', 'deprecated');
exception when duplicate_object then null; end $$;

-- ===================================================================
-- FILE: migrations/002_identity_and_companies.sql
-- ===================================================================
-- BlinkJob — 002: users, worker profiles, skills, companies

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  phone text,
  role user_role not null default 'worker',
  status user_status not null default 'incomplete',
  full_name text not null,
  consents jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists worker_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  birth_date date,
  home_location geography(Point, 4326),
  operating_radius_km numeric not null default 15,
  bio text,
  completeness_score int not null default 0,
  reliability_score numeric not null default 0,
  verification_tier verification_tier not null default 't0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists skill_taxonomy (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  synonyms text[] not null default '{}',
  status skill_taxonomy_status not null default 'active',
  version int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists worker_skills (
  worker_id uuid not null references worker_profiles(user_id) on delete cascade,
  skill_id uuid not null references skill_taxonomy(id) on delete restrict,
  level skill_level not null default 'base',
  verified boolean not null default false,
  verified_at timestamptz,
  primary key (worker_id, skill_id)
);

create table if not exists worker_availability (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references worker_profiles(user_id) on delete cascade,
  day_of_week smallint check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  vat_number text,
  status company_status not null default 'pending_verification',
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_members (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role company_member_role not null default 'recruiter',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (company_id, user_id)
);

create table if not exists company_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  label text not null,
  address text not null,
  location geography(Point, 4326) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_worker_profiles_home_location on worker_profiles using gist (home_location);
create index if not exists idx_company_locations_location on company_locations using gist (location);
create index if not exists idx_worker_skills_skill on worker_skills (skill_id);

-- ===================================================================
-- FILE: migrations/003_jobs_and_matching.sql
-- ===================================================================
-- BlinkJob — 003: jobs, requirements, applications, assignments

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references company_locations(id) on delete restrict,
  created_by uuid not null references users(id),
  title text not null,
  description text not null,
  category text not null,
  positions_count int not null check (positions_count > 0),
  pay_amount_cents int not null check (pay_amount_cents >= 0),
  pay_currency text not null default 'EUR',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  application_deadline timestamptz not null,
  status job_status not null default 'draft',
  version int not null default 1,
  urgency_tier urgency_tier not null default 'standard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (application_deadline <= starts_at)
);

create table if not exists job_requirements (
  job_id uuid not null references jobs(id) on delete cascade,
  skill_id uuid not null references skill_taxonomy(id) on delete restrict,
  mandatory boolean not null default false,
  primary key (job_id, skill_id)
);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  worker_id uuid not null references worker_profiles(user_id) on delete cascade,
  type application_type not null default 'application',
  status application_status not null default 'sent',
  match_score numeric,
  match_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references applications(id) on delete restrict,
  job_id uuid not null references jobs(id) on delete restrict,
  worker_id uuid not null references worker_profiles(user_id) on delete restrict,
  status assignment_status not null default 'confirmed',
  confirmed_terms_snapshot jsonb not null,
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_status on jobs (status);
create index if not exists idx_jobs_company on jobs (company_id);
create index if not exists idx_applications_job on applications (job_id);
create index if not exists idx_applications_worker on applications (worker_id);
create index if not exists idx_assignments_job on assignments (job_id);
create index if not exists idx_assignments_worker on assignments (worker_id);

-- ===================================================================
-- FILE: migrations/004_execution_and_payments.sql
-- ===================================================================
-- BlinkJob — 004: check-in/out, payments (tracked ledger, no real PSP)

create table if not exists check_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  type check_event_type not null,
  occurred_at timestamptz not null default now(),
  method check_event_method not null default 'manual',
  location geography(Point, 4326),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references assignments(id) on delete restrict,
  gross_amount_cents int not null check (gross_amount_cents >= 0),
  platform_fee_cents int not null default 0 check (platform_fee_cents >= 0),
  fee_version text not null default 'v1',
  net_amount_cents int not null check (net_amount_cents >= 0),
  currency text not null default 'EUR',
  status payment_status not null default 'draft',
  provider text not null default 'tracked_ledger',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (net_amount_cents = gross_amount_cents - platform_fee_cents)
);

create index if not exists idx_check_events_assignment on check_events (assignment_id);

-- A payment can only reach 'paid' once its assignment is completed.
create or replace function enforce_payment_requires_completed_assignment()
returns trigger as $$
declare
  assignment_status_val assignment_status;
begin
  if new.status = 'paid' then
    select status into assignment_status_val from assignments where id = new.assignment_id;
    if assignment_status_val is distinct from 'completed' then
      raise exception 'Payment % cannot be marked paid: assignment % is not completed', new.id, new.assignment_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_payment_requires_completed_assignment on payments;
create trigger trg_payment_requires_completed_assignment
  before insert or update on payments
  for each row execute function enforce_payment_requires_completed_assignment();

-- ===================================================================
-- FILE: migrations/005_reviews_disputes_notifications_audit.sql
-- ===================================================================
-- BlinkJob — 005: reviews, disputes, notifications, audit log, feature flags

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  rating_dimensions jsonb not null default '{}'::jsonb,
  comment text,
  published_at timestamptz,
  moderation_status moderation_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (assignment_id, author_id)
);

create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  opened_by uuid not null references users(id),
  type text not null,
  status dispute_status not null default 'open',
  resolution text,
  economic_impact_cents int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null,
  channel notification_channel not null default 'in_app',
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Append-only: no update/delete grants at application role level; enforced via RLS + no UPDATE policy.
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists feature_flags (
  key text primary key,
  description text not null,
  enabled_globally boolean not null default false,
  enabled_cities text[] not null default '{}',
  enabled_categories text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Points ledger table is created but intentionally unused in the MVP (BlinkPoints is post-MVP, feature-flagged).
create table if not exists points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  points int not null,
  reason text not null,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on notifications (user_id, read_at);
create index if not exists idx_audit_events_resource on audit_events (resource_type, resource_id);
create index if not exists idx_disputes_assignment on disputes (assignment_id);

insert into feature_flags (key, description, enabled_globally)
values
  ('blinknow_enabled', 'Abilita modalita urgente BlinkNow', false),
  ('blink_assistant_enabled', 'Abilita suggerimenti Blink Assistant', false),
  ('blinkpoints_enabled', 'Abilita ledger punti BlinkPoints', false)
on conflict (key) do nothing;

-- ===================================================================
-- FILE: migrations/006_row_level_security.sql
-- ===================================================================
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

-- ===================================================================
-- FILE: migrations/007_user_provisioning_and_company_bootstrap.sql
-- ===================================================================
-- BlinkJob — 007: auto-provision public.users on signup, and allow a brand-new
-- company to be bootstrapped by its first owner (fixes a gap in 006_row_level_security.sql:
-- there was no INSERT policy for `users`, and `company_members_manage` requires an existing
-- membership row, which a first-time owner can never have).

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'worker'),
    'incomplete'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Worker profile is created lazily by the app on first onboarding step, not by this
-- trigger, since it needs user-provided data (location, radius) with real defaults.

create policy company_members_bootstrap_owner on company_members for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and not exists (
      select 1 from company_members cm where cm.company_id = company_members.company_id
    )
  );

-- ===================================================================
-- FILE: migrations/008_create_company_with_owner_rpc.sql
-- ===================================================================
-- BlinkJob — 008: atomic company + owner bootstrap.
-- Fixes a second RLS bootstrap gap left by 006/007: `insert into companies ... returning id`
-- requires a SELECT policy on the freshly inserted row, but `companies_member_read` only
-- allows members to read, and the inserting user isn't a member yet (chicken-and-egg,
-- same class of issue as the company_members bootstrap policy in 007). A SECURITY DEFINER
-- function sidesteps this cleanly and makes the two inserts atomic (no orphan company row
-- if the membership insert were to fail).

create or replace function public.create_company_with_owner(
  p_legal_name text,
  p_vat_number text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into companies (legal_name, vat_number)
  values (p_legal_name, p_vat_number)
  returning id into v_company_id;

  insert into company_members (company_id, user_id, role, accepted_at)
  values (v_company_id, auth.uid(), 'owner', now());

  return v_company_id;
end;
$$;

revoke all on function public.create_company_with_owner(text, text) from public;
grant execute on function public.create_company_with_owner(text, text) to authenticated;

-- ===================================================================
-- FILE: migrations/009_find_company_account_rpc.sql
-- ===================================================================
-- BlinkJob — 009: narrow, safe lookup for the team-invite feature.
-- `users_select_self_or_staff` (006) correctly blocks a company owner from reading arbitrary
-- other users' rows by email (privacy). Team invite still needs to check "does an account with
-- this email exist and is it a company-side account" — a SECURITY DEFINER function exposes only
-- that narrow answer (id + full_name), never arbitrary user data, and only to company-role callers.

create or replace function public.find_company_account_by_email(p_email text)
returns table (id uuid, full_name text)
language sql
security definer
set search_path = public
as $$
  select id, full_name from users
  where email = p_email and role in ('recruiter', 'company_owner');
$$;

revoke all on function public.find_company_account_by_email(text) from public;
grant execute on function public.find_company_account_by_email(text) to authenticated;

-- ===================================================================
-- FILE: migrations/010_public_read_via_published_job.sql
-- ===================================================================
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

-- ===================================================================
-- FILE: migrations/011_matching_rpcs.sql
-- ===================================================================
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

-- ===================================================================
-- FILE: migrations/012_company_read_candidate_skills_availability.sql
-- ===================================================================
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

-- ===================================================================
-- FILE: migrations/013_fix_candidate_read_policies_rls_recursion.sql
-- ===================================================================
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

-- ===================================================================
-- FILE: migrations/014_applications_assignments_rpcs.sql
-- ===================================================================
-- BlinkJob — 014: M5 (candidature/inviti/selezione/conferma).
-- Two gaps in 006's RLS model: (1) there was no INSERT policy letting a company create an
-- `invite`-type application on a candidate's behalf — only the worker themselves could insert
-- their own application (fixed with a plain policy below); (2) there was no INSERT policy for
-- `assignments` at all, and the application -> assignment transition needs the positions_count
-- business rule (BR from DATABASE_SCHEMA.md: "un job può avere N assignments, una per posizione")
-- enforced somewhere more durable than client code — fixed with a SECURITY DEFINER RPC so the
-- multi-step transition (validate → update application → insert assignment) is atomic.

-- A plain insert (no RPC needed): the job and the company membership both already exist at
-- invite time, so there's no bootstrap chicken-and-egg for the follow-up
-- `applications_company_read` select-after-insert, unlike the companies/company_members case.
drop policy if exists applications_company_invite_insert on applications;
create policy applications_company_invite_insert on applications for insert
  with check (
    type = 'invite'
    and exists (select 1 from jobs j where j.id = job_id and is_company_member(j.company_id))
  );

create or replace function public.confirm_candidate(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_application applications%rowtype;
  v_location company_locations%rowtype;
  v_confirmed_count int;
  v_assignment_id uuid;
  v_snapshot jsonb;
begin
  select * into v_application from applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;

  select * into v_job from jobs where id = v_application.job_id;

  if not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to confirm this application';
  end if;

  if v_application.status not in ('sent', 'viewed', 'shortlisted', 'info_requested') then
    raise exception 'Application is not in a confirmable state (status: %)', v_application.status;
  end if;

  select count(*) into v_confirmed_count
  from assignments
  where job_id = v_job.id and status <> 'canceled';

  if v_confirmed_count >= v_job.positions_count then
    raise exception 'All positions for this job are already filled';
  end if;

  select * into v_location from company_locations where id = v_job.location_id;

  v_snapshot := jsonb_build_object(
    'job_title', v_job.title,
    'pay_amount_cents', v_job.pay_amount_cents,
    'pay_currency', v_job.pay_currency,
    'starts_at', v_job.starts_at,
    'ends_at', v_job.ends_at,
    'location_label', v_location.label,
    'location_address', v_location.address,
    'job_version', v_job.version
  );

  update applications set status = 'accepted' where id = p_application_id;

  insert into assignments (application_id, job_id, worker_id, status, confirmed_terms_snapshot)
  values (p_application_id, v_job.id, v_application.worker_id, 'confirmed', v_snapshot)
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

revoke all on function public.confirm_candidate(uuid) from public;
grant execute on function public.confirm_candidate(uuid) to authenticated;

-- ===================================================================
-- FILE: migrations/015_company_read_applicant_name.sql
-- ===================================================================
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

-- ===================================================================
-- FILE: migrations/016_accept_invite_rpc.sql
-- ===================================================================
-- BlinkJob — 016: fixes a real design gap found while testing M5's invite flow.
-- `respondToInviteAction` (accept path) only flipped applications.status to 'accepted' — but
-- 'accepted' is *not* one of the states `confirm_candidate` (014) accepts as input, so an
-- accepted invite could never actually produce an assignment; it would sit forever as an
-- "accepted" application with no one covering the shift. Accepting a company-initiated invite is,
-- by definition, the worker's confirmation — there is no separate company approval step left to
-- do — so it should create the assignment immediately, atomically, same as confirm_candidate but
-- authorized by "I am the invited worker" instead of "I manage this job's company".

create or replace function public.accept_invite(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_application applications%rowtype;
  v_location company_locations%rowtype;
  v_confirmed_count int;
  v_assignment_id uuid;
  v_snapshot jsonb;
begin
  select * into v_application from applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;

  if v_application.worker_id <> auth.uid() then
    raise exception 'Not authorized to accept this invite';
  end if;

  if v_application.type <> 'invite' or v_application.status <> 'sent' then
    raise exception 'Invite is not in an acceptable state (status: %)', v_application.status;
  end if;

  select * into v_job from jobs where id = v_application.job_id;

  select count(*) into v_confirmed_count
  from assignments
  where job_id = v_job.id and status <> 'canceled';

  if v_confirmed_count >= v_job.positions_count then
    raise exception 'All positions for this job are already filled';
  end if;

  select * into v_location from company_locations where id = v_job.location_id;

  v_snapshot := jsonb_build_object(
    'job_title', v_job.title,
    'pay_amount_cents', v_job.pay_amount_cents,
    'pay_currency', v_job.pay_currency,
    'starts_at', v_job.starts_at,
    'ends_at', v_job.ends_at,
    'location_label', v_location.label,
    'location_address', v_location.address,
    'job_version', v_job.version
  );

  update applications set status = 'accepted' where id = p_application_id;

  insert into assignments (application_id, job_id, worker_id, status, confirmed_terms_snapshot)
  values (p_application_id, v_job.id, v_application.worker_id, 'confirmed', v_snapshot)
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

revoke all on function public.accept_invite(uuid) from public;
grant execute on function public.accept_invite(uuid) to authenticated;

-- ===================================================================
-- FILE: migrations/017_execution_rpcs.sql
-- ===================================================================
-- BlinkJob — 017: M6 (esecuzione — check-in/out, completamento, annullamento).
-- assignments has no UPDATE policy for the worker at all (006 only lets the company update), and
-- these transitions have business rules (valid-state checks) that belong in one place rather
-- than duplicated client-side — so, consistent with confirm_candidate/accept_invite, they're
-- SECURITY DEFINER RPCs rather than new bare RLS policies.

create or replace function public.check_in_assignment(
  p_assignment_id uuid,
  p_method check_event_method default 'manual',
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
begin
  select * into v_assignment from assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found';
  end if;

  if v_assignment.worker_id <> auth.uid() then
    raise exception 'Not authorized to check in on this assignment';
  end if;

  if v_assignment.status <> 'confirmed' then
    raise exception 'Assignment is not in a checkable-in state (status: %)', v_assignment.status;
  end if;

  insert into check_events (assignment_id, type, method, note)
  values (p_assignment_id, 'check_in', p_method, p_note);

  update assignments set status = 'in_progress' where id = p_assignment_id;
end;
$$;

create or replace function public.check_out_assignment(
  p_assignment_id uuid,
  p_method check_event_method default 'manual',
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
begin
  select * into v_assignment from assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found';
  end if;

  if v_assignment.worker_id <> auth.uid() then
    raise exception 'Not authorized to check out on this assignment';
  end if;

  if v_assignment.status <> 'in_progress' then
    raise exception 'Assignment is not in a checkable-out state (status: %)', v_assignment.status;
  end if;

  if exists (
    select 1 from check_events where assignment_id = p_assignment_id and type = 'check_out'
  ) then
    raise exception 'Already checked out';
  end if;

  insert into check_events (assignment_id, type, method, note)
  values (p_assignment_id, 'check_out', p_method, p_note);
end;
$$;

-- Either party can confirm completion (single confirmation, not a double-send flow — the PRD
-- reserves double-confirmation/anti-retaliation windows for reviews, not for this step).
create or replace function public.confirm_assignment_completion(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
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

  update assignments set status = 'completed' where id = p_assignment_id;
end;
$$;

-- Either party can cancel while the assignment hasn't completed yet.
create or replace function public.cancel_assignment(p_assignment_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
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
end;
$$;

-- The worker-side assignment view needs the employer name/location for as long as the
-- assignment exists, not just while the job happens to still be 'published' (010 covers only the
-- public feed case). Mirrors 010's pattern, scoped to the worker's own confirmed assignment.
drop policy if exists companies_read_via_own_assignment on companies;
create policy companies_read_via_own_assignment on companies for select
  using (
    exists (
      select 1 from assignments a join jobs j on j.id = a.job_id
      where j.company_id = companies.id and a.worker_id = auth.uid()
    )
  );

drop policy if exists company_locations_read_via_own_assignment on company_locations;
create policy company_locations_read_via_own_assignment on company_locations for select
  using (
    exists (
      select 1 from assignments a join jobs j on j.id = a.job_id
      where j.location_id = company_locations.id and a.worker_id = auth.uid()
    )
  );

revoke all on function public.check_in_assignment(uuid, check_event_method, text) from public;
revoke all on function public.check_out_assignment(uuid, check_event_method, text) from public;
revoke all on function public.confirm_assignment_completion(uuid) from public;
revoke all on function public.cancel_assignment(uuid, text) from public;
grant execute on function public.check_in_assignment(uuid, check_event_method, text) to authenticated;
grant execute on function public.check_out_assignment(uuid, check_event_method, text) to authenticated;
grant execute on function public.confirm_assignment_completion(uuid) to authenticated;
grant execute on function public.cancel_assignment(uuid, text) to authenticated;

-- ===================================================================
-- FILE: migrations/018_payments_tracked_ledger.sql
-- ===================================================================
-- BlinkJob — 018: M7 (pagamenti — ledger tracciato, nessun PSP reale).
-- Per TECH_ARCHITECTURE.md sez. 2: TrackedLedgerProvider, nessun money-movement reale in questa
-- fase. Un pagamento viene creato automaticamente quando un assignment passa a 'completed'
-- (mai manualmente, e mai per un assignment non completato — enforced sia qui sia dal trigger
-- `enforce_payment_requires_completed_assignment` di 004). L'azienda poi conferma l'importo e
-- segna il pagamento come effettuato (bonifico/contanti fuori piattaforma — tracciato, non
-- processato). payments non ha alcuna policy INSERT/UPDATE (006): tutte le transizioni passano
-- da RPC security definer, stesso pattern delle altre milestone.

create or replace function public.calculate_platform_fee_cents(p_gross_amount_cents int)
returns int
language sql
immutable
as $$
  -- fee_version 'v1': commissione piattaforma 12% flat, arrotondata verso il basso.
  select floor(p_gross_amount_cents * 0.12)::int;
$$;

-- Ridefinisce 014's confirm_assignment_completion per creare anche il pagamento tracciato,
-- atomicamente con la transizione a 'completed'.
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
end;
$$;

create or replace function public.confirm_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments%rowtype;
  v_job jobs%rowtype;
begin
  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;

  select j.* into v_job from assignments a join jobs j on j.id = a.job_id where a.id = v_payment.assignment_id;

  if not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to confirm this payment';
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'Payment is not pending (status: %)', v_payment.status;
  end if;

  update payments set status = 'confirmed' where id = p_payment_id;
end;
$$;

create or replace function public.mark_payment_paid(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments%rowtype;
  v_job jobs%rowtype;
begin
  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;

  select j.* into v_job from assignments a join jobs j on j.id = a.job_id where a.id = v_payment.assignment_id;

  if not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to mark this payment as paid';
  end if;

  if v_payment.status <> 'confirmed' then
    raise exception 'Payment is not confirmed (status: %)', v_payment.status;
  end if;

  update payments set status = 'paid' where id = p_payment_id;
end;
$$;

revoke all on function public.calculate_platform_fee_cents(int) from public;
revoke all on function public.confirm_payment(uuid) from public;
revoke all on function public.mark_payment_paid(uuid) from public;
grant execute on function public.calculate_platform_fee_cents(int) to authenticated;
grant execute on function public.confirm_payment(uuid) to authenticated;
grant execute on function public.mark_payment_paid(uuid) to authenticated;

-- ===================================================================
-- FILE: migrations/019_reviews_and_reliability.sql
-- ===================================================================
-- BlinkJob — 019: M8 (recensioni bilaterali e metriche di affidabilità).
-- Real gap found by inspection this time (not by trial and error): `reviews_insert` (006) only
-- checks `author_id = auth.uid()` — it never verifies the author actually participated in that
-- assignment, that the assignment is completed, or that `recipient_id` is the correct other
-- party. As written, any authenticated user could POST a 5-star (or 1-star) review against any
-- assignment for any recipient, manipulating anyone's reputation. Tightened below.
--
-- MVP simplifications (documented, not hidden): reviews publish immediately on submission (no
-- double-blind/simultaneous-reveal window — the PRD's fuller anti-retaliation design is deferred
-- past this MVP); worker reliability_score is the simple average of "overall" ratings received
-- from published reviews (no-show/cancellation weighting is deferred — that needs scheduled
-- no-show detection, which doesn't exist in this MVP).

drop policy if exists reviews_insert on reviews;
create policy reviews_insert on reviews for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from assignments a
      join jobs j on j.id = a.job_id
      where a.id = assignment_id
        and a.status = 'completed'
        and (
          (a.worker_id = auth.uid() and recipient_id = j.created_by)
          or (is_company_member(j.company_id) and recipient_id = a.worker_id)
        )
    )
  );

create or replace function public.recompute_worker_reliability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from worker_profiles where user_id = new.recipient_id) then
    update worker_profiles
    set reliability_score = coalesce((
      select round(avg((rating_dimensions->>'overall')::numeric), 1)
      from reviews
      where recipient_id = new.recipient_id and moderation_status = 'published'
    ), 0)
    where user_id = new.recipient_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recompute_worker_reliability on reviews;
create trigger trg_recompute_worker_reliability
  after insert on reviews
  for each row execute function recompute_worker_reliability();

-- ===================================================================
-- FILE: migrations/020_admin_console_rpcs.sql
-- ===================================================================
-- BlinkJob — 020: M9 (console amministrativa — utenti, aziende, dispute, analytics base).
-- Nessuna policy permette oggi a staff/admin di scrivere su `users`/`companies` (solo di
-- leggerli, via 006) — le azioni di verifica/sospensione passano quindi da RPC security definer
-- con logging in `audit_events`, stesso pattern del resto del progetto. `disputes_insert` (006)
-- ha la stessa debolezza già vista in reviews_insert: verifica solo `opened_by = auth.uid()`,
-- non la partecipazione all'assignment — corretta di conseguenza.

create or replace function public.admin_set_user_status(p_user_id uuid, p_status user_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  update users set status = p_status where id = p_user_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_set_user_status', 'user', p_user_id, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_set_company_status(p_company_id uuid, p_status company_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  update companies set status = p_status where id = p_company_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_set_company_status', 'company', p_company_id, jsonb_build_object('status', p_status));
end;
$$;

drop policy if exists disputes_insert on disputes;
create policy disputes_insert on disputes for insert
  with check (
    opened_by = auth.uid()
    and exists (
      select 1 from assignments a join jobs j on j.id = a.job_id
      where a.id = assignment_id and (a.worker_id = auth.uid() or is_company_member(j.company_id))
    )
  );

create or replace function public.open_dispute(p_assignment_id uuid, p_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute_id uuid;
begin
  if not exists (
    select 1 from assignments a join jobs j on j.id = a.job_id
    where a.id = p_assignment_id and (a.worker_id = auth.uid() or is_company_member(j.company_id))
  ) then
    raise exception 'Not authorized to open a dispute for this assignment';
  end if;

  insert into disputes (assignment_id, opened_by, type, status)
  values (p_assignment_id, auth.uid(), p_type, 'open')
  returning id into v_dispute_id;

  return v_dispute_id;
end;
$$;

create or replace function public.resolve_dispute(p_dispute_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  update disputes set status = 'resolved', resolution = p_resolution where id = p_dispute_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_resolve_dispute', 'dispute', p_dispute_id, jsonb_build_object('resolution', p_resolution));
end;
$$;

revoke all on function public.admin_set_user_status(uuid, user_status) from public;
revoke all on function public.admin_set_company_status(uuid, company_status) from public;
revoke all on function public.open_dispute(uuid, text) from public;
revoke all on function public.resolve_dispute(uuid, text) from public;
grant execute on function public.admin_set_user_status(uuid, user_status) to authenticated;
grant execute on function public.admin_set_company_status(uuid, company_status) to authenticated;
grant execute on function public.open_dispute(uuid, text) to authenticated;
grant execute on function public.resolve_dispute(uuid, text) to authenticated;

-- ===================================================================
-- FILE: seed/001_dev_seed.sql
-- ===================================================================
-- BlinkJob — Dev seed data (non-sensitive, fictional). Do NOT use in production.
-- Assumes corresponding auth.users rows already exist (create via Supabase Auth first,
-- then insert matching rows here with the same ids).

insert into skill_taxonomy (id, name, category) values
  ('00000000-0000-0000-0000-000000000101', 'Movimentazione merci', 'logistica'),
  ('00000000-0000-0000-0000-000000000102', 'Allestimento espositori', 'retail'),
  ('00000000-0000-0000-0000-000000000103', 'Cassa', 'retail'),
  ('00000000-0000-0000-0000-000000000104', 'Servizio di sala', 'hospitality'),
  ('00000000-0000-0000-0000-000000000105', 'Carrello elevatore (patentino)', 'logistica')
on conflict (id) do nothing;

-- NOTE: user rows below use placeholder uuids and must match real auth.users ids
-- when seeding a live Supabase project. Provided here to document expected shape only.
comment on table skill_taxonomy is 'Seed skills for dev/demo matching scenarios.';
