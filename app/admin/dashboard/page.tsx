import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeatureFlagToggle } from "@/features/admin/components/feature-flag-toggle";
import { formatCents } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Panoramica" },
  { href: "/admin/users", label: "Utenti" },
  { href: "/admin/companies", label: "Aziende" },
  { href: "/admin/jobs", label: "Incarichi" },
  { href: "/admin/blinknow", label: "BlinkNow" },
  { href: "/admin/disputes", label: "Dispute" },
  { href: "/admin/documents", label: "Documenti" },
];

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const [
    { count: workerCount },
    { count: companyOwnerCount },
    { count: companiesTotal },
    { count: companiesPending },
    { count: jobsPublished },
    { count: assignmentsCompleted },
    { count: disputesOpen },
    { data: paidPayments },
    { data: kpiRows },
  ] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "worker"),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "company_owner"),
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_verification"),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed"),
    supabase.from("disputes").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("payments").select("net_amount_cents").eq("status", "paid"),
    supabase.rpc("admin_kpi_summary"),
  ]);

  const kpi = kpiRows?.[0];

  const { data: featureFlags } = await supabase
    .from("feature_flags")
    .select("key, description, enabled_globally")
    .order("key");

  const totalPaidCents = (paidPayments ?? []).reduce((sum, p) => sum + p.net_amount_cents, 0);

  const stats = [
    { label: "Lavoratori registrati", value: workerCount ?? 0 },
    { label: "Aziende registrate", value: companyOwnerCount ?? 0 },
    { label: "Aziende totali", value: companiesTotal ?? 0 },
    { label: "Aziende da verificare", value: companiesPending ?? 0 },
    { label: "Incarichi pubblicati", value: jobsPublished ?? 0 },
    { label: "Incarichi completati", value: assignmentsCompleted ?? 0 },
    { label: "Dispute aperte", value: disputesOpen ?? 0 },
    { label: "Totale pagato ai lavoratori", value: formatCents(totalPaidCents) },
  ];

  return (
    <DashboardShell title="Amministrazione" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Console amministrativa</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-normal text-muted-foreground">
                  {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{s.value}</CardContent>
            </Card>
          ))}
        </div>

        {kpi && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">KPI (PRD sez. 19)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: "Fill rate", value: `${kpi.fill_rate}%`, hint: "posizioni confermate su pubblicate" },
                {
                  label: "Tempo mediano di conferma",
                  value: `${kpi.median_hours_to_confirm} h`,
                  hint: "dalla creazione dell'incarico alla conferma",
                },
                { label: "Completion rate", value: `${kpi.completion_rate}%`, hint: "assegnazioni completate" },
                {
                  label: "No-show rate (stimato)",
                  value: `${kpi.no_show_rate}%`,
                  hint: "annullate senza check-in registrato",
                },
                { label: "Dispute rate", value: `${kpi.dispute_rate}%`, hint: "dispute su incarichi completati" },
                { label: "Payment success", value: `${kpi.payment_success_rate}%`, hint: "pagamenti segnati come pagati" },
              ].map((k) => (
                <div key={k.label} className="rounded-lg bg-muted p-3">
                  <p className="text-xl font-semibold">{k.value}</p>
                  <p className="text-sm font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">{k.hint}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feature flags — funzionalità post-MVP</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(featureFlags ?? []).map((flag) => (
              <div key={flag.key} className="flex items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{flag.key}</p>
                  <p className="text-xs text-muted-foreground">{flag.description}</p>
                </div>
                <FeatureFlagToggle flagKey={flag.key} enabledGlobally={flag.enabled_globally} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
