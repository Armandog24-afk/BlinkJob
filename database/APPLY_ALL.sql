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
-- BlinkJob — 021: M10 (hardening di sicurezza — revisione finale).
-- `points_ledger` (005, predisposizione futura per BlinkPoints, non popolata/attiva nell'MVP —
-- vedi TECH_ARCHITECTURE.md sez. 7) è la sola tabella applicativa rimasta senza RLS abilitata:
-- 006 non la includeva nell'elenco. Anche se oggi nessun codice applicativo la scrive/legge,
-- lasciarla senza RLS significherebbe che una chiave anon/authenticated potrebbe leggerla o
-- scriverla direttamente via API REST non appena qualcuno la popolasse, bypassando qualunque
-- controllo futuro. Chiusa preventivamente, in linea con "privacy by design" (CLAUDE.md).

alter table points_ledger enable row level security;

drop policy if exists points_ledger_owner_read on points_ledger;
create policy points_ledger_owner_read on points_ledger for select
  using (user_id = auth.uid() or is_admin_or_support());

-- Nessuna policy INSERT/UPDATE/DELETE: finché BlinkPoints non è attivo, solo funzioni
-- security definer (nessuna ancora esiste) potranno scrivere qui, mai il client direttamente.
-- BlinkJob — 022: M12 (notifiche in-app — gap MVP must-have).
-- La tabella `notifications` esiste dalla 005 con RLS `notifications_owner` (005/006), ma nessun
-- codice applicativo la scrive: nessuna delle transizioni costruite in M2-M9 emette una notifica.
-- `notifications_owner` (using/with check su user_id = auth.uid()) non permette comunque a un
-- utente di notificare un ALTRO utente (es. l'azienda deve notificare il lavoratore quando
-- conferma la candidatura) — quindi l'emissione non può essere un insert diretto dal client,
-- deve avvenire dentro le funzioni security definer che già gestiscono ogni transizione
-- (bypassano la RLS), o in trigger per gli insert non ancora incapsulati in una RPC
-- (candidature, recensioni). Stesso pattern idempotente delle migration precedenti:
-- create or replace function, drop/create trigger.

