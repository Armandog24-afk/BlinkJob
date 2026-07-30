import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { JobForm, type JobFormDefaultValues } from "@/features/jobs/components/job-form";
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

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const { template: templateId } = await searchParams;

  const supabase = await createClient();
  const [{ data: locations }, { data: skills }] = await Promise.all([
    supabase
      .from("company_locations")
      .select("id, label, address")
      .eq("company_id", membership.companyId)
      .order("created_at"),
    supabase.from("skill_taxonomy").select("id,name,category").eq("status", "active").order("name"),
  ]);

  let defaultValues: JobFormDefaultValues | undefined;
  if (templateId) {
    const [{ data: template }, { data: templateRequirements }] = await Promise.all([
      supabase
        .from("job_templates")
        .select("title, category, description, positions_count, pay_amount_cents, company_id")
        .eq("id", templateId)
        .single(),
      supabase.from("job_template_requirements").select("skill_id, mandatory").eq("template_id", templateId),
    ]);

    if (template && template.company_id === membership.companyId) {
      defaultValues = {
        title: template.title,
        category: template.category,
        description: template.description,
        positionsCount: template.positions_count,
        payAmountEuro: (template.pay_amount_cents / 100).toFixed(2),
        mandatorySkillIds: (templateRequirements ?? []).filter((r) => r.mandatory).map((r) => r.skill_id),
        preferredSkillIds: (templateRequirements ?? []).filter((r) => !r.mandatory).map((r) => r.skill_id),
      };
    }
  }

  if (!locations || locations.length === 0) {
    return (
      <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
        <Card>
          <CardHeader>
            <CardTitle>Aggiungi prima una sede</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Per pubblicare un incarico serve almeno una sede.{" "}
            <a href="/company/locations" className="text-primary underline underline-offset-4">
              Aggiungi una sede →
            </a>
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Nuovo incarico</h1>
        <JobForm locations={locations} skills={skills ?? []} defaultValues={defaultValues} />
      </div>
    </DashboardShell>
  );
}
