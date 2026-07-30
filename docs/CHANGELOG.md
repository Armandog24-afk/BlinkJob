# CHANGELOG — BlinkJob

## M24 — Centro notifiche: quiet hours e dedup (2026-07-30)

`database/migrations/032_notification_preferences.sql`: nuova tabella `notification_preferences`
(ore silenziose, modalità di raggruppamento) e trigger `apply_notification_preferences` su ogni
insert in `notifications` — nessuna delle ~15 RPC che generano notifiche è stata toccata, la logica
è centralizzata nel trigger. Due comportamenti reali: le notifiche create durante le ore silenziose
restano nascoste (`visible_at`) finché la fascia non termina, e notifiche duplicate sullo stesso
evento/riferimento entro 24h si accorpano in una riga con contatore (`occurrences`) invece di
accumularsi. **Limite documentato**: nessun canale email/SMS esiste ancora (categoria 2), quindi un
vero digest "consegnato" non è possibile — `digest_mode` controlla solo il raggruppamento visivo
nella nuova pagina `/notifications`, raggiungibile dal link "Vedi tutte e preferenze" nel dropdown.
Verificato in produzione: apertura di una nuova disputa (che genera una notifica) non si è rotta
dopo l'introduzione del trigger.

## M22 — Help center + appello dispute (2026-07-30)

**Help center** (`/help`, pubblica, collegata con un link "Aiuto" sempre visibile nell'header di
`DashboardShell`): contenuti reali scritti a mano che descrivono solo funzionalità esistenti
(matching, candidature, check-in/out QR, pagamenti, recensioni, chat e mascheramento contatti,
dispute/appello, BlinkNow, BlinkPoints, template/talent pool) — nessuna funzionalità inventata.

**Appello dispute** (`database/migrations/031_dispute_appeal.sql`, PRD sez. 20): l'enum
`dispute_status` aveva già gli stati `appealed`/`closed` fin dalla 001, mai usati. Nuova RPC
`appeal_dispute` (una sola volta, solo su una disputa già `resolved`, da worker o azienda
coinvolti) porta lo stato ad `appealed`; `resolve_dispute` (022) è stata ridefinita per chiudere
definitivamente (`closed`) quando ri-risolve una disputa in appello invece di rimetterla in
`resolved` (che riaprirebbe l'appello all'infinito). Nuove pagine `/worker/disputes` e
`/company/disputes` (prima non esisteva alcuna vista delle proprie dispute per le due parti, solo
per l'admin) con pulsante "Fai appello" quando risolta; `/admin/disputes` aggiornata per mostrare
il motivo dell'appello e permettere una nuova risoluzione. Verificato end-to-end in produzione:
apertura disputa → risoluzione (dato di test preesistente) → appello → stato "In appello" con
motivo salvato correttamente.

## M21 — Chat contestuale azienda-lavoratore (2026-07-29)

`database/migrations/030_messaging.sql`: nuove tabelle `conversations` (una per coppia job/worker,
stessa chiave unique di `applications`), `messages`, `message_reports`. Tre RPC security definer:
`get_or_create_conversation` (crea/riusa la conversazione, ma solo se esiste già una candidatura per
quella coppia — non è un canale di contatto libero prima che l'azienda abbia valutato il
lavoratore), `send_message` (mascheramento automatico via regex di email e numeri di telefono nel
testo prima di salvarlo, più notifica alla controparte), `report_message` (segnalazione di un
messaggio, visibile solo al segnalante e agli admin via RLS).

Nuova pagina `/messages/[jobId]/[workerId]` (thread di chat, form di invio, pulsante "Segnala" su
ogni messaggio della controparte). Collegata con un pulsante "Chat" da: candidature lavoratore,
incarichi attivi/storico lavoratore, lista candidature di un incarico (azienda), assegnazioni
azienda.

## M18-M20 — Template incarichi, talent pool, QR check-in, KPI admin (2026-07-29)

**M18 — Job templates + talent pool (`database/migrations/028_job_templates_talent_pool.sql`)**:
nuove tabelle `job_templates`/`job_template_requirements`/`company_worker_favorites` (RLS per
azienda) e RPC `add_worker_to_talent_pool`/`remove_worker_from_talent_pool`. Un'azienda può salvare
un incarico pubblicato come template (`/company/jobs/templates`) e riusarlo per precompilare un
nuovo incarico (`/company/jobs/new?template=<id>`) — luogo/orari/scadenza restano volutamente fuori
dal template, da rivedere ogni volta. Dalle assegnazioni completate può aggiungere il lavoratore al
talent pool (`/company/talent-pool`) per ritrovarlo più facilmente in futuro.

**M19 — QR check-in (`lib/qr.ts`, `app/checkin/[assignmentId]/page.tsx`)**: il QR mostrato
all'azienda in `/company/assignments` punta a `/checkin/<assignmentId>` — nessun segreto nel codice,
la sicurezza resta nelle RPC `check_in_assignment`/`check_out_assignment` esistenti
(`auth.uid() = worker_id`) più un controllo di cortesia nella pagina stessa.

**M20 — KPI reali console admin (`database/migrations/029_admin_kpi_summary.sql`)**: RPC
`admin_kpi_summary()` calcola fill rate, tempo mediano di conferma, completion rate, no-show rate
(proxy), dispute rate e payment success rate direttamente da jobs/assignments/disputes/payments —
niente tabella eventi dedicata (fuori scope, vedi commento in testa alla migrazione), ma dati reali,
non placeholder. Mostrati in una nuova card su `/admin/dashboard`.

**Bug di regressione trovato e corretto durante la verifica live**: quattro pulsanti (salva
template, elimina template, rimuovi da talent pool, conferma QR check-in/out) erano stati aggiunti
passando una closure (`action={() => serverAction(id)}`) direttamente da un Server Component a
`ActionButton` (Client Component) — React Server Components non riesce a serializzare una funzione
creata così, causando un errore 500 in produzione su 3 pagine (`/company/jobs/[id]`,
`/company/jobs/templates`, `/company/talent-pool`, `/checkin/[assignmentId]`). Il pattern corretto,
già usato ovunque nel resto del codebase, è un piccolo wrapper `"use client"` che riceve solo dati
semplici (id) come prop e costruisce la closure lui stesso — creati
`features/jobs/components/save-as-template-button.tsx`,
`features/jobs/components/delete-template-button.tsx`,
`features/companies/components/remove-from-talent-pool-button.tsx`,
`features/assignments/components/qr-checkin-button.tsx`. Verificato l'intero flusso end-to-end in
produzione dopo il fix (creazione template, precompilazione form, lista talent pool, caricamento
pagina check-in).

## Restyling "Neon Arcade" (2026-07-29)

Richiesta dall'utente: rendere il sito più "gamification-friendly" (più colori, energia, senso di
progresso/ricompensa) invece dell'aspetto grigio/austero di default di shadcn. Lavoro in due fasi.

