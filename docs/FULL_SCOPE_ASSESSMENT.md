# Valutazione: MVP attuale vs "100% del PRD"

Richiesta dall'utente il 2026-07-29: cosa servirebbe per sviluppare tutto ciò che il PRD (`BlinkJob_PRD_Product_Bible_v3.docx`, 52 sezioni) descrive, invece di fermarsi all'MVP (M1-M14 già costruiti e verificati).

**Conclusione in breve:** è tecnicamente possibile, ma il PRD stesso — nella propria sezione di gap analysis (35) — dice chiaramente che il rischio principale non è tecnico:

> "Il progetto non è 'scarno' sul prodotto; era incompleto sulle dipendenze esterne. Il rischio principale non è tecnico, ma costruire una UX elegante prima di avere deciso chi assume, chi intermedia, chi paga, chi forma e chi risponde in caso di incidente." (sez. 35.3)

Questo documento divide ciò che manca in 4 categorie, per capire cosa posso costruire subito e cosa dipende da decisioni che non sono ingegneristiche.

---

## Categoria 1 — Solo ingegneria: posso costruirle da qui, nessun blocco esterno

Nessuna di queste richiede un nuovo fornitore, un costo ricorrente o un parere professionale — sono estensioni dirette di quanto già costruito (M1-M14).

| Area PRD | Cosa manca | Note |
|---|---|---|
| 8.8 Messaggistica | Chat contestuale azienda↔lavoratore (MSG-001..004), mascheramento contatti, segnalazione messaggio | Nessuna chat esiste oggi, solo notifiche unidirezionali (M12) |
| 8.8 Notifiche | Centro notifiche con digest/quiet hours, template versionati, dedup garantito (NOT-002..006) | Oggi solo notifiche in-app immediate, no digest |
| 8.7 Documenti | Infrastruttura di archivio/versioning/scadenza documenti, accettazione con evidenze (timestamp/IP) | Il *contenuto legale* del contratto è categoria 3, l'infrastruttura per generarlo/archiviarlo/versionarlo è categoria 1 |
| 21.2 Should have | Template incarichi, preferiti/talent pool, centri di costo, report aziendali, stima difficoltà copertura | Estensioni dirette dello schema `jobs`/`companies` esistente |
| 21.2 Should have | QR check-in (alternativa al check-in manuale attuale) | Generare/leggere un QR è solo codice |
| 21.3 Could have | Import CV, serie di incarichi ricorrenti, temi dashboard | |
| 21.3 Could have | SSO | Solo se si usano i provider OAuth integrati in Supabase Auth (Google, ecc.) — zero nuovo vendor |
| 19. Analytics | Intero funnel eventi + KPI (fill rate, no-show rate, ecc.) | Costruibile self-hosted su Postgres (tabella eventi + query admin), zero vendor esterno |
| 42.2 Verifica T1 | Verifica telefono + identità base | La logica è cat. 1; l'invio SMS/OTP stesso richiede un provider (cat. 2) |
| 11. Matching | Geofencing avanzato | PostGIS è già in uso da M4, è solo più query |
| 8.12 Supporto | Help center strutturato, flusso di appello sulle dispute | Estensione del modulo dispute già esistente (M9) |

**Stima:** questa categoria da sola è grande quanto tutto ciò che è stato costruito finora (M1-M14) — realisticamente altrettante milestone.

---

## Categoria 2 — Richiede una tua decisione e/o un costo (provider, budget)

Qui la scelta tecnica dipende da un fornitore o un budget che solo tu puoi approvare. Una volta scelto, l'integrazione stessa è ingegneria.

