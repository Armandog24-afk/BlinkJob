-- BlinkJob — 031: M22 (appello dispute — PRD sez. 20 "should have").
-- `dispute_status` include già 'appealed'/'closed' fin dalla 001 (mai usati finora): un ciclo a due
-- passaggi, non un percorso di ricorso a più livelli — 'open' → 'resolved' (admin) → opzionalmente
-- 'appealed' (la parte che non è d'accordo, una sola volta) → 'closed' (decisione finale
-- dell'admin, non più appellabile). Riusa la colonna `resolution` esistente (005) per l'esito più
-- recente invece di tenere uno storico completo — coerente con "non un percorso di ricorso a più
-- livelli".

alter table disputes add column if not exists appeal_reason text;

create or replace function public.appeal_dispute(p_dispute_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dispute disputes%rowtype;
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
  v_appealed_by_worker boolean;
begin
  select * into v_dispute from disputes where id = p_dispute_id;
  if not found then
    raise exception 'Dispute not found';
  end if;

  select * into v_assignment from assignments where id = v_dispute.assignment_id;
  select * into v_job from jobs where id = v_assignment.job_id;

  if not (v_assignment.worker_id = auth.uid() or is_company_member(v_job.company_id)) then
    raise exception 'Not authorized to appeal this dispute';
  end if;

  if v_dispute.status <> 'resolved' then
    raise exception 'Puoi fare appello solo su una disputa già risolta';
  end if;

  v_appealed_by_worker := auth.uid() = v_assignment.worker_id;

  update disputes
  set status = 'appealed', appeal_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_dispute_id;

  if v_appealed_by_worker then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'dispute_appealed',
      jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_assignment.worker_id, 'dispute_appealed',
      jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id)
    );
  end if;
end;
$$;

-- Ridefinita (022) per gestire il secondo passaggio: risolvere una disputa in appello la chiude
-- definitivamente invece di rimetterla in 'resolved' (che riaprirebbe la possibilità di appello).
create or replace function public.resolve_dispute(p_dispute_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_dispute disputes%rowtype;
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
  v_new_status dispute_status;
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  select * into v_dispute from disputes where id = p_dispute_id;
  if not found then
    raise exception 'Dispute not found';
  end if;

  if v_dispute.status not in ('open', 'collecting', 'deciding', 'appealed') then
    raise exception 'Dispute is not in a resolvable state (status: %)', v_dispute.status;
  end if;

  v_new_status := case when v_dispute.status = 'appealed' then 'closed' else 'resolved' end;

  select * into v_assignment from assignments where id = v_dispute.assignment_id;
  select * into v_job from jobs where id = v_assignment.job_id;

  update disputes set status = v_new_status, resolution = p_resolution where id = p_dispute_id;

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_resolve_dispute', 'dispute', p_dispute_id, jsonb_build_object('resolution', p_resolution, 'new_status', v_new_status));

  insert into notifications (user_id, event_type, payload)
  values (
    v_assignment.worker_id, 'dispute_resolved',
    jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id, 'resolution', p_resolution)
  );
  insert into notifications (user_id, event_type, payload)
  select cm.user_id, 'dispute_resolved',
    jsonb_build_object('job_title', v_job.title, 'dispute_id', p_dispute_id, 'resolution', p_resolution)
  from company_members cm
  where cm.company_id = v_job.company_id;
end;
$$;

revoke all on function public.appeal_dispute(uuid, text) from public;
grant execute on function public.appeal_dispute(uuid, text) to authenticated;
