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
  return supabase;
}

export async function confirmPaymentAction(paymentId: string): Promise<ActionState> {
  const supabase = await requireUser();
  const { error } = await supabase.rpc("confirm_payment", { p_payment_id: paymentId });
  if (error) {
    console.error("[confirmPaymentAction] rpc error:", error);
    return { error: "Impossibile confermare il pagamento." };
  }
  revalidatePath("/company/payments");
  return {};
}

export async function markPaymentPaidAction(paymentId: string): Promise<ActionState> {
  const supabase = await requireUser();
  const { error } = await supabase.rpc("mark_payment_paid", { p_payment_id: paymentId });
  if (error) {
    console.error("[markPaymentPaidAction] rpc error:", error);
    return { error: "Impossibile segnare il pagamento come effettuato." };
  }
  revalidatePath("/company/payments");
  revalidatePath("/worker/payments");
  return {};
}
