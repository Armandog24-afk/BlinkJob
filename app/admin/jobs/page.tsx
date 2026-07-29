import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Panoramica" },
  { href: "/admin/users", label: "Utenti" },
  { href: "/admin/companies", label: "Aziende" },
  { href: "/admin/jobs", label: "Incarichi" },
  { href: "/admin/blinknow", label: "BlinkNow" },
  { href: "/admin/disputes", label: "Dispute" },
];

export default async function AdminJobsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, positions_count, pay_amount_cents, pay_currency, companies(legal_name)")
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Amministrazione" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Incarichi ({jobs?.length ?? 0})</h1>
        <div className="space-y-3">
          {(jobs ?? []).map((j) => {
            const company = Array.isArray(j.companies) ? j.companies[0] : j.companies;
            return (
              <Card key={j.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{j.title}</CardTitle>
                  <Badge variant={j.status === "published" ? "default" : "secondary"}>
                    {j.status}
                  </Badge>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>{company?.legal_name}</p>
                  <p>
                    {formatCents(j.pay_amount_cents, j.pay_currency)} · {j.positions_count}{" "}
                    posizion{j.positions_count === 1 ? "e" : "i"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
