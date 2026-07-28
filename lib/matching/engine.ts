// Deterministic, explainable matching engine (PRD sez. 11 / MVP_SCOPE.md).
// No ML, no protected attributes — every score is a weighted sum of transparent signals,
// and every result carries the concrete reasons a human reviewer (or the candidate) can audit.

export interface JobForMatching {
  startsAt: string;
  endsAt: string;
  mandatorySkillIds: string[];
  preferredSkillIds: string[];
  urgencyTier?: "standard" | "blinknow";
}

export interface AvailabilitySlot {
  dayOfWeek: number | null;
  startTime: string; // "HH:MM:SS"
  endTime: string;
  expiresAt: string | null;
}

export interface WorkerForMatching {
  distanceKm: number;
  operatingRadiusKm: number;
  status: "incomplete" | "pending_verification" | "active" | "suspended" | "blocked";
  skillIds: string[];
  reliabilityScore: number; // 0-5, 0 means "no data yet"
  availability: AvailabilitySlot[];
}

export interface MatchResult {
  score: number; // 0-100
  reasons: string[];
  breakdown: {
    availability: number;
    distance: number;
    skillFit: number;
    reliability: number;
    preference: number;
  };
}

const WEIGHTS = {
  availability: 0.3,
  distance: 0.25,
  skillFit: 0.2,
  reliability: 0.15,
  preference: 0.1,
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// worker_availability.start_time/end_time are plain wall-clock times with no timezone info,
// implicitly local to the market this pilot serves. jobs.starts_at is an absolute instant
// (timestamptz), which a server running in any timezone (e.g. UTC in production) would
// otherwise convert using ITS OWN local time — silently misaligning every comparison. Anchoring
// to a fixed zone here keeps the result identical regardless of where the code runs.
const MARKET_TIMEZONE = "Europe/Rome";
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function zonedDayAndMinutes(iso: string): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = Number(byType.hour) % 24; // midnight can format as "24"
  return { dayOfWeek: WEEKDAY_INDEX[byType.weekday], minutes: hour * 60 + Number(byType.minute) };
}

function availabilityCoverage(
  job: JobForMatching,
  availability: AvailabilitySlot[]
): "full" | "partial" | "none" {
  const start = new Date(job.startsAt);
  const end = new Date(job.endsAt);
  const { dayOfWeek, minutes: jobStartMin } = zonedDayAndMinutes(job.startsAt);
  const jobEndMin = jobStartMin + (end.getTime() - start.getTime()) / 60000;
  const now = new Date();

  let best: "full" | "partial" | "none" = "none";

  for (const slot of availability) {
    if (slot.dayOfWeek !== dayOfWeek) continue;
    if (slot.expiresAt && new Date(slot.expiresAt) < now) continue;

    const slotStart = timeToMinutes(slot.startTime);
    const slotEnd = timeToMinutes(slot.endTime);
    const overlaps = slotStart < jobEndMin && slotEnd > jobStartMin;
    if (!overlaps) continue;

    const fullyCovers = slotStart <= jobStartMin && slotEnd >= jobEndMin;
    if (fullyCovers) return "full";
    best = "partial";
  }

  return best;
}

/**
 * Returns null when the candidate fails a hard eligibility filter (never shown, never scored).
 * Otherwise returns a 0-100 score plus the human-readable reasons behind it.
 */
export function computeMatch(job: JobForMatching, worker: WorkerForMatching): MatchResult | null {
  if (worker.status === "suspended" || worker.status === "blocked") return null;
  if (worker.distanceKm > worker.operatingRadiusKm) return null;

  const missingMandatory = job.mandatorySkillIds.filter((id) => !worker.skillIds.includes(id));
  if (missingMandatory.length > 0) return null;

  const coverage = availabilityCoverage(job, worker.availability);
  if (coverage === "none") return null;

  const availabilityScore = coverage === "full" ? 1 : 0.6;

  const distanceScore = Math.max(
    0,
    1 - worker.distanceKm / Math.max(worker.operatingRadiusKm, 1)
  );

  const matchedPreferred = job.preferredSkillIds.filter((id) => worker.skillIds.includes(id));
  const skillFitScore =
    job.preferredSkillIds.length === 0 ? 1 : matchedPreferred.length / job.preferredSkillIds.length;

  // A worker with no track record yet is scored neutrally rather than penalized (PRD sez. 27:
  // ranking must not disadvantage newcomers).
  const reliabilityScore = worker.reliabilityScore === 0 ? 0.6 : Math.min(worker.reliabilityScore / 5, 1);

  // No employer preference weighting exists in the schema yet — neutral placeholder,
  // to be wired up when that data model lands (post-MVP).
  const preferenceScore = 1;

  const baseScore =
    100 *
    (WEIGHTS.availability * availabilityScore +
      WEIGHTS.distance * distanceScore +
      WEIGHTS.skillFit * skillFitScore +
      WEIGHTS.reliability * reliabilityScore +
      WEIGHTS.preference * preferenceScore);

  // PRD sez. 11.4: BlinkNow ottiene un "boost temporaneo... limitato e registrato" in classifica,
  // non un filtro/priorità assoluta. Bonus fisso e ridotto, sempre visibile in `reasons` (il
  // "registrato" richiesto dal PRD è questa trasparenza, non un log separato).
  const BLINKNOW_BOOST = 5;
  const score =
    job.urgencyTier === "blinknow" ? Math.min(100, baseScore + BLINKNOW_BOOST) : baseScore;

  const totalMatchedSkills = job.mandatorySkillIds.length + matchedPreferred.length;
  const totalRequiredSkills = job.mandatorySkillIds.length + job.preferredSkillIds.length;

  const reasons: string[] = [
    `distanza ${worker.distanceKm.toFixed(1)} km`,
    coverage === "full"
      ? "disponibile negli orari richiesti"
      : "parzialmente disponibile negli orari richiesti",
  ];

  if (totalRequiredSkills > 0) {
    reasons.push(`possiede ${totalMatchedSkills} competenze richieste su ${totalRequiredSkills}`);
  }

  reasons.push(
    worker.reliabilityScore > 0
      ? `rating ${worker.reliabilityScore.toFixed(1)}/5`
      : "nessuna recensione ancora"
  );

  if (job.urgencyTier === "blinknow") {
    reasons.push(`incarico urgente BlinkNow: priorità temporanea (+${BLINKNOW_BOOST} punti)`);
  }

  return {
    score: Math.round(score * 10) / 10,
    reasons,
    breakdown: {
      availability: availabilityScore,
      distance: distanceScore,
      skillFit: skillFitScore,
      reliability: reliabilityScore,
      preference: preferenceScore,
    },
  };
}
