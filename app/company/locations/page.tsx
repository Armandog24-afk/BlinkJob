import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { CompanyLocationForm } from "@/features/companies/components/location-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NAV_ITEMS = [
  { href: "/company/dashboard", label: "Panoramica" },
  { href: "/company/jobs", label: "Incarichi" },
  { href: "/company/assignments", label: "Assegnazioni" },
  { href: "/company/payments", label: "Pagamenti" },
  { href: "/company/locations", label: "Sedi" },
  { href: "/company/team", label: "Team" },
];

export default async function CompanyLocationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("company_locations")
    .select("id, label, address, created_at")
    .eq("company_id", membership.companyId)
    .order("created_at");

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Sedi</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Le tue sedi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {locations && locations.length > 0 ? (
              locations.map((loc) => (
                <div key={loc.id} className="rounded-md border p-3">
                  <p className="font-medium">{loc.label}</p>
                  <p className="text-sm text-muted-foreground">{loc.address}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nessuna sede ancora aggiunta.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aggiungi sede</CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyLocationForm />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
