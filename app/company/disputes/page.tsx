import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { AppealDisputeForm } from "@/features/disputes/components/appeal-dispute-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  open: "Aperta",
  collecting: "Raccolta info",
  deciding: "In decisione",
  resolved: "Risolta",
  appealed: "In appello",
  closed: "Chiusa",
};

export default async function CompanyDisputesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const supabase = await createClient();
  const { data: jobs } = await supabase.from("jobs").select("id, title").eq("company_id", membership.companyId);
  const jobIds = (jobs ?? []).map((j) => j.id);
  const jobTitleById = new Map((jobs ?? []).map((j) => [j.id, j.title]));

  const { data: assignments } = jobIds.length
    ? await supabase.from("assignments").select("id, job_id").in("job_id", jobIds)
    : { data: [] as { id: string; job_id: string }[] };
  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const jobIdByAssignmentId = new Map((assignments ?? []).map((a) => [a.id, a.job_id]));

  const { data: disputes } = assignmentIds.length
    ? await supabase
        .from("disputes")
        .select("id, assignment_id, type, status, resolution, appeal_reason, created_at")
        .in("assignment_id", assignmentIds)
        .order("created_at", { ascending: false })
    : { data: [] as { id: string; assignment_id: string; type: string; status: string; resolution: string | null; appeal_reason: string | null; created_at: string }[] };

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Dispute ({disputes?.length ?? 0})</h1>
        <div className="space-y-3">
          {disputes && disputes.length > 0 ? (
            disputes.map((d) => {
              const jobId = jobIdByAssignmentId.get(d.assignment_id);
              const jobTitle = jobId ? jobTitleById.get(jobId) : undefined;
              return (
                <Card key={d.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{jobTitle}</CardTitle>
                    <Badge variant={d.status === "resolved" || d.status === "closed" ? "success" : "destructive"}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{d.type}</p>
                    {d.resolution && <p className="text-foreground">Risoluzione: {d.resolution}</p>}
                    {d.status === "appealed" && d.appeal_reason && (
                      <p className="text-foreground">Il tuo appello: {d.appeal_reason}</p>
                    )}
                    {d.status === "resolved" && <AppealDisputeForm disputeId={d.id} />}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nessuna disputa segnalata.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
