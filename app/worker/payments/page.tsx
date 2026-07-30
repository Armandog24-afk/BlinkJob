import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";

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
  draft: "Bozza",
  pending: "In attesa dell'azienda",
  confirmed: "Confermato",
  paid: "Pagato",
  refunded: "Rimborsato",
  disputed: "In disputa",
};

const STATUS_VARIANT: Record<string, "default" | "success" | "destructive" | "outline"> = {
  draft: "outline",
  pending: "default",
  confirmed: "default",
  paid: "success",
  refunded: "outline",
  disputed: "destructive",
};

export default async function WorkerPaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: payments } = await supabase
    .from("payments")
    .select(
      "id, status, gross_amount_cents, platform_fee_cents, net_amount_cents, currency, created_at, assignments!inner(worker_id, jobs(title, companies(legal_name)))"
    )
    .eq("assignments.worker_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Area lavoratore" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Pagamenti</h1>

        <div className="space-y-3">
          {payments && payments.length > 0 ? (
            payments.map((p) => {
              const assignment = Array.isArray(p.assignments) ? p.assignments[0] : p.assignments;
              const job = assignment ? (Array.isArray(assignment.jobs) ? assignment.jobs[0] : assignment.jobs) : null;
              const company = job ? (Array.isArray(job.companies) ? job.companies[0] : job.companies) : null;
              return (
                <Card key={p.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{job?.title}</CardTitle>
                    <Badge variant={STATUS_VARIANT[p.status] ?? "default"}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{company?.legal_name}</p>
                    <p className="font-medium text-foreground">
                      Netto: {formatCents(p.net_amount_cents, p.currency)}
                    </p>
                    <p>Lordo: {formatCents(p.gross_amount_cents, p.currency)}</p>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nessun pagamento ancora.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
