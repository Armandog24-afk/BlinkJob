import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteTemplateButton } from "@/features/jobs/components/delete-template-button";
import { formatCents } from "@/lib/utils";

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

export default async function JobTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("job_templates")
    .select("id, title, category, positions_count, pay_amount_cents, pay_currency, created_at")
    .eq("company_id", membership.companyId)
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Template incarichi ({templates?.length ?? 0})</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Salva un incarico come template dalla sua pagina di dettaglio per riutilizzarlo — luogo,
          orari e scadenza candidature restano da compilare ogni volta.
        </p>

        <div className="space-y-3">
          {templates && templates.length > 0 ? (
            templates.map((t) => (
              <Card key={t.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{t.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Categoria: {t.category}</p>
                  <p>
                    {formatCents(t.pay_amount_cents, t.pay_currency)} · {t.positions_count} posizion
                    {t.positions_count === 1 ? "e" : "i"}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      render={<Link href={`/company/jobs/new?template=${t.id}`}>Usa questo template</Link>}
                    />
                    <DeleteTemplateButton templateId={t.id} />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nessun template ancora.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
