import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { getCandidatesForJob } from "@/features/matching/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { JobStatusActions } from "@/features/jobs/components/job-status-actions";
import { BlinkNowToggle } from "@/features/jobs/components/blinknow-toggle";
import { InviteButton } from "@/features/applications/components/invite-button";
import { ApplicationDecisionButtons } from "@/features/applications/components/application-decision-buttons";
import { SaveAsTemplateButton } from "@/features/jobs/components/save-as-template-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";
import { getBadgeInfo, POINTS_LEVELS } from "@/lib/points/levels";
import { formatWavePriorityLabel } from "@/lib/blinknow/config";

const NAV_ITEMS = [
  { href: "/company/dashboard", label: "Panoramica" },
  { href: "/company/jobs", label: "Incarichi" },
  { href: "/company/jobs/templates", label: "Template" },
  { href: "/company/assignments", label: "Assegnazioni" },
  { href: "/company/disputes", label: "Dispute" },
  { href: "/company/talent-pool", label: "Talent pool" },
  { href: "/company/payments", label: "Pagamenti" },
  { href: "/company/locations", label: "Sedi" },
  { href: "/company/team", label: "Team" },
];

const STATUS_LABEL: Record<string, string> = {
  sent: "Inviata",
  viewed: "Vista",
  shortlisted: "In shortlist",
  info_requested: "Info richieste",
  accepted: "Accettata",
  rejected: "Rifiutata",
  withdrawn: "Ritirata",
  expired: "Scaduta",
};

const DECIDABLE = new Set(["sent", "viewed", "shortlisted", "info_requested"]);

