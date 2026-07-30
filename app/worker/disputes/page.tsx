import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { AppealDisputeForm } from "@/features/disputes/components/appeal-dispute-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const NAV_ITEMS = [
  { href: "/worker/dashboard", label: "Panoramica" },
  { href: "/worker/jobs", label: "Incarichi" },
  { href: "/worker/applications", label: "Candidature" },
  { href: "/worker/assignments", label: "I miei incarichi" },
  { href: "/worker/disputes", label: "Dispute" },
  { href: "/worker/payments", label: "Pagamenti" },
  { href: "/worker/profile", label: "Profilo" },
];

const STATUS_LABEL: Record<string, string> = {
  open: "Aperta",
  collecting: "Raccolta info",
  deciding: "In decisione",
  resolved: "Risolta",
  appealed: "In appello",
  closed: "Chiusa",
};

export default async function WorkerDisputesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: disputes } = await supabase
    .from("disputes")
    .select(
      "id, type, status, resolution, appeal_reason, created_at, assignments!inner(worker_id, jobs(title))"
    )
    .eq("assignments.worker_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Area lavoratore" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Le mie dispute ({disputes?.length ?? 0})</h1>
        <div className="space-y-3">
          {disputes && disputes.length > 0 ? (
            disputes.map((d) => {
              const assignment = Array.isArray(d.assignments) ? d.assignments[0] : d.assignments;
              const job = assignment
                ? Array.isArray(assignment.jobs)
                  ? assignment.jobs[0]
                  : assignment.jobs
                : null;
              return (
                <Card key={d.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{job?.title}</CardTitle>
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
