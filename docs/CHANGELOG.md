# CHANGELOG — BlinkJob

Riepilogo delle modifiche per milestone, secondo la regola di FASE 10 ("dopo ogni fase: verifica, correggi, aggiorna documentazione, riepiloga").

## M1 — Fondazioni (completata)

**Cosa è stato costruito:**
- Scaffold Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (Base UI).
- Struttura cartelle secondo TECH_ARCHITECTURE.md: `/app`, `/components`, `/features`, `/lib`, `/types`, `/tests`, `/database`, `/docs`.
- Client Supabase (`lib/supabase/{client,server,admin,proxy}.ts`), tipi `Database` allineati a mano alle migration SQL (`types/database.ts`).
- Migration 007 aggiunta (`database/migrations/007_user_provisioning_and_company_bootstrap.sql`): trigger `handle_new_user` per creare automaticamente la riga `public.users` alla registrazione, e policy di bootstrap per il primo owner di un'azienda (gap non coperto dalla migration 006 originale).
- Autenticazione: registrazione (lavoratore/azienda), login, logout, callback conferma email, RBAC via `proxy.ts` (ex `middleware.ts`, rinominato secondo la nuova convenzione Next.js 16) che protegge le sezioni `/worker`, `/company`, `/admin` in base al ruolo utente.
- Onboarding minimo azienda (creazione azienda + membership owner) e dashboard segnaposto per i tre ruoli.
- Landing page.
- Test unitari (vitest) sugli schemi di validazione zod.

**Verifica eseguita:**
- Migration applicate al progetto Supabase reale dell'utente (SQL Editor).
- `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm test` tutti verdi.
- Flusso di registrazione lavoratore testato end-to-end nel browser: form → `auth.signUp` → trigger crea `public.users` → redirect a `/worker/onboarding`.
- Login verificato (script Node con client anon Supabase): credenziali valide, sessione creata, riga profilo leggibile via RLS.
- RBAC verificato: accesso non autenticato a `/worker/dashboard` reindirizza correttamente a `/login`.

