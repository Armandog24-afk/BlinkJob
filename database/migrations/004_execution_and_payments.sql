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