export default async function CompanyJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, title, description, category, status, positions_count, pay_amount_cents, pay_currency, starts_at, ends_at, application_deadline, company_id, urgency_tier, blinknow_fee_cents, blinknow_fee_status, blinknow_response_deadline, company_locations(label, address), companies(status)"
    )
    .eq("id", id)
    .single();

  if (!job || job.company_id !== membership.companyId) notFound();

  const jobCompany = Array.isArray(job.companies) ? job.companies[0] : job.companies;
  const blinknowEligible =
    job.status === "draft" &&
    jobCompany?.status === "active" &&
    (await supabase.rpc("is_blinknow_enabled_for_job", { p_category: job.category })).data === true;

  const location = Array.isArray(job.company_locations)
    ? job.company_locations[0]
    : job.company_locations;

  const [
    { data: requirements },
    candidates,
    { data: applications },
    { count: confirmedCount },
    waveStats,
  ] = await Promise.all([
    supabase.from("job_requirements").select("mandatory, skill_taxonomy(name)").eq("job_id", job.id),
    job.status === "published" ? getCandidatesForJob(job.id) : Promise.resolve([]),
    supabase
      .from("applications")
      .select("id, worker_id, type, status, worker_profiles(user_id, users(full_name))")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .neq("status", "canceled"),
    job.urgency_tier === "blinknow"
      ? supabase.rpc("blinknow_wave_stats", { p_job_id: job.id })
      : Promise.resolve({ data: null }),
  ]);

  const appliedWorkerIds = new Set((applications ?? []).map((a) => a.worker_id));
  const positionsFilled = (confirmedCount ?? 0) >= job.positions_count;

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <div className="flex gap-2">
            {job.urgency_tier === "blinknow" && <Badge variant="destructive">Urgente · BlinkNow</Badge>}
            <Badge variant={job.status === "published" ? "default" : "secondary"}>
              {job.status}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <JobStatusActions jobId={job.id} status={job.status} />
          {job.status === "draft" && (
            <BlinkNowToggle jobId={job.id} urgencyTier={job.urgency_tier} eligible={blinknowEligible} />
          )}
          <SaveAsTemplateButton jobId={job.id} />
        </div>

        {job.urgency_tier === "blinknow" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">BlinkNow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Fee: {job.blinknow_fee_cents != null ? formatCents(job.blinknow_fee_cents, "EUR") : "—"} ·{" "}
                {job.blinknow_fee_status === "refunded" ? "rimborsata" : "addebitata (ledger tracciato)"}
              </p>
              {job.blinknow_response_deadline && (
                <p>
                  {new Date(job.blinknow_response_deadline) > new Date()
                    ? `Finestra di risposta fino al ${new Date(job.blinknow_response_deadline).toLocaleString("it-IT")}`
                    : "Finestra di risposta scaduta"}
                </p>
              )}
              {waveStats?.data && waveStats.data.length > 0 && (
                <div className="pt-1">
                  <p className="font-medium text-foreground">Ondate di notifica</p>
                  <ul className="mt-1 list-inside list-disc">
                    {waveStats.data.map((w) => (
                      <li key={w.wave_number}>
                        Ondata {w.wave_number} ({formatWavePriorityLabel(w.wave_number)}):{" "}
                        {w.notified_count} notificati, {w.applied_count} candidature
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dettagli</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{job.description}</p>
            <p className="text-muted-foreground">Categoria: {job.category}</p>
            <p className="text-muted-foreground">
              Sede: {location?.label} — {location?.address}
            </p>
            <p className="text-muted-foreground">
              {new Date(job.starts_at).toLocaleString("it-IT")} →{" "}
              {new Date(job.ends_at).toLocaleString("it-IT")}
            </p>
            <p className="text-muted-foreground">
              Scadenza candidature: {new Date(job.application_deadline).toLocaleString("it-IT")}
            </p>
            <p className="text-muted-foreground">
              Compenso: {formatCents(job.pay_amount_cents, job.pay_currency)} ·{" "}
              {confirmedCount ?? 0}/{job.positions_count} posizion
              {job.positions_count === 1 ? "e coperta" : "i coperte"}
            </p>
          </CardContent>
        </Card>

        {requirements && requirements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competenze richieste</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {requirements.map((r, i) => {
                const skill = Array.isArray(r.skill_taxonomy) ? r.skill_taxonomy[0] : r.skill_taxonomy;
                return (
                  <Badge key={i} variant={r.mandatory ? "default" : "secondary"}>
                    {skill?.name} {r.mandatory ? "(obbligatoria)" : "(preferenziale)"}
                  </Badge>
                );
              })}
            </CardContent>
          </Card>
        )}

        {applications && applications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Candidature e inviti ({applications.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {applications.map((app) => {
                const workerProfile = Array.isArray(app.worker_profiles)
                  ? app.worker_profiles[0]
                  : app.worker_profiles;
                const workerUser = workerProfile
                  ? Array.isArray(workerProfile.users)
                    ? workerProfile.users[0]
                    : workerProfile.users
                  : null;
                return (
                  <div key={app.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{workerUser?.full_name}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline">{app.type === "invite" ? "Invito" : "Candidatura"}</Badge>
                        <Badge>{STATUS_LABEL[app.status] ?? app.status}</Badge>
                      </div>
                    </div>
                    {DECIDABLE.has(app.status) && !positionsFilled && (
                      <div className="mt-2">
                        <ApplicationDecisionButtons applicationId={app.id} jobId={job.id} />
                      </div>
                    )}
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link href={`/messages/${job.id}/${app.worker_id}`}>Chat</Link>}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {job.status === "published" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Candidati compatibili ({candidates.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {candidates.length > 0 ? (
                candidates.map((c) => (
                  <div key={c.workerId} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{c.fullName}</p>
                      <Badge>{c.score.toFixed(0)}% compatibile</Badge>
                    </div>
                    {(c.pointsLevel > 0 || c.badges.length > 0) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.pointsLevel > 0 && (
                          <Badge variant="secondary">
                            Livello {POINTS_LEVELS.find((l) => l.level === c.pointsLevel)?.name}
                          </Badge>
                        )}
                        {c.badges.map((key) => (
                          <Badge key={key} variant="outline">
                            {getBadgeInfo(key).label}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                      {c.reasons.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                    {!appliedWorkerIds.has(c.workerId) && (
                      <div className="mt-2">
                        <InviteButton jobId={job.id} workerId={c.workerId} />
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nessun lavoratore compatibile trovato per ora.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