-- Candidature/inviti: nessuna RPC li incapsula (insert diretto via applications_worker_insert /
-- applications_company_invite_insert), quindi qui serve un trigger.
create or replace function public.notify_on_application_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
begin
  select * into v_job from jobs where id = new.job_id;

  if new.type = 'application' then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'application_received',
      jsonb_build_object('job_id', v_job.id, 'job_title', v_job.title, 'application_id', new.id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      new.worker_id, 'invite_received',
      jsonb_build_object('job_id', v_job.id, 'job_title', v_job.title, 'application_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_application_insert on applications;
create trigger trg_notify_on_application_insert
  after insert on applications
  for each row execute function notify_on_application_insert();

-- Recensioni: idem, insert diretto (reviews_insert, 019), non una RPC.
create or replace function public.notify_on_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (user_id, event_type, payload)
  values (
    new.recipient_id, 'review_received',
    jsonb_build_object('assignment_id', new.assignment_id, 'rating', new.rating_dimensions->>'overall')
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_on_review_insert on reviews;
create trigger trg_notify_on_review_insert
  after insert on reviews
  for each row execute function notify_on_review_insert();

-- Da qui in poi: transizioni già incapsulate in RPC security definer (014/016/017/018/020),
-- ridefinite per aggiungere l'emissione della notifica nello stesso passaggio atomico.

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

  insert into notifications (user_id, event_type, payload)
  values (
    v_application.worker_id, 'application_accepted',
    jsonb_build_object('job_title', v_job.title, 'assignment_id', v_assignment_id)
  );

  return v_assignment_id;
end;
$$;

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

  insert into notifications (user_id, event_type, payload)
  select cm.user_id, 'invite_accepted',
    jsonb_build_object('job_title', v_job.title, 'assignment_id', v_assignment_id)
  from company_members cm
  where cm.company_id = v_job.company_id;

  return v_assignment_id;
end;
$$;

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
  v_job jobs%rowtype;
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

  select * into v_job from jobs where id = v_assignment.job_id;
  insert into notifications (user_id, event_type, payload)
  select cm.user_id, 'assignment_checked_in',
    jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
  from company_members cm
  where cm.company_id = v_job.company_id;
end;
$$;

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
  v_confirmed_by_worker boolean;
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

  v_confirmed_by_worker := v_assignment.worker_id = auth.uid();

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

  -- Notifica la controparte (chi ha confermato lo sa già).
  if v_confirmed_by_worker then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'assignment_completed',
      jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_assignment.worker_id, 'assignment_completed',
      jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
    );
  end if;
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
  v_worker_id uuid;
begin
  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;

  select j.* into v_job
  from assignments a join jobs j on j.id = a.job_id where a.id = v_payment.assignment_id;
  select worker_id into v_worker_id from assignments where id = v_payment.assignment_id;

  if not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to mark this payment as paid';
  end if;

  if v_payment.status <> 'confirmed' then
    raise exception 'Payment is not confirmed (status: %)', v_payment.status;
  end if;

  update payments set status = 'paid' where id = p_payment_id;

  insert into notifications (user_id, event_type, payload)
  values (
    v_worker_id, 'payment_paid',
    jsonb_build_object('job_title', v_job.title, 'net_amount_cents', v_payment.net_amount_cents)
  );
end;
$$;

create or replace function public.open_dispute(p_assignment_id uuid, p_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute_id uuid;
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
  v_opened_by_worker boolean;
begin
  select * into v_assignment from assignments where id = p_assignment_id;
  select * into v_job from jobs where id = v_assignment.job_id;

  if not (v_assignment.worker_id = auth.uid() or is_company_member(v_job.company_id)) then
    raise exception 'Not authorized to open a dispute for this assignment';
  end if;

  v_opened_by_worker := v_assignment.worker_id = auth.uid();

  insert into disputes (assignment_id, opened_by, type, status)
  values (p_assignment_id, auth.uid(), p_type, 'open')
  returning id into v_dispute_id;

  if v_opened_by_worker then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'dispute_opened',
      jsonb_build_object('job_title', v_job.title, 'dispute_id', v_dispute_id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_assignment.worker_id, 'dispute_opened',
      jsonb_build_object('job_title', v_job.title, 'dispute_id', v_dispute_id)
    );
  end if;

  return v_dispute_id;
end;
$$;

create or replace function public.resolve_dispute(p_dispute_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute disputes%rowtype;
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  select * into v_dispute from disputes where id = p_dispute_id;
  select * into v_assignment from assignments where id = v_dispute.assignment_id;
  select * into v_job from jobs where id = v_assignment.job_id;

  update disputes set status = 'resolved', resolution = p_resolution where id = p_dispute_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_resolve_dispute', 'dispute', p_dispute_id, jsonb_build_object('resolution', p_resolution));

  insert into notifications (user_id, event_type, payload)
  values (
    v_assignment.worker_id, 'dispute_resolved',
    jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id, 'resolution', p_resolution)
  );
  insert into notifications (user_id, event_type, payload)
  select cm.user_id, 'dispute_resolved',
    jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id, 'resolution', p_resolution)
  from company_members cm
  where cm.company_id = v_job.company_id;
end;
$$;

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

  insert into notifications (user_id, event_type, payload)
  values (p_user_id, 'account_status_changed', jsonb_build_object('status', p_status));
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

  insert into notifications (user_id, event_type, payload)
  select cm.user_id, 'company_status_changed', jsonb_build_object('status', p_status)
  from company_members cm
  where cm.company_id = p_company_id;
end;
$$;

-- "Segna come letta" non richiede una RPC: la policy notifications_owner (006) già permette
-- al destinatario di aggiornare le proprie righe (using/with check su user_id = auth.uid()) —
-- un update diretto dal client via supabase-js basta, stesso ragionamento di 014 per l'insert
-- di invito diretto.
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
-- BlinkJob — 024: M14 (BlinkPoints — punti/badge interni, PRD sez. 9.3, requisiti PTS-001..005).
-- Il PRD è esplicito: "Nel pilot può essere simulato internamente senza ricompense monetarie" —
-- esattamente il ruolo già previsto per `points_ledger` (005/006/010: tabella creata ma mai
-- scritta, RLS abilitata senza alcuna policy INSERT/UPDATE/DELETE per il client). Qui si
-- implementa solo quella simulazione interna: nessun redeem, nessun marketplace ricompense
-- (PTS-005, esplicitamente rimandato dal PRD stesso "solo dopo analisi fiscale e antifrode").
--
-- Semplificazioni MVP documentate (scelte deliberate, non dimenticanze):
-- 1. PTS-002 "livelli e badge configurabili, regole versionate": i valori punti sono costanti
--    hardcoded qui (versione "v1" implicita nel commento), non una tabella di configurazione
--    editabile da admin — stesso pattern già usato per `calculate_platform_fee_cents` (018).
--    Una UI di configurazione è oggettivamente post-pilot ("può essere simulato").
-- 2. "Conferma disponibilità aggiornata → punti periodici" (riga 2 della tabella PRD) NON è
--    implementata: nell'MVP attuale non esiste alcun flusso per modificare la disponibilità
--    dopo l'onboarding iniziale (gap indipendente da BlinkPoints, fuori scope qui).
-- 3. PTS-004 "revoca punti in caso di abuso, con motivo e contestazione" è implementata come
--    azione admin manuale (`admin_adjust_points`) invece di una regola automatica legata alle
--    dispute: `resolve_dispute` accetta oggi solo una nota testuale libera, non un esito
--    strutturato (vinta/persa dal lavoratore) da cui derivare in modo affidabile una revoca
--    automatica — un umano che decide è più sicuro di un'euristica su testo libero.
-- 4. PTS-003 "nessun pay-to-rank" è soddisfatto per costruzione: `points_ledger` non è mai letto
--    da `reliability_score` (che resta derivato solo dalle recensioni, 019) e non esiste alcun
--    flusso di acquisto in questo MVP.
-- 5. PTS-001 "ledger immutabile": nessuna funzione qui esegue mai update/delete su
--    `points_ledger`, solo insert — una revoca è una nuova riga con importo negativo e motivo,
--    mai una modifica alla storia (coerente con "motivo e possibilità di contestazione").

create or replace function public.award_points(
  p_user_id uuid,
  p_points int,
  p_reason text,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select enabled_globally from feature_flags where key = 'blinkpoints_enabled'), false) then
    return;
  end if;

  insert into points_ledger (user_id, points, reason, reference_type, reference_id)
  values (p_user_id, p_points, p_reason, p_reference_type, p_reference_id);
end;
$$;

-- Badge profilo completo: una tantum, sia al primo submit (insert, profilo già al 100%) sia a un
-- successivo aggiornamento che lo porta al 100% (update) — mai due volte per lo stesso worker.
create or replace function public.award_points_on_profile_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completeness_score = 100 and (tg_op = 'INSERT' or old.completeness_score < 100) then
    perform award_points(new.user_id, 50, 'profile_completed_badge', 'worker_profiles', new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_award_points_on_profile_completion on worker_profiles;
create trigger trg_award_points_on_profile_completion
  after insert or update on worker_profiles
  for each row execute function award_points_on_profile_completion();

-- Recensione utile: punti fissi a chi scrive, indipendenti dal voto assegnato (PRD: "niente
-- incentivo sul voto positivo" — l'incentivo è contribuire, non votare bene).
create or replace function public.award_points_on_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform award_points(new.author_id, 5, 'review_contributed', 'review', new.id);
  return new;
end;
$$;

drop trigger if exists trg_award_points_on_review_insert on reviews;
create trigger trg_award_points_on_review_insert
  after insert on reviews
  for each row execute function award_points_on_review_insert();

-- Punti affidabilità: ridefinisce 018/017 per aggiungere l'assegnazione nello stesso passaggio
-- atomico del completamento (nessun'altra logica cambiata).
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
  v_confirmed_by_worker boolean;
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

  v_confirmed_by_worker := v_assignment.worker_id = auth.uid();

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

  perform award_points(v_assignment.worker_id, 20, 'assignment_completed_no_issues', 'assignment', p_assignment_id);

  if v_confirmed_by_worker then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'assignment_completed',
      jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_assignment.worker_id, 'assignment_completed',
      jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
    );
  end if;
end;
$$;

-- PTS-004: rettifica/revoca manuale, con motivo obbligatorio — mai una update/delete sulla riga
-- originale, sempre una nuova riga (positiva o negativa) che la storia lascia intatta.
create or replace function public.admin_adjust_points(p_user_id uuid, p_points int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required for a manual points adjustment';
  end if;

  insert into points_ledger (user_id, points, reason, reference_type)
  values (p_user_id, p_points, 'admin_adjustment: ' || trim(p_reason), 'admin_adjustment');

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_adjust_points', 'user', p_user_id,
    jsonb_build_object('points', p_points, 'reason', p_reason));
end;
$$;

revoke all on function public.admin_adjust_points(uuid, int, text) from public;
grant execute on function public.admin_adjust_points(uuid, int, text) to authenticated;
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
-- BlinkJob — 026: M17 (BlinkPoints — livelli, ricompense non monetarie, badge — PRD PTS-002).
-- 024 implementava solo il ledger (PTS-001/003/004): punti assegnati, mai riscattabili. Qui si
-- aggiunge PTS-002 ("livelli e badge configurabili, regole versionate") con ricompense
-- deliberatamente NON monetarie: priorità nelle ondate BlinkNow (025) e un piccolo boost di
-- visibilità nel matching, mai un aumento di `reliability_score` (che resta derivato solo dalle
-- recensioni, 019 — PTS-003 "nessun pay-to-rank" resta rispettato per costruzione). PTS-005
-- (marketplace ricompense reali/monetarie) resta esplicitamente fuori scope: il PRD lo vieta
-- "solo dopo analisi fiscale e antifrode" — nessuna riga qui introduce denaro reale o sconti.
--
-- Semplificazioni MVP documentate:
-- 1. Soglie livello (100/300/600 punti) e valori badge hardcoded qui, tenute allineate a mano a
--    lib/points/levels.ts — stesso pattern già accettato per calculate_platform_fee_cents/
--    lib/payments/fees.ts (018) e worker_points_level (025).
-- 2. `worker_badges` è append-only per lo stesso motivo di `points_ledger` (PTS-001): un catalogo
--    di eventi verificabili, non un contenuto editabile.

-- Il matching lato azienda (features/matching/queries.ts) calcola il livello BlinkPoints dei
-- candidati per il boost di visibilità (lib/matching/engine.ts) — `points_ledger_owner_read`
-- (021) permette solo la lettura dei propri punti, quindi senza questa policy la query
-- restituirebbe righe vuote per ogni candidato e il livello risulterebbe sempre 0 lato azienda.
-- Stesso schema di `worker_badges_company_read_via_candidate` più sotto.
drop policy if exists points_ledger_company_read_via_candidate on points_ledger;
create policy points_ledger_company_read_via_candidate on points_ledger for select
  using (is_geo_candidate_for_company_job(user_id));

create table if not exists worker_badges (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references worker_profiles(user_id) on delete cascade,
  badge_key text not null,
  awarded_at timestamptz not null default now(),
  unique (worker_id, badge_key)
);

alter table worker_badges enable row level security;

drop policy if exists worker_badges_owner_read on worker_badges;
create policy worker_badges_owner_read on worker_badges for select
  using (worker_id = auth.uid() or is_admin_or_support());

-- I badge di un lavoratore sono un segnale di fiducia pensato anche per l'azienda che valuta un
-- candidato (mostrato nella lista candidati, 003/011) — stesso ragionamento di
-- `worker_profiles_company_read` (006): lettura per l'azienda solo sui candidati geo-idonei ai
-- propri incarichi pubblicati, mai un elenco libero di tutti i lavoratori.
drop policy if exists worker_badges_company_read_via_candidate on worker_badges;
create policy worker_badges_company_read_via_candidate on worker_badges for select
  using (is_geo_candidate_for_company_job(worker_id));

create or replace function public.award_badge(p_user_id uuid, p_badge_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select enabled_globally from feature_flags where key = 'blinkpoints_enabled'), false) then
    return;
  end if;

  insert into worker_badges (worker_id, badge_key)
  values (p_user_id, p_badge_key)
  on conflict (worker_id, badge_key) do nothing;
end;
$$;

-- Profilo completo: ora assegna anche il badge, oltre ai punti già esistenti (024).
create or replace function public.award_points_on_profile_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completeness_score = 100 and (tg_op = 'INSERT' or old.completeness_score < 100) then
    perform award_points(new.user_id, 50, 'profile_completed_badge', 'worker_profiles', new.user_id);
    perform award_badge(new.user_id, 'profilo_completo');
  end if;
  return new;
end;
$$;

-- Recensioni: 024 premiava solo chi SCRIVE una recensione. Qui si aggiunge un badge per chi la
-- RICEVE per la prima volta (costruzione della propria reputazione), senza toccare i punti
-- esistenti né introdurre un incentivo sul voto (il badge non dipende dal rating).
create or replace function public.award_points_on_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_review_count int;
begin
  perform award_points(new.author_id, 5, 'review_contributed', 'review', new.id);

  select count(*) into v_recipient_review_count
  from reviews where recipient_id = new.recipient_id and moderation_status = 'published';

  if v_recipient_review_count = 1 and exists (select 1 from worker_profiles where user_id = new.recipient_id) then
    perform award_badge(new.recipient_id, 'prima_recensione_ricevuta');
  end if;

  return new;
end;
$$;

-- Affidabilità 5 stelle: badge quando la media raggiunge 5.0 con almeno 3 recensioni pubblicate
-- (evita che un singolo voto fortunato lo assegni). Ridefinisce 019's trigger function.
create or replace function public.recompute_worker_reliability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg numeric;
  v_count int;
begin
  if exists (select 1 from worker_profiles where user_id = new.recipient_id) then
    select round(avg((rating_dimensions->>'overall')::numeric), 1), count(*)
    into v_avg, v_count
    from reviews
    where recipient_id = new.recipient_id and moderation_status = 'published';

    update worker_profiles set reliability_score = coalesce(v_avg, 0) where user_id = new.recipient_id;

    if v_avg = 5 and v_count >= 3 then
      perform award_badge(new.recipient_id, 'affidabile_5_stelle');
    end if;
  end if;
  return new;
end;
$$;

-- Dieci incarichi completati: ridefinisce 024's confirm_assignment_completion per aggiungere il
-- controllo soglia nello stesso passaggio atomico (nessun'altra logica cambiata).
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
  v_confirmed_by_worker boolean;
  v_completed_count int;
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

  v_confirmed_by_worker := v_assignment.worker_id = auth.uid();

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

  perform award_points(v_assignment.worker_id, 20, 'assignment_completed_no_issues', 'assignment', p_assignment_id);

  select count(*) into v_completed_count
  from assignments where worker_id = v_assignment.worker_id and status = 'completed';
  if v_completed_count >= 10 then
    perform award_badge(v_assignment.worker_id, 'dieci_incarichi_completati');
  end if;

  if v_confirmed_by_worker then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'assignment_completed',
      jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_assignment.worker_id, 'assignment_completed',
      jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
    );
  end if;
end;
$$;

-- Badge di livello: assegnati al superamento di una soglia punti. Valutati ad ogni movimento del
-- ledger (append-only, 024) invece che con un cron, coerente col resto di questa migration.
create or replace function public.award_level_badges_on_points_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level smallint;
begin
  v_level := worker_points_level(new.user_id);
  if v_level >= 1 then perform award_badge(new.user_id, 'livello_argento'); end if;
  if v_level >= 2 then perform award_badge(new.user_id, 'livello_oro'); end if;
  if v_level >= 3 then perform award_badge(new.user_id, 'livello_platino'); end if;
  return new;
end;
$$;

drop trigger if exists trg_award_level_badges_on_points_change on points_ledger;
create trigger trg_award_level_badges_on_points_change
  after insert on points_ledger
  for each row execute function award_level_badges_on_points_change();

revoke all on function public.award_badge(uuid, text) from public;
grant execute on function public.award_badge(uuid, text) to authenticated;
-- BlinkJob — 027: correzioni da Supabase Security Advisor (richiesta esplicita dell'utente,
-- 2026-07-29, controllo eseguito leggendo tutte le migration invece che il dashboard — nessun
-- accesso autenticato disponibile a questo agente).
--
-- Tre problemi reali trovati:
-- 1. `skill_taxonomy` (002) non ha mai avuto RLS abilitata — unica tabella pubblica dimenticata
--    quando 006 ha abilitato RLS su tutte le altre. Dati non sensibili (solo un catalogo di
--    competenze), ma senza RLS sarebbe scrivibile da qualunque chiave anon/authenticated via
--    REST API (`rls_disabled_in_public`, ERROR).
-- 2. `uuid-ossp`, `postgis`, `pgcrypto` installate nello schema `public` (001) invece che in uno
--    schema dedicato (`extension_in_public`, ERROR — raccomandazione standard di Supabase).
--    PostGIS non supporta lo spostamento in questo ambiente (vedi nota al punto 2 più sotto) e
--    resta un rischio accettato; le altre due vengono spostate.
-- 3. Tre funzioni fondamentali in 006 (`current_user_role`, `is_company_member`,
--    `is_admin_or_support`) non hanno mai avuto `search_path` fissato — sfuggite a tutti i
--    controlli precedenti in questa sessione perché scritte in uno stile compatto
--    ("... as $$ ... $$ language sql stable security definer;") diverso dal pattern usato da
--    ogni migration successiva. Le prime due sono SECURITY DEFINER: senza search_path fissato,
--    chi potesse creare oggetti in uno schema presente nel proprio search_path potrebbe in teoria
--    far risolvere "users" verso una tabella contraffatta, falsificando il proprio ruolo
--    (`function_search_path_mutable`, ERROR per funzioni SECURITY DEFINER).
--
-- Spostare le estensioni fuori da `public` richiede aggiornare il search_path di OGNI funzione
-- che usa PostGIS/pgcrypto (altrimenti `ST_Distance`/`gen_random_uuid` non si risolverebbero più
-- dentro le funzioni che fissano `search_path = public`) — fatto qui con un blocco dinamico
-- invece di elencare a mano ~30 firme, per evitare di dimenticarne una.

-- 1. skill_taxonomy: stesso pattern di sola-lettura-pubblica + scrittura-staff di feature_flags
-- (006) — è un catalogo di riferimento, non dati per-utente.
alter table skill_taxonomy enable row level security;

drop policy if exists skill_taxonomy_read on skill_taxonomy;
create policy skill_taxonomy_read on skill_taxonomy for select using (true);

drop policy if exists skill_taxonomy_staff_write on skill_taxonomy;
create policy skill_taxonomy_staff_write on skill_taxonomy for all
  using (is_admin_or_support()) with check (is_admin_or_support());

-- 2. Estensioni fuori da public. `extensions` è lo schema che Supabase crea di default in ogni
-- progetto per questo esatto scopo ed è già incluso nel search_path di sessione del SQL Editor.
-- `alter extension ... set schema` NON è idempotente (errore se già spostata) — a differenza di
-- ogni altra istruzione in questo file, quindi qui serve una guardia esplicita per poter rilanciare
-- questa migration in sicurezza in caso di dubbio su un'esecuzione precedente.
--
-- PostGIS però NON supporta affatto `SET SCHEMA` in questo ambiente (Postgres restituisce
-- l'errore "0A000: extension postgis does not support SET SCHEMA" — l'estensione è marcata
-- "non rilocabile" dal suo stesso control file, non è un limite di questo script). L'unica strada
-- per spostarla davvero sarebbe drop/recreate, il che farebbe cadere in cascata OGNI colonna
-- `geography`/`geometry` esistente (home_location, company_locations.location, ecc.) — una
-- migrazione dati distruttiva e sproporzionata solo per silenziare un avviso di postura. PostGIS
-- resta quindi in `public`: rischio accettato e documentato (è la scelta comune per progetti
-- Supabase che usano PostGIS, non una scorciatoia presa qui). `uuid-ossp`/`pgcrypto` invece
-- supportano lo spostamento e vengono spostate.
create schema if not exists extensions;

do $$
begin
  if not exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'uuid-ossp' and n.nspname = 'extensions'
  ) then
    alter extension "uuid-ossp" set schema extensions;
  end if;

  if not exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) then
    alter extension pgcrypto set schema extensions;
  end if;
