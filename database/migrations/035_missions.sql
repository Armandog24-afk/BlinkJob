-- BlinkJob — 035: M27 (missioni con reward BlinkPoints — estensione di PTS-002, 026).
-- I badge (026) sono traguardi permanenti one-shot; le missioni aggiungono obiettivi più piccoli,
-- alcuni ripetibili ogni mese (`period_key` = 'YYYY-MM'), altri una tantum (`period_key` =
-- 'lifetime') — stessa infrastruttura punti (`award_points`, 024), nessuna nuova ricompensa
-- monetaria (PTS-005 resta fuori scope). Catalogo missioni hardcoded qui, tenuto allineato a mano
-- a lib/points/missions.ts — stesso pattern già accettato per lib/points/levels.ts (026).
--
-- Semplificazione documentata: nessun sistema di eventi/cron in questo stack — il completamento
-- si verifica "pigramente" quando il lavoratore visita la pagina missioni (`refresh_worker_
-- missions`), non in tempo reale al momento esatto in cui la soglia viene raggiunta. Innocuo per
-- ricompense non urgenti come queste.

create table if not exists mission_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  mission_key text not null,
  period_key text not null,
  completed_at timestamptz not null default now(),
  points_awarded int not null,
  unique (user_id, mission_key, period_key)
);

alter table mission_completions enable row level security;

drop policy if exists mission_completions_owner_read on mission_completions;
create policy mission_completions_owner_read on mission_completions for select
  using (user_id = auth.uid() or is_admin_or_support());

create or replace function public.refresh_worker_missions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_key text := to_char(now(), 'YYYY-MM');
  v_month_start timestamptz := date_trunc('month', now());
  v_count int;
  v_inserted_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Lifetime: prima candidatura.
  select count(*) into v_count from applications where worker_id = v_user_id and type = 'application';
  if v_count >= 1 then
    v_inserted_id := null;
    insert into mission_completions (user_id, mission_key, period_key, points_awarded)
    values (v_user_id, 'prima_candidatura', 'lifetime', 5)
    on conflict (user_id, mission_key, period_key) do nothing
    returning id into v_inserted_id;
    if v_inserted_id is not null then
      perform award_points(v_user_id, 5, 'mission_prima_candidatura', 'mission', v_inserted_id);
    end if;
  end if;

  -- Lifetime: primo incarico completato.
  select count(*) into v_count from assignments where worker_id = v_user_id and status = 'completed';
  if v_count >= 1 then
    v_inserted_id := null;
    insert into mission_completions (user_id, mission_key, period_key, points_awarded)
    values (v_user_id, 'primo_incarico_completato', 'lifetime', 15)
    on conflict (user_id, mission_key, period_key) do nothing
    returning id into v_inserted_id;
    if v_inserted_id is not null then
      perform award_points(v_user_id, 15, 'mission_primo_incarico_completato', 'mission', v_inserted_id);
    end if;
  end if;

  -- Mensile: 3 incarichi completati questo mese.
  select count(*) into v_count from assignments
  where worker_id = v_user_id and status = 'completed' and updated_at >= v_month_start;
  if v_count >= 3 then
    v_inserted_id := null;
    insert into mission_completions (user_id, mission_key, period_key, points_awarded)
    values (v_user_id, 'tre_incarichi_al_mese', v_month_key, 30)
    on conflict (user_id, mission_key, period_key) do nothing
    returning id into v_inserted_id;
    if v_inserted_id is not null then
      perform award_points(v_user_id, 30, 'mission_tre_incarichi_al_mese', 'mission', v_inserted_id);
    end if;
  end if;

  -- Mensile: 2 recensioni lasciate questo mese.
  select count(*) into v_count from reviews
  where author_id = v_user_id and created_at >= v_month_start;
  if v_count >= 2 then
    v_inserted_id := null;
    insert into mission_completions (user_id, mission_key, period_key, points_awarded)
    values (v_user_id, 'due_recensioni_al_mese', v_month_key, 10)
    on conflict (user_id, mission_key, period_key) do nothing
    returning id into v_inserted_id;
    if v_inserted_id is not null then
      perform award_points(v_user_id, 10, 'mission_due_recensioni_al_mese', 'mission', v_inserted_id);
    end if;
  end if;
end;
$$;

revoke all on function public.refresh_worker_missions() from public;
grant execute on function public.refresh_worker_missions() to authenticated;
