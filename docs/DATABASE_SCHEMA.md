# DATABASE_SCHEMA — BlinkJob

Schema relazionale PostgreSQL (Supabase). Basato su PRD sez. 15 (Modello Dati) esteso con i campi necessari ai requisiti funzionali di sez. 8. Le migrazioni SQL eseguibili sono in `/database/migrations`.

## 1. Convenzioni

- Chiavi primarie: `uuid` (`gen_random_uuid()`).
- Timestamp sempre `timestamptz`, salvati in UTC; la UI localizza.
- Importi: `integer` in centesimi + `currency` esplicito (mai `float`).
- Ogni tabella ha `created_at`, `updated_at`.
- Stati come `enum` Postgres, non stringhe libere.
- Nessuna cancellazione fisica per entità con obbligo di audit (`Job`, `Assignment`, `Payment`, `Review`, `Dispute`): si usa soft-delete/stato, mai `DELETE`.

## 2. Diagramma relazionale (sintetico)

```
users ──1:1── worker_profiles ──1:N── worker_availability
  │                 │
  │                 ├──N:M── skills (via worker_skills)
  │
  ├──N:M── companies (via company_members, ruolo)
  │
companies ──1:N── company_locations
  │
  ├──1:N── jobs ──1:N── job_requirements (skill richieste)
  │           │
  │           ├──1:N── applications ──N:1── worker_profiles
  │           │           │
  │           │           └──1:1── assignments (quando accettata)
  │           │                       │
  │           │                       ├──1:N── check_events
  │           │                       ├──1:1── payments
  │           │                       ├──1:N── reviews (2, una per parte)
  │           │                       └──0:N── disputes
  │
notifications ──N:1── users
audit_events ──N:1── users (actor)
feature_flags (standalone)
skill_taxonomy (standalone, referenziata da worker_skills / job_requirements)
```

## 3. Entità principali

### users
Identità tecnica condivisa tra lavoratore e utente aziendale.
| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | = auth.users.id (Supabase Auth) |
| email | text unique | |
| phone | text nullable | |
| role | enum(worker, recruiter, company_owner, support, admin) | ruolo primario |
| status | enum(incomplete, pending_verification, active, suspended, blocked) | |
| full_name | text | |
| consents | jsonb | versione + timestamp consensi (privacy, termini) |
| created_at, updated_at | timestamptz | |

### worker_profiles
| Campo | Tipo | Note |
|---|---|---|
| user_id | uuid PK/FK → users | |
| birth_date | date | |
| home_location | geography(Point) | PostGIS, per calcolo distanza |
| operating_radius_km | numeric | |
| bio | text | |
| completeness_score | int | calcolato, non modificabile manualmente |
| reliability_score | numeric | derivato da completions/no-show/cancellazioni |
| verification_tier | enum(t0,t1,t2,t3) | vedi sez. 42.2 PRD, semplificato |
| blinknow_opt_in | bool | default false; consenso esplicito richiesto per ricevere notifiche BlinkNow (M13) |

### worker_skills (N:M worker_profiles ↔ skill_taxonomy)
| worker_id | skill_id | level (enum: base, intermedio, avanzato) | verified (bool) | verified_at |

### skill_taxonomy
| id | name | category | synonyms (text[]) | status (enum active/deprecated) | version |

### worker_availability
| id | worker_id FK | day_of_week / date_range | start_time | end_time | expires_at |

### companies
| id | legal_name | vat_number | status (enum pending_verification, active, limited, suspended) | billing_email | created_at |

### company_members (N:M users ↔ companies)
| company_id | user_id | role (enum owner, recruiter) | invited_at | accepted_at |

### company_locations
| id | company_id FK | address | location (geography Point) | label |

### jobs
| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK | |
| location_id | uuid FK → company_locations | |
| title, description | text | |
| category | text | tassonomia ruoli |
| positions_count | int | numero persone richieste |
| pay_amount_cents | int | |
| pay_currency | text | default EUR |
| starts_at, ends_at | timestamptz | |
| application_deadline | timestamptz | |
| status | enum(draft, published, in_selection, confirmed, in_progress, completed, disputed, canceled, expired) | macchina a stati, sez. 10.1 PRD |
| version | int | incrementato a ogni modifica materiale (BR-002) |
| urgency_tier | enum(standard, blinknow) | predisposizione futura, non attivo nell'MVP |
| created_by | uuid FK users | |

