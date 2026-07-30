"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/features/auth/actions";

export async function openDisputeAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const assignmentId = formData.get("assignmentId");
  const type = formData.get("type");
  if (typeof assignmentId !== "string" || typeof type !== "string" || !type.trim()) {
    return { error: "Descrivi brevemente il problema." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("open_dispute", {
    p_assignment_id: assignmentId,
    p_type: type.trim(),
  });

  if (error) {
    console.error("[openDisputeAction] rpc error:", error);
    return { error: "Impossibile segnalare il problema. Riprova." };
  }

  revalidatePath("/worker/assignments");
  revalidatePath("/company/assignments");
  return {};
}

export async function appealDisputeAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const disputeId = formData.get("disputeId");
  const reason = formData.get("reason");
  if (typeof disputeId !== "string") {
    return { error: "Disputa non valida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("appeal_dispute", {
    p_dispute_id: disputeId,
    p_reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
  });

  if (error) {
    console.error("[appealDisputeAction] rpc error:", error);
    return {
      error: error.message.includes("già risolta")
        ? "Puoi fare appello solo su una disputa già risolta."
        : "Impossibile inviare l'appello. Riprova.",
    };
  }

  revalidatePath("/worker/disputes");
  revalidatePath("/company/disputes");
  revalidatePath("/admin/disputes");
  return { message: "Appello inviato. Il team lo esaminerà." };
}
