-- BlinkJob — 033: M25 (archivio documenti con accettazione tracciata — PRD sez. 8.7 DOC-xxx).
-- Il *contenuto legale* reale (testo di Termini di Servizio, Privacy, contratti) è categoria 3
-- (serve un legale) — qui si costruisce solo l'infrastruttura: versioning per chiave (`key` +
-- `version`, un documento può avere più versioni nel tempo, la più recente è quella "corrente"),
-- archivio consultabile, e accettazione con evidenza (timestamp + IP + user agent), non solo un
-- checkbox scartato subito dopo la validazione come accadeva finora in `registerAction`.
-- `scope` distingue documenti di piattaforma (Termini/Privacy, uno per tutti) da documenti
-- legati a un contesto specifico (es. termini di un incarico) — solo il primo caso è collegato
-- a un flusso reale (registrazione) in questa milestone; il secondo è schema pronto per quando
-- servirà, non wiring inventato senza consumo reale.

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'assignment')),
  key text not null,
  title text not null,
  body text not null,
  version int not null default 1,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (scope, key, version)
);

create table if not exists document_acceptances (
  id uuid primary key default gen_random_uuid(),
  document_template_id uuid not null references document_templates(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  context_id uuid,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

alter table document_templates enable row level security;
alter table document_acceptances enable row level security;

-- Stesso pattern di skill_taxonomy (027): catalogo di riferimento, lettura pubblica, scrittura solo staff.
drop policy if exists document_templates_read on document_templates;
create policy document_templates_read on document_templates for select using (true);

drop policy if exists document_templates_staff_write on document_templates;
create policy document_templates_staff_write on document_templates for all
  using (is_admin_or_support()) with check (is_admin_or_support());

-- Append-only, come audit_events (005): l'utente vede le proprie accettazioni, l'admin tutte,
-- nessun update/delete concesso.
drop policy if exists document_acceptances_read on document_acceptances;
create policy document_acceptances_read on document_acceptances for select
  using (user_id = auth.uid() or is_admin_or_support());

drop policy if exists document_acceptances_insert_own on document_acceptances;
create policy document_acceptances_insert_own on document_acceptances for insert
  with check (user_id = auth.uid());

create index if not exists idx_document_acceptances_user on document_acceptances (user_id);

insert into document_templates (scope, key, title, body, version) values
  (
    'platform', 'terms_of_service', 'Termini di Servizio',
    'Bozza operativa dei Termini di Servizio di BlinkJob. Testo legale definitivo da validare con un legale prima del lancio pubblico (vedi docs/FULL_SCOPE_ASSESSMENT.md, categoria 3). Utilizzando la piattaforma accetti che BlinkJob mette in contatto aziende e lavoratori per incarichi temporanei e traccia le fasi di candidatura, esecuzione e pagamento di ogni incarico.',
    1
  ),
  (
    'platform', 'privacy_policy', 'Informativa Privacy',
    'Bozza operativa dell''Informativa Privacy di BlinkJob. Testo legale definitivo, incluse basi giuridiche e retention, da validare con un DPO/privacy counsel (vedi docs/FULL_SCOPE_ASSESSMENT.md, categoria 3). I dati raccolti in questa fase (profilo, candidature, incarichi, messaggi, pagamenti tracciati) sono usati esclusivamente per far funzionare la piattaforma.',
    1
  )
on conflict (scope, key, version) do nothing;
