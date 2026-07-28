import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { BlinknowPreferenceForm } from "@/features/workers/components/blinknow-preference-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NAV_ITEMS = [
  { href: "/worker/dashboard", label: "Panoramica" },
  { href: "/worker/jobs", label: "Incarichi" },
  { href: "/worker/applications", label: "Candidature" },
  { href: "/worker/assignments", label: "I miei incarichi" },
  { href: "/worker/payments", label: "Pagamenti" },
  { href: "/worker/profile", label: "Profilo" },
];

export default async function WorkerProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: profile }, { data: blinkpointsFlag }, { data: pointsRows }] = await Promise.all([
    supabase
      .from("worker_profiles")
      .select("blinknow_opt_in, operating_radius_km, completeness_score")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("feature_flags")
      .select("enabled_globally")
      .eq("key", "blinkpoints_enabled")
      .maybeSingle(),
    supabase
      .from("points_ledger")
      .select("points, reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (!profile) redirect("/worker/onboarding");

  const blinkpointsEnabled = blinkpointsFlag?.enabled_globally ?? false;
  const totalPoints = (pointsRows ?? []).reduce((sum, p) => sum + p.points, 0);

  const POINTS_REASON_LABEL: Record<string, string> = {
    profile_completed_badge: "Badge: profilo completato",
    review_contributed: "Recensione lasciata",
    assignment_completed_no_issues: "Incarico completato senza problemi",
  };

  return (
    <DashboardShell title="Area lavoratore" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">Profilo</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Il tuo profilo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>Email: {user.email}</p>
            <p>Nome: {user.full_name}</p>
            <p>Raggio operativo: {profile.operating_radius_km} km</p>
            <p>Completezza profilo: {profile.completeness_score}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferenze notifiche</CardTitle>
          </CardHeader>
          <CardContent>
            <BlinknowPreferenceForm optIn={profile.blinknow_opt_in} />
          </CardContent>
        </Card>

        {blinkpointsEnabled && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">BlinkPoints — {totalPoints} punti</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {pointsRows && pointsRows.length > 0 ? (
                pointsRows.map((p, i) => (
                  <div key={i} className="flex items-center justify-between border-b pb-1 last:border-b-0 last:pb-0">
                    <span>{POINTS_REASON_LABEL[p.reason] ?? p.reason}</span>
                    <span className={p.points >= 0 ? "text-foreground" : "text-destructive"}>
                      {p.points >= 0 ? "+" : ""}
                      {p.points}
                    </span>
                  </div>
                ))
              ) : (
                <p>Nessun punto ancora — simulazione interna, non riscattabile in questa fase.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
