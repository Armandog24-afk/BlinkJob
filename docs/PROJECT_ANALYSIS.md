# PROJECT_ANALYSIS — BlinkJob

Fonte: `BlinkJob_PRD_Product_Bible_v3.docx` (v1.1, 23/07/2026). Documento letto integralmente (50 sezioni + 6 appendici).

## 1. Sintesi del prodotto

BlinkJob è un marketplace HRTech a due lati che collega **aziende con esigenze operative temporanee** e **lavoratori disponibili nella stessa area**, tramite geolocalizzazione, disponibilità dichiarata, matching deterministico e spiegabile, esecuzione tracciata (check-in/out), pagamento tracciato e reputazione bilaterale.

Il PRD è esplicito su un punto architetturale chiave: **BlinkJob deve comportarsi come un sistema operativo per il lavoro temporaneo, non come una bacheca annunci**. Il valore non è il volume di annunci ma la riduzione del tempo tra bisogno e copertura, con tracciabilità end-to-end.

North Star Metric: numero di incarichi completati con esito positivo per settimana, con lavoratore confermato entro la soglia di servizio.

## 2. Obiettivi

Obiettivi MVP (sez. 4.1 PRD):
1. Azienda verificata crea e pubblica un incarico strutturato.
2. Lavoratore verificato dichiara competenze, posizione, disponibilità.
3. Calcolo di candidati/incarichi compatibili con logica trasparente (matching spiegabile).
4. Candidatura → invito → selezione → conferma con stati tracciati.
5. Check-in, check-out, conferma completamento, prove minime.
6. Pagamento marketplace o, in alternativa, tracciamento pagamento esterno nel pilot.
7. Recensioni bilaterali, segnalazioni, supporto amministrativo.
8. Eventi analytics per funnel, tempi di matching, qualità.

Non-obiettivi MVP (sez. 4.2): nessuna selezione IA autonoma, nessuna copertura nazionale multi-verticale, nessun payroll completo, nessuna gamification estesa, nessuna dashboard drag-and-drop, nessun contratto generato senza validazione legale.

## 3. Target utenti (personas)

| Persona | Contesto | Obiettivo | Rischio di abbandono |
|---|---|---|---|
| Responsabile operativo aziendale | Gestisce turni/eventi distribuiti sul territorio | Coprire il bisogno senza ore di telefonate | Candidature irrilevanti, costi/responsabilità poco chiari |
| Lavoratore flessibile | Studente/part-time/freelance con disponibilità variabile | Trovare incarichi compatibili vicini e ben pagati | Richieste documentali premature, compensi opachi, troppe notifiche |

Ruoli di sistema: Lavoratore, Owner azienda, Recruiter/manager, Admin piattaforma, Support agent, Partner/verifier.

## 4. Funzionalità principali (Must have per MVP, MoSCoW sez. 21)

- **Identità e trust**: account, verifica email/telefono, profili, ruoli, audit.
- **Marketplace**: creazione incarico, feed/ricerca, matching deterministico, candidatura/invito, conferma.
- **Esecuzione**: timeline, check-in/out, completamento, cancellazione, assistenza.
- **Pagamenti**: provider o flusso pilot tracciato, fee, stato, payout/rimborso, riconciliazione.
- **Reputazione**: recensioni bilaterali, metriche oggettive (no-show, cancellazioni separate dai rating).
- **Operations**: console admin, verifiche, dispute, moderazione, feature flags.
- **Compliance**: consensi, documenti, retention, diritti privacy, template legali approvati (esterni al software).
- **Analytics**: eventi funnel, KPI liquidità/qualità/costi.

## 5. Rischi (sez. 27 PRD, sintesi)

