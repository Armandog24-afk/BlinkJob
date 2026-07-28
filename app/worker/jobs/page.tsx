import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getMatchedJobsForWorker } from "@/features/matching/queries";
import { ApplyButton } from "@/features/applications/components/apply-button";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/worker/dashboard", label: "Panoramica" },
  { href: "/worker/jobs", label: "Incarichi" },
  { href: "/worker/applications", label: "Candidature" },
  { href: "/worker/assignments", label: "I miei incarichi" },
  { href: "/worker/payments", label: "Pagamenti" },
  { href: "/worker/profile", label: "Profilo" },
];

export default async function WorkerJobsFeedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [jobs, { data: existingApplications }] = await Promise.all([
    getMatchedJobsForWorker(user.id),
    supabase.from("applications").select("job_id").eq("worker_id", user.id),
  ]);

  const appliedJobIds = new Set((existingApplications ?? []).map((a) => a.job_id));

  return (
    <DashboardShell title="Area lavoratore" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Incarichi disponibili</h1>
        <p className="text-sm text-muted-foreground">
          Ordinati per compatibilità: disponibilità, distanza dal tuo raggio operativo,
          competenze e affidabilità.
        </p>

        <div className="space-y-3">
          {jobs.length > 0 ? (
            jobs.map((job) => (
              <Card key={job.jobId}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {job.title}
                    {job.urgencyTier === "blinknow" && (
                      <Badge variant="destructive">Urgente</Badge>
                    )}
                  </CardTitle>
                  <Badge>{job.score.toFixed(0)}% compatibile</Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>{job.companyName}</p>
                  <p>{job.locationLabel}</p>
                  <p>{new Date(job.startsAt).toLocaleString("it-IT")}</p>
                  <p className="font-medium text-foreground">
                    {formatCents(job.payAmountCents, job.payCurrency)} · {job.positionsCount}{" "}
                    posizion{job.positionsCount === 1 ? "e" : "i"}
                  </p>
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-xs font-medium text-foreground">Consigliato perché:</p>
                    <ul className="list-inside list-disc text-xs">
                      {job.reasons.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                  {appliedJobIds.has(job.jobId) ? (
                    <Badge variant="secondary">Candidatura inviata</Badge>
                  ) : (
                    <ApplyButton jobId={job.jobId} score={job.score} reasons={job.reasons} />
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nessun incarico compatibile al momento. Amplia il raggio operativo o la
                disponibilità nel tuo profilo per vedere più opportunità.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
