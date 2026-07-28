"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/features/companies/queries";
import type { ActionState } from "@/features/auth/actions";

export async function applyToJobAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const jobId = formData.get("jobId");
  const scoreRaw = formData.get("score");
  const reasonsRaw = formData.get("reasons");

  if (typeof jobId !== "string" || !jobId) {
    return { error: "Incarico non valido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let reasons: unknown[] = [];
  try {
    reasons = typeof reasonsRaw === "string" ? JSON.parse(reasonsRaw) : [];
  } catch {
    reasons = [];
  }

  const { error } = await supabase.from("applications").insert({
    job_id: jobId,
    worker_id: user.id,
    type: "application",
    status: "sent",
    match_score: typeof scoreRaw === "string" && scoreRaw ? Number(scoreRaw) : null,
    match_reasons: reasons,
  });

  if (error) {
    console.error("[applyToJobAction] insert error:", error);
    return {
      error:
        error.code === "23505"
          ? "Ti sei già candidato/a per questo incarico."
          : "Impossibile inviare la candidatura. Riprova.",
    };
  }

  revalidatePath("/worker/jobs");
  revalidatePath("/worker/applications");
  return {};
}

export async function withdrawApplicationAction(applicationId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("applications")
    .update({ status: "withdrawn" })
    .eq("id", applicationId)
    .eq("worker_id", user.id)
    .in("status", ["sent", "viewed", "shortlisted", "info_requested"]);

  if (error) {
    console.error("[withdrawApplicationAction] update error:", error);
    return { error: "Impossibile ritirare la candidatura." };
  }

  revalidatePath("/worker/applications");
  return {};
}

export async function respondToInviteAction(
  applicationId: string,
  accept: boolean
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (accept) {
    // Accepting a direct invite is the worker's confirmation — it creates the assignment
    // immediately (atomically, with the positions_count check), there is no separate company
    // approval step left to do. See migration 016 for why this can't just be a status update.
    const { error } = await supabase.rpc("accept_invite", { p_application_id: applicationId });
    if (error) {
      console.error("[respondToInviteAction] accept_invite error:", error);
      return {
        error: error.message.includes("filled")
          ? "Tutte le posizioni per questo incarico sono già coperte."
          : "Impossibile accettare l'invito.",
      };
    }
    revalidatePath("/worker/applications");
    return {};
  }

  const { error } = await supabase
    .from("applications")
    .update({ status: "rejected" })
    .eq("id", applicationId)
    .eq("worker_id", user.id)
    .eq("type", "invite")
    .eq("status", "sent");

  if (error) {
    console.error("[respondToInviteAction] update error:", error);
    return { error: "Impossibile rispondere all'invito." };
  }

  revalidatePath("/worker/applications");
  return {};
}

export async function inviteWorkerAction(jobId: string, workerId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) return { error: "Devi far parte di un'azienda." };

  const { error } = await supabase.from("applications").insert({
    job_id: jobId,
    worker_id: workerId,
    type: "invite",
    status: "sent",
  });

  if (error) {
    console.error("[inviteWorkerAction] insert error:", error);
    return {
      error: error.code === "23505" ? "Hai già invitato questa persona." : "Impossibile inviare l'invito.",
    };
  }

  revalidatePath(`/company/jobs/${jobId}`);
  return {};
}

export async function rejectApplicationAction(applicationId: string, jobId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("applications")
    .update({ status: "rejected" })
    .eq("id", applicationId)
    .in("status", ["sent", "viewed", "shortlisted", "info_requested"]);

  if (error) {
    console.error("[rejectApplicationAction] update error:", error);
    return { error: "Impossibile rifiutare la candidatura." };
  }

  revalidatePath(`/company/jobs/${jobId}`);
  return {};
}

export async function confirmCandidateAction(applicationId: string, jobId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("confirm_candidate", { p_application_id: applicationId });

  if (error) {
    console.error("[confirmCandidateAction] rpc error:", error);
    return { error: error.message.includes("filled") ? "Tutte le posizioni sono già coperte." : "Impossibile confermare il candidato." };
  }

  revalidatePath(`/company/jobs/${jobId}`);
  return {};
}
