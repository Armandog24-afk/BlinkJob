import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export default async function CompanyDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const supabase = await createClient();
  const [{ data: company }, { count: locationsCount }, { count: membersCount }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("legal_name, status")
        .eq("id", membership.companyId)
        .single(),
      supabase
        .from("company_locations")
        .select("id", { count: "exact", head: true })
        .eq("company_id", membership.companyId),
      supabase
        .from("company_members")
        .select("user_id", { count: "exact", head: true })
        .eq("company_id", membership.companyId),
    ]);

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{company?.legal_name}</h1>
          <p className="text-muted-foreground">
            Stato verifica azienda: <span className="font-medium">{company?.status}</span>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sedi</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {locationsCount ?? 0} sed{locationsCount === 1 ? "e" : "i"} registrat
              {locationsCount === 1 ? "a" : "e"}.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {membersCount ?? 0} membr{membersCount === 1 ? "o" : "i"} (tu: {membership.role}).
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Prossimi passi</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            La creazione incarichi e il matching arrivano nelle prossime milestone (M3–M5).
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
