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