end;
$$;

-- 3a. Le tre funzioni fondamentali di 006, mai coperte da `set search_path` finora.
alter function public.current_user_role() set search_path = public, extensions;
alter function public.is_company_member(uuid) set search_path = public, extensions;
alter function public.is_admin_or_support() set search_path = public, extensions;

-- 3b. Altra funzione già in produzione (023) scritta senza search_path esplicito (non security
-- definer, ma il linter la segnala comunque come buona pratica mancante) e il trigger di 004.
-- Nota: `worker_points_level`/`calculate_blinknow_fee_cents` (025, non ancora applicata quando
-- questa migration può girare) nascono già con `search_path = public, extensions` impostato
-- direttamente alla creazione — Postgres non richiede che gli schemi elencati in `search_path`
-- esistano già, quindi l'ordine fra questa migration e 025 non ha importanza.
alter function public.is_blinknow_enabled_for_job(text) set search_path = public, extensions;
alter function public.enforce_payment_requires_completed_assignment() set search_path = public, extensions;

-- 3c. Ogni funzione che aveva già `search_path = public` fissato (007 in poi): estende
-- l'impostazione esistente per includere anche `extensions`, così le chiamate a PostGIS/pgcrypto
-- al loro interno continuano a risolversi dopo lo spostamento del punto 2. Un blocco dinamico
-- evita di elencare a mano ogni firma (con relativo rischio di dimenticarne una).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proconfig is not null
      and exists (select 1 from unnest(p.proconfig) cfg where cfg = 'search_path=public')
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
  end loop;
