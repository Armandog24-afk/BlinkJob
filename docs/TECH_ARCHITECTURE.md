# TECH_ARCHITECTURE — BlinkJob

Basato su PRD sez. 14 (Architettura Tecnica di Riferimento) e sez. 47 (Architettura, Integrazioni e Cloud Operating Model).

## 1. Scelta architetturale

**Modular monolith** con confini di dominio chiari (non microservizi prematuri, come raccomandato esplicitamente dal PRD). I moduli pubblicano eventi di dominio per permettere estrazione futura in servizi separati quando carico/team/rischio lo richiedono.

Domini isolati concettualmente fin dall'inizio: `Identity`, `Marketplace` (Jobs/Applications), `Matching`, `Assignments`, `Documents`, `Payments/Ledger`, `Trust & Safety`, `Notifications`, `Analytics`.

## 2. Stack tecnologico

| Layer | Scelta | Motivazione |
|---|---|---|
| Web (azienda + admin + lavoratore, mobile-responsive) | Next.js 14 (App Router) + React + TypeScript | Un solo codebase invece di web+mobile nativo separato: riduce time-to-MVP mantenendo mobile-first per il lavoratore via responsive design. Il PRD ammette React Native come alternativa mobile; qui si sceglie **PWA responsive** come opzione più semplice da documentare (nessun app store, nessun build nativo, deploy singolo). |
| Styling | Tailwind CSS | Velocità, design system tramite tokens, coerenza mobile/desktop. |
| Component library | shadcn/ui (Base UI + Tailwind) | Accessibile (Base UI, il successore di Radix mantenuto dallo stesso team), componibile, nessun lock-in runtime pesante. |
| Backend / API | Next.js Route Handlers + Supabase (PostgreSQL) | Supabase fornisce Auth, DB relazionale, Storage, RLS: riduce la superficie di infrastruttura da gestire nel pilot. |
| Database | PostgreSQL (Supabase) + PostGIS | Transazioni ACID per stati critici (Job/Assignment/Payment) + query geografiche (distanza, raggio). |
| Auth | Supabase Auth (email/password + OTP telefono) | Sessioni gestite, MFA disponibile per ruolo admin. |
| Storage documenti | Supabase Storage (bucket privati) | Cifrato a riposo, URL firmate a breve durata, RLS per accesso. |
| Queue/job asincroni | Supabase Edge Functions + tabella `job_queue` (pilot) → provider queue gestito a scale | Notifiche, ricalcolo matching, eventi analytics. |
| Hosting | Vercel (frontend/API) + Supabase Cloud (EU region) | Residenza dati UE, scalabilità gestita, costi prevedibili nel pilot. |
| Pagamenti | **Adapter pattern**: `PaymentProvider` interfaccia con implementazione `TrackedLedgerProvider` (MVP, nessun PSP reale) e slot per `StripeConnectProvider` (futuro, post-validazione legale) | Vedi MVP_SCOPE.md sez. 3 — decisione esplicita di non integrare money-movement reale in questa fase. |
| Analytics | Tabella eventi Postgres + viste aggregate (pilot) → product analytics tool a scale | Funnel ricostruibile senza dipendenza esterna immediata. |

## 3. Struttura cartelle

```
/app                    # Next.js App Router: route per worker/, company/, admin/, auth/
/components             # UI condivisi (design system, shadcn/ui wrappers)
/features               # Logica di business per dominio (jobs, matching, assignments, payments, reviews, auth)
  /jobs
  /matching
  /assignments
  /payments
  /reviews
  /admin
/lib                     # Client Supabase, utilità, validazione (zod), auth helpers
/database                # Migrazioni SQL, seed, RLS policies
/types                   # Tipi TypeScript condivisi (generati da schema + domain types)
/tests                   # Unit, integration, e2e (per i 5 scenari core)
/docs                    # Questo set di documenti
```

Separazione netta: UI (`app`, `components`) non contiene logica di business; `features` non importa componenti React; `database` è l'unica fonte di verità per lo schema (nessuna modifica schema fuori da migrazioni versionate).

## 4. Database