### job_requirements
| job_id FK | skill_id FK | mandatory (bool) |

### applications
| id | job_id FK | worker_id FK | type (enum application, invite) | status (enum sent, viewed, shortlisted, info_requested, accepted, rejected, withdrawn, expired) | match_score | match_reasons (jsonb) | created_at |

### assignments
| id | application_id FK unique | job_id FK | worker_id FK | status (enum confirmed, in_progress, completed, disputed, canceled) | confirmed_terms_snapshot (jsonb) | confirmed_at |

Vincolo: un `assignment` per `application` accettata; un `job` può avere N `assignments` (una per posizione).

### check_events
| id | assignment_id FK | type (enum check_in, check_out) | occurred_at | method (enum gps, manual, qr) | location (geography nullable) | note |

### payments (ledger tracciato — nessun PSP reale nell'MVP)
| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| assignment_id | uuid FK unique | |
| gross_amount_cents | int | |
| platform_fee_cents | int | calcolato da `fee_version` |
| fee_version | text | versione formula commissione |
| net_amount_cents | int | |
| currency | text | |
| status | enum(draft, pending, confirmed, paid, refunded, disputed) | stati semplificati rispetto al ledger PSP reale di sez. 40.3 PRD |
| provider | text | = 'tracked_ledger' nell'MVP |
| created_at, updated_at | | |

### reviews
| id | assignment_id FK | author_id FK | recipient_id FK | rating_dimensions (jsonb) | comment | published_at | moderation_status (enum pending, published, hidden) |

Vincolo unique: (assignment_id, author_id).

### disputes
| id | assignment_id FK | opened_by FK | type | status (enum open, collecting, deciding, resolved, appealed, closed) | resolution | economic_impact_cents |

### notifications
| id | user_id FK | event_type | channel (enum in_app, email) | payload (jsonb) | read_at | created_at |

### audit_events (append-only, no update/delete)
| id | actor_id FK nullable | action | resource_type | resource_id | metadata (jsonb) | created_at |

### feature_flags
| key | description | enabled_globally (bool) | enabled_cities (text[]) | enabled_categories (text[]) |

### points_ledger (M14 — BlinkPoints, simulazione interna senza ricompense)
| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| points | int | positivo o negativo (una revoca è una nuova riga negativa, mai una modifica) |
| reason | text | es. `profile_completed_badge`, `review_contributed`, `assignment_completed_no_issues`, `admin_adjustment: ...` |
| reference_type / reference_id | text / uuid | opzionali, puntano all'entità che ha originato il movimento |

Append-only per design: nessuna policy RLS INSERT/UPDATE/DELETE per il client, scrittura solo tramite `award_points`/`admin_adjust_points` (security definer, gated dal flag `blinkpoints_enabled`).

## 4. Vincoli applicati (da sez. 15.2 PRD)

- `assignments.application_id` UNIQUE — un'assegnazione per candidatura.
- `payments.status` non può diventare `paid` se `assignments.status != 'completed'` — enforced in trigger/funzione applicativa, non solo a livello UI.
- `reviews` UNIQUE (assignment_id, author_id) — una recensione per parte per incarico.
- Modifica a campi materiali di `jobs` (pay_amount_cents, starts_at, ends_at, location_id) dopo `published` incrementa `version` e invalida accettazioni precedenti non ancora confermate.
- Tutti gli importi interi in centesimi; mai floating point.

## 5. Row Level Security (sintesi — dettaglio in `database/migrations`)

- `worker_profiles`: il lavoratore vede/modifica solo il proprio; l'azienda vede solo i profili con `application`/`assignment` verso un proprio `job`; admin/support vedono per ruolo.
- `jobs`: pubblico in lettura solo se `status = 'published'`; scrittura solo da membri della company proprietaria.
- `payments`, `audit_events`: nessun accesso diretto client-side, solo tramite funzioni server-side con ruolo verificato.
