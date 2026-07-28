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
