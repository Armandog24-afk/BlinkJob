"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/features/auth/actions";

export async function sendMessageAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const conversationId = formData.get("conversationId");
  const jobId = formData.get("jobId");
  const workerId = formData.get("workerId");
  const body = formData.get("body");

  if (
    typeof conversationId !== "string" ||
    typeof jobId !== "string" ||
    typeof workerId !== "string" ||
    typeof body !== "string" ||
    !body.trim()
  ) {
    return { error: "Scrivi un messaggio prima di inviarlo." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_body: body,
  });

  if (error) {
    console.error("[sendMessageAction] rpc error:", error);
    return { error: "Impossibile inviare il messaggio. Riprova." };
  }

  revalidatePath(`/messages/${jobId}/${workerId}`);
  return {};
}

export async function reportMessageAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const messageId = formData.get("messageId");
  const jobId = formData.get("jobId");
  const workerId = formData.get("workerId");
  const reason = formData.get("reason");

  if (typeof messageId !== "string" || typeof jobId !== "string" || typeof workerId !== "string") {
    return { error: "Messaggio non valido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_message", {
    p_message_id: messageId,
    p_reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
  });

  if (error) {
    console.error("[reportMessageAction] rpc error:", error);
    return { error: "Impossibile inviare la segnalazione." };
  }

  revalidatePath(`/messages/${jobId}/${workerId}`);
  return { message: "Segnalazione inviata. Il team la esaminerà." };
}
