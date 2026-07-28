import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentMembership } from "@/features/companies/queries";
import { DashboardShell } from "@/components/dashboard-shell";
import { AssignmentActions } from "@/features/assignments/components/assignment-actions";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { OpenDisputeForm } from "@/features/disputes/components/open-dispute-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  confirmed: "Confermato",
  in_progress: "In corso",
  completed: "Completato",
  disputed: "In disputa",
  canceled: "Annullato",
};

const ACTIVE_STATUSES = new Set(["confirmed", "in_progress"]);

export default async function CompanyAssignmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) redirect("/company/onboarding");

  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("assignments")
    .select(
      "id, status, confirmed_at, confirmed_terms_snapshot, worker_id, job_id, jobs!inner(title, company_id), worker_profiles(users(full_name))"
    )
    .eq("jobs.company_id", membership.companyId)
    .order("confirmed_at", { ascending: false });

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: checkEvents } = assignmentIds.length
    ? await supabase
        .from("check_events")
        .select("assignment_id, type")
        .in("assignment_id", assignmentIds)
    : { data: [] as { assignment_id: string; type: string }[] };

  const checkedOutIds = new Set(
    (checkEvents ?? []).filter((e) => e.type === "check_out").map((e) => e.assignment_id)
  );

  const completedIds = (assignments ?? [])
    .filter((a) => a.status === "completed")
    .map((a) => a.id);
  const { data: ownReviews } = completedIds.length
    ? await supabase
        .from("reviews")
        .select("assignment_id")
        .eq("author_id", user.id)
        .in("assignment_id", completedIds)
    : { data: [] as { assignment_id: string }[] };
  const reviewedIds = new Set((ownReviews ?? []).map((r) => r.assignment_id));

  const active = (assignments ?? []).filter((a) => ACTIVE_STATUSES.has(a.status));
  const history = (assignments ?? []).filter((a) => !ACTIVE_STATUSES.has(a.status));

  function renderAssignment(a: NonNullable<typeof assignments>[number]) {
    const job = Array.isArray(a.jobs) ? a.jobs[0] : a.jobs;
    const workerProfile = Array.isArray(a.worker_profiles) ? a.worker_profiles[0] : a.worker_profiles;
    const workerUser = workerProfile
      ? Array.isArray(workerProfile.users)
        ? workerProfile.users[0]
        : workerProfile.users
      : null;
    const snapshot = a.confirmed_terms_snapshot as {
      pay_amount_cents: number;
      pay_currency: string;
      starts_at: string;
      ends_at: string;
    };

    return (
      <Card key={a.id}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{job?.title}</CardTitle>
          <Badge>{STATUS_LABEL[a.status] ?? a.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Lavoratore: {workerUser?.full_name}</p>
          <p>
            {new Date(snapshot.starts_at).toLocaleString("it-IT")} →{" "}
            {new Date(snapshot.ends_at).toLocaleString("it-IT")}
          </p>
          <p className="font-medium text-foreground">
            {formatCents(snapshot.pay_amount_cents, snapshot.pay_currency)}
          </p>
          <AssignmentActions
            assignmentId={a.id}
            status={a.status}
            hasCheckedOut={checkedOutIds.has(a.id)}
            viewerRole="company"
          />
          {a.status === "completed" &&
            (reviewedIds.has(a.id) ? (
              <p className="text-xs text-muted-foreground">Recensione inviata.</p>
            ) : (
              <ReviewForm assignmentId={a.id} />
            ))}
          {(a.status === "in_progress" || a.status === "completed") && (
            <OpenDisputeForm assignmentId={a.id} />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <DashboardShell title="Area azienda" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-8">
        <div>
          <h1 className="mb-4 text-2xl font-semibold">Assegnazioni attive</h1>
          <div className="space-y-3">
            {active.length > 0 ? (
              active.map(renderAssignment)
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nessuna assegnazione attiva al momento.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-xl font-semibold">Storico</h2>
          <div className="space-y-3">
            {history.length > 0 ? (
              history.map(renderAssignment)
            ) : (
              <p className="text-sm text-muted-foreground">Nessuna assegnazione conclusa ancora.</p>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
