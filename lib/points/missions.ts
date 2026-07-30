// Mirrors the SQL source of truth (database/migrations/035, refresh_worker_missions) — kept in
// sync manually, same pattern as lib/points/levels.ts (026).

export interface MissionDef {
  key: string;
  label: string;
  description: string;
  type: "lifetime" | "monthly";
  target: number;
  pointsReward: number;
}

export const MISSIONS: MissionDef[] = [
  {
    key: "prima_candidatura",
    label: "Prima candidatura",
    description: "Invia la tua prima candidatura a un incarico.",
    type: "lifetime",
    target: 1,
    pointsReward: 5,
  },
  {
    key: "primo_incarico_completato",
    label: "Primo incarico completato",
    description: "Completa il tuo primo incarico.",
    type: "lifetime",
    target: 1,
    pointsReward: 15,
  },
  {
    key: "tre_incarichi_al_mese",
    label: "3 incarichi questo mese",
    description: "Completa 3 incarichi nello stesso mese.",
    type: "monthly",
    target: 3,
    pointsReward: 30,
  },
  {
    key: "due_recensioni_al_mese",
    label: "2 recensioni questo mese",
    description: "Lascia 2 recensioni nello stesso mese.",
    type: "monthly",
    target: 2,
    pointsReward: 10,
  },
];

export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}
