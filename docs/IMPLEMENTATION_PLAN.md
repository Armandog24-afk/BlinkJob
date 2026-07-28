# IMPLEMENTATION_PLAN — BlinkJob (software MVP)

Questo piano copre esclusivamente la costruzione del **software MVP** all'interno di questa sessione di lavoro. Non copre le fasi legali/commerciali (legal discovery, scelta partner APL, fundraising) che il PRD colloca a monte e in parallelo (sez. 23, 34) e che restano responsabilità del founder/consulenti esterni.

## 1. Ordine di sviluppo

| # | Milestone | Contenuto | Dipendenze |
|---|---|---|---|
| M0 | Documentazione | PROJECT_ANALYSIS, MVP_SCOPE, TECH_ARCHITECTURE, IMPLEMENTATION_PLAN | Lettura PRD completa |
| M1 | Fondazioni | Scaffold Next.js/TS/Tailwind, schema DB + RLS, auth base, RBAC | M0 |
| M2 | Onboarding | Profilo lavoratore (skill/disponibilità/area), profilo azienda (sedi/team) | M1 |
| M3 | Marketplace core | Creazione/pubblicazione incarico, feed/ricerca | M2 |
| M4 | Matching Engine | Pipeline eligibility→score→spiegazione | M3 |
| M5 | Candidature/Selezione | Candidatura, invito, conferma con snapshot condizioni | M4 |
| M6 | Esecuzione | Check-in/out, completamento, cancellazione | M5 |
| M7 | Pagamenti (tracciati) | Ledger stati, fee calcolo, riepilogo | M6 |
| M8 | Reputazione | Recensioni bilaterali, metriche oggettive | M7 |
| M9 | Admin console | Verifica, dispute, moderazione, analytics base, feature flags | M6 (parallelo a M7/M8) |
| M10 | Qualità | Test sui 5 scenari, hardening sicurezza, riepilogo finale | M9 |

## 2. Dipendenze critiche tra moduli

- Il Matching Engine (M4) dipende da dati di disponibilità/skill (M2) e da incarichi pubblicati (M3): senza dati realistici di test, lo score non è verificabile — verranno creati seed di sviluppo (aziende/lavoratori/incarichi fittizi, non dati reali).
- Le Candidature (M5) dipendono dal Matching per la spiegazione del match, ma devono funzionare anche come invito diretto senza passare dal ranking.
- I Pagamenti (M7) dipendono dal completamento di un Assignment (M6): nessun avanzamento a "pagato" senza stato `completed`.
- Le Recensioni (M8) dipendono da Assignment `completed` o `closed`.
- L'Admin (M9) legge trasversalmente tutti i domini: viene costruito in parallelo via viste/servizi read-side, non blocca gli altri moduli.

## 3. Stime (indicative, per una singola sessione di sviluppo assistito — non i 12-16 settimane/team di 8 persone stimati dal PRD per il prodotto reale completo di compliance)

Questo piano produce un **MVP dimostrabile e testabile end-to-end**, non l'intero perimetro Must-have del PRD con integrazioni reali (KYC/KYB/PSP/e-signature), che restano stub documentati. Le milestone M1-M10 vengono eseguite in sequenza in questa sessione, verificando ogni modulo con test prima di passare al successivo.

## 4. Definition of Done per modulo (adattata da sez. 23.3 PRD)

- Criteri di accettazione del requisito PRD corrispondente soddisfatti per il sottoinsieme in scope.
- Transizioni di stato coperte da test.
- RLS/RBAC applicati dove il modulo tocca dati sensibili.
- Nessun segreto o dato sensibile in log.
- Documentazione aggiornata con riepilogo modifiche dopo ogni fase (vedi regola FASE 10 del brief).

## 5. Cosa NON è incluso in questo piano (per trasparenza verso investitori/stakeholder futuri)

- Integrazione reale con provider di pagamento marketplace (Stripe Connect o equivalente).
- KYC/KYB reale tramite provider certificato.
- Firma elettronica qualificata.
- Notifiche SMS.
- App mobile nativa (si usa PWA responsive).
- Penetration test, audit fairness formale, DPIA — attività che richiedono professionisti esterni (legal, DPO, security auditor) come indicato dal PRD stesso (sez. 35.3).

## 6. Prossimi passi dopo questa sessione (raccomandazione, non eseguiti qui)

1. Validare con legale del lavoro il modello operativo (Modello A — Software per APL, raccomandato dal PRD).
2. Selezionare provider KYC/KYB e PSP marketplace, avviare due diligence.
3. Sostituire gli adapter stub (`lib/integrations/*`) con integrazioni reali, senza toccare lo schema dati core.
4. Eseguire il pilot design (sez. 26 e 43 del PRD): scelta cella città×verticale, 10-20 aziende pilot, 200-500 lavoratori.
