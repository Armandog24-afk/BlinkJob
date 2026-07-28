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
