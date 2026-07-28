import { describe, expect, it } from "vitest";
import {
  computeMatch,
  zonedDayAndMinutes,
  type JobForMatching,
  type WorkerForMatching,
} from "@/lib/matching/engine";

const SKILL_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SKILL_B = "aaaaaaaa-0000-0000-0000-000000000002";
const SKILL_C = "aaaaaaaa-0000-0000-0000-000000000003";

// A Saturday, 18:00-23:00 shift in Europe/Rome local time (CEST, UTC+2 in August).
const SATURDAY_JOB: JobForMatching = {
  startsAt: "2026-08-15T16:00:00.000Z",
  endsAt: "2026-08-15T21:00:00.000Z",
  mandatorySkillIds: [SKILL_A],
  preferredSkillIds: [SKILL_B, SKILL_C],
};

function jobDayOfWeek(iso: string) {
  return zonedDayAndMinutes(iso).dayOfWeek;
}

const JOB_DAY = jobDayOfWeek(SATURDAY_JOB.startsAt);

function baseWorker(overrides: Partial<WorkerForMatching> = {}): WorkerForMatching {
  return {
    distanceKm: 5,
    operatingRadiusKm: 20,
    status: "active",
    skillIds: [SKILL_A],
    reliabilityScore: 4.5,
    availability: [{ dayOfWeek: JOB_DAY, startTime: "16:00:00", endTime: "23:59:00", expiresAt: null }],
    ...overrides,
  };
}

describe("computeMatch — hard filters (exclusion, never scored)", () => {
  it("excludes a suspended worker", () => {
    expect(computeMatch(SATURDAY_JOB, baseWorker({ status: "suspended" }))).toBeNull();
  });

  it("excludes a blocked worker", () => {
    expect(computeMatch(SATURDAY_JOB, baseWorker({ status: "blocked" }))).toBeNull();
  });

  it("excludes a worker outside their own declared operating radius", () => {
    const result = computeMatch(
      SATURDAY_JOB,
      baseWorker({ distanceKm: 30, operatingRadiusKm: 20 })
    );
    expect(result).toBeNull();
  });

  it("excludes a worker missing a mandatory skill", () => {
    const result = computeMatch(SATURDAY_JOB, baseWorker({ skillIds: [SKILL_B] }));
    expect(result).toBeNull();
  });

  it("excludes a worker with no availability overlapping the job's day/time", () => {
    const result = computeMatch(
      SATURDAY_JOB,
      baseWorker({
        availability: [
          { dayOfWeek: (JOB_DAY + 1) % 7, startTime: "09:00:00", endTime: "17:00:00", expiresAt: null },
        ],
      })
    );
    expect(result).toBeNull();
  });

  it("excludes a worker whose only matching slot has already expired", () => {
    const result = computeMatch(
      SATURDAY_JOB,
      baseWorker({
        availability: [
          {
            dayOfWeek: jobDayOfWeek(SATURDAY_JOB.startsAt),
            startTime: "16:00:00",
            endTime: "23:59:00",
            expiresAt: "2020-01-01T00:00:00.000Z",
          },
        ],
      })
    );
    expect(result).toBeNull();
  });

  it("does not require preferred skills — mandatory-only worker still qualifies", () => {
    const result = computeMatch(SATURDAY_JOB, baseWorker({ skillIds: [SKILL_A] }));
    expect(result).not.toBeNull();
  });
});

describe("computeMatch — scoring and explanation", () => {
  it("scores a fully-qualified, close, reliable worker near the top of the range", () => {
    const result = computeMatch(
      SATURDAY_JOB,
      baseWorker({ distanceKm: 1, skillIds: [SKILL_A, SKILL_B, SKILL_C], reliabilityScore: 5 })
    );
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(90);
    expect(result!.reasons.some((r) => r.includes("km"))).toBe(true);
    expect(result!.reasons.some((r) => r.includes("negli orari richiesti"))).toBe(true);
    expect(result!.reasons.some((r) => r.includes("competenze richieste"))).toBe(true);
    expect(result!.reasons.some((r) => r.includes("rating"))).toBe(true);
  });

  it("scores lower for a worker who only partially covers the shift", () => {
    const full = computeMatch(SATURDAY_JOB, baseWorker())!;
    const partial = computeMatch(
      SATURDAY_JOB,
      baseWorker({
        availability: [
          { dayOfWeek: jobDayOfWeek(SATURDAY_JOB.startsAt), startTime: "16:00:00", endTime: "20:00:00", expiresAt: null },
        ],
      })
    )!;
    expect(partial.score).toBeLessThan(full.score);
    expect(partial.reasons.some((r) => r.includes("parzialmente"))).toBe(true);
  });

  it("scores a farther worker lower than a closer, otherwise identical worker", () => {
    const near = computeMatch(SATURDAY_JOB, baseWorker({ distanceKm: 1 }))!;
    const far = computeMatch(SATURDAY_JOB, baseWorker({ distanceKm: 15 }))!;
    expect(far.score).toBeLessThan(near.score);
  });

  it("does not penalize a brand-new worker with no reviews yet (reliability = 0)", () => {
    const newWorker = computeMatch(SATURDAY_JOB, baseWorker({ reliabilityScore: 0 }))!;
    const poorlyRated = computeMatch(SATURDAY_JOB, baseWorker({ reliabilityScore: 1 }))!;
    expect(newWorker.breakdown.reliability).toBeGreaterThan(poorlyRated.breakdown.reliability);
    expect(newWorker.reasons.some((r) => r.includes("nessuna recensione"))).toBe(true);
  });

  it("rewards matching more preferred skills", () => {
    const oneMatch = computeMatch(SATURDAY_JOB, baseWorker({ skillIds: [SKILL_A, SKILL_B] }))!;
    const twoMatches = computeMatch(
      SATURDAY_JOB,
      baseWorker({ skillIds: [SKILL_A, SKILL_B, SKILL_C] })
    )!;
    expect(twoMatches.score).toBeGreaterThan(oneMatch.score);
  });
});
