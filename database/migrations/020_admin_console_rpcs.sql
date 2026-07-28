-- BlinkJob — 020: M9 (console amministrativa — utenti, aziende, dispute, analytics base).
-- Nessuna policy permette oggi a staff/admin di scrivere su `users`/`companies` (solo di
-- leggerli, via 006) — le azioni di verifica/sospensione passano quindi da RPC security definer
-- con logging in `audit_events`, stesso pattern del resto del progetto. `disputes_insert` (006)
-- ha la stessa debolezza già vista in reviews_insert: verifica solo `opened_by = auth.uid()`,
-- non la partecipazione all'assignment — corretta di conseguenza.

create or replace function public.admin_set_user_status(p_user_id uuid, p_status user_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  update users set status = p_status where id = p_user_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_set_user_status', 'user', p_user_id, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_set_company_status(p_company_id uuid, p_status company_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  update companies set status = p_status where id = p_company_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_set_company_status', 'company', p_company_id, jsonb_build_object('status', p_status));
end;
$$;

drop policy if exists disputes_insert on disputes;
create policy disputes_insert on disputes for insert
  with check (
    opened_by = auth.uid()
    and exists (
      select 1 from assignments a join jobs j on j.id = a.job_id
      where a.id = assignment_id and (a.worker_id = auth.uid() or is_company_member(j.company_id))
    )
  );

create or replace function public.open_dispute(p_assignment_id uuid, p_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute_id uuid;
begin
  if not exists (
    select 1 from assignments a join jobs j on j.id = a.job_id
    where a.id = p_assignment_id and (a.worker_id = auth.uid() or is_company_member(j.company_id))
  ) then
    raise exception 'Not authorized to open a dispute for this assignment';
  end if;

  insert into disputes (assignment_id, opened_by, type, status)
  values (p_assignment_id, auth.uid(), p_type, 'open')
  returning id into v_dispute_id;

  return v_dispute_id;
end;
$$;

create or replace function public.resolve_dispute(p_dispute_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  update disputes set status = 'resolved', resolution = p_resolution where id = p_dispute_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_resolve_dispute', 'dispute', p_dispute_id, jsonb_build_object('resolution', p_resolution));
end;
$$;

revoke all on function public.admin_set_user_status(uuid, user_status) from public;
revoke all on function public.admin_set_company_status(uuid, company_status) from public;
revoke all on function public.open_dispute(uuid, text) from public;
revoke all on function public.resolve_dispute(uuid, text) from public;
grant execute on function public.admin_set_user_status(uuid, user_status) to authenticated;
grant execute on function public.admin_set_company_status(uuid, company_status) to authenticated;
grant execute on function public.open_dispute(uuid, text) to authenticated;
grant execute on function public.resolve_dispute(uuid, text) to authenticated;
