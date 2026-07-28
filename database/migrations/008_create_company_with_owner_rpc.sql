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
