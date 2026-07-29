import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { QrCheckinButton } from "@/features/assignments/components/qr-checkin-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Pagina di destinazione del QR check-in (PRD 21.2 "should have"): l'azienda mostra il QR sul
 * luogo dell'incarico, il lavoratore lo scansiona con la fotocamera del telefono (nessuna app
 * dedicata: il sistema operativo apre direttamente questo URL). L'identità resta verificata dalle
 * RPC `check_in_assignment`/`check_out_assignment` stesse (auth.uid() = worker_id) — l'URL non
 * contiene nulla di segreto, chi non è il lavoratore assegnato riceve solo un errore.
 */
export default async function CheckinPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/checkin/${assignmentId}`);

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, status, worker_id, jobs(title)")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment) {
    return (
      <CenteredCard title="Incarico non trovato">
        Il codice non corrisponde a nessun incarico valido.
      </CenteredCard>
    );
  }

  if (assignment.worker_id !== user.id) {
    return (
      <CenteredCard title="Non è il tuo incarico">
        Questo QR è associato a un altro lavoratore.
      </CenteredCard>
    );
  }

  const job = Array.isArray(assignment.jobs) ? assignment.jobs[0] : assignment.jobs;

  return (
    <CenteredCard title={job?.title ?? "Incarico"}>
      {assignment.status === "confirmed" && (
        <>
          <p className="mb-4">Confermi di essere arrivato/a sul posto di lavoro?</p>
          <QrCheckinButton assignmentId={assignmentId} mode="check-in" />
        </>
      )}
      {assignment.status === "in_progress" && (
        <>
          <p className="mb-4">Confermi di aver terminato l&apos;incarico?</p>
          <QrCheckinButton assignmentId={assignmentId} mode="check-out" />
        </>
      )}
      {assignment.status === "completed" && <p>Incarico già completato. Grazie!</p>}
      {(assignment.status === "canceled" || assignment.status === "disputed") && (
        <p>Questo incarico non è più attivo.</p>
      )}
      <p className="mt-6 text-sm">
        <Link href="/worker/assignments" className="text-primary underline underline-offset-4">
          Vai ai miei incarichi
        </Link>
      </p>
    </CenteredCard>
  );
}

function CenteredCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{children}</CardContent>
      </Card>
    </div>
  );
}
