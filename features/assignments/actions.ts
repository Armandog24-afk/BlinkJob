"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/features/auth/actions";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function mapExecutionError(message: string): string {
  if (message.includes("checkable-in")) return "Non puoi ancora fare il check-in per questo incarico.";
  if (message.includes("checkable-out")) return "Non puoi fare il check-out ora.";
  if (message.includes("Already checked out")) return "Hai già effettuato il check-out.";
  if (message.includes("before check-out")) return "Devi prima fare il check-out.";
  if (message.includes("no longer be canceled")) return "Questo incarico non può più essere annullato.";
  if (message.includes("Not authorized")) return "Non sei autorizzato/a per questa azione.";
  return "Impossibile completare l'operazione. Riprova.";
}

export async function checkInAction(
  assignmentId: string,
  method: "manual" | "qr" = "manual"
): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("check_in_assignment", {
    p_assignment_id: assignmentId,
    p_method: method,
  });
  if (error) {
    console.error("[checkInAction] rpc error:", error);
    return { error: mapExecutionError(error.message) };
  }
  revalidatePath("/worker/assignments");
  revalidatePath("/checkin/[assignmentId]", "page");
  return {};
}

export async function checkOutAction(
  assignmentId: string,
  method: "manual" | "qr" = "manual"
): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("check_out_assignment", {
    p_assignment_id: assignmentId,
    p_method: method,
  });
  if (error) {
    console.error("[checkOutAction] rpc error:", error);
    return { error: mapExecutionError(error.message) };
  }
  revalidatePath("/worker/assignments");
  revalidatePath("/checkin/[assignmentId]", "page");
  return {};
}

export async function confirmCompletionAction(assignmentId: string): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("confirm_assignment_completion", {
    p_assignment_id: assignmentId,
  });
  if (error) {
    console.error("[confirmCompletionAction] rpc error:", error);
    return { error: mapExecutionError(error.message) };
  }
  revalidatePath("/worker/assignments");
  revalidatePath("/company/assignments");
  return {};
}

export async function cancelAssignmentAction(assignmentId: string): Promise<ActionState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("cancel_assignment", { p_assignment_id: assignmentId });
  if (error) {
    console.error("[cancelAssignmentAction] rpc error:", error);
    return { error: mapExecutionError(error.message) };
  }
  revalidatePath("/worker/assignments");
  revalidatePath("/company/assignments");
  return {};
}