PostgreSQL relazionale, entità core come da PRD sez. 15: `User`, `WorkerProfile`, `Company`, `Job`, `Application`, `Assignment`, `ContractDocument`, `CheckEvent`, `Payment`, `Review`, `Dispute`, `Notification`, `AuditEvent`, `SkillTaxonomy`, `FeatureFlag`. Dettaglio completo in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

Vincoli architetturali dal PRD applicati:
- Ogni `Assignment` collega esattamente un lavoratore a una posizione di un `Job`.
- Un `Payment` non avanza a payout senza `Assignment` completato.
- `Review` univoca per (autore, destinatario, assignment).
- Modifiche materiali a `Job` generano nuova versione/snapshot (no mutazione silenziosa di condizioni accettate).
- Importi in unità minime di valuta (centesimi), valuta esplicita; timestamp sempre UTC.

## 5. Integrazioni (catalogo, sez. 47.2 PRD — stato in questo MVP)

| Integrazione | Stato in questo MVP | Note |
|---|---|---|
| Identity verification (KYC) | **Stub** — upload documento + stato manuale admin, nessun provider esterno | Da sostituire con provider certificato prima del pilot reale |
| KYB/UBO | **Stub** — dati azienda dichiarati + verifica manuale admin | Come sopra |
| Payments marketplace | **TrackedLedgerProvider** (nessun PSP) | Vedi sez. 2 |
| Maps/routing (distanza) | Calcolo distanza via PostGIS (haversine/geography) | Nessuna dipendenza da provider mappe esterno nel MVP; ETA reale è post-MVP |
| E-signature | **Stub** — accettazione con timestamp + audit, non firma qualificata | Sufficiente per snapshot condizioni, non per valore legale pieno |
| Notifiche email | Supabase/Resend (o log console in dev) | SMS esplicitamente rimandato (Should have) |

Ogni integrazione stub è isolata dietro un'interfaccia (`lib/integrations/*`) così che sostituirla con un provider reale non richieda refactoring del dominio.

## 6. Sicurezza (sez. 17 e 47.4 PRD)

- **RBAC**: ruoli `worker`, `recruiter`, `company_owner`, `support`, `admin`, enforced sia lato applicazione sia via **Row Level Security** Postgres (difesa in profondità).
- **Audit log append-only** (`audit_events`) per ogni azione privilegiata (sospensioni, rimborsi, modifiche dati sensibili).
- Cifratura a riposo (gestita da Supabase), TLS in transito.
- Validazione input con `zod` su ogni boundary API.
- Nessun segreto in repo; variabili d'ambiente per chiavi Supabase.
- PII esclusa dai log applicativi.
- Rate limiting su login e azioni finanziarie (a livello middleware).
- Upload documento: whitelist tipo file, limite dimensione (scansione malware è post-MVP, richiede provider esterno).

## 7. Estendibilità per moduli futuri

| Modulo futuro | Predisposizione architetturale |
|---|---|
| BlinkNow | Campo `urgency_tier` su `Job` + feature flag `blinknow_enabled` per città/categoria; pricing e SLA aggiuntivi non implementati ora |
| Blink Assistant | Nessun accoppiamento: si aggiungerebbe come servizio che legge dati esistenti (job draft, profilo) e propone testo, senza toccare lo schema core |
| BlinkPoints | Tabella `points_ledger` prevista ma non popolata/attiva nell'MVP; nessuna UI |

## 8. Non Functional Requirements applicati nell'MVP (sottoinsieme realistico di sez. 13 PRD)

- Idempotency-key su azioni critiche (pubblicazione, conferma, "pagamento").
- Transazioni DB per transizioni di stato (Job/Assignment/Payment).
- Log strutturati con correlation id.
- Test automatizzati sui path critici (vedi sez. 25 PRD e /tests).
- Accessibilità: componenti shadcn/ui (basati su Radix) forniscono focus management e semantica corretta di base; verifica WCAG 2.2 AA completa è fuori scope per il primo giro.

Target di disponibilità/SLA formali (99,5%, RPO/RTO) sono obiettivi organizzativi per il pilot reale, non verificabili in un ambiente di sviluppo locale — riportati qui per completezza ma non testati in questa fase.
