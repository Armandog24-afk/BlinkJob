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