| Rischio | Impatto | Mitigazione prevista dal PRD |
|---|---|---|
| Il modello ricade in attività regolamentata (intermediazione lavoro) | Alto — bloccante | Legal discovery prima dei flussi definitivi; partnership con APL autorizzata |
| Insufficiente densità locale (liquidità marketplace) | Alto | Pilot circoscritto a una "cella" città×verticale×ruolo |
| No-show / qualità incoerente | Alto | Verifiche, reminder, lista d'attesa, metriche oggettive |
| Complessità payout/riconciliazione/chargeback | Alto | Provider marketplace, idempotenza, ledger, operations |
| Frode, account takeover, documenti falsi | Alto | KYC/KYB, risk scoring, MFA admin, audit |
| Ranking che penalizza nuovi utenti o gruppi (bias) | Alto | Motore spiegabile, audit fairness, no attributi protetti |
| Scope creep prima della validazione | Alto | MoSCoW rigido, gate, feature flags |
| Budget MVP realistico (€15-17k originale insufficiente) | Alto | Milestone financing: prototype (€20-45k) → closed pilot compliant (€80-180k) → MVP scalabile (€180-350k) |

## 6. Assunzioni da validare (sez. 27.1, esplicite nel PRD — non fatti)

- Le aziende sono disposte a pagare per rapidità/riduzione carico amministrativo.
- I lavoratori aggiornano realmente la disponibilità se ricevono opportunità pertinenti.
- Un raggio geografico ristretto produce liquidità sufficiente nel verticale scelto.
- Le mansioni iniziali sono descrivibili con tassonomia e requisiti standard.
- Il provider di pagamento supporta il modello legale e i tempi desiderati.
- Il presidio manuale del pilot è sostenibile e produce dati utili all'automazione futura.

## 7. Punti da validare esternamente prima del go-live reale (bloccanti secondo il PRD stesso)

Questi punti **non sono decisioni tecniche** e il PRD è esplicito nel dire che il software deve adattarsi alla decisione legale, non sostituirla:

1. **Ruolo giuridico della piattaforma** — marketplace tecnico vs intermediario autorizzato vs partnership APL (sez. 38). Il PRD raccomanda, come opzione più semplice per un MVP tecnico, il **Modello A — Software per APL** (BlinkJob fornisce tecnologia, un partner APL gestisce l'intermediazione).
2. **Tipologia di rapporto di lavoro ammesso** (P.IVA, CPO/prestazione occasionale con limiti INPS, somministrazione) — determina contratti, documenti, calcolo importi.
3. **Modello di pagamento e merchant of record** — chi è responsabile legale dei fondi (sez. 40). Il PRD esplicita che il termine "escrow" va evitato finché non esiste struttura autorizzata, e ammette come alternativa per il pilot un **flusso di pagamento tracciato** (non money-movement reale via PSP).
4. **Salute e sicurezza (D.Lgs 81/2008)** — classificazione rischio mansione, DPI, formazione, responsabilità (sez. 39).
5. **Conformità Direttiva UE 2024/2831** (gestione algoritmica del lavoro tramite piattaforme) e **AI Act** (matching/scoring HR è "alto rischio").
6. **GDPR / DPIA** per geolocalizzazione, profiling, dati di reputazione.

**Decisione di prodotto presa in questo progetto (documentata secondo la regola "se manca una decisione, scegli la più semplice"):** l'MVP software implementa tutti i flussi funzionali sopra descritti, ma il modulo Pagamenti usa il **flusso "pilot tracciato"** esplicitamente ammesso dal PRD (niente PSP reale, niente money-movement, niente KYC/KYB reale) finché le decisioni legali non sono validate da consulenti esterni. Vedi [MVP_SCOPE.md](MVP_SCOPE.md) e [TECH_ARCHITECTURE.md](TECH_ARCHITECTURE.md).

## 8. Conclusione della sezione di analisi

Il PRD stesso raccomanda (sez. 34): 3-5 settimane di legal/discovery, poi 12-16 settimane di build MVP con un team di ~8 persone (PM, tech lead, frontend, mobile, UX, QA, legal a consumo, operations), poi closed pilot. Questo progetto procede a costruire il **software** dell'MVP in modo tecnicamente solido e completo per tutti i flussi Must-have, lasciando esplicitamente aperti (e documentati come tali) i gate legali/regolatori che nessun software può risolvere autonomamente.
