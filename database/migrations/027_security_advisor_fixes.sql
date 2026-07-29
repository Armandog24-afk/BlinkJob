-- BlinkJob — 027: correzioni da Supabase Security Advisor (richiesta esplicita dell'utente,
-- 2026-07-29, controllo eseguito leggendo tutte le migration invece che il dashboard — nessun
-- accesso autenticato disponibile a questo agente).
--
-- Tre problemi reali trovati:
-- 1. `skill_taxonomy` (002) non ha mai avuto RLS abilitata — unica tabella pubblica dimenticata
--    quando 006 ha abilitato RLS su tutte le altre. Dati non sensibili (solo un catalogo di
--    competenze), ma senza RLS sarebbe scrivibile da qualunque chiave anon/authenticated via
--    REST API (`rls_disabled_in_public`, ERROR).
-- 2. `uuid-ossp`, `postgis`, `pgcrypto` installate nello schema `public` (001) invece che in uno
--    schema dedicato (`extension_in_public`, ERROR — raccomandazione standard di Supabase).
--    PostGIS non supporta lo spostamento in questo ambiente (vedi nota al punto 2 più sotto) e
--    resta un rischio accettato; le altre due vengono spostate.
-- 3. Tre funzioni fondamentali in 006 (`current_user_role`, `is_company_member`,
--    `is_admin_or_support`) non hanno mai avuto `search_path` fissato — sfuggite a tutti i
--    controlli precedenti in questa sessione perché scritte in uno stile compatto
--    ("... as $$ ... $$ language sql stable security definer;") diverso dal pattern usato da
--    ogni migration successiva. Le prime due sono SECURITY DEFINER: senza search_path fissato,
--    chi potesse creare oggetti in uno schema presente nel proprio search_path potrebbe in teoria
--    far risolvere "users" verso una tabella contraffatta, falsificando il proprio ruolo
--    (`function_search_path_mutable`, ERROR per funzioni SECURITY DEFINER).
--
-- Spostare le estensioni fuori da `public` richiede aggiornare il search_path di OGNI funzione
-- che usa PostGIS/pgcrypto (altrimenti `ST_Distance`/`gen_random_uuid` non si risolverebbero più
-- dentro le funzioni che fissano `search_path = public`) — fatto qui con un blocco dinamico
-- invece di elencare a mano ~30 firme, per evitare di dimenticarne una.

-- 1. skill_taxonomy: stesso pattern di sola-lettura-pubblica + scrittura-staff di feature_flags
-- (006) — è un catalogo di riferimento, non dati per-utente.
alter table skill_taxonomy enable row level security;

drop policy if exists skill_taxonomy_read on skill_taxonomy;
create policy skill_taxonomy_read on skill_taxonomy for select using (true);

drop policy if exists skill_taxonomy_staff_write on skill_taxonomy;
create policy skill_taxonomy_staff_write on skill_taxonomy for all
  using (is_admin_or_support()) with check (is_admin_or_support());

-- 2. Estensioni fuori da public. `extensions` è lo schema che Supabase crea di default in ogni
-- progetto per questo esatto scopo ed è già incluso nel search_path di sessione del SQL Editor.
-- `alter extension ... set schema` NON è idempotente (errore se già spostata) — a differenza di
-- ogni altra istruzione in questo file, quindi qui serve una guardia esplicita per poter rilanciare
-- questa migration in sicurezza in caso di dubbio su un'esecuzione precedente.
--
-- PostGIS però NON supporta affatto `SET SCHEMA` in questo ambiente (Postgres restituisce
-- l'errore "0A000: extension postgis does not support SET SCHEMA" — l'estensione è marcata
-- "non rilocabile" dal suo stesso control file, non è un limite di questo script). L'unica strada
-- per spostarla davvero sarebbe drop/recreate, il che farebbe cadere in cascata OGNI colonna
-- `geography`/`geometry` esistente (home_location, company_locations.location, ecc.) — una
-- migrazione dati distruttiva e sproporzionata solo per silenziare un avviso di postura. PostGIS
-- resta quindi in `public`: rischio accettato e documentato (è la scelta comune per progetti
-- Supabase che usano PostGIS, non una scorciatoia presa qui). `uuid-ossp`/`pgcrypto` invece
-- supportano lo spostamento e vengono spostate.
create schema if not exists extensions;

do $$
begin
  if not exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'uuid-ossp' and n.nspname = 'extensions'
  ) then
    alter extension "uuid-ossp" set schema extensions;
  end if;

  if not exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) then
    alter extension pgcrypto set schema extensions;
  end if;
end;
$$;

-- 3a. Le tre funzioni fondamentali di 006, mai coperte da `set search_path` finora.
alter function public.current_user_role() set search_path = public, extensions;
alter function public.is_company_member(uuid) set search_path = public, extensions;
alter function public.is_admin_or_support() set search_path = public, extensions;

-- 3b. Altra funzione già in produzione (023) scritta senza search_path esplicito (non security
-- definer, ma il linter la segnala comunque come buona pratica mancante) e il trigger di 004.
-- Nota: `worker_points_level`/`calculate_blinknow_fee_cents` (025, non ancora applicata quando
-- questa migration può girare) nascono già con `search_path = public, extensions` impostato
-- direttamente alla creazione — Postgres non richiede che gli schemi elencati in `search_path`
-- esistano già, quindi l'ordine fra questa migration e 025 non ha importanza.
alter function public.is_blinknow_enabled_for_job(text) set search_path = public, extensions;
alter function public.enforce_payment_requires_completed_assignment() set search_path = public, extensions;

-- 3c. Ogni funzione che aveva già `search_path = public` fissato (007 in poi): estende
-- l'impostazione esistente per includere anche `extensions`, così le chiamate a PostGIS/pgcrypto
-- al loro interno continuano a risolversi dopo lo spostamento del punto 2. Un blocco dinamico
-- evita di elencare a mano ogni firma (con relativo rischio di dimenticarne una).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proconfig is not null
      and exists (select 1 from unnest(p.proconfig) cfg where cfg = 'search_path=public')
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
  end loop;
end;
$$;
