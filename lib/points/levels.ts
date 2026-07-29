// Mirrors the SQL source of truth (database/migrations/025, worker_points_level) — kept in sync
// manually, same pattern as lib/payments/fees.ts / lib/blinknow/config.ts.
//
// Ricompense volutamente NON monetarie (PRD PTS-005 vieta un marketplace ricompense reale prima
// di un'analisi fiscale/antifrode): un livello sblocca solo un piccolo boost di visibilità nel
// matching e la priorità nelle ondate BlinkNow (025) — mai un aumento di reliability_score
// (PTS-003, "nessun pay-to-rank" resta rispettato per costruzione).

export interface PointsLevel {
  level: 0 | 1 | 2 | 3;
  name: string;
  minPoints: number;
  matchingBoost: number;
}

export const POINTS_LEVELS: PointsLevel[] = [
  { level: 0, name: "Bronzo", minPoints: 0, matchingBoost: 0 },
  { level: 1, name: "Argento", minPoints: 100, matchingBoost: 1 },
  { level: 2, name: "Oro", minPoints: 300, matchingBoost: 2 },
  { level: 3, name: "Platino", minPoints: 600, matchingBoost: 3 },
];

export function getPointsLevel(totalPoints: number): PointsLevel {
  let current = POINTS_LEVELS[0];
  for (const level of POINTS_LEVELS) {
    if (totalPoints >= level.minPoints) current = level;
  }
  return current;
}

export function getNextPointsLevel(totalPoints: number): PointsLevel | null {
  const current = getPointsLevel(totalPoints);
  return POINTS_LEVELS.find((l) => l.level === current.level + 1) ?? null;
}

export interface BadgeInfo {
  key: string;
  label: string;
  description: string;
}

export const BADGE_CATALOG: Record<string, BadgeInfo> = {
  profilo_completo: {
    key: "profilo_completo",
    label: "Profilo completo",
    description: "Ha completato il profilo al 100%.",
  },
  prima_recensione_ricevuta: {
    key: "prima_recensione_ricevuta",
    label: "Prima recensione",
    description: "Ha ricevuto la prima recensione da un'azienda.",
  },
  dieci_incarichi_completati: {
    key: "dieci_incarichi_completati",
    label: "10 incarichi completati",
    description: "Ha completato almeno 10 incarichi.",
  },
  affidabile_5_stelle: {
    key: "affidabile_5_stelle",
    label: "Affidabilità 5 stelle",
    description: "Rating medio di 5/5 su almeno 3 recensioni.",
  },
  livello_argento: {
    key: "livello_argento",
    label: "Livello Argento",
    description: "Ha raggiunto il livello Argento in BlinkPoints.",
  },
  livello_oro: {
    key: "livello_oro",
    label: "Livello Oro",
    description: "Ha raggiunto il livello Oro in BlinkPoints.",
  },
  livello_platino: {
    key: "livello_platino",
    label: "Livello Platino",
    description: "Ha raggiunto il livello Platino in BlinkPoints.",
  },
};

export function getBadgeInfo(badgeKey: string): BadgeInfo {
  return BADGE_CATALOG[badgeKey] ?? { key: badgeKey, label: badgeKey, description: "" };
}
