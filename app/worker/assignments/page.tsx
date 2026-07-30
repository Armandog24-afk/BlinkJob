import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard-shell";
import { AssignmentActions } from "@/features/assignments/components/assignment-actions";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { OpenDisputeForm } from "@/features/disputes/components/open-dispute-form";
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
  confirmed: "Confermato",
  in_progress: "In corso",
  completed: "Completato",
  disputed: "In disputa",
  canceled: "Annullato",
};

const STATUS_VARIANT: Record<string, "default" | "success" | "destructive" | "outline"> = {
  confirmed: "default",
  in_progress: "default",
  completed: "success",
  disputed: "destructive",
  canceled: "outline",
};

const ACTIVE_STATUSES = new Set(["confirmed", "in_progress"]);

export default async function WorkerAssignmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const workerId = user.id;

  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("assignments")
    .select(
      "id, job_id, status, confirmed_at, confirmed_terms_snapshot, jobs(title, companies(legal_name), company_locations(label, address))"
    )
    .eq("worker_id", workerId)
    .order("confirmed_at", { ascending: false });

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: checkEvents } = assignmentIds.length
    ? await supabase
        .from("check_events")
        .select("assignment_id, type, occurred_at")
        .in("assignment_id", assignmentIds)
    : { data: [] as { assignment_id: string; type: string; occurred_at: string }[] };

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
        .eq("author_id", workerId)
        .in("assignment_id", completedIds)
    : { data: [] as { assignment_id: string }[] };
  const reviewedIds = new Set((ownReviews ?? []).map((r) => r.assignment_id));

  const active = (assignments ?? []).filter((a) => ACTIVE_STATUSES.has(a.status));
  const history = (assignments ?? []).filter((a) => !ACTIVE_STATUSES.has(a.status));

  function renderAssignment(a: NonNullable<typeof assignments>[number]) {
    const job = Array.isArray(a.jobs) ? a.jobs[0] : a.jobs;
    const company = job ? (Array.isArray(job.companies) ? job.companies[0] : job.companies) : null;
    const location = job
      ? Array.isArray(job.company_locations)
        ? job.company_locations[0]
        : job.company_locations
      : null;
    const snapshot = a.confirmed_terms_snapshot as {
      job_title: string;
      pay_amount_cents: number;
      pay_currency: string;
      starts_at: string;
      ends_at: string;
    };

    return (
      <Card key={a.id}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{job?.title ?? snapshot.job_title}</CardTitle>
          <Badge variant={STATUS_VARIANT[a.status] ?? "default"}>
            {STATUS_LABEL[a.status] ?? a.status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{company?.legal_name}</p>
          <p>
            {location?.label} — {location?.address}
          </p>
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
            viewerRole="worker"
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
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/messages/${a.job_id}/${workerId}`}>Chat</Link>}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <DashboardShell title="Area lavoratore" navItems={NAV_ITEMS} userLabel={user.full_name}>
      <div className="space-y-8">
        <div>
          <h1 className="mb-4 text-2xl font-semibold">Incarichi attivi</h1>
          <div className="space-y-3">
            {active.length > 0 ? (
              active.map(renderAssignment)
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nessun incarico attivo al momento.
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
              <p className="text-sm text-muted-foreground">Nessun incarico concluso ancora.</p>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