**Decisioni prese (nessuna richiedeva l'utente, secondo la regola "se manca una decisione, scegli la più semplice"):**
- shadcn/ui ora usa **Base UI** (successore di Radix) invece di Radix direttamente — aggiornato in TECH_ARCHITECTURE.md.
- Creazione azienda spostata dall'onboarding di registrazione a uno step separato post-login (`/company/onboarding`), per evitare un problema di ordinamento RLS (un utente non ancora autenticato non può creare righe protette da RLS durante la conferma email).
- Conferma email disattivata in ambiente di sviluppo (impostazione Supabase Auth) per evitare i rate limit dell'SMTP di test integrato; da riattivare prima del pilot reale.

**Bug corretti durante la verifica:**
- Mancava una policy RLS `INSERT` per `company_members` al primo owner (nessuna riga esistente su cui basare `is_company_member`) — risolto con policy di bootstrap in migration 007.
- Il tipo `Database` non includeva `Relationships`/`Views`/`Functions` richiesti dal generic constraint di supabase-js recente, causando `never` su tutte le query tipizzate — risolto.

## M2 — Onboarding lavoratore/azienda (completata)

**Cosa è stato costruito:**
- Onboarding lavoratore (`/worker/onboarding`): dati anagrafici, area operativa (geolocalizzazione browser o selezione città tra 20 città italiane precaricate — nessun provider mappe esterno), raggio operativo, competenze da tassonomia, disponibilità (giorni + fascia oraria). Calcola un `completeness_score` e porta lo stato utente da `incomplete` a `pending_verification`.
- Gestione sedi azienda (`/company/locations`) e team (`/company/team`, invito di account azienda esistenti via email).
- Componente condiviso `LocationPicker` estratto per riuso tra onboarding lavoratore e sedi azienda.
- Migration 008 (`create_company_with_owner` RPC atomica) e 009 (`find_company_account_by_email` RPC per invito team) per chiudere due ulteriori gap RLS di bootstrap trovati testando dal vivo.

**Verifica eseguita:**
- Flusso completo testato nel browser con account reali: profilo lavoratore salvato e visibile in dashboard; azienda creata, sede aggiunta, secondo account azienda invitato con successo al team.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` verdi dopo ogni modifica.

**Bug corretti durante la verifica:**
- `insert into companies ... returning id` falliva per RLS (l'utente non era ancora membro al momento della select-after-insert) — risolto con RPC atomica `create_company_with_owner` (migration 008).
- La ricerca di un account per email nell'invito team falliva sempre: `users_select_self_or_staff` blocca correttamente la lettura di righe altrui — risolto con RPC dedicata a lettura minima e mirata (migration 009), non con un allargamento della policy generale.
- `zod`'s `.uuid()` rifiuta UUID sintatticamente validi ma non RFC4122-compliant come quelli del seed (`00000000-...-0101`) — sostituito con una semplice regex di forma.

## M3 — Marketplace core: creazione incarico e feed (completata)

**Cosa è stato costruito:**
- Wizard creazione incarico azienda (`/company/jobs/new`): ruolo, descrizione, sede, orari, compenso, posizioni, competenze obbligatorie/preferenziali.
- Ciclo di vita incarico sul sottoinsieme di stati già presenti nello schema (`draft → published → canceled`); "pausa" è implementata come ritorno a `draft` (nessun nuovo valore enum necessario — semplificazione documentata).
- Lista e dettaglio incarichi azienda (`/company/jobs`, `/company/jobs/[id]`) con azioni di stato.
- Feed pubblico lavoratore (`/worker/jobs`), inizialmente senza scoring (arrivato in M4).
- Migration 010: policy di lettura pubblica per `companies`/`company_locations` limitata alle righe referenziate da almeno un incarico pubblicato (il lavoratore deve poter vedere nome azienda e indirizzo sede di un annuncio pubblico, ma non l'anagrafica di aziende con cui non ha alcun rapporto).

**Verifica eseguita:**
- Creazione, pubblicazione e visualizzazione nel feed testate end-to-end nel browser.

**Bug corretti durante la verifica:**
- Il feed lavoratore mostrava nome azienda/sede vuoti: nessuna policy RLS permetteva la lettura pubblica di `companies`/`company_locations` per un annuncio pubblicato — risolto (migration 010).

## M4 — Matching engine deterministico e spiegabile (completata)

**Cosa è stato costruito:**
- `lib/matching/engine.ts`: funzione pura `computeMatch(job, worker)` — pipeline eligibility → disponibilità → distanza (raggio dichiarato) → skill fit → affidabilità → preferenza, pesi 0.30/0.25/0.20/0.15/0.10 come da MVP_SCOPE.md. Filtri hard (sospeso/bloccato, fuori raggio, competenza obbligatoria mancante, nessuna disponibilità compatibile) escludono il candidato prima di qualsiasi punteggio. Ogni risultato include le `reasons` leggibili nel formato richiesto dal PRD ("distanza X km", "disponibile negli orari richiesti", "possiede N competenze richieste", "rating X/5").
- I lavoratori senza recensioni (`reliability_score = 0`) sono trattati in modo neutro, non penalizzati — mitigazione esplicita del rischio di bias PRD sez. 27.
- Migration 011: RPC `candidate_workers_for_job` / `candidate_jobs_for_worker` per il filtro geografico hard (PostGIS), con controllo di autorizzazione interno (solo membri dell'azienda proprietaria, o il lavoratore stesso) dato che sono `security definer`.
- `features/matching/queries.ts`: livello di query che combina RPC + skill/disponibilità in batch e applica `computeMatch`; usato sia per il feed lavoratore ordinato per compatibilità sia per la lista candidati lato azienda.
- Sezione "Candidati compatibili" in `/company/jobs/[id]` e feed `/worker/jobs` ordinato per compatibilità con motivi visibili.

**Verifica eseguita:**
- 22 test unitari (`tests/unit/matching-engine.test.ts`) su tutti i filtri hard e sugli scenari di scoring/spiegazione — tutti verdi.
- Testato end-to-end nel browser: incarico compatibile con l'orario/competenze/area di un lavoratore reale mostra correttamente lo score (94%) e le motivazioni sia lato azienda (lista candidati) sia lato lavoratore (feed).

**Bug corretti durante la verifica:**
- Il calcolo disponibilità usava l'ora locale del **runtime**, non del mercato servito — su un server in produzione (tipicamente UTC) avrebbe silenziosamente disallineato ogni confronto con le disponibilità dichiarate in ora italiana. Corretto ancorando esplicitamente a `Europe/Rome` via `Intl.DateTimeFormat` (trovato dai test unitari prima ancora del test nel browser).
- La lista candidati risultava sempre vuota: `worker_skills_owner`/`worker_availability_owner` (006) permettono la lettura solo al lavoratore stesso, senza alcuna policy che permetta a un'azienda di leggere competenze/disponibilità di un candidato — risolto con policy dedicate (migration 012).
- La migration 012, however, non funzionava: una policy RLS il cui `USING` referenzia un'altra tabella (qui `worker_profiles`) è soggetta anche alla RLS di **quella** tabella per l'utente chiamante, non solo alla propria — la subquery vedeva quindi zero righe e la policy negava sempre l'accesso. Risolto avvolgendo l'intero controllo di eleggibilità in una funzione `security definer` (`is_geo_candidate_for_company_job`, migration 013), stesso pattern già usato per `is_company_member`.

## M5 — Candidature, inviti, selezione, conferma (completata)

**Cosa è stato costruito:**
- Lavoratore: candidatura a un incarico (`/worker/jobs`, punteggio/motivazioni del match salvati al momento della candidatura), ritiro candidatura, elenco candidature/inviti con risposta accetta/rifiuta (`/worker/applications`).
- Azienda: invito diretto a un candidato dalla lista compatibili, elenco "Candidature e inviti" per incarico con conferma/rifiuto, contatore posizioni coperte.
- Migration 014: policy che permette a un'azienda di creare un'application di tipo `invite`; RPC `confirm_candidate` (security definer) che, atomicamente, verifica lo stato della candidatura, controlla che le posizioni non siano già coperte, crea l'`assignment` con uno snapshot immutabile dei termini dell'incarico (BR-002 di DATABASE_SCHEMA.md) e aggiorna lo stato della candidatura.
- Migration 015: policy che permette a un'azienda di leggere il nome (`users.full_name`) di chi si è candidato a un suo incarico.
- Migration 016: RPC `accept_invite`, analoga a `confirm_candidate` ma autorizzata dal lavoratore invitato invece che dall'azienda.

**Verifica eseguita:**
- Testato end-to-end nel browser con account reali: candidatura lavoratore → comparsa in "Candidature e inviti" lato azienda → conferma → assignment creato con snapshot corretto e contatore posizioni aggiornato; invito azienda → comparsa in "Le mie candidature" lato lavoratore → accettazione → secondo assignment creato.
- `npx tsc --noEmit`, `npm run lint`, `npm test` (22 test) verdi dopo ogni modifica.

**Bug corretti durante la verifica:**
- Mancava una policy `INSERT` per `applications` di tipo `invite` da parte dell'azienda (solo il lavoratore poteva inserire una propria candidatura) — risolto in migration 014.
- Mancava qualunque policy `INSERT` per `assignments` — risolto con la RPC `confirm_candidate`, che applica anche la regola di business "non più assignment attivi del numero di posizioni".
- La lista "Candidature e inviti" mostrava il nome del candidato vuoto: nessuna policy permetteva a un'azienda di leggere `users.full_name` di un candidato — risolto in migration 015 (stesso pattern di `worker_profiles_company_read`).
- **Bug di design reale**: accettare un invito impostava `applications.status = 'accepted'`, ma `confirm_candidate` accetta in ingresso solo gli stati `sent/viewed/shortlisted/info_requested` — un invito accettato dal lavoratore non avrebbe mai generato un assignment, restando bloccato per sempre senza che nessuno se ne accorgesse. Corretto con una RPC dedicata (`accept_invite`, migration 016) che crea l'assignment contestualmente all'accettazione, dato che accettare un invito diretto è già di per sé la conferma finale (nessun ulteriore passaggio di approvazione azienda è previsto in quel caso).

## M6 — Esecuzione: check-in/out, completamento, annullamento (completata)

**Cosa è stato costruito:**
- Migration 017: RPC `check_in_assignment` (confirmed → in_progress, registra un `check_event`), `check_out_assignment` (registra il check-out, richiede check-in avvenuto e nessun check-out precedente), `confirm_assignment_completion` (in_progress → completed, richiedibile da lavoratore o azienda, richiede check-out avvenuto), `cancel_assignment` (confirmed/in_progress → canceled, richiedibile da entrambe le parti, con nota opzionale registrata in `audit_events`). Tutte security definer con controllo di autorizzazione e di stato espliciti.
- Due policy aggiuntive (`companies`/`company_locations` leggibili dal lavoratore tramite un proprio assignment, non solo tramite un job ancora pubblicato) per mantenere visibili i dati azienda/sede anche se l'incarico viene poi rimosso dal feed.
- `/worker/assignments`: incarichi attivi e storico, con azioni contestuali allo stato (check-in, check-out, conferma completamento, annulla).
- `/company/assignments`: vista equivalente lato azienda (senza check-in/out, che restano azioni esclusive del lavoratore).

**Verifica eseguita:**
- Testato l'intero ciclo di vita nel browser con un assignment reale: check-in → check-out → conferma completamento → stato "Completato" spostato nello storico, verificato identico su entrambi i lati (lavoratore e azienda). Annullamento testato separatamente su un secondo assignment, anch'esso verificato su entrambi i lati.
- `npx tsc --noEmit`, `npm run lint`, `npm test` (22 test) verdi.

**Nota operativa:** durante l'esecuzione delle migration di questa sessione si sono verificati due incidenti non di codice ma di processo: (1) un blocco SQL con un errore di trascrizione ha fatto fallire un'intera transazione multi-statement nell'SQL Editor, che esegue tutte le istruzioni incollate come un unico blocco atomico — un singolo errore di sintassi annulla anche le istruzioni precedenti già "riuscite" nello stesso incolla; (2) di conseguenza le migration da qui in avanti sono scritte in modo idempotente (`create or replace function`, `drop policy if exists` prima di `create policy`) per poter essere ri-eseguite in sicurezza in caso di errori a metà.

## M7 — Pagamenti: ledger tracciato (completata)

**Cosa è stato costruito:**
- Migration 018: `calculate_platform_fee_cents` (commissione piattaforma 12% flat, `fee_version` 'v1'); `confirm_assignment_completion` ridefinita per creare automaticamente il pagamento (`status='pending'`) atomicamente con la transizione a `completed`, usando gli importi dallo snapshot immutabile dell'assignment; `confirm_payment` (pending→confirmed) e `mark_payment_paid` (confirmed→paid), entrambe azionabili solo dall'azienda.
- `lib/payments/fees.ts`: stessa formula della funzione SQL, mantenuta come riferimento testato unitariamente (fonte di verità resta comunque il calcolo server-side).
- `/company/payments`: lista pagamenti con importi lordo/commissione/netto e azioni di conferma; `/worker/payments`: vista di sola lettura equivalente.

**Verifica eseguita:**
- Creato un nuovo incarico end-to-end (creazione → pubblicazione → candidatura → conferma → check-in → check-out → conferma completamento) per testare il percorso senza riutilizzare assignment già chiusi da M6. Il pagamento è stato creato automaticamente con gli importi esatti (50,00 € lordo → 6,00 € commissione → 44,00 € netto), confermato e segnato come pagato lato azienda, visibile correttamente su entrambi i lati.
- 4 nuovi test unitari sulla formula di commissione (26 totali) verdi; `npx tsc --noEmit`, `npm run lint` verdi.

## M8 — Recensioni bilaterali e reputazione (completata)

**Cosa è stato costruito:**
- Migration 019: policy `reviews_insert` corretta (verifica partecipazione all'assignment, stato `completed` e correttezza di `recipient_id` — non solo `author_id`); trigger `recompute_worker_reliability` che ricalcola `worker_profiles.reliability_score` come media delle recensioni pubblicate ricevute, ad ogni nuovo insert.
- Form di recensione (1-5 stelle + commento) integrato nelle card degli assignment completati, sia lato lavoratore (`/worker/assignments`) sia lato azienda (`/company/assignments`); il destinatario (recipient) è derivato lato server dal ruolo dell'autore, non fidato dal client.
- Card "Reputazione" in `/worker/dashboard` con punteggio medio e lista recensioni ricevute.

**Semplificazioni MVP documentate (non nascoste):** le recensioni si pubblicano immediatamente all'invio (nessuna finestra di rivelazione simultanea/anti-ritorsione — il disegno più completo del PRD è rimandato); il `reliability_score` è la semplice media delle valutazioni ricevute (nessun peso per no-show/cancellazioni, che richiederebbe un rilevamento automatico non presente in questo MVP).

**Verifica eseguita:**
- Trovata e corretta una vulnerabilità reale prima ancora di testare nel browser: la policy `reviews_insert` originale (006) verificava solo `author_id = auth.uid()`, permettendo a chiunque autenticato di inserire recensioni false su qualsiasi assignment per manipolare la reputazione di chiunque.
- Testato end-to-end nel browser: recensione azienda→lavoratore inviata, `reliability_score` di Maria aggiornato automaticamente a 5 (verificato via query diretta); recensione lavoratore→azienda inviata; card reputazione in dashboard lavoratore mostra correttamente punteggio e commento.
- `npx tsc --noEmit`, `npm run lint`, `npm test` (26 test) verdi.

## M9 — Console amministrativa (completata)

**Cosa è stato costruito:**
- Migration 020: RPC `admin_set_user_status` / `admin_set_company_status` (verifica/sospensione/blocco, con logging in `audit_events`); `open_dispute` / `resolve_dispute`; policy `disputes_insert` corretta (stessa debolezza già vista in `reviews_insert`: verificava solo `opened_by`, non la partecipazione all'assignment).
- `/admin/dashboard`: analytics base reali (utenti per ruolo, aziende da verificare, incarichi pubblicati/completati, dispute aperte, totale pagato).
- `/admin/users`, `/admin/companies`, `/admin/jobs`: liste con azioni di stato (attiva/sospendi/blocca per utenti, verifica/limita/sospendi per aziende).
- `/admin/disputes`: lista dispute con form di risoluzione; segnalazione problema ("Segnala un problema") integrata nelle card assignment lato lavoratore e azienda.

**Verifica eseguita:**
- Creato un account admin di test, promosso a `role='admin'` via SQL (nessun self-service, come da regola di sicurezza del progetto).
- Testato end-to-end nel browser: attivazione di un lavoratore `pending_verification` → `active`; verifica di un'azienda `pending_verification` → `active`; apertura di una segnalazione lato lavoratore su un assignment completato, visibile in `/admin/disputes` con nome del segnalante, risolta con nota di risoluzione.

## M10 — Qualità: test dei 5 scenari core + hardening di sicurezza (completata)

**Cosa è stato costruito:**
- `tests/integration/helpers.ts` + `tests/integration/five-scenarios.test.ts`: suite di integrazione (vitest) eseguita contro il progetto Supabase reale (non mockato), che copre in un unico flusso sequenziale i 5 scenari core di FASE 9: (1) un nuovo lavoratore registra profilo/competenze/disponibilità; (2) un'azienda crea ed pubblica un incarico; (3) `candidate_workers_for_job` + `computeMatch` trovano il lavoratore come candidato compatibile con motivazioni leggibili; (4) il lavoratore si candida e l'azienda conferma (`confirm_candidate`) creando l'assignment; (5) check-in/check-out/completamento creano automaticamente il pagamento (commissione 12% verificata sull'importo esatto) e la recensione dell'azienda aggiorna `reliability_score` del lavoratore tramite il trigger.
- Migration 021 (`points_ledger_owner_read`): abilitata la row level security sull'ultima tabella applicativa che ne era priva (`points_ledger`, predisposizione futura per BlinkPoints, non ancora usata da alcun codice) — nessuna policy INSERT/UPDATE/DELETE, in linea con "nessuna scrittura diretta dal client" finché la feature non è attiva.
- Revisione di sicurezza: verificato che ogni funzione `security definer` nel progetto ha `set search_path = public` (nessun gap trovato); eseguito `npm audit` e documentate le 14 segnalazioni (2 moderate + 12 high) come rischio accettato e monitorato — sono tutte dipendenze di sviluppo transitive (CLI `shadcn`, toolchain di build di Next.js) non presenti nel bundle eseguito in produzione; non applicato `npm audit fix --force` perché declasserebbe Next.js a una versione major precedente (rottura inaccettabile) senza chiudere un'esposizione reale.

**Verifica eseguita:**
- I 5 scenari passano come test vitest con asserzioni reali (non console.log) contro il database Supabase reale: 31/31 test totali verdi (26 unitari + 5 di integrazione), `npx tsc --noEmit` e `npm run lint` puliti.
- Migration 021 applicata dall'utente via SQL Editor; verificata empiricamente con uno script Node throwaway autenticato come utente di test: `SELECT` su `points_ledger` riesce e restituisce solo righe proprie (vuoto, nessun errore), `INSERT` viene negato con errore Postgres `42501` ("new row violates row-level security policy") — la RLS è attiva e non esiste alcuna policy di scrittura diretta dal client, come da disegno. Script di verifica rimosso subito dopo l'uso.

**Nota:** con questa milestone il prodotto copre l'intero perimetro richiesto da CLAUDE.md (area lavoratore, area azienda, matching, gestione incarichi, recensioni, amministrazione) come MVP funzionante end-to-end, verificato sia da test automatici che da test manuali nel browser contro dati reali.
- `npx tsc --noEmit`, `npm run lint`, `npm test` (26 test) verdi.
