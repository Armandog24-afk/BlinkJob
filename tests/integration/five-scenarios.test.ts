// Integration tests for the 5 core scenarios (CLAUDE.md FASE 9), run against the real Supabase
// project configured in .env.local — not mocked. Each run creates a small amount of throwaway
// fixture data (one worker, one company, one job, one assignment) with a unique email per run;
// this is a dev/pilot project, so leftover fixtures are acceptable and harmless (documented
// simplification — no teardown). Scenarios build on each other sequentially, matching the actual
// worker→hire→execute→pay→review pipeline rather than 5 isolated unit tests.

import { describe, expect, it } from "vitest";
import { signUpAndSignIn, SKILL_MOVIMENTAZIONE_MERCI } from "./helpers";
import { toEwktPoint } from "@/lib/geo";
import { computeMatch, type AvailabilitySlot } from "@/lib/matching/engine";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const PASSWORD = "TestPassword123!";
const RUN_ID = Date.now();

describe("5 scenari MVP (integrazione, database reale)", () => {
  let workerClient: SupabaseClient<Database>;
  let workerId: string;
  let companyClient: SupabaseClient<Database>;
  let companyOwnerId: string;
  let companyId: string;
  let locationId: string;
  let jobId: string;
  let applicationId: string;
  let assignmentId: string;

  it("Scenario 1 — nuovo lavoratore registra profilo", async () => {
    const signup = await signUpAndSignIn(
      `it.worker.${RUN_ID}@blinkjob-testmail.com`,
      PASSWORD,
      "Test Worker",
      "worker"
    );
    workerClient = signup.client;
    workerId = signup.userId;

    const { error: profileError } = await workerClient.from("worker_profiles").upsert({
      user_id: workerId,
      birth_date: "1995-01-01",
      home_location: toEwktPoint(45.4642, 9.19), // Milano
      operating_radius_km: 20,
    });
    expect(profileError).toBeNull();

    const { error: skillError } = await workerClient
      .from("worker_skills")
      .insert({ worker_id: workerId, skill_id: SKILL_MOVIMENTAZIONE_MERCI });
    expect(skillError).toBeNull();

    // All 7 days, full day: avoids the test depending on which weekday the run happens to fall
    // on — the availability *matching logic itself* is covered separately and thoroughly by
    // tests/unit/matching-engine.test.ts.
    const availabilityRows = Array.from({ length: 7 }, (_, day_of_week) => ({
      worker_id: workerId,
      day_of_week,
      start_time: "00:00:00",
      end_time: "23:59:00",
    }));
    const { error: availError } = await workerClient
      .from("worker_availability")
      .insert(availabilityRows);
    expect(availError).toBeNull();

    const { data: profile } = await workerClient
      .from("worker_profiles")
      .select("user_id, operating_radius_km")
      .eq("user_id", workerId)
      .single();
    expect(profile?.operating_radius_km).toBe(20);
  });

  it("Scenario 2 — azienda pubblica un incarico", async () => {
    const signup = await signUpAndSignIn(
      `it.company.${RUN_ID}@blinkjob-testmail.com`,
      PASSWORD,
      "Test Recruiter",
      "company_owner"
    );
    companyClient = signup.client;
    companyOwnerId = signup.userId;

    const { data: companyIdData, error: companyError } = await companyClient.rpc(
      "create_company_with_owner",
      { p_legal_name: `Test Co ${RUN_ID}`, p_vat_number: null }
    );
    expect(companyError).toBeNull();
    companyId = companyIdData as unknown as string;
    expect(companyId).toBeTruthy();

    const { data: location, error: locationError } = await companyClient
      .from("company_locations")
      .insert({
        company_id: companyId,
        label: "Sede test",
        address: "Via Test 1, Milano",
        location: toEwktPoint(45.4642, 9.19),
      })
      .select("id")
      .single();
    expect(locationError).toBeNull();
    locationId = location!.id;

    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // one week from now
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
    const deadline = new Date(startsAt.getTime() - 2 * 24 * 60 * 60 * 1000);

    const { data: job, error: jobError } = await companyClient
      .from("jobs")
      .insert({
        company_id: companyId,
        location_id: locationId,
        created_by: companyOwnerId,
        title: `Facchino test ${RUN_ID}`,
        description: "Incarico di test per la suite di integrazione.",
        category: "logistica",
        positions_count: 1,
        pay_amount_cents: 8000,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        application_deadline: deadline.toISOString(),
        status: "draft",
      })
      .select("id")
      .single();
    expect(jobError).toBeNull();
    jobId = job!.id;

    await companyClient
      .from("job_requirements")
      .insert({ job_id: jobId, skill_id: SKILL_MOVIMENTAZIONE_MERCI, mandatory: true });

    const { error: publishError } = await companyClient
      .from("jobs")
      .update({ status: "published" })
      .eq("id", jobId);
    expect(publishError).toBeNull();

    const { data: publishedJob } = await companyClient
      .from("jobs")
      .select("status")
      .eq("id", jobId)
      .single();
    expect(publishedJob?.status).toBe("published");
  });

  it("Scenario 3 — il sistema trova lavoratori compatibili", async () => {
    const { data: candidates, error } = await companyClient.rpc("candidate_workers_for_job", {
      p_job_id: jobId,
    });
    expect(error).toBeNull();
    const candidate = candidates?.find((c) => c.worker_id === workerId);
    expect(candidate, "il lavoratore di test deve apparire come candidato geo-eleggibile").toBeTruthy();

    const { data: job } = await companyClient
      .from("jobs")
      .select("starts_at, ends_at")
      .eq("id", jobId)
      .single();
    const { data: skills } = await workerClient
      .from("worker_skills")
      .select("skill_id")
      .eq("worker_id", workerId);
    const { data: availabilityRows } = await workerClient
      .from("worker_availability")
      .select("day_of_week, start_time, end_time, expires_at")
      .eq("worker_id", workerId);

    const availability: AvailabilitySlot[] = (availabilityRows ?? []).map((row) => ({
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      expiresAt: row.expires_at,
    }));

    const match = computeMatch(
      {
        startsAt: job!.starts_at,
        endsAt: job!.ends_at,
        mandatorySkillIds: [SKILL_MOVIMENTAZIONE_MERCI],
        preferredSkillIds: [],
      },
      {
        distanceKm: candidate!.distance_km,
        operatingRadiusKm: candidate!.operating_radius_km,
        status: candidate!.status,
        skillIds: (skills ?? []).map((s) => s.skill_id),
        reliabilityScore: candidate!.reliability_score,
        availability,
      }
    );

    expect(match, "il match deterministico deve riuscire per un candidato pienamente compatibile").not.toBeNull();
    expect(match!.score).toBeGreaterThan(0);
    expect(match!.reasons.some((r) => r.includes("km"))).toBe(true);
    expect(match!.reasons.some((r) => r.includes("competenze richieste"))).toBe(true);
  });

  it("Scenario 4 — il lavoratore si candida e l'azienda conferma l'incarico", async () => {
    const { data: application, error: applyError } = await workerClient
      .from("applications")
      .insert({ job_id: jobId, worker_id: workerId, type: "application", status: "sent" })
      .select("id")
      .single();
    expect(applyError).toBeNull();
    applicationId = application!.id;

    const { data: newAssignmentId, error: confirmError } = await companyClient.rpc(
      "confirm_candidate",
      { p_application_id: applicationId }
    );
    expect(confirmError).toBeNull();
    assignmentId = newAssignmentId as unknown as string;

    const { data: assignment } = await companyClient
      .from("assignments")
      .select("status, confirmed_terms_snapshot")
      .eq("id", assignmentId)
      .single();
    expect(assignment?.status).toBe("confirmed");
    expect((assignment?.confirmed_terms_snapshot as { pay_amount_cents: number }).pay_amount_cents).toBe(
      8000
    );
  });

  it("Scenario 5 — l'azienda completa l'incarico, il pagamento si crea e arriva la recensione", async () => {
    const { error: checkInError } = await workerClient.rpc("check_in_assignment", {
      p_assignment_id: assignmentId,
    });
    expect(checkInError).toBeNull();

    const { error: checkOutError } = await workerClient.rpc("check_out_assignment", {
      p_assignment_id: assignmentId,
    });
    expect(checkOutError).toBeNull();

    const { error: completeError } = await workerClient.rpc("confirm_assignment_completion", {
      p_assignment_id: assignmentId,
    });
    expect(completeError).toBeNull();

    const { data: assignment } = await workerClient
      .from("assignments")
      .select("status")
      .eq("id", assignmentId)
      .single();
    expect(assignment?.status).toBe("completed");

    const { data: payment } = await companyClient
      .from("payments")
      .select("gross_amount_cents, platform_fee_cents, net_amount_cents, status")
      .eq("assignment_id", assignmentId)
      .single();
    expect(payment?.gross_amount_cents).toBe(8000);
    expect(payment?.platform_fee_cents).toBe(960); // 12% of 8000
    expect(payment?.net_amount_cents).toBe(7040);
    expect(payment?.status).toBe("pending");

    const { data: jobRow } = await companyClient
      .from("jobs")
      .select("created_by")
      .eq("id", jobId)
      .single();

    const { error: reviewError } = await companyClient.from("reviews").insert({
      assignment_id: assignmentId,
      author_id: companyOwnerId,
      recipient_id: workerId,
      rating_dimensions: { overall: 5 },
      comment: "Test di integrazione: ottimo lavoro.",
      moderation_status: "published",
      published_at: new Date().toISOString(),
    });
    expect(reviewError).toBeNull();
    expect(jobRow?.created_by).toBe(companyOwnerId);

    const { data: workerProfile } = await companyClient
      .from("worker_profiles")
      .select("reliability_score")
      .eq("user_id", workerId)
      .single();
    expect(workerProfile?.reliability_score).toBe(5);
  });
});
