import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/action-button";
import { processBlinknowRefundsAction } from "@/features/admin/actions";
import { formatCents } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Panoramica" },
  { href: "/admin/users", label: "Utenti" },
  { href: "/admin/companies", label: "Aziende" },
  { href: "/admin/jobs", label: "Incarichi" },
  { href: "/admin/blinknow", label: "BlinkNow" },
  { href: "/admin/disputes", label: "Dispute" },
];

const FEE_STATUS_LABEL: Record<string, string> = {
  pending: "Addebitata",
  refunded: "Rimborsata",
};

export default async function AdminBlinknowPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      "id, title, status, positions_count, blinknow_fee_cents, blinknow_fee_status, blinknow_response_deadline, companies(legal_name)"
    )
    .eq("urgency_tier", "blinknow")
    .order("created_at", { ascending: false });

  const jobIds = (jobs ?? []).map((j) => j.id);
  const confirmedCounts = new Map<string, number>();
  if (jobIds.length > 0) {
    const { data: assignmentRows } = await supabase
      .from("assignments")
      .select("job_id")
      .in("job_id", jobIds)
      .neq("status", "canceled");
    for (const row of assignmentRows ?? []) {
      confirmedCounts.set(row.job_id, (confirmedCounts.get(row.job_id) ?? 0) + 1);
    }
  }

  return (
    <DashboardShell title="Amministrazione" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">BlinkNow — pannello operativo</h1>
          <ActionButton
            action={processBlinknowRefundsAction}
            label="Verifica rimborsi scaduti"
            variant="outline"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Nessuno scheduler in background in questo stack: i rimborsi per incarichi scaduti senza
          copertura vanno verificati manualmente con il pulsante sopra (PRD BNW-006).
        </p>

        <div className="space-y-3">
          {jobs && jobs.length > 0 ? (
            jobs.map((job) => {
              const company = Array.isArray(job.companies) ? job.companies[0] : job.companies;
              const confirmed = confirmedCounts.get(job.id) ?? 0;
              const covered = confirmed >= job.positions_count;
              const overdue =
                job.blinknow_response_deadline != null &&
                new Date(job.blinknow_response_deadline) < new Date();

              return (
                <Card key={job.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">
                      {job.title} — {company?.legal_name}
                    </CardTitle>
                    <div className="flex gap-2">
                      {!covered && overdue && job.status === "published" && (
                        <Badge variant="destructive">Scoperto, scaduto</Badge>
                      )}
                      <Badge variant={covered ? "secondary" : "default"}>
                        {confirmed}/{job.positions_count} coperte
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <p>
                      Fee: {job.blinknow_fee_cents != null ? formatCents(job.blinknow_fee_cents, "EUR") : "—"}{" "}
                      · {FEE_STATUS_LABEL[job.blinknow_fee_status] ?? job.blinknow_fee_status}
                    </p>
                    {job.blinknow_response_deadline && (
                      <p>
                        Scadenza risposta: {new Date(job.blinknow_response_deadline).toLocaleString("it-IT")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nessun incarico BlinkNow al momento.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
