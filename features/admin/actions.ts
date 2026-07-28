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

export async function setFeatureFlagAction(key: string, enabledGlobally: boolean): Promise<ActionState> {
  const supabase = await requireUser();
  const { error } = await supabase.rpc("admin_set_feature_flag", {
    p_key: key,
    p_enabled_globally: enabledGlobally,
  });
  if (error) {
    console.error("[setFeatureFlagAction] rpc error:", error);
    return { error: "Impossibile aggiornare il feature flag." };
  }
  revalidatePath("/admin/dashboard");
  return {};
}

export async function adjustPointsAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = formData.get("userId");
  const points = formData.get("points");
  const reason = formData.get("reason");

  if (typeof userId !== "string" || typeof reason !== "string" || !reason.trim()) {
    return { error: "Inserisci un motivo per la rettifica." };
  }
  const parsedPoints = Number(points);
  if (!Number.isInteger(parsedPoints) || parsedPoints === 0) {
    return { error: "Inserisci un numero di punti valido (diverso da zero)." };
  }

  const supabase = await requireUser();
  const { error } = await supabase.rpc("admin_adjust_points", {
    p_user_id: userId,
    p_points: parsedPoints,
    p_reason: reason.trim(),
  });
  if (error) {
    console.error("[adjustPointsAction] rpc error:", error);
    return { error: "Impossibile rettificare i punti." };
  }
  revalidatePath("/admin/users");
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
