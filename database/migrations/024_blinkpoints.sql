-- BlinkJob — 024: M14 (BlinkPoints — punti/badge interni, PRD sez. 9.3, requisiti PTS-001..005).
-- Il PRD è esplicito: "Nel pilot può essere simulato internamente senza ricompense monetarie" —
-- esattamente il ruolo già previsto per `points_ledger` (005/006/010: tabella creata ma mai
-- scritta, RLS abilitata senza alcuna policy INSERT/UPDATE/DELETE per il client). Qui si
-- implementa solo quella simulazione interna: nessun redeem, nessun marketplace ricompense
-- (PTS-005, esplicitamente rimandato dal PRD stesso "solo dopo analisi fiscale e antifrode").
--
-- Semplificazioni MVP documentate (scelte deliberate, non dimenticanze):
-- 1. PTS-002 "livelli e badge configurabili, regole versionate": i valori punti sono costanti
--    hardcoded qui (versione "v1" implicita nel commento), non una tabella di configurazione
--    editabile da admin — stesso pattern già usato per `calculate_platform_fee_cents` (018).
--    Una UI di configurazione è oggettivamente post-pilot ("può essere simulato").
-- 2. "Conferma disponibilità aggiornata → punti periodici" (riga 2 della tabella PRD) NON è
--    implementata: nell'MVP attuale non esiste alcun flusso per modificare la disponibilità
--    dopo l'onboarding iniziale (gap indipendente da BlinkPoints, fuori scope qui).
-- 3. PTS-004 "revoca punti in caso di abuso, con motivo e contestazione" è implementata come
--    azione admin manuale (`admin_adjust_points`) invece di una regola automatica legata alle
--    dispute: `resolve_dispute` accetta oggi solo una nota testuale libera, non un esito
--    strutturato (vinta/persa dal lavoratore) da cui derivare in modo affidabile una revoca
--    automatica — un umano che decide è più sicuro di un'euristica su testo libero.
-- 4. PTS-003 "nessun pay-to-rank" è soddisfatto per costruzione: `points_ledger` non è mai letto
--    da `reliability_score` (che resta derivato solo dalle recensioni, 019) e non esiste alcun
--    flusso di acquisto in questo MVP.
-- 5. PTS-001 "ledger immutabile": nessuna funzione qui esegue mai update/delete su
--    `points_ledger`, solo insert — una revoca è una nuova riga con importo negativo e motivo,
--    mai una modifica alla storia (coerente con "motivo e possibilità di contestazione").

create or replace function public.award_points(
  p_user_id uuid,
  p_points int,
  p_reason text,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select enabled_globally from feature_flags where key = 'blinkpoints_enabled'), false) then
    return;
  end if;

  insert into points_ledger (user_id, points, reason, reference_type, reference_id)
  values (p_user_id, p_points, p_reason, p_reference_type, p_reference_id);
end;
$$;

-- Badge profilo completo: una tantum, sia al primo submit (insert, profilo già al 100%) sia a un
-- successivo aggiornamento che lo porta al 100% (update) — mai due volte per lo stesso worker.
create or replace function public.award_points_on_profile_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completeness_score = 100 and (tg_op = 'INSERT' or old.completeness_score < 100) then
    perform award_points(new.user_id, 50, 'profile_completed_badge', 'worker_profiles', new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_award_points_on_profile_completion on worker_profiles;
create trigger trg_award_points_on_profile_completion
  after insert or update on worker_profiles
  for each row execute function award_points_on_profile_completion();

-- Recensione utile: punti fissi a chi scrive, indipendenti dal voto assegnato (PRD: "niente
-- incentivo sul voto positivo" — l'incentivo è contribuire, non votare bene).
create or replace function public.award_points_on_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform award_points(new.author_id, 5, 'review_contributed', 'review', new.id);
  return new;
end;
$$;

drop trigger if exists trg_award_points_on_review_insert on reviews;
create trigger trg_award_points_on_review_insert
  after insert on reviews
  for each row execute function award_points_on_review_insert();

-- Punti affidabilità: ridefinisce 018/017 per aggiungere l'assegnazione nello stesso passaggio
-- atomico del completamento (nessun'altra logica cambiata).
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
  v_confirmed_by_worker boolean;
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

  v_confirmed_by_worker := v_assignment.worker_id = auth.uid();

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

  perform award_points(v_assignment.worker_id, 20, 'assignment_completed_no_issues', 'assignment', p_assignment_id);

  if v_confirmed_by_worker then
    insert into notifications (user_id, event_type, payload)
    select cm.user_id, 'assignment_completed',
      jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
    from company_members cm
    where cm.company_id = v_job.company_id;
  else
    insert into notifications (user_id, event_type, payload)
    values (
      v_assignment.worker_id, 'assignment_completed',
      jsonb_build_object('job_title', v_job.title, 'assignment_id', p_assignment_id)
    );
  end if;
end;
$$;

-- PTS-004: rettifica/revoca manuale, con motivo obbligatorio — mai una update/delete sulla riga
-- originale, sempre una nuova riga (positiva o negativa) che la storia lascia intatta.
create or replace function public.admin_adjust_points(p_user_id uuid, p_points int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_or_support() then
    raise exception 'Not authorized';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required for a manual points adjustment';
  end if;

  insert into points_ledger (user_id, points, reason, reference_type)
  values (p_user_id, p_points, 'admin_adjustment: ' || trim(p_reason), 'admin_adjustment');

  insert into audit_events (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), 'admin_adjust_points', 'user', p_user_id,
    jsonb_build_object('points', p_points, 'reason', p_reason));
end;
$$;

revoke all on function public.admin_adjust_points(uuid, int, text) from public;
grant execute on function public.admin_adjust_points(uuid, int, text) to authenticated;
