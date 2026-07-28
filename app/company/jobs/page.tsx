import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/company/dashboard", label: "Panoramica" },
  { href: "/company/jobs", label: "Incarichi" },
  { href: "/company/assignments", label: "Assegnazioni" },
  { href: "/company/payments", label: "Pagamenti" },
  { href: "/company/locations", label: "Sedi" },
  { href: "/company/team", label: "Team" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  published: "Pubblicato",
  in_selection: "In selezione",
  confirmed: "Confermato",
  in_progress: "In corso",
  completed: "Completato",
  disputed: "In disputa",
  canceled: "Annullato",
  expired: "Scaduto",
};

export default async function CompanyJobsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, positions_count, pay_amount_cents, pay_currency, starts_at")
    .eq("company_id", membership.companyId)
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Incarichi</h1>
          <Button render={<Link href="/company/jobs/new">Nuovo incarico</Link>} />
        </div>

        <div className="space-y-3">
          {jobs && jobs.length > 0 ? (
            jobs.map((job) => (
              <Link key={job.id} href={`/company/jobs/${job.id}`}>
                <Card className="transition-colors hover:bg-muted/40">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{job.title}</CardTitle>
                    <Badge variant={job.status === "published" ? "default" : "secondary"}>
                      {STATUS_LABEL[job.status] ?? job.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {job.positions_count} posizion{job.positions_count === 1 ? "e" : "i"} ·{" "}
                    {formatCents(job.pay_amount_cents, job.pay_currency)} ·{" "}
                    {new Date(job.starts_at).toLocaleString("it-IT")}
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nessun incarico ancora creato.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