end;
$$;
-- BlinkJob — 028: M18 (template incarichi + talent pool/preferiti — PRD sez. 21.2 "should have").
-- Due funzionalità indipendenti, stesso schema di riferimento di `jobs`/`job_requirements` (003)
-- per coerenza — un template è "gli stessi campi di un incarico, meno luogo/orari/scadenza",
-- il talent pool è un elenco aziendale di lavoratori con cui si è già lavorato davvero.

create table if not exists job_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid not null references users(id),
  title text not null,
  category text not null,
  description text not null,
  positions_count int not null check (positions_count > 0),
  pay_amount_cents int not null check (pay_amount_cents >= 0),
  pay_currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

create table if not exists job_template_requirements (
  template_id uuid not null references job_templates(id) on delete cascade,
  skill_id uuid not null references skill_taxonomy(id) on delete restrict,
  mandatory boolean not null default false,
  primary key (template_id, skill_id)
);

alter table job_templates enable row level security;
alter table job_template_requirements enable row level security;

-- Stesso schema di company_locations_manage (006): solo i membri della propria azienda.
drop policy if exists job_templates_manage on job_templates;
create policy job_templates_manage on job_templates for all
  using (is_company_member(company_id)) with check (is_company_member(company_id));

drop policy if exists job_template_requirements_manage on job_template_requirements;
create policy job_template_requirements_manage on job_template_requirements for all
  using (exists (select 1 from job_templates t where t.id = template_id and is_company_member(t.company_id)));

