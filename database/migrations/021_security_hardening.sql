-- BlinkJob — 021: M10 (hardening di sicurezza — revisione finale).
-- `points_ledger` (005, predisposizione futura per BlinkPoints, non popolata/attiva nell'MVP —
-- vedi TECH_ARCHITECTURE.md sez. 7) è la sola tabella applicativa rimasta senza RLS abilitata:
-- 006 non la includeva nell'elenco. Anche se oggi nessun codice applicativo la scrive/legge,
-- lasciarla senza RLS significherebbe che una chiave anon/authenticated potrebbe leggerla o
-- scriverla direttamente via API REST non appena qualcuno la popolasse, bypassando qualunque
-- controllo futuro. Chiusa preventivamente, in linea con "privacy by design" (CLAUDE.md).

alter table points_ledger enable row level security;

drop policy if exists points_ledger_owner_read on points_ledger;
create policy points_ledger_owner_read on points_ledger for select
  using (user_id = auth.uid() or is_admin_or_support());

-- Nessuna policy INSERT/UPDATE/DELETE: finché BlinkPoints non è attivo, solo funzioni
-- security definer (nessuna ancora esiste) potranno scrivere qui, mai il client direttamente.
