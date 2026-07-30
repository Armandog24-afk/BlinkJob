import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { WithdrawButton } from "@/features/applications/components/withdraw-button";
import { RespondInviteButtons } from "@/features/applications/components/respond-invite-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";

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

const STATUS_LABEL: Record<string, string> = {
  sent: "Inviata",
  viewed: "Vista dall'azienda",
  shortlisted: "In shortlist",
  info_requested: "Info richieste",
  accepted: "Accettata",
  rejected: "Rifiutata",
  withdrawn: "Ritirata",
  expired: "Scaduta",
};

const WITHDRAWABLE = new Set(["sent", "viewed", "shortlisted", "info_requested"]);

export default async function WorkerApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: applications } = await supabase
    .from("applications")
    .select(
      "id, job_id, type, status, created_at, jobs(title, starts_at, pay_amount_cents, pay_currency, companies(legal_name))"
    )
    .eq("worker_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <DashboardShell title="Area lavoratore" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Le mie candidature</h1>

        <div className="space-y-3">
          {applications && applications.length > 0 ? (
            applications.map((app) => {
              const job = Array.isArray(app.jobs) ? app.jobs[0] : app.jobs;
              const company = job ? (Array.isArray(job.companies) ? job.companies[0] : job.companies) : null;
              return (
                <Card key={app.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{job?.title}</CardTitle>
                    <div className="flex gap-2">
                      <Badge variant="outline">{app.type === "invite" ? "Invito" : "Candidatura"}</Badge>
                      <Badge>{STATUS_LABEL[app.status] ?? app.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{company?.legal_name}</p>
                    {job && (
                      <p>
                        {new Date(job.starts_at).toLocaleString("it-IT")} ·{" "}
                        {formatCents(job.pay_amount_cents, job.pay_currency)}
                      </p>
                    )}
                    {app.type === "invite" && app.status === "sent" && (
                      <RespondInviteButtons applicationId={app.id} />
                    )}
                    {app.type === "application" && WITHDRAWABLE.has(app.status) && (
                      <WithdrawButton applicationId={app.id} />
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link href={`/messages/${app.job_id}/${user.id}`}>Chat</Link>}
                    />
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nessuna candidatura o invito ancora.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