-- Talent pool: solo lavoratori con cui l'azienda ha già completato almeno un incarico — non un
-- elenco/directory libera di tutti i lavoratori (stesso principio di privacy-by-design già
-- applicato a worker_badges_company_read_via_candidate, 026, solo più stringente: qui serve un
-- rapporto di lavoro reale già concluso, non solo idoneità geografica).
create table if not exists company_worker_favorites (
  company_id uuid not null references companies(id) on delete cascade,
  worker_id uuid not null references worker_profiles(user_id) on delete cascade,
  added_by uuid not null references users(id),
  note text,
  created_at timestamptz not null default now(),
  primary key (company_id, worker_id)
);

alter table company_worker_favorites enable row level security;

drop policy if exists company_worker_favorites_read on company_worker_favorites;
create policy company_worker_favorites_read on company_worker_favorites for select
  using (is_company_member(company_id));

create or replace function public.add_worker_to_talent_pool(p_worker_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from company_members
  where user_id = auth.uid()
  limit 1;

  if v_company_id is null then
    raise exception 'Devi far parte di un''azienda';
  end if;

  if not exists (
    select 1
    from assignments a
    join jobs j on j.id = a.job_id
    where a.worker_id = p_worker_id and j.company_id = v_company_id and a.status = 'completed'
  ) then
    raise exception 'Puoi aggiungere al talent pool solo lavoratori con cui hai già completato un incarico';
  end if;

  insert into company_worker_favorites (company_id, worker_id, added_by, note)
  values (v_company_id, p_worker_id, auth.uid(), nullif(trim(coalesce(p_note, '')), ''))
  on conflict (company_id, worker_id) do update set note = excluded.note;
end;
$$;

create or replace function public.remove_worker_from_talent_pool(p_worker_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from company_members
  where user_id = auth.uid()
  limit 1;

  if v_company_id is null then
    raise exception 'Devi far parte di un''azienda';
  end if;

  delete from company_worker_favorites
  where company_id = v_company_id and worker_id = p_worker_id;
end;
$$;

revoke all on function public.add_worker_to_talent_pool(uuid, text) from public;
revoke all on function public.remove_worker_from_talent_pool(uuid) from public;
grant execute on function public.add_worker_to_talent_pool(uuid, text) to authenticated;
grant execute on function public.remove_worker_from_talent_pool(uuid) to authenticated;
-- BlinkJob — 029: M20 (KPI reali console admin — PRD sez. 19.3).
-- Il PRD descrive un intero funnel di eventi dedicato (sez. 19.1/19.2) — costruire quella
-- infrastruttura (tabella eventi + strumentazione di ogni azione) è un progetto a parte. Qui si
-- calcolano invece i KPI più utili direttamente dai dati che esistono già (jobs/applications/
-- assignments/disputes/payments), senza inventare un sistema di tracking separato — più semplice
-- e comunque reale, non un placeholder.
--
-- Semplificazione documentata: il "tempo di conferma" usa `jobs.created_at` come proxy per il
-- momento di pubblicazione (questo schema non registra un timestamp separato per la transizione
-- a 'published' — `updated_at` viene sovrascritto a ogni modifica, non solo alla pubblicazione).
-- Il "no-show rate" è approssimato come assignment annullati senza alcun check-in registrato —
-- un proxy ragionevole, non l'evento "no-show" esplicito che il PRD prevede a sé (richiederebbe
-- uno scheduler per rilevare l'assenza al superamento dell'orario di inizio, non presente in
-- questo stack, stesso limite già documentato per BlinkNow in 025).

create or replace function public.admin_kpi_summary()
returns table (
  fill_rate numeric,
  median_hours_to_confirm numeric,
  completion_rate numeric,
  no_show_rate numeric,
  dispute_rate numeric,
  payment_success_rate numeric
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_published_positions bigint;
  v_confirmed_positions bigint;
  v_non_canceled bigint;
  v_completed bigint;
  v_no_show_like bigint;
  v_disputes bigint;
  v_paid bigint;
  v_payments_total bigint;
  v_median_hours numeric;
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  select coalesce(sum(positions_count), 0) into v_published_positions
  from jobs
  where status in ('published', 'in_selection', 'confirmed', 'in_progress', 'completed');

  select count(*) into v_confirmed_positions from assignments where status <> 'canceled';

  select
    count(*) filter (where status <> 'canceled'),
    count(*) filter (where status = 'completed'),
    count(*) filter (
      where status = 'canceled'
        and not exists (select 1 from check_events ce where ce.assignment_id = assignments.id and ce.type = 'check_in')
    )
  into v_non_canceled, v_completed, v_no_show_like
  from assignments;

  select count(*) into v_disputes from disputes;

  select count(*) filter (where status = 'paid'), count(*) into v_paid, v_payments_total from payments;

  select percentile_cont(0.5) within group (order by extract(epoch from (a.confirmed_at - j.created_at)) / 3600.0)
  into v_median_hours
  from assignments a
  join jobs j on j.id = a.job_id;

  return query
  select
    case when v_published_positions > 0 then round(100.0 * v_confirmed_positions / v_published_positions, 1) else 0 end,
    round(coalesce(v_median_hours, 0), 1),
    case when v_non_canceled > 0 then round(100.0 * v_completed / v_non_canceled, 1) else 0 end,
    case when v_non_canceled > 0 then round(100.0 * v_no_show_like / v_non_canceled, 1) else 0 end,
    case when v_completed > 0 then round(100.0 * v_disputes / v_completed, 1) else 0 end,
    case when v_payments_total > 0 then round(100.0 * v_paid / v_payments_total, 1) else 0 end;
end;
$$;

revoke all on function public.admin_kpi_summary() from public;
grant execute on function public.admin_kpi_summary() to authenticated;
-- BlinkJob — 030: M21 (chat contestuale azienda-lavoratore — PRD sez. 22 "MSG-001..004").
-- Una conversazione per coppia (job, worker) — stessa chiave di `applications` (unique job_id,
-- worker_id, 003): la chat è "contestuale" a una candidatura/incarico, non un DM libero fra
-- estranei. Può essere creata solo se esiste già una candidatura per quella coppia (get_or_create_
-- conversation lo verifica), così non diventa un canale di contatto diretto prima che l'azienda
-- abbia davvero valutato il lavoratore.
--
-- Mascheramento contatti (MSG-002, "should have"): euristica via regex su email e sequenze
-- numeriche lunghe (telefoni), non un NLP dedicato — stesso compromesso "reale ma non perfetto"
-- già documentato per BlinkNow (025) e i KPI (029). Falsi positivi/negativi possibili, ma copre il
-- caso comune (scambiarsi email/numero per uscire dalla piattaforma).

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  worker_id uuid not null references worker_profiles(user_id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id),
  body text not null,
  contains_masked_contact boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  reporter_id uuid not null references users(id),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table conversations enable row level security;
alter table messages enable row level security;
alter table message_reports enable row level security;

drop policy if exists conversations_read on conversations;
create policy conversations_read on conversations for select
  using (worker_id = auth.uid() or is_company_member(company_id));

drop policy if exists messages_read on messages;
create policy messages_read on messages for select
  using (exists (
    select 1 from conversations c
    where c.id = conversation_id and (c.worker_id = auth.uid() or is_company_member(c.company_id))
  ));

drop policy if exists message_reports_read on message_reports;
create policy message_reports_read on message_reports for select
  using (reporter_id = auth.uid() or is_admin_or_support());

-- Nessuna policy insert diretta: creazione conversazione, invio messaggio e segnalazione passano
-- tutte da RPC security definer (stesso motivo di notify_on_* in 022 — serve validare
-- l'appartenenza/candidatura e, per i messaggi, applicare il mascheramento in modo atomico).

create or replace function public.get_or_create_conversation(p_job_id uuid, p_worker_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job jobs%rowtype;
  v_conversation_id uuid;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found then
    raise exception 'Job not found';
  end if;

  if not (auth.uid() = p_worker_id or is_company_member(v_job.company_id)) then
    raise exception 'Not authorized to open this conversation';
  end if;

  if not exists (
    select 1 from applications where job_id = p_job_id and worker_id = p_worker_id
  ) then
    raise exception 'Nessuna candidatura trovata per questo incarico e lavoratore';
  end if;

  select id into v_conversation_id from conversations
  where job_id = p_job_id and worker_id = p_worker_id;

  if v_conversation_id is null then
    insert into conversations (job_id, worker_id, company_id)
    values (p_job_id, p_worker_id, v_job.company_id)
    returning id into v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$;

create or replace function public.send_message(p_conversation_id uuid, p_body text)
returns messages
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_conversation conversations%rowtype;
  v_body text;
  v_masked boolean := false;
  v_message messages%rowtype;
begin
  select * into v_conversation from conversations where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found';
  end if;

  if not (v_conversation.worker_id = auth.uid() or is_company_member(v_conversation.company_id)) then
    raise exception 'Not authorized to post in this conversation';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'Message body cannot be empty';
  end if;

  v_body := regexp_replace(v_body, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contatto rimosso]', 'g');
  v_body := regexp_replace(v_body, '(\+?[0-9][0-9 .-]{7,}[0-9])', '[contatto rimosso]', 'g');
  v_masked := v_body <> trim(p_body);

  insert into messages (conversation_id, sender_id, body, contains_masked_contact)
  values (p_conversation_id, auth.uid(), v_body, v_masked)
  returning * into v_message;

  if auth.uid() = v_conversation.worker_id then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'message_received',
      jsonb_build_object('conversation_id', p_conversation_id, 'job_id', v_conversation.job_id)
    from company_members cm
    where cm.company_id = v_conversation.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_conversation.worker_id, 'message_received',
      jsonb_build_object('conversation_id', p_conversation_id, 'job_id', v_conversation.job_id)
    );
  end if;

  return v_message;
end;
$$;

create or replace function public.report_message(p_message_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_conversation conversations%rowtype;
begin
  select c.* into v_conversation
  from messages m join conversations c on c.id = m.conversation_id
  where m.id = p_message_id;

  if not found then
    raise exception 'Message not found';
  end if;

  if not (v_conversation.worker_id = auth.uid() or is_company_member(v_conversation.company_id)) then
    raise exception 'Not authorized to report this message';
  end if;

  insert into message_reports (message_id, reporter_id, reason)
  values (p_message_id, auth.uid(), nullif(trim(coalesce(p_reason, '')), ''));
end;
$$;

revoke all on function public.get_or_create_conversation(uuid, uuid) from public;
revoke all on function public.send_message(uuid, text) from public;
revoke all on function public.report_message(uuid, text) from public;
grant execute on function public.get_or_create_conversation(uuid, uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.report_message(uuid, text) to authenticated;
-- BlinkJob — 031: M22 (appello dispute — PRD sez. 20 "should have").
-- `dispute_status` include già 'appealed'/'closed' fin dalla 001 (mai usati finora): un ciclo a due
-- passaggi, non un percorso di ricorso a più livelli — 'open' → 'resolved' (admin) → opzionalmente
-- 'appealed' (la parte che non è d'accordo, una sola volta) → 'closed' (decisione finale
-- dell'admin, non più appellabile). Riusa la colonna `resolution` esistente (005) per l'esito più
-- recente invece di tenere uno storico completo — coerente con "non un percorso di ricorso a più
-- livelli".

alter table disputes add column if not exists appeal_reason text;

create or replace function public.appeal_dispute(p_dispute_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dispute disputes%rowtype;
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
  v_appealed_by_worker boolean;
begin
  select * into v_dispute from disputes where id = p_dispute_id;
  if not found then
    raise exception 'Dispute not found';
  end if;

  select * into v_assignment from assignments where id = v_dispute.assignment_id;
  select * into v_job from jobs where id = v_assignment.job_id;

  if not (v_assignment.worker_id = auth.uid() or is_company_member(v_job.company_id)) then
    raise exception 'Not authorized to appeal this dispute';
  end if;

  if v_dispute.status <> 'resolved' then
    raise exception 'Puoi fare appello solo su una disputa già risolta';
  end if;

  v_appealed_by_worker := auth.uid() = v_assignment.worker_id;

  update disputes
  set status = 'appealed', appeal_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_dispute_id;

  if v_appealed_by_worker then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'dispute_appealed',
      jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_assignment.worker_id, 'dispute_appealed',
      jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id)
    );
  end if;
end;
$$;

-- Ridefinita (022) per gestire il secondo passaggio: risolvere una disputa in appello la chiude
-- definitivamente invece di rimetterla in 'resolved' (che riaprirebbe la possibilità di appello).
create or replace function public.resolve_dispute(p_dispute_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dispute disputes%rowtype;
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
  v_new_status dispute_status;
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  select * into v_dispute from disputes where id = p_dispute_id;
  if not found then
    raise exception 'Dispute not found';
  end if;

  if v_dispute.status not in ('open', 'collecting', 'deciding', 'appealed') then
    raise exception 'Dispute is not in a resolvable state (status: %)', v_dispute.status;
  end if;

  v_new_status := case when v_dispute.status = 'appealed' then 'closed' else 'resolved' end;

  select * into v_assignment from assignments where id = v_dispute.assignment_id;
  select * into v_job from jobs where id = v_assignment.job_id;

  update disputes set status = v_new_status, resolution = p_resolution where id = p_dispute_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_resolve_dispute', 'dispute', p_dispute_id, jsonb_build_object('resolution', p_resolution, 'new_status', v_new_status));

  insert into notifications (user_id, event_type, payload)
  values (
    v_assignment.worker_id, 'dispute_resolved',
    jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id, 'resolution', p_resolution)
  );
  insert into notifications (user_id, event_type, payload)
  select cm.user_id, 'dispute_resolved',
    jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id, 'resolution', p_resolution)
  from company_members cm
  where cm.company_id = v_job.company_id;
end;
$$;

revoke all on function public.appeal_dispute(uuid, text) from public;
grant execute on function public.appeal_dispute(uuid, text) to authenticated;
-- BlinkJob — 032: M24 (centro notifiche: quiet hours + dedup — PRD sez. 8.8 NOT-002..006).
-- Semplificazione documentata: le notifiche restano solo in-app (nessun canale email/SMS
-- integrato, vedi FULL_SCOPE_ASSESSMENT.md categoria 2) — quindi un vero "digest" (batch inviato
-- a intervalli) non ha un canale su cui essere consegnato. Qui si implementa ciò che è comunque
-- reale in un sistema pull-based: le notifiche generate durante le "ore silenziose" restano
-- create ma non visibili finché la finestra non finisce (`visible_at`), e notifiche duplicate
-- sullo stesso evento/riferimento entro 24h si accorpano in una sola riga con un contatore
-- (`occurrences`) invece di accumularsi. `digest_mode` è salvato come preferenza e usato solo per
-- il raggruppamento visivo nella pagina notifiche, non per una consegna posticipata reale.
-- Fascia oraria calcolata su Europe/Rome (unico mercato del pilot, PRD sez. 1).

create table if not exists notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  quiet_hours_start smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end smallint check (quiet_hours_end between 0 and 23),
  digest_mode text not null default 'immediate' check (digest_mode in ('immediate', 'daily')),
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

drop policy if exists notification_preferences_owner on notification_preferences;
create policy notification_preferences_owner on notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table notifications add column if not exists visible_at timestamptz not null default now();
alter table notifications add column if not exists occurrences int not null default 1;

create index if not exists idx_notifications_visible on notifications (user_id, visible_at) where read_at is null;

create or replace function public.apply_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prefs notification_preferences%rowtype;
  v_dedup_key text;
  v_existing_id uuid;
  v_local_time time;
  v_local_today timestamp;
begin
  select * into v_prefs from notification_preferences where user_id = new.user_id;

  v_dedup_key := coalesce(
    new.payload->>'conversation_id',
    new.payload->>'dispute_id',
    new.payload->>'assignment_id',
    new.payload->>'job_id',
    ''
  );

  if v_dedup_key <> '' then
    select id into v_existing_id
    from notifications
    where user_id = new.user_id
      and event_type = new.event_type
      and read_at is null
      and created_at > now() - interval '24 hours'
      and coalesce(payload->>'conversation_id', payload->>'dispute_id', payload->>'assignment_id', payload->>'job_id', '') = v_dedup_key
    order by created_at desc
    limit 1;

    if v_existing_id is not null then
      update notifications
      set occurrences = occurrences + 1, created_at = now(), payload = new.payload
      where id = v_existing_id;
      return null;
    end if;
  end if;

  new.visible_at := now();

  if v_prefs.quiet_hours_start is not null and v_prefs.quiet_hours_end is not null then
    v_local_time := (now() at time zone 'Europe/Rome')::time;
    v_local_today := date_trunc('day', now() at time zone 'Europe/Rome');

    if v_prefs.quiet_hours_start < v_prefs.quiet_hours_end then
      if v_local_time >= make_time(v_prefs.quiet_hours_start, 0, 0)
        and v_local_time < make_time(v_prefs.quiet_hours_end, 0, 0) then
        new.visible_at := (v_local_today + make_interval(hours => v_prefs.quiet_hours_end)) at time zone 'Europe/Rome';
      end if;
    else
      if v_local_time >= make_time(v_prefs.quiet_hours_start, 0, 0) then
        new.visible_at := (v_local_today + interval '1 day' + make_interval(hours => v_prefs.quiet_hours_end)) at time zone 'Europe/Rome';
      elsif v_local_time < make_time(v_prefs.quiet_hours_end, 0, 0) then
        new.visible_at := (v_local_today + make_interval(hours => v_prefs.quiet_hours_end)) at time zone 'Europe/Rome';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_notification_preferences on notifications;
create trigger trg_apply_notification_preferences
  before insert on notifications
  for each row execute function apply_notification_preferences();
-- BlinkJob — 033: M25 (archivio documenti con accettazione tracciata — PRD sez. 8.7 DOC-xxx).
-- Il *contenuto legale* reale (testo di Termini di Servizio, Privacy, contratti) è categoria 3
-- (serve un legale) — qui si costruisce solo l'infrastruttura: versioning per chiave (`key` +
-- `version`, un documento può avere più versioni nel tempo, la più recente è quella "corrente"),
-- archivio consultabile, e accettazione con evidenza (timestamp + IP + user agent), non solo un
-- checkbox scartato subito dopo la validazione come accadeva finora in `registerAction`.
-- `scope` distingue documenti di piattaforma (Termini/Privacy, uno per tutti) da documenti
-- legati a un contesto specifico (es. termini di un incarico) — solo il primo caso è collegato
-- a un flusso reale (registrazione) in questa milestone; il secondo è schema pronto per quando
-- servirà, non wiring inventato senza consumo reale.

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'assignment')),
  key text not null,
  title text not null,
  body text not null,
  version int not null default 1,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (scope, key, version)
);

