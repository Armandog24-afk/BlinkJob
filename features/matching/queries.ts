import "server-only";
import { createClient } from "@/lib/supabase/server";
import { computeMatch, type AvailabilitySlot, type MatchResult } from "@/lib/matching/engine";

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export interface CandidateMatch extends MatchResult {
  workerId: string;
  fullName: string;
}

/** Ranked, explainable list of candidate workers for a company's job (company-side view). */
export async function getCandidatesForJob(jobId: string): Promise<CandidateMatch[]> {
  const supabase = await createClient();

  const [{ data: job }, { data: candidates, error: candidatesError }, { data: requirements }] =
    await Promise.all([
      supabase.from("jobs").select("starts_at, ends_at").eq("id", jobId).single(),
      supabase.rpc("candidate_workers_for_job", { p_job_id: jobId }),
      supabase.from("job_requirements").select("skill_id, mandatory").eq("job_id", jobId),
    ]);

  if (candidatesError) {
    console.error("[getCandidatesForJob] candidate_workers_for_job error:", candidatesError);
  }

  if (!job || !candidates || candidates.length === 0) return [];

  const workerIds = candidates.map((c) => c.worker_id);
  const [{ data: skillRows }, { data: availabilityRows }] = await Promise.all([
    supabase.from("worker_skills").select("worker_id, skill_id").in("worker_id", workerIds),
    supabase
      .from("worker_availability")
      .select("worker_id, day_of_week, start_time, end_time, expires_at")
      .in("worker_id", workerIds),
  ]);

  const skillsByWorker = groupBy(skillRows ?? [], (r) => r.worker_id);
  const availabilityByWorker = groupBy(availabilityRows ?? [], (r) => r.worker_id);

  const jobForMatching = {
    startsAt: job.starts_at,
    endsAt: job.ends_at,
    mandatorySkillIds: (requirements ?? []).filter((r) => r.mandatory).map((r) => r.skill_id),
    preferredSkillIds: (requirements ?? []).filter((r) => !r.mandatory).map((r) => r.skill_id),
  };

  const results: CandidateMatch[] = [];

  for (const candidate of candidates) {
    const availability: AvailabilitySlot[] = (availabilityByWorker.get(candidate.worker_id) ?? []).map(
      (a) => ({
        dayOfWeek: a.day_of_week,
        startTime: a.start_time,
        endTime: a.end_time,
        expiresAt: a.expires_at,
      })
    );

    const match = computeMatch(jobForMatching, {
      distanceKm: candidate.distance_km,
      operatingRadiusKm: candidate.operating_radius_km,
      status: candidate.status,
      skillIds: (skillsByWorker.get(candidate.worker_id) ?? []).map((s) => s.skill_id),
      reliabilityScore: candidate.reliability_score,
      availability,
    });

    if (match) {
      results.push({ workerId: candidate.worker_id, fullName: candidate.full_name, ...match });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export interface MatchedJob extends MatchResult {
  jobId: string;
  title: string;
  companyName: string;
  locationLabel: string;
  payAmountCents: number;
  payCurrency: string;
  positionsCount: number;
  startsAt: string;
}

/** Ranked, explainable feed of published jobs for a worker (worker-side view). */
export async function getMatchedJobsForWorker(workerId: string): Promise<MatchedJob[]> {
  const supabase = await createClient();

  const [{ data: profile }, { data: user }, { data: candidateJobs }] = await Promise.all([
    supabase
      .from("worker_profiles")
      .select("operating_radius_km, reliability_score")
      .eq("user_id", workerId)
      .single(),
    supabase.from("users").select("status").eq("id", workerId).single(),
    supabase.rpc("candidate_jobs_for_worker", { p_worker_id: workerId }),
  ]);

  if (!profile || !user || !candidateJobs || candidateJobs.length === 0) return [];

  const jobIds = candidateJobs.map((j) => j.job_id);
  const distanceByJob = new Map(candidateJobs.map((j) => [j.job_id, j.distance_km]));

  const [{ data: jobs }, { data: requirementRows }, { data: skillRows }, { data: availabilityRows }] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(
          "id, title, starts_at, ends_at, pay_amount_cents, pay_currency, positions_count, companies(legal_name), company_locations(label, address)"
        )
        .in("id", jobIds),
      supabase.from("job_requirements").select("job_id, skill_id, mandatory").in("job_id", jobIds),
      supabase.from("worker_skills").select("skill_id").eq("worker_id", workerId),
      supabase
        .from("worker_availability")
        .select("day_of_week, start_time, end_time, expires_at")
        .eq("worker_id", workerId),
    ]);

  if (!jobs) return [];

  const requirementsByJob = groupBy(requirementRows ?? [], (r) => r.job_id);
  const workerSkillIds = (skillRows ?? []).map((s) => s.skill_id);
  const availability: AvailabilitySlot[] = (availabilityRows ?? []).map((a) => ({
    dayOfWeek: a.day_of_week,
    startTime: a.start_time,
    endTime: a.end_time,
    expiresAt: a.expires_at,
  }));

  const results: MatchedJob[] = [];

  for (const job of jobs) {
    const reqs = requirementsByJob.get(job.id) ?? [];
    const match = computeMatch(
      {
        startsAt: job.starts_at,
        endsAt: job.ends_at,
        mandatorySkillIds: reqs.filter((r) => r.mandatory).map((r) => r.skill_id),
        preferredSkillIds: reqs.filter((r) => !r.mandatory).map((r) => r.skill_id),
      },
      {
        distanceKm: distanceByJob.get(job.id) ?? Infinity,
        operatingRadiusKm: profile.operating_radius_km,
        status: user.status,
        skillIds: workerSkillIds,
        reliabilityScore: profile.reliability_score,
        availability,
      }
    );

    if (match) {
      const company = Array.isArray(job.companies) ? job.companies[0] : job.companies;
      const location = Array.isArray(job.company_locations)
        ? job.company_locations[0]
        : job.company_locations;

      results.push({
        jobId: job.id,
        title: job.title,
        companyName: company?.legal_name ?? "",
        locationLabel: location ? `${location.label} — ${location.address}` : "",
        payAmountCents: job.pay_amount_cents,
        payCurrency: job.pay_currency,
        positionsCount: job.positions_count,
        startsAt: job.starts_at,
        ...match,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