**Fase 1 (analisi, nessun codice toccato)**: mappati i componenti gamification-friendly esistenti
(livello/punti BlinkPoints, badge, punteggio matching, badge urgenza BlinkNow, notifiche, KPI
admin) e proposte 3 direzioni visive complete (palette, tipografia, mockup con i veri componenti
dell'app) in un artifact. L'utente ha scelto: **layout di "Arcade Energy" (forme molto arrotondate,
bottoni pillola, ombre colorate, shimmer) con i colori di "Neon Tech" (dark mode nativo, ciano
#22D3EE, magenta neon #FB3A5D, lime #A3E635)**.

**Fase 2 — cosa è cambiato:**
- `app/globals.css`: unica fonte di verità del tema riscritta con la nuova palette scura
  (background #0B0E1A, card #171529, primario ciano, distruttivo/urgenza magenta neon, più due
  nuovi token semantici `--reward` (lime, per punti/livelli) e `--success` (smeraldo,
  per stati completati) — separati dall'accento del brand, non riusati per tutto). Raggio bordo
  base portato da 0.625rem a 1rem (si propaga automaticamente a tutte le scale derivate
  `radius-xl/2xl/3xl`). Nuove utility condivise `glow-primary`/`glow-destructive`/`glow-reward`
  (ombre colorate) e animazioni `shimmer`/`pop`, entrambe disattivate sotto
  `prefers-reduced-motion: reduce`.
- **Un solo tema, non un toggle**: rimossa la vecchia coppia `:root`/`.dark` — nessun
  `ThemeProvider` è mai stato collegato in questo progetto (next-themes è usato solo dal toast),
  quindi mantenere due palette parallele sarebbe stato codice morto. Se in futuro servirà un tema
  chiaro reale, i valori vanno spostati come descritto nel commento in testa al file.
- `app/layout.tsx`: aggiunto il font **Fredoka** (rotondo, per i titoli) accanto a Geist via
  `next/font/google`, collegato tramite il token `--font-heading` già predisposto (usato da
  `CardTitle`) — zero modifiche per-componente necessarie.
- `components/ui/button.tsx`: forma pillola (`rounded-full`) invece di `rounded-lg`, hover con
  leggero sollevamento + ombra colorata (glow), variante `destructive` passata da tinta leggera a
  riempimento pieno (coerente con il trattamento "bold" scelto, si applica automaticamente a ogni
  azione pericolosa/urgente dell'app, non solo BlinkNow).
- `components/ui/card.tsx`: raggio aumentato (`rounded-xl` → `rounded-2xl`).
- **Nuovo** `components/ui/progress.tsx`: barra di progresso accessibile (ruolo/aria corretti) —
  prima non esisteva; usata per il livello BlinkPoints, che prima era solo testo.
- `app/worker/profile/page.tsx`: la card BlinkPoints ora mostra una vera barra di progresso verso
  il livello successivo (gradiente lime→ciano, shimmer), badge di livello sul token `reward`.
- `features/notifications/components/notifications-bell-client.tsx`: il pallino dei non letti ora
  "compare" con una piccola animazione (rispetta reduced-motion).
- `components/dashboard-shell.tsx`: **due bug di responsività mobile trovati e corretti durante la
  verifica** (non introdotti da questo restyling, solo scoperti testando su viewport 375px): la nav
  con 6 voci andava in overflow orizzontale (ora scorrevole, `overflow-x-auto`) e la riga header
  andava in overflow di 13px con utenti/titoli lunghi (etichetta sezione e nome utente ora nascosti
  sotto il breakpoint `sm`, restano logo/campanella/uscita).

**Bug reale preesistente trovato e corretto (non introdotto oggi)**: `--font-sans` non è mai stato
collegato a `--font-geist-sans` (il font iniettato da `next/font` in `app/layout.tsx`) — l'intero
sito ha sempre reso il testo in **Times New Roman**, il fallback finale del browser, non in Geist.
Scoperto controllando i `computedStyle` reali durante la verifica di questo restyling, non prima.

**Verifica eseguita:** `npx tsc --noEmit`, `npm run lint`, `npm test` (35 unitari, invariati —
restyling puramente visivo) puliti. Deploy su Vercel, verificato con `getComputedStyle` diretto sul
sito pubblicato (non solo visivamente): colori, raggi, gradiente e font confermati corretti dopo
ogni singola modifica. Responsività mobile verificata (375px) su login, profilo lavoratore,
dashboard admin e dettaglio incarico azienda — nessun overflow orizzontale residuo. Nessuna
modifica a logica, dati, route o RLS.


## Deploy demo (2026-07-29) e sospensione temporanea della registrazione

Progetto pubblicato su Vercel (https://blinkjob.vercel.app), collegato al progetto Supabase reale usato per tutto lo sviluppo, per una demo condivisibile. Deploy diretto da CLI locale (GitHub non collegato all'account Vercel dell'utente — nessun OAuth GitHub configurato), variabili d'ambiente Supabase impostate su Vercel per production/preview.

**Registrazione self-service disattivata su richiesta** dopo una segnalazione di malfunzionamento nel demo pubblico. Controllati i log Vercel (`vercel logs`): nessun errore server-side loggato né su `/register` né su `/worker/onboarding` — il problema segnalato sembra più una frizione percepita nell'onboarding (submit multipli ravvicinati in log) che un crash reale, ma non essendone certi si è disattivato l'ingresso self-service per non bloccare l'accesso al resto della demo. `lib/config.ts` (`REGISTRATION_ENABLED = false`) gate la pagina `/register`, il link "Registrati" nel login e la server action `registerAction` stessa (difesa in profondità, non solo nascosto in UI). Reversibile con un solo flag una volta chiarita la causa. Demo utilizzabile con gli account seed esistenti (lavoratore, azienda, admin).

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

## Fase 2 — Oltre l'MVP iniziale

Codice pubblicato su GitHub (`github.com/Armandog24-afk/BlinkJob`, commit iniziale con storia unica per M1-M10). Prima di passare alle funzionalità future previste dal PRD (BlinkNow, Blink Assistant, BlinkPoints), analisi di MVP_SCOPE.md ha rilevato due gap reali nel perimetro must-have mai colmati: **recupero password** e **notifiche in-app** (tabella esistente da M1, mai scritta/letta da alcun codice). Priorità decisa: chiudere prima questi due gap, poi le tre feature "should/could have" già predisposte a livello di schema, partendo dalla più economica (nessuna dipendenza esterna) verso quella più costosa (Blink Assistant, richiede un provider AI esterno — verrà chiesta conferma all'utente prima di implementarla).

## M11 — Recupero password (completata)

**Cosa è stato costruito:**
- `/forgot-password`: form email → `resetPasswordForEmail`; messaggio di successo identico indipendentemente dall'esistenza dell'account (nessun oracolo di enumerazione).
- `/reset-password`: pagina completamente client-side (`ResetPasswordGate`) che stabilisce la sessione di recovery **prima** di mostrare il form, gestendo sia il flusso a fragment URL (`#access_token=...`) sia quello PKCE (`?code=...`).
- Link "Password dimenticata?" nel form di login.

**Decisione tecnica (non ovvia, documentata):** il link di recovery generato da Supabase per questo progetto redirige con i token nel **fragment dell'URL** (`#access_token=...`), non con un `?code=` PKCE — un fragment non viene mai inviato a nessun server, quindi un Route Handler come `/auth/callback` non può in linea di principio vederlo. Per questo `/reset-password` è stata scritta come componente client che legge `window.location.hash` direttamente (o, in subordine, un eventuale `?code=`) e stabilisce la sessione via `supabase.auth.setSession()`/`exchangeCodeForSession()` lato browser, prima di mostrare il form di nuova password.

**Verifica eseguita:**
- Simulato il click sul link di recovery senza un vero inbox: generato un link reale via `supabase.auth.admin.generateLink` (script throwaway), risolto il redirect lato server (`curl -D -`) per ottenere l'URL finale con i token, poi navigato il browser direttamente su quell'URL same-origin — mai toccato il dominio Supabase dal browser sandbox.
- Confermato che il form imposta la nuova password: dopo l'invio, redirect automatico a `/worker/dashboard` (l'utente resta autenticato); login con la password nuova riuscito, login con la vecchia password rifiutato (`Invalid login credentials`). Password di test poi ripristinata al valore originale documentato.
- `npx tsc --noEmit`, `npm run lint`, `npm test` (31 test) verdi. Script di verifica temporanei rimossi.

**Nota:** questo stesso gap del fragment-URL riguarda potenzialmente anche il link di conferma email in fase di registrazione (`/auth/callback`), oggi non osservabile perché la conferma email è disattivata in sviluppo — da riverificare con lo stesso metodo prima di riattivare la conferma email in produzione.

## M12 — Notifiche in-app (completata)

**Cosa è stato costruito:**
- Migration 022: la tabella `notifications` esisteva da M1 (005/006) ma nessun codice applicativo la scriveva. Poiché la sua RLS (`notifications_owner`) permette solo a un utente di scrivere le **proprie** righe, l'emissione verso un'altra parte (es. l'azienda che deve notificare il lavoratore) non può essere un insert diretto dal client: va incapsulata nelle funzioni `security definer` che già gestiscono ogni transizione (`confirm_candidate`, `accept_invite`, `check_in_assignment`, `confirm_assignment_completion`, `mark_payment_paid`, `open_dispute`, `resolve_dispute`, `admin_set_user_status`, `admin_set_company_status`, tutte ridefinite per emettere la notifica nello stesso passaggio atomico) o in trigger `AFTER INSERT` per gli insert non ancora incapsulati in una RPC (candidature/inviti, recensioni).
- `features/notifications/` (`queries.ts`, `actions.ts`, `components/notifications-bell{,-client}.tsx`): campanella nell'header di `DashboardShell`, badge con conteggio non lette, dropdown con le ultime 10 notifiche in italiano, "segna come letta" (singola o tutte) via update diretto (già coperto dalla policy esistente, nessuna nuova RPC necessaria).

**Bug corretto durante la scrittura (non da trial-and-error, da un errore Postgres alla prima esecuzione):** `mark_payment_paid` conteneva `select j.*, a.worker_id into v_job, v_worker_id` — Postgres non ammette una variabile `%rowtype` insieme ad altri target in una singola clausola `INTO` multipla (`42601: record variable cannot be part of multiple-item INTO list`). Poiché l'intera migration viene incollata come un solo script nell'SQL Editor di Supabase, l'errore ha annullato anche le funzioni già create con successo nello stesso paste (stessa dinamica già osservata a M5) — corretto separando in due `select ... into` distinti e rifatto il paste completo.

**Verifica eseguita:**
- `npx tsc --noEmit` e `npm run lint` puliti sul nuovo codice.
- Migration 022 applicata dall'utente; verificata con uno script Node throwaway: le RPC che erano rotte (`mark_payment_paid`, ecc.) ora restituiscono errori di business logic (`P0001: Payment not found`) invece dell'errore di sintassi — script rimosso subito dopo l'uso.
- Verificato l'intero flusso nel browser: promosso "Verdi Catering Srl" da `pending_verification` ad `active` dalla console admin → login come proprietaria dell'azienda → campanella mostra badge "1" e la notifica "Lo stato della tua azienda è ora: active" → click su "Letta" → `read_at` impostato (confermato via query diretta). Stato dell'azienda di test ripristinato a `pending_verification` al termine della verifica per non alterare i dati demo.

## M13 — BlinkNow (completata, con ambito volutamente ridotto)

**Analisi preliminare (PRD, sez. 9.1 / EPIC 11):** BlinkNow nel PRD è una feature ricca — SLA per città/categoria, distribuzione a "cerchi concentrici", fee premium, presidio on-call — con dipendenze operative esplicitamente non ancora decise dal founder (roadmap sez. 24: "BlinkNow dipende da densità dell'offerta, operations e pricing"; OQ-07 è una open question bloccante su pricing/SLA). `TECH_ARCHITECTURE.md` (sez. 7) è esplicito: solo `urgency_tier` + flag `blinknow_enabled` sono predisposti, "pricing e SLA aggiuntivi non implementati ora". Costruire quella parte avrebbe significato inventare cifre di business al posto del founder — scelta: implementare solo il meccanismo (flag → urgenza → boost di matching → notifica opt-in), non il pricing/SLA reali. Nessun gating per città: né `jobs` né `company_locations` hanno un campo città strutturato (solo geografia + etichetta libera) — `feature_flags.enabled_cities` resta non utilizzato, gating solo su categoria.

**Cosa è stato costruito:**
- Migration 023: `worker_profiles.blinknow_opt_in` (default `false`); `is_blinknow_enabled_for_job(categoria)`; `set_job_blinknow(job_id, enabled)` (solo su bozze, richiede azienda verificata + categoria abilitata dal flag); trigger `notify_on_blinknow_job_published` che notifica solo i lavoratori con opt-in esplicito, geo-eleggibili e non sospesi/bloccati (stesso schema del gap PRD US-022: mai notifiche urgenti senza consenso); `admin_set_feature_flag` (audit-logged, riusabile per M14/M15).
- Matching engine (`lib/matching/engine.ts`): boost fisso e limitato (+5 punti, cap a 100) per `urgencyTier: 'blinknow'`, sempre indicato in chiaro in `reasons` — il "limitato e registrato" richiesto dal PRD sez. 11.4 è questa trasparenza, non un filtro assoluto o un log separato.
- Azienda: toggle "Attiva BlinkNow" sulla pagina incarico (solo su bozze, solo se azienda verificata e categoria abilitata) + badge "Urgente · BlinkNow".
- Lavoratore: `/worker/profile` (pagina nuova — la voce di navigazione esisteva già dal M2 ma puntava a una route inesistente, 404 non ancora notato; corretto qui) con opt-in esplicito alle notifiche urgenti; badge "Urgente" nel feed incarichi.
- Admin: card "Feature flags" in `/admin/dashboard` con toggle per i 3 flag post-MVP (blinknow/assistant/points), tutti disattivati globalmente di default.

**Bug corretto durante la verifica (non da trial-and-error, da un errore Postgres alla prima esecuzione reale):** `set_job_blinknow` conteneva `urgency_tier = case when p_enabled then 'blinknow' else 'standard' end` — un'espressione `CASE` con literal di testo risolve a tipo `text`, e Postgres non fa cast implicito da `text` a un tipo enum (`42804: column "urgency_tier" is of type urgency_tier but expression is of type text`). Corretto con un cast esplicito `(...)::urgency_tier`. Applicata solo la funzione corretta (idempotente), non l'intera migration.

**Verifica eseguita (browser, flusso reale completo):**
- `npx tsc --noEmit`, `npm run lint`, `npm test` (30 unitari, 4 nuovi per il boost BlinkNow) puliti.
- Attivato `blinknow_enabled` globalmente da admin → opt-in di un lavoratore su `/worker/profile` (persistenza confermata dopo reload) → creato un incarico come azienda verificata, attivato BlinkNow (badge "Urgente · BlinkNow" visibile), pubblicato → candidati compatibili mostrano il motivo "incarico urgente BlinkNow: priorità temporanea (+5 punti)" → il lavoratore con opt-in riceve la notifica "Nuovo incarico urgente BlinkNow" (badge "1", contenuto corretto) e vede il badge "Urgente" nel proprio feed incarichi con lo stesso boost. Un lavoratore senza opt-in non riceve nulla (verificato per assenza: solo il lavoratore opt-in ha ricevuto la notifica).
- Stato demo ripristinato al termine: flag `blinknow_enabled` disattivato globalmente, opt-in del lavoratore di test rimosso — nessuno dei due era stato richiesto come stato permanente.

## M14 — BlinkPoints (completata, simulazione interna senza ricompense)

**Analisi preliminare (PRD, sez. 9.3, requisiti PTS-001..005):** il PRD stesso è esplicito — "Nel pilot può essere simulato internamente senza ricompense monetarie" — un mandato diretto per il ruolo già previsto di `points_ledger` (tabella esistente da M1, RLS abilitata senza policy di scrittura client fin da M10). PTS-005 ("marketplace ricompense") è esplicitamente rimandato dal PRD "solo dopo analisi fiscale e antifrode" — non implementato, coerente con il PRD, non una scelta arbitraria.

**Cosa è stato costruito:**
- Migration 024: `award_points(...)` (helper interno, no-op se `blinkpoints_enabled` è disattivato — stesso gating di BlinkNow); trigger su `worker_profiles` (badge profilo completato, una tantum, gestisce sia il primo insert al 100% sia un update successivo che ci arriva) e su `reviews` (punti fissi a chi scrive una recensione, indipendenti dal voto — "niente incentivo sul voto positivo" dal PRD); `confirm_assignment_completion` ridefinita per assegnare punti affidabilità nello stesso passaggio atomico del completamento; `admin_adjust_points` (rettifica/revoca manuale con motivo obbligatorio, audit-logged — PTS-004).
- UI: card "BlinkPoints" su `/worker/profile` (ledger leggibile, totale) e form "Rettifica punti" su `/admin/users`, entrambe visibili solo con il flag attivo.

**Semplificazioni MVP documentate direttamente nella migration (non dimenticanze):**
- PTS-002 ("livelli e badge configurabili, regole versionate"): valori punti hardcoded (stesso pattern di `calculate_platform_fee_cents`, non una tabella di config editabile — costruirla ora sarebbe prematuro per una simulazione di pilot). **Aggiornamento M17**: livelli e badge veri e propri sono stati poi costruiti — vedi sezione M17 più sotto.
- "Conferma disponibilità aggiornata → punti periodici": non implementata perché nell'MVP attuale non esiste alcun flusso per modificare la disponibilità dopo l'onboarding iniziale (gap indipendente, fuori perimetro di questa milestone).
- PTS-004 (revoca per abuso): decisione umana via `admin_adjust_points` invece di una regola automatica legata alle dispute — `resolve_dispute` accetta solo una nota libera, non un esito strutturato da cui derivare in modo affidabile una revoca automatica.
- PTS-003 (nessun pay-to-rank): soddisfatto per costruzione — `points_ledger` non è mai letto da `reliability_score` (derivato solo dalle recensioni, 019) e nessun flusso di acquisto esiste in questo MVP.
- PTS-001 (ledger immutabile): nessuna funzione qui esegue update/delete su `points_ledger`, solo insert — verificato anche nel test di rettifica (uno storno è una nuova riga negativa, mai una modifica alla riga originale).

**Verifica eseguita (browser, flusso reale completo):**
- `npx tsc --noEmit`, `npm run lint`, `npm test` (30 unitari) puliti. Cache Turbopack ripulita (`rm -rf .next`) dopo uno stop del dev server che aveva lasciato un file di tipi generato in stato inconsistente — non un problema del codice applicativo.
- Attivato `blinkpoints_enabled` da admin → registrato un nuovo lavoratore reale via `/register` e completato l'onboarding (5 competenze, 2 giorni di disponibilità, bio) fino al 100% di completezza → badge "profilo completato" (+50 punti) assegnato automaticamente e visibile su `/worker/profile`, coerente col totale mostrato anche su `/admin/users`.
- Verificata la rettifica manuale: assegnati e poi stornati 15 punti a un utente reale dalla console admin, storia del ledger intatta (due righe, +15 e -15, mai una modifica).
- Stato demo ripristinato: flag disattivato globalmente al termine (nessuno dei due era stato richiesto come stato permanente).

## M15 — Blink Assistant (feature "could have", richiede provider AI esterno)

In corso — richiede una decisione del founder su quale provider AI usare prima di procedere (nessun servizio LLM esterno collegato al progetto finora).

## M16 — BlinkNow, arricchimento completo (PRD sez. 9.1, requisiti BNW-001..006)

**Richiesta dall'utente il 2026-07-29**, dopo una valutazione a tutto campo di cosa mancherebbe per portare il progetto dall'MVP al 100% del PRD (`docs/FULL_SCOPE_ASSESSMENT.md`): arricchire BlinkNow oltre il meccanismo minimo di M13.

**Cosa è stato costruito (migration 025):**
- BNW-001: `calculate_blinknow_fee_cents()` (v1 flat, 15,00 €) e `set_job_blinknow` ridefinita per addebitare la fee e calcolare una finestra di risposta (`blinknow_response_deadline = least(starts_at, now() + 6h)`) contestualmente all'attivazione — mostrati in UI **prima** del click, non solo dopo.
- BNW-002: `notify_on_blinknow_job_published` ridefinita per calcolare bande di distanza assolute (5/15/30 km) e taggare ogni notifica con un numero d'ondata nel payload; `blinknow_wave_stats(job_id)` espone destinatari/conversioni per ondata (conversione = candidatura con `created_at` successivo alla notifica, calcolata a posteriori via join, nessuna tabella aggiuntiva).
- BNW-004: `cancel_assignment` ridefinita per invitare automaticamente il prossimo candidato geo-idoneo (per distanza, non per punteggio completo — il ranking pieno resta in TypeScript) quando un assignment BlinkNow viene cancellato prima della scadenza e restano posizioni scoperte. Automatizza solo "chi è il prossimo", non la conferma finale (resta un'accettazione/conferma umana).
- BNW-006: `process_blinknow_refunds()` (RPC admin-only) rimborsa la fee per incarichi scaduti senza copertura — invocabile dal pannello, non un vero cron (nessuno scheduler in background in questo stack).
- BNW-005: `/admin/blinknow`, nuovo pannello operativo con elenco incarichi urgenti, stato fee/scadenza, copertura posizioni e pulsante "Verifica rimborsi scaduti".
- UI azienda: `BlinkNowToggle` mostra la fee prima dell'attivazione; card "BlinkNow" sulla pagina incarico con fee/stato/scadenza/statistiche per ondata.

**Semplificazioni MVP documentate nella migration (non dimenticanze):** ondate calcolate e notificate tutte insieme alla pubblicazione invece che scaglionate nel tempo (nessuno scheduler disponibile — il PRD richiede solo che ogni ondata *registri* raggio/destinatari/conversioni, non che sia temporalmente distribuita); candidato successivo per lista d'attesa scelto per distanza, non per punteggio completo; fee flat v1 senza variazione per città/categoria (pricing reale non ancora deciso dal founder).

**Verifica eseguita (browser, flusso reale completo, dopo un riavvio pulito del dev server — vedi nota sotto):**
- `npx tsc --noEmit`, `npm run lint`, `npm test` (35 unitari) puliti.
- Creato un incarico, attivato BlinkNow (fee 15,00 € mostrata prima del click, confermata dopo), pubblicato → card "Ondate di notifica" mostra "Ondata 1 (priorità massima): 1 notificati, 0 candidature" per il lavoratore opt-in → pannello admin `/admin/blinknow` mostra correttamente fee/copertura; pulsante "Verifica rimborsi scaduti" eseguito con esito "Nessun rimborso dovuto" (corretto, l'unico altro incarico BlinkNow esistente aveva `blinknow_fee_status='none'`, precedente all'introduzione delle colonne fee).
- **Incidente scoperto durante la verifica**: un vecchio processo `next dev` orfano di una fase precedente della sessione era rimasto in ascolto sulla porta 3000, causando una corruzione della cache Turbopack (doppio scrittore su `.next`, stesso rischio già documentato in memoria di progetto) che si manifestava come 404 su rotte esistenti (`/login`). Risolto terminando il processo orfano e ripulendo `.next` — non un problema del codice applicativo.

## M17 — BlinkPoints, livelli e badge non monetari (PRD PTS-002)

**Richiesta dall'utente il 2026-07-29** insieme a M16, con una precisazione esplicita raccolta prima di costruire: le ricompense dovevano restare **non monetarie** (priorità/visibilità, non un marketplace di sconti/cash-out reale) — PTS-005 resta esplicitamente rimandato dal PRD "solo dopo analisi fiscale e antifrode", non toccato qui.

**Cosa è stato costruito (migration 026):**
- `worker_badges` (append-only, stesso principio di `points_ledger`): un catalogo di badge guadagnati, distinto dalla cronologia punti. Badge implementati: profilo completo, prima recensione ricevuta, 10 incarichi completati, affidabilità 5 stelle (≥3 recensioni), livelli Argento/Oro/Platino.
- `worker_points_level(user_id)`: livello dedotto dal totale punti (soglie v1: 100/300/600), tenuto allineato a mano con `lib/points/levels.ts` (stesso pattern di `calculate_platform_fee_cents`/`lib/payments/fees.ts`).
- Matching engine: piccolo boost aggiuntivo per livello (+1/+2/+3, sempre più piccolo del boost BlinkNow), mai sul `reliability_score` (PTS-003 "nessun pay-to-rank" resta rispettato per costruzione — guadagnato con azioni verificate, non acquistabile).
- Integrazione con BlinkNow (025): i lavoratori con livello più alto vengono promossi a un'ondata di notifica precedente rispetto alla sola distanza — la prima vera ricompensa "di priorità" richiesta dall'utente.
- UI: card "Badge" e indicatore di livello su `/worker/profile`; livello e badge del candidato mostrati anche all'azienda nella lista candidati (segnale di fiducia, stesso perimetro di visibilità di `worker_profiles_company_read`).

**Bug reale trovato e corretto durante la verifica:** la policy RLS `points_ledger_owner_read` (021) permette solo la lettura dei propri punti — senza una policy aggiuntiva, il calcolo del livello lato azienda (per il boost/candidati) avrebbe sempre restituito 0 per qualunque candidato. Aggiunta `points_ledger_company_read_via_candidate`, stesso schema di `worker_badges_company_read_via_candidate`.

**Verifica eseguita (browser, flusso reale completo):**
- Rettificati temporaneamente 250 punti a un lavoratore reale dalla console admin → card candidati sull'incarico BlinkNow mostra correttamente "Livello Argento" (badge di livello), il tag del badge permanente "Livello Argento" guadagnato, e il motivo "livello BlinkPoints Argento: priorità (+1 punti)" nel punteggio di match — badge e punti poi ripristinati (storno di -250; il badge guadagnato resta per design, coerente con l'immutabilità del ledger).
- Confermato che badge e boost di livello sono correttamente disgiunti da `reliability_score` (mai modificato da questa migration).

## Sicurezza — correzioni da Supabase Security Advisor (migration 027)

**Richiesta dall'utente il 2026-07-29** (link al pannello Advisor del progetto Supabase — nessun accesso autenticato disponibile a questo agente, controllo eseguito leggendo tutte le migration).

**Tre problemi reali trovati e corretti:**
1. `skill_taxonomy` non aveva mai avuto RLS abilitata (unica tabella dimenticata da 006) — aggiunta lettura pubblica + scrittura solo staff, stesso schema di `feature_flags`.
2. `uuid-ossp`, `postgis`, `pgcrypto` installate nello schema `public` invece che in uno schema dedicato. **PostGIS non supporta lo spostamento in questo ambiente** (Postgres: "extension postgis does not support SET SCHEMA", estensione marcata non rilocabile) — spostarla davvero richiederebbe drop/recreate con perdita a cascata di ogni colonna geography/geometry esistente, sproporzionato per un avviso di postura. Rischio accettato e documentato per PostGIS; `uuid-ossp`/`pgcrypto` invece spostate con successo.
3. Tre funzioni fondamentali di 006 (`current_user_role`, `is_company_member`, `is_admin_or_support`) non avevano mai avuto `search_path` fissato — sfuggite ai controlli precedenti (M10) perché scritte in uno stile compatto diverso dal resto delle migration. Le prime due sono SECURITY DEFINER: un search_path non fissato è un vettore reale di privilege escalation.

**Verifica eseguita:** `skill_taxonomy` ora nega la scrittura non-admin (`42501`) ma resta leggibile; le RPC che usano PostGIS (`candidate_jobs_for_worker`, ecc.) continuano a funzionare correttamente dopo lo spostamento di `uuid-ossp`/`pgcrypto` e l'aggiornamento dei `search_path` di ogni funzione esistente (fatto con un blocco dinamico su `pg_proc`, non elencando ~30 firme a mano).
