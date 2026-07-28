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
