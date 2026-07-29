import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RemoveFromTalentPoolButton } from "@/features/companies/components/remove-from-talent-pool-button";

const NAV_ITEMS = [
  { href: "/company/dashboard", label: "Panoramica" },
  { href: "/company/jobs", label: "Incarichi" },
  { href: "/company/jobs/templates", label: "Template" },
  { href: "/company/assignments", label: "Assegnazioni" },
  { href: "/company/talent-pool", label: "Talent pool" },
  { href: "/company/payments", label: "Pagamenti" },
  { href: "/company/locations", label: "Sedi" },
  { href: "/company/team", label: "Team" },
];

export default async function TalentPoolPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const supabase = await createClient();
  const { data: favorites } = await supabase
    .from("company_worker_favorites")
    .select("worker_id, note, created_at, worker_profiles(reliability_score, users(full_name, status))")
    .eq("company_id", membership.companyId)
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Talent pool ({favorites?.length ?? 0})</h1>
        <p className="text-sm text-muted-foreground">
          Lavoratori con cui hai già completato almeno un incarico — aggiungili dalla pagina
          &quot;Assegnazioni&quot;, sotto un incarico concluso.
        </p>

        <div className="space-y-3">
          {favorites && favorites.length > 0 ? (
            favorites.map((f) => {
              const profile = Array.isArray(f.worker_profiles) ? f.worker_profiles[0] : f.worker_profiles;
              const workerUser = profile
                ? Array.isArray(profile.users)
                  ? profile.users[0]
                  : profile.users
                : null;
              return (
                <Card key={f.worker_id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{workerUser?.full_name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>Affidabilità: {profile?.reliability_score ?? 0}/5</p>
                    {f.note && <p>Nota: {f.note}</p>}
                    <RemoveFromTalentPoolButton workerId={f.worker_id} />
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nessun lavoratore nel talent pool ancora.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
