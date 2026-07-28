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
