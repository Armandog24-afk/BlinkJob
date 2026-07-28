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
