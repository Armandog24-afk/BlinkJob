import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { TeamInviteForm } from "@/features/companies/components/team-invite-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

export default async function CompanyTeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("company_members")
    .select("role, user_id, users(full_name, email)")
    .eq("company_id", membership.companyId);

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Team</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Membri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {members?.map((m) => {
              const member = Array.isArray(m.users) ? m.users[0] : m.users;
              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{member?.full_name}</p>
                    <p className="text-sm text-muted-foreground">{member?.email}</p>
                  </div>
                  <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {membership.role === "owner" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aggiungi un collega</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                La persona deve avere già un account BlinkJob registrato come azienda.
              </p>
              <TeamInviteForm />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
