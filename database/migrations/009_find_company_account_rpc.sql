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
