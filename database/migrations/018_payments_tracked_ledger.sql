-- BlinkJob — 018: M7 (pagamenti — ledger tracciato, nessun PSP reale).
-- Per TECH_ARCHITECTURE.md sez. 2: TrackedLedgerProvider, nessun money-movement reale in questa
-- fase. Un pagamento viene creato automaticamente quando un assignment passa a 'completed'
-- (mai manualmente, e mai per un assignment non completato — enforced sia qui sia dal trigger
-- `enforce_payment_requires_completed_assignment` di 004). L'azienda poi conferma l'importo e
-- segna il pagamento come effettuato (bonifico/contanti fuori piattaforma — tracciato, non
-- processato). payments non ha alcuna policy INSERT/UPDATE (006): tutte le transizioni passano
-- da RPC security definer, stesso pattern delle altre milestone.

create or replace function public.calculate_platform_fee_cents(p_gross_amount_cents int)
returns int
language sql
immutable
as $$
  -- fee_version 'v1': commissione piattaforma 12% flat, arrotondata verso il basso.
  select floor(p_gross_amount_cents * 0.12)::int;
$$;

-- Ridefinisce 014's confirm_assignment_completion per creare anche il pagamento tracciato,
-- atomicamente con la transizione a 'completed'.
create or replace function public.confirm_assignment_completion(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_job jobs%rowtype;
  v_gross int;
  v_fee int;
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

  v_gross := (v_assignment.confirmed_terms_snapshot->>'pay_amount_cents')::int;
  v_fee := calculate_platform_fee_cents(v_gross);

  insert into payments (
    assignment_id, gross_amount_cents, platform_fee_cents, fee_version, net_amount_cents,
    currency, status, provider
  )
  values (
    p_assignment_id, v_gross, v_fee, 'v1', v_gross - v_fee,
    coalesce(v_assignment.confirmed_terms_snapshot->>'pay_currency', 'EUR'), 'pending', 'tracked_ledger'
  );
end;
$$;

create or replace function public.confirm_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments%rowtype;
  v_job jobs%rowtype;
begin
  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;

  select j.* into v_job from assignments a join jobs j on j.id = a.job_id where a.id = v_payment.assignment_id;

  if not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to confirm this payment';
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'Payment is not pending (status: %)', v_payment.status;
  end if;

  update payments set status = 'confirmed' where id = p_payment_id;
end;
$$;

create or replace function public.mark_payment_paid(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments%rowtype;
  v_job jobs%rowtype;
begin
  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;

  select j.* into v_job from assignments a join jobs j on j.id = a.job_id where a.id = v_payment.assignment_id;

  if not is_company_member(v_job.company_id) then
    raise exception 'Not authorized to mark this payment as paid';
  end if;

  if v_payment.status <> 'confirmed' then
    raise exception 'Payment is not confirmed (status: %)', v_payment.status;
  end if;

  update payments set status = 'paid' where id = p_payment_id;
end;
$$;

revoke all on function public.calculate_platform_fee_cents(int) from public;
revoke all on function public.confirm_payment(uuid) from public;
revoke all on function public.mark_payment_paid(uuid) from public;
grant execute on function public.calculate_platform_fee_cents(int) to authenticated;
grant execute on function public.confirm_payment(uuid) to authenticated;
grant execute on function public.mark_payment_paid(uuid) to authenticated;
