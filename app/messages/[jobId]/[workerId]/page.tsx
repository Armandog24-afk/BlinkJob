import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { SendMessageForm } from "@/features/messages/components/send-message-form";
import { ReportMessageButton } from "@/features/messages/components/report-message-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ jobId: string; workerId: string }>;
}) {
  const { jobId, workerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/messages/${jobId}/${workerId}`);

  const supabase = await createClient();
  const isWorkerViewer = user.id === workerId;

  const { data: job } = await supabase
    .from("jobs")
    .select("title, companies(legal_name)")
    .eq("id", jobId)
    .maybeSingle();

  const { data: conversationId, error: conversationError } = await supabase.rpc(
    "get_or_create_conversation",
    { p_job_id: jobId, p_worker_id: workerId }
  );

  if (conversationError || !job) {
    return (
      <CenteredCard title="Conversazione non disponibile">
        {conversationError?.message.includes("candidatura")
          ? "Questa conversazione richiede una candidatura esistente per questo incarico."
          : "Non è stato possibile aprire questa conversazione."}
      </CenteredCard>
    );
  }

  const company = Array.isArray(job.companies) ? job.companies[0] : job.companies;

  let otherPartyLabel = company?.legal_name ?? "Azienda";
  if (isWorkerViewer) {
    otherPartyLabel = company?.legal_name ?? "Azienda";
  } else {
    const { data: workerUser } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", workerId)
      .maybeSingle();
    otherPartyLabel = workerUser?.full_name ?? "Lavoratore";
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, body, contains_masked_contact, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const backHref = isWorkerViewer ? "/worker/applications" : `/company/jobs/${jobId}`;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="flex h-[80vh] w-full max-w-2xl flex-col">
        <CardHeader>
          <Link href={backHref} className="text-xs text-muted-foreground underline underline-offset-4">
            ← Torna indietro
          </Link>
          <CardTitle>{job.title}</CardTitle>
          <p className="text-sm text-muted-foreground">Con: {otherPartyLabel}</p>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex-1 space-y-3 overflow-y-auto">
            {messages && messages.length > 0 ? (
              messages.map((m) => {
                const isOwn = m.sender_id === user.id;
                return (
                  <div key={m.id} className={cn("flex flex-col gap-1", isOwn ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        isOwn ? "bg-primary text-primary-foreground" : "bg-muted"
                      )}
                    >
                      {m.body}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(m.created_at).toLocaleString("it-IT")}</span>
                      {m.contains_masked_contact && <span>· contatto rimosso</span>}
                      {!isOwn && <ReportMessageButton messageId={m.id} jobId={jobId} workerId={workerId} />}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Nessun messaggio ancora. Scrivi il primo!
              </p>
            )}
          </div>
          <SendMessageForm conversationId={conversationId} jobId={jobId} workerId={workerId} />
        </CardContent>
      </Card>
    </div>
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
