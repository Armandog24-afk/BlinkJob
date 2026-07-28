# MVP_SCOPE — BlinkJob

Basato sulla prioritizzazione MoSCoW del PRD (sez. 21) e sui requisiti funzionali (sez. 8). Questo documento è la fonte di verità per cosa viene costruito ora e cosa viene rimandato.

## 1. Principio guida

> "Un'azienda deve poter pubblicare un bisogno lavorativo in meno di 5 minuti. Un lavoratore deve poter completare il profilo iniziale in meno di 10 minuti." (PRD sez. 5)

Ogni funzionalità in scope deve essere valutata anche contro questo vincolo di velocità/UX.

## 2. Dentro l'MVP (Must have)

### Area Lavoratore
- Registrazione (email/password), verifica email, login sicuro, recupero password.
- Profilo: dati anagrafici, domicilio/area operativa, skill da tassonomia controllata, esperienze sintetiche.
- Disponibilità: giorni, fasce orarie, raggio geografico, scadenza disponibilità.
- Stato profilo: incompleto → in verifica → attivo → sospeso → bloccato.
- Feed incarichi ordinato per compatibilità, con motivi del match visibili.
- Candidatura e ritiro candidatura; risposta a inviti diretti.
- Incarico attivo: timeline, check-in/check-out, segnalazione ritardo/assenza, conferma completamento.
- Storico incarichi, wallet (importi tracciati, non reali).
- Recensioni bilaterali dopo completamento.

### Area Azienda
- Registrazione organizzazione, dati legali minimi, una o più sedi.
- Invito membri team con ruoli (owner, recruiter).
- Wizard creazione incarico: ruolo, descrizione, luogo, data/orari, compenso, numero posizioni, requisiti obbligatori/preferenziali, responsabile.
- Anteprima annuncio, bozza → pubblicazione → pausa → chiusura → annullamento.
- Lista candidati con motivi di match, confronto, invito diretto, conferma/selezione.
- Gestione posizioni multiple e lista d'attesa.
- Storico incarichi e stato pagamento/fee.

### Matching Engine (deterministico, sez. 11 PRD)
Pipeline: eligibility → availability → geo feasibility → skill fit → quality signals → preference fit → ranking + spiegazione. Score iniziale: 0,30 disponibilità + 0,25 distanza + 0,20 skill fit + 0,15 affidabilità + 0,10 preferenze (pesi configurabili). Hard filter separati dal soft score. Nessun attributo protetto nel modello.

### Area Admin
- Gestione utenti/aziende: ricerca, verifica documenti (simulata), sospensione/riattivazione.
- Gestione incarichi: vista incarichi a rischio, moderazione annunci.
- Gestione dispute: coda casi, decisione, esito.
- Analytics base: funnel, fill rate, completion rate, no-show rate.
- Feature flags minimi (per città/categoria).
- Audit log per azioni privilegiate.

### Trasversali
- Notifiche in-app (email opzionale in dev).
- RBAC (lavoratore, recruiter, owner azienda, support, admin).
- Recensioni bilaterali con doppio invio o scadenza (anti-ritorsione).
- Eventi analytics minimi (sez. 19 PRD): signup, job_published, application_submitted, assignment_confirmed, job_completed.

## 3. Pagamenti — decisione di scope

Il PRD ammette esplicitamente come alternativa di pilot: **"tracciare il pagamento esterno"** invece di integrare un PSP marketplace reale (che richiede KYB/KYC, due diligence, autorizzazioni legali — sez. 40 PRD).

**Decisione presa per questo MVP:** modulo Pagamenti implementato come **ledger tracciato** (stati: DRAFT → PENDING → CONFIRMED → PAID/REFUNDED/DISPUTED), senza integrazione PSP reale, senza credenziali finanziarie, senza money-movement. Il modello dati è già compatibile con una futura integrazione Stripe Connect (o equivalente) — vedi [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) — cambiando solo l'adapter, non lo schema.

## 4. Rimandato (Should have — post-validazione MVP core)

- Template incarichi condivisi e talent pool aziendale.
- QR check-in, SMS per eventi critici.
- BlinkNow (categoria/città singola).
- Stima difficoltà di copertura.
- Centri di costo e report aziendali avanzati.
- Verifica skill tramite partner esterno.
- Help center strutturato e dispute appeal multi-livello.
- MFA obbligatoria (oltre email/password) — pianificata ma non bloccante per il primo giro funzionante.

## 5. Rimandato (Could have)

- Blink Assistant (drafting assistito, no decisioni autonome).
- BlinkPoints (senza ricompense monetarie).
- Import CV, SSO enterprise, incarichi ricorrenti, temi dashboard.

## 6. Esplicitamente escluso dalla prima release (Won't have)

- Copertura nazionale multi-verticale.
- Payroll completo / sostituzione di consulente del lavoro o APL.
- Selezione autonoma tramite IA (nessuna decisione di assunzione/esclusione automatizzata).
- Classifiche pubbliche dei lavoratori, pay-to-rank.
- Pubblicità geolocalizzata.
- Integrazioni HR enterprise complesse.
- Dashboard drag-and-drop personalizzabili.
- KYC/KYB reale, firma elettronica legalmente vincolante, PSP reale (dipendono da decisioni legali esterne, sez. 7 di PROJECT_ANALYSIS.md).

## 7. Architettura modulare per funzionalità future

BlinkNow, Blink Assistant e BlinkPoints devono essere **attivabili via feature flag**, non hard-coded fuori scope: il modello dati e i moduli di dominio (Jobs, Notifications, Reviews) sono progettati per accettare questi moduli senza refactoring strutturale (vedi TECH_ARCHITECTURE.md, sez. Estendibilità).

## 8. Priorità di sviluppo (ordine di build)

1. Fondazioni: auth, ruoli, schema DB, RLS.
2. Profilo lavoratore + azienda (onboarding).
3. Creazione e pubblicazione incarico.
4. Matching engine (eligibility + score + spiegazione).
5. Candidature/inviti/selezione/conferma.
6. Esecuzione: check-in/out, completamento.
7. Pagamenti tracciati (ledger, non PSP reale).
8. Recensioni e reputazione.
9. Admin console (verifica, dispute, moderazione, analytics).
10. Test dei 5 scenari core + hardening sicurezza.
