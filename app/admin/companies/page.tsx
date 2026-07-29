import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { CompanyStatusActions } from "@/features/admin/components/company-status-actions";
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  pending_verification: "secondary",
  limited: "secondary",
  suspended: "destructive",
};

export default async function AdminCompaniesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, legal_name, vat_number, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Amministrazione" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Aziende ({companies?.length ?? 0})</h1>
        <div className="space-y-3">
          {(companies ?? []).map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{c.legal_name}</CardTitle>
                <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{c.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>P.IVA: {c.vat_number ?? "—"}</p>
                <CompanyStatusActions companyId={c.id} status={c.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