create table if not exists document_acceptances (
  id uuid primary key default gen_random_uuid(),
  document_template_id uuid not null references document_templates(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  context_id uuid,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

alter table document_templates enable row level security;
alter table document_acceptances enable row level security;

-- Stesso pattern di skill_taxonomy (027): catalogo di riferimento, lettura pubblica, scrittura solo staff.
drop policy if exists document_templates_read on document_templates;
create policy document_templates_read on document_templates for select using (true);

drop policy if exists document_templates_staff_write on document_templates;
create policy document_templates_staff_write on document_templates for all
  using (is_admin_or_support()) with check (is_admin_or_support());

-- Append-only, come audit_events (005): l'utente vede le proprie accettazioni, l'admin tutte,
-- nessun update/delete concesso.
drop policy if exists document_acceptances_read on document_acceptances;
create policy document_acceptances_read on document_acceptances for select
  using (user_id = auth.uid() or is_admin_or_support());

drop policy if exists document_acceptances_insert_own on document_acceptances;
create policy document_acceptances_insert_own on document_acceptances for insert
  with check (user_id = auth.uid());

create index if not exists idx_document_acceptances_user on document_acceptances (user_id);

insert into document_templates (scope, key, title, body, version) values
  (
    'platform', 'terms_of_service', 'Termini di Servizio',
    'Bozza operativa dei Termini di Servizio di BlinkJob. Testo legale definitivo da validare con un legale prima del lancio pubblico (vedi docs/FULL_SCOPE_ASSESSMENT.md, categoria 3). Utilizzando la piattaforma accetti che BlinkJob mette in contatto aziende e lavoratori per incarichi temporanei e traccia le fasi di candidatura, esecuzione e pagamento di ogni incarico.',
    1
  ),
  (
    'platform', 'privacy_policy', 'Informativa Privacy',
    'Bozza operativa dell''Informativa Privacy di BlinkJob. Testo legale definitivo, incluse basi giuridiche e retention, da validare con un DPO/privacy counsel (vedi docs/FULL_SCOPE_ASSESSMENT.md, categoria 3). I dati raccolti in questa fase (profilo, candidature, incarichi, messaggi, pagamenti tracciati) sono usati esclusivamente per far funzionare la piattaforma.',
    1
  )
on conflict (scope, key, version) do nothing;
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
