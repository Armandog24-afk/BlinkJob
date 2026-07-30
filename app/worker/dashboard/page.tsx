import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DAY_LABELS } from "@/lib/geo";

const NAV_ITEMS = [
  { href: "/worker/dashboard", label: "Panoramica" },
  { href: "/worker/jobs", label: "Incarichi" },
  { href: "/worker/applications", label: "Candidature" },
  { href: "/worker/assignments", label: "I miei incarichi" },
  { href: "/worker/disputes", label: "Dispute" },
  { href: "/worker/payments", label: "Pagamenti" },
  { href: "/worker/profile", label: "Profilo" },
];

export default async function WorkerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("worker_profiles")
    .select("operating_radius_km, completeness_score, reliability_score")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) redirect("/worker/onboarding");

  const [{ data: skills }, { data: availability }, { data: reviews }] = await Promise.all([
    supabase
      .from("worker_skills")
      .select("level, skill_taxonomy(name)")
      .eq("worker_id", user.id),
    supabase
      .from("worker_availability")
      .select("day_of_week, start_time, end_time")
      .eq("worker_id", user.id)
      .order("day_of_week"),
    supabase
      .from("reviews")
      .select("rating_dimensions, comment, published_at")
      .eq("recipient_id", user.id)
      .eq("moderation_status", "published")
      .order("published_at", { ascending: false }),
  ]);

  return (
    <DashboardShell title="Area lavoratore" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Ciao, {user.full_name.split(" ")[0]}</h1>
          <p className="text-muted-foreground">
            Stato profilo: <span className="font-medium">{user.status}</span> · Completezza:{" "}
            <span className="font-medium">{profile.completeness_score}%</span>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competenze</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {skills && skills.length > 0 ? (
                skills.map((s, i) => (
                  <Badge key={i} variant="secondary">
                    {(Array.isArray(s.skill_taxonomy) ? s.skill_taxonomy[0] : s.skill_taxonomy)
                      ?.name}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nessuna competenza selezionata.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Disponibilità</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              {availability && availability.length > 0 ? (
                availability.map((a, i) => (
                  <p key={i}>
                    {DAY_LABELS[a.day_of_week ?? 0]}: {a.start_time.slice(0, 5)}–
                    {a.end_time.slice(0, 5)}
                  </p>
                ))
              ) : (
                <p>Nessuna disponibilità impostata.</p>
              )}
              <p className="pt-2">Raggio operativo: {profile.operating_radius_km} km</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Reputazione — {profile.reliability_score > 0 ? `${profile.reliability_score}/5` : "nessuna recensione ancora"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviews && reviews.length > 0 ? (
              reviews.map((r, i) => {
                const dims = r.rating_dimensions as { overall?: number };
                return (
                  <div key={i} className="border-b pb-2 text-sm last:border-b-0 last:pb-0">
                    <p className="font-medium">{dims.overall ?? "—"}/5</p>
                    {r.comment && <p className="text-muted-foreground">{r.comment}</p>}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessuna recensione ricevuta ancora. Completa un incarico per ottenere la tua
                prima recensione.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
