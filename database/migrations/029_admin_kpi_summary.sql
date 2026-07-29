-- BlinkJob — 029: M20 (KPI reali console admin — PRD sez. 19.3).
-- Il PRD descrive un intero funnel di eventi dedicato (sez. 19.1/19.2) — costruire quella
-- infrastruttura (tabella eventi + strumentazione di ogni azione) è un progetto a parte. Qui si
-- calcolano invece i KPI più utili direttamente dai dati che esistono già (jobs/applications/
-- assignments/disputes/payments), senza inventare un sistema di tracking separato — più semplice
-- e comunque reale, non un placeholder.
--
-- Semplificazione documentata: il "tempo di conferma" usa `jobs.created_at` come proxy per il
-- momento di pubblicazione (questo schema non registra un timestamp separato per la transizione
-- a 'published' — `updated_at` viene sovrascritto a ogni modifica, non solo alla pubblicazione).
-- Il "no-show rate" è approssimato come assignment annullati senza alcun check-in registrato —
-- un proxy ragionevole, non l'evento "no-show" esplicito che il PRD prevede a sé (richiederebbe
-- uno scheduler per rilevare l'assenza al superamento dell'orario di inizio, non presente in
-- questo stack, stesso limite già documentato per BlinkNow in 025).

create or replace function public.admin_kpi_summary()
returns table (
  fill_rate numeric,
  median_hours_to_confirm numeric,
  completion_rate numeric,
  no_show_rate numeric,
  dispute_rate numeric,
  payment_success_rate numeric
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_published_positions bigint;
  v_confirmed_positions bigint;
  v_non_canceled bigint;
  v_completed bigint;
  v_no_show_like bigint;
  v_disputes bigint;
  v_paid bigint;
  v_payments_total bigint;
  v_median_hours numeric;
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;

  select coalesce(sum(positions_count), 0) into v_published_positions
  from jobs
  where status in ('published', 'in_selection', 'confirmed', 'in_progress', 'completed');

  select count(*) into v_confirmed_positions from assignments where status <> 'canceled';

  select
    count(*) filter (where status <> 'canceled'),
    count(*) filter (where status = 'completed'),
    count(*) filter (
      where status = 'canceled'
        and not exists (select 1 from check_events ce where ce.assignment_id = assignments.id and ce.type = 'check_in')
    )
  into v_non_canceled, v_completed, v_no_show_like
  from assignments;

  select count(*) into v_disputes from disputes;

  select count(*) filter (where status = 'paid'), count(*) into v_paid, v_payments_total from payments;

  select percentile_cont(0.5) within group (order by extract(epoch from (a.confirmed_at - j.created_at)) / 3600.0)
  into v_median_hours
  from assignments a
  join jobs j on j.id = a.job_id;

  return query
  select
    case when v_published_positions > 0 then round(100.0 * v_confirmed_positions / v_published_positions, 1) else 0 end,
    round(coalesce(v_median_hours, 0), 1),
    case when v_non_canceled > 0 then round(100.0 * v_completed / v_non_canceled, 1) else 0 end,
    case when v_non_canceled > 0 then round(100.0 * v_no_show_like / v_non_canceled, 1) else 0 end,
    case when v_completed > 0 then round(100.0 * v_disputes / v_completed, 1) else 0 end,
    case when v_payments_total > 0 then round(100.0 * v_paid / v_payments_total, 1) else 0 end;
end;
$$;

revoke all on function public.admin_kpi_summary() from public;
grant execute on function public.admin_kpi_summary() to authenticated;
