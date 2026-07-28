import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { PaymentActions } from "@/features/payments/components/payment-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/company/dashboard", label: "Panoramica" },
  { href: "/company/jobs", label: "Incarichi" },
  { href: "/company/assignments", label: "Assegnazioni" },
  { href: "/company/payments", label: "Pagamenti" },
  { href: "/company/locations", label: "Sedi" },
  { href: "/company/team", label: "Team" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  pending: "Da confermare",
  confirmed: "Confermato",
  paid: "Pagato",
  refunded: "Rimborsato",
  disputed: "In disputa",
};

export default async function CompanyPaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const supabase = await createClient();
  const { data: payments } = await supabase
    .from("payments")
    .select(
      "id, status, gross_amount_cents, platform_fee_cents, net_amount_cents, currency, created_at, assignments!inner(job_id, jobs!inner(title, company_id), worker_profiles(users(full_name)))"
    )
    .eq("assignments.jobs.company_id", membership.companyId)
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Pagamenti</h1>
        <p className="text-sm text-muted-foreground">
          Ledger tracciato: nessun trasferimento di denaro reale in questa fase. Conferma
          l&apos;importo e segna come pagato dopo aver effettuato il pagamento fuori piattaforma.
        </p>

        <div className="space-y-3">
          {payments && payments.length > 0 ? (
            payments.map((p) => {
              const assignment = Array.isArray(p.assignments) ? p.assignments[0] : p.assignments;
              const job = assignment ? (Array.isArray(assignment.jobs) ? assignment.jobs[0] : assignment.jobs) : null;
              const workerProfile = assignment
                ? Array.isArray(assignment.worker_profiles)
                  ? assignment.worker_profiles[0]
                  : assignment.worker_profiles
                : null;
              const workerUser = workerProfile
                ? Array.isArray(workerProfile.users)
                  ? workerProfile.users[0]
                  : workerProfile.users
                : null;
              return (
                <Card key={p.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{job?.title}</CardTitle>
                    <Badge>{STATUS_LABEL[p.status] ?? p.status}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>Lavoratore: {workerUser?.full_name}</p>
                    <p>Compenso lordo: {formatCents(p.gross_amount_cents, p.currency)}</p>
                    <p>Commissione piattaforma: {formatCents(p.platform_fee_cents, p.currency)}</p>
                    <p className="font-medium text-foreground">
                      Netto al lavoratore: {formatCents(p.net_amount_cents, p.currency)}
                    </p>
                    <PaymentActions paymentId={p.id} status={p.status} />
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nessun pagamento ancora. Viene creato automaticamente quando un incarico viene
                completato.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
