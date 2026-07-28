"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/features/auth/actions";
import type { CompanyStatus, UserStatus } from "@/types/database";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

export async function setUserStatusAction(
  userId: string,
  status: UserStatus
): Promise<ActionState> {
  const supabase = await requireUser();
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_user_id: userId,
    p_status: status,
  });
  if (error) {
    console.error("[setUserStatusAction] rpc error:", error);
    return { error: "Impossibile aggiornare lo stato dell'utente." };
  }
  revalidatePath("/admin/users");
  return {};
}

export async function setCompanyStatusAction(
  companyId: string,
  status: CompanyStatus
): Promise<ActionState> {
  const supabase = await requireUser();
  const { error } = await supabase.rpc("admin_set_company_status", {
    p_company_id: companyId,
    p_status: status,
  });
  if (error) {
    console.error("[setCompanyStatusAction] rpc error:", error);
    return { error: "Impossibile aggiornare lo stato dell'azienda." };
  }
  revalidatePath("/admin/companies");
  return {};
}

export async function resolveDisputeAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const disputeId = formData.get("disputeId");
  const resolution = formData.get("resolution");
  if (typeof disputeId !== "string" || typeof resolution !== "string" || !resolution.trim()) {
    return { error: "Inserisci una nota di risoluzione." };
  }

  const supabase = await requireUser();
  const { error } = await supabase.rpc("resolve_dispute", {
    p_dispute_id: disputeId,
    p_resolution: resolution.trim(),
  });
  if (error) {
    console.error("[resolveDisputeAction] rpc error:", error);
    return { error: "Impossibile risolvere la disputa." };
  }
  revalidatePath("/admin/disputes");
  return {};
}
