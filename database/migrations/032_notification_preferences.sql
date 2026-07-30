-- BlinkJob — 032: M24 (centro notifiche: quiet hours + dedup — PRD sez. 8.8 NOT-002..006).
-- Semplificazione documentata: le notifiche restano solo in-app (nessun canale email/SMS
-- integrato, vedi FULL_SCOPE_ASSESSMENT.md categoria 2) — quindi un vero "digest" (batch inviato
-- a intervalli) non ha un canale su cui essere consegnato. Qui si implementa ciò che è comunque
-- reale in un sistema pull-based: le notifiche generate durante le "ore silenziose" restano
-- create ma non visibili finché la finestra non finisce (`visible_at`), e notifiche duplicate
-- sullo stesso evento/riferimento entro 24h si accorpano in una sola riga con un contatore
-- (`occurrences`) invece di accumularsi. `digest_mode` è salvato come preferenza e usato solo per
-- il raggruppamento visivo nella pagina notifiche, non per una consegna posticipata reale.
-- Fascia oraria calcolata su Europe/Rome (unico mercato del pilot, PRD sez. 1).

create table if not exists notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  quiet_hours_start smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end smallint check (quiet_hours_end between 0 and 23),
  digest_mode text not null default 'immediate' check (digest_mode in ('immediate', 'daily')),
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

drop policy if exists notification_preferences_owner on notification_preferences;
create policy notification_preferences_owner on notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table notifications add column if not exists visible_at timestamptz not null default now();
alter table notifications add column if not exists occurrences int not null default 1;

create index if not exists idx_notifications_visible on notifications (user_id, visible_at) where read_at is null;

create or replace function public.apply_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prefs notification_preferences%rowtype;
  v_dedup_key text;
  v_existing_id uuid;
  v_local_time time;
  v_local_today timestamp;
begin
  select * into v_prefs from notification_preferences where user_id = new.user_id;

  v_dedup_key := coalesce(
    new.payload->>'conversation_id',
    new.payload->>'dispute_id',
    new.payload->>'assignment_id',
    new.payload->>'job_id',
    ''
  );

  if v_dedup_key <> '' then
    select id into v_existing_id
    from notifications
    where user_id = new.user_id
      and event_type = new.event_type
      and read_at is null
      and created_at > now() - interval '24 hours'
      and coalesce(payload->>'conversation_id', payload->>'dispute_id', payload->>'assignment_id', payload->>'job_id', '') = v_dedup_key
    order by created_at desc
    limit 1;

    if v_existing_id is not null then
      update notifications
      set occurrences = occurrences + 1, created_at = now(), payload = new.payload
      where id = v_existing_id;
      return null;
    end if;
  end if;

  new.visible_at := now();

  if v_prefs.quiet_hours_start is not null and v_prefs.quiet_hours_end is not null then
    v_local_time := (now() at time zone 'Europe/Rome')::time;
    v_local_today := date_trunc('day', now() at time zone 'Europe/Rome');

    if v_prefs.quiet_hours_start < v_prefs.quiet_hours_end then
      if v_local_time >= make_time(v_prefs.quiet_hours_start, 0, 0)
        and v_local_time < make_time(v_prefs.quiet_hours_end, 0, 0) then
        new.visible_at := (v_local_today + make_interval(hours => v_prefs.quiet_hours_end)) at time zone 'Europe/Rome';
      end if;
    else
      if v_local_time >= make_time(v_prefs.quiet_hours_start, 0, 0) then
        new.visible_at := (v_local_today + interval '1 day' + make_interval(hours => v_prefs.quiet_hours_end)) at time zone 'Europe/Rome';
      elsif v_local_time < make_time(v_prefs.quiet_hours_end, 0, 0) then
        new.visible_at := (v_local_today + make_interval(hours => v_prefs.quiet_hours_end)) at time zone 'Europe/Rome';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_notification_preferences on notifications;
create trigger trg_apply_notification_preferences
  before insert on notifications
  for each row execute function apply_notification_preferences();
