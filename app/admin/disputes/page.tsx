import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { ResolveDisputeForm } from "@/features/admin/components/resolve-dispute-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Panoramica" },
  { href: "/admin/users", label: "Utenti" },
  { href: "/admin/companies", label: "Aziende" },
  { href: "/admin/jobs", label: "Incarichi" },
  { href: "/admin/blinknow", label: "BlinkNow" },
  { href: "/admin/disputes", label: "Dispute" },
];

const STATUS_LABEL: Record<string, string> = {
  open: "Aperta",
  collecting: "Raccolta info",
  deciding: "In decisione",
  resolved: "Risolta",
  appealed: "In appello",
  closed: "Chiusa",
};

export default async function AdminDisputesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: disputes } = await supabase
    .from("disputes")
    .select(
      "id, type, status, resolution, created_at, users(full_name), assignments(jobs(title))"
    )
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Amministrazione" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Dispute ({disputes?.length ?? 0})</h1>
        <div className="space-y-3">
          {disputes && disputes.length > 0 ? (
            disputes.map((d) => {
              const opener = Array.isArray(d.users) ? d.users[0] : d.users;
              const assignment = Array.isArray(d.assignments) ? d.assignments[0] : d.assignments;
              const job = assignment ? (Array.isArray(assignment.jobs) ? assignment.jobs[0] : assignment.jobs) : null;
              return (
                <Card key={d.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{job?.title}</CardTitle>
                    <Badge variant={d.status === "resolved" ? "secondary" : "destructive"}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>Segnalato da: {opener?.full_name}</p>
                    <p>{d.type}</p>
                    {d.resolution ? (
                      <p className="text-foreground">Risoluzione: {d.resolution}</p>
                    ) : (
                      <ResolveDisputeForm disputeId={d.id} />
                    )}
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
