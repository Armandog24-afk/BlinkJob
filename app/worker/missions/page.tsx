import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MISSIONS, currentMonthKey } from "@/lib/points/missions";

const NAV_ITEMS = [
  { href: "/worker/dashboard", label: "Panoramica" },
  { href: "/worker/jobs", label: "Incarichi" },
  { href: "/worker/applications", label: "Candidature" },
  { href: "/worker/assignments", label: "I miei incarichi" },
  { href: "/worker/disputes", label: "Dispute" },
  { href: "/worker/missions", label: "Missioni" },
  { href: "/worker/payments", label: "Pagamenti" },
  { href: "/worker/profile", label: "Profilo" },
];

export default async function WorkerMissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: blinkpointsFlag } = await supabase
    .from("feature_flags")
    .select("enabled_globally")
    .eq("key", "blinkpoints_enabled")
    .maybeSingle();

  const blinkpointsEnabled = blinkpointsFlag?.enabled_globally ?? false;

  if (!blinkpointsEnabled) {
    return (
      <DashboardShell title="Area lavoratore" navItems={NAV_ITEMS} userLabel={user.full_name}>
        <div className="mx-auto max-w-lg">
          <h1 className="mb-4 text-2xl font-semibold">Missioni</h1>
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              BlinkPoints non è attivo in questa fase — le missioni non assegnano ricompense.
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  await supabase.rpc("refresh_worker_missions");

  const now = new Date();
  const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [
    { count: applicationsCount },
    { count: completedCount },
    { count: monthlyCompletedCount },
    { count: monthlyReviewsCount },
    { data: completions },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("worker_id", user.id)
      .eq("type", "application"),
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("worker_id", user.id)
      .eq("status", "completed"),
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("worker_id", user.id)
      .eq("status", "completed")
      .gte("updated_at", monthStartIso),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("author_id", user.id)
      .gte("created_at", monthStartIso),
    supabase.from("mission_completions").select("mission_key, period_key").eq("user_id", user.id),
  ]);

  const currentCountByKey: Record<string, number> = {
    prima_candidatura: applicationsCount ?? 0,
    primo_incarico_completato: completedCount ?? 0,
    tre_incarichi_al_mese: monthlyCompletedCount ?? 0,
    due_recensioni_al_mese: monthlyReviewsCount ?? 0,
  };

  const monthKey = currentMonthKey();
  const completedSet = new Set((completions ?? []).map((c) => `${c.mission_key}:${c.period_key}`));

  return (
    <DashboardShell title="Area lavoratore" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">Missioni</h1>
        <p className="text-sm text-muted-foreground">
          Obiettivi con ricompensa in BlinkPoints — quelli mensili si possono ripetere ogni mese.
        </p>

        {MISSIONS.map((mission) => {
          const periodKey = mission.type === "monthly" ? monthKey : "lifetime";
          const isCompleted = completedSet.has(`${mission.key}:${periodKey}`);
          const current = currentCountByKey[mission.key] ?? 0;
          const progress = Math.min(current, mission.target);

          return (
            <Card key={mission.key} className={isCompleted ? "glow-reward" : undefined}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{mission.label}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{mission.type === "monthly" ? "Mensile" : "Una tantum"}</Badge>
                  {isCompleted && (
                    <Badge className="bg-reward text-reward-foreground">Completata</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{mission.description}</p>
                <Progress
                  variant="reward"
                  value={progress}
                  max={mission.target}
                  aria-label={`${progress}/${mission.target}`}
                />
                <div className="flex items-center justify-between text-xs">
                  <span>
                    {progress}/{mission.target}
                  </span>
                  <span>+{mission.pointsReward} punti</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </DashboardShell>
  );
}