| Area PRD | Decisione necessaria | Perché non posso decidere io |
|---|---|---|
| 40. Pagamenti reali | PSP (es. Stripe Connect): KYC/KYB, payout reali, riserve, chargeback, rimborsi | Il PRD stesso dice: "da validare con PSP, fiscalista e legale" (sez. 35.1) prima di integrare — non è solo scelta tecnica |
| 42.2 Verifica T2/T3 | Provider di verifica identità/documenti (es. Stripe Identity, Onfido) per lavoratori e KYB/UBO aziende | Servizio a pagamento, terzo esterno |
| 9.2 Blink Assistant | Provider AI (Anthropic, OpenAI, ecc.) | Già discusso — hai scelto di rimandarlo (M15) |
| 8.8 SMS critici | Provider SMS (es. Twilio) | Costo per messaggio, serve un account |
| 8.7 Firma qualificata | Provider di firma elettronica qualificata (opzionale, DOC-009) | Solo se il modello giuridico scelto la richiede |
| 41.3 Ranking ML avanzato | Il PRD pone una "linea rossa": serve DPO + AI owner **prima** di procedere, non è una libera scelta di prodotto | Governance, non tecnologia |
| Assicurazioni | RC professionale/piattaforma, cyber, infortuni | Broker assicurativo, non codice |

---

## Categoria 3 — Bloccato da decisioni legali/fiscali/regolatorie (servono professionisti esterni, non uno sviluppatore)

Questa è la categoria che il PRD segnala come "bloccante prima del pilot" (sez. 35.2) — nessuna quantità di codice la risolve.

| Decisione | Owner secondo il PRD | Perché blocca |
|---|---|---|
| Ruolo giuridico di BlinkJob (bacheca / intermediario / somministratore) | Founder + legale del lavoro | Determina responsabilità su tutto il resto |
| Rapporti di lavoro ammessi nel pilot (prestazione occasionale, P.IVA, CPO, APL) | Consulente del lavoro | Cambia i template contrattuali e i flussi pagamento |
| Salute e sicurezza (mansioni, formazione, DPI, incidenti) | HSE/RSPP | Richiesto prima di onboardare aziende con ruoli operativi |
| Contenuto reale del contratto/template legale | Legale | L'infrastruttura per generarlo è già cat. 1, ma il *testo* deve venire da un legale |
| Consensi privacy specifici, DPIA, basi giuridiche | DPO/privacy counsel | Determina quali consensi tracciare e con quale retention (sez. 41.2) |
| Fatturazione elettronica, IVA, regime fiscale (sez. 40.4) | Fiscalista/CFO | Determina chi emette cosa e quando |
| Merchant of record e flusso fondi | CFO/fiscalista + PSP | Precede qualunque integrazione pagamenti |

---

## Categoria 4 — Esplicitamente rimandate dal PRD stesso ("Won't have", sez. 21.4)

Non vanno costruite in questa fase — il PRD lo dice esplicitamente, non è una mia scelta:

- Copertura nazionale indiscriminata
- Payroll completo e gestione di ogni forma contrattuale
- Selezione autonoma tramite IA (senza supervisione umana)
- Classifiche pubbliche dei lavoratori
- Pubblicità geolocalizzata
- Integrazioni HR enterprise complesse
- Dashboard drag-and-drop
- BlinkPoints con ricompense monetarie (richiede analisi fiscale/antifrode prima, sez. 9.3 — già rispettato in M14)

---

## Raccomandazione

Non trattare "100%" come un unico obiettivo monolitico:

1. **Categoria 1** posso iniziarla subito, a milestone come fatto finora (M16+), senza aspettare nessuno.
2. **Categoria 2** ha bisogno di tue decisioni su provider/budget — quella con leva maggiore è quasi certamente **i pagamenti reali** (sblocca il pilot con soldi veri), ma anche quella con più prerequisiti (categoria 3 la precede).
3. **Categoria 3** non è lavoro mio: servono un legale del lavoro, un consulente del lavoro, un consulente HSE, un fiscalista e un DPO — il PRD lo dice esplicitamente come readiness bloccante *prima* del pilot, indipendentemente da quanto sia completo il prodotto.
4. **Categoria 4** non va costruita ora.
