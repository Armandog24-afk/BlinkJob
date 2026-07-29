"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { companyOnboardingSchema } from "@/lib/validation/company";
import { companyLocationSchema, teamInviteSchema } from "@/lib/validation/company-location";
import { toEwktPoint } from "@/lib/geo";
import { getCurrentMembership } from "@/features/companies/queries";
import type { ActionState } from "@/features/auth/actions";

export async function createCompanyAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = companyOnboardingSchema.safeParse({
    legalName: formData.get("legalName"),
    vatNumber: formData.get("vatNumber"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error: rpcError } = await supabase.rpc("create_company_with_owner", {
    p_legal_name: parsed.data.legalName,
    p_vat_number: parsed.data.vatNumber ?? null,
  });

  if (rpcError) {
    console.error("[createCompanyAction] create_company_with_owner error:", rpcError);
    return { error: "Impossibile creare l'azienda. Riprova." };
  }

  redirect("/company/dashboard");
}

export async function addCompanyLocationAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = companyLocationSchema.safeParse({
    label: formData.get("label"),
    address: formData.get("address"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) return { error: "Devi prima creare la tua azienda." };

  const { error } = await supabase.from("company_locations").insert({
    company_id: membership.companyId,
    label: parsed.data.label,
    address: parsed.data.address,
    location: toEwktPoint(parsed.data.lat, parsed.data.lng),
  });

  if (error) {
    console.error("[addCompanyLocationAction] insert error:", error);
    return { error: "Impossibile salvare la sede. Riprova." };
  }

  revalidatePath("/company/locations");
  return {};
}

export async function addTeamMemberAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = teamInviteSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) return { error: "Devi prima creare la tua azienda." };
  if (membership.role !== "owner") {
    return { error: "Solo l'owner può invitare nuovi membri." };
  }

  const { data: candidates, error: lookupError } = await supabase.rpc(
    "find_company_account_by_email",
    { p_email: parsed.data.email }
  );

  if (lookupError) {
    console.error("[addTeamMemberAction] lookup error:", lookupError);
    return { error: "Impossibile verificare l'account. Riprova." };
  }

  const invitee = candidates?.[0];
  if (!invitee) {
    return {
      error: "Nessun account azienda trovato con questa email. La persona deve prima registrarsi come azienda su BlinkJob.",
    };
  }

  const { error } = await supabase.from("company_members").insert({
    company_id: membership.companyId,
    user_id: invitee.id,
    role: "recruiter",
    accepted_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[addTeamMemberAction] insert error:", error);
    return {
      error: error.code === "23505" ? "Questa persona è già nel team." : "Impossibile aggiungere il membro. Riprova.",
    };
  }

  revalidatePath("/company/team");
  return {};
}

export async function addToTalentPoolAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const workerId = formData.get("workerId");
  const note = formData.get("note");
  if (typeof workerId !== "string") {
    return { error: "Lavoratore non valido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_worker_to_talent_pool", {
    p_worker_id: workerId,
    p_note: typeof note === "string" && note.trim() ? note.trim() : null,
  });

  if (error) {
    console.error("[addToTalentPoolAction] rpc error:", error);
    return {
      error: error.message.includes("completato")
        ? "Puoi aggiungere al talent pool solo lavoratori con cui hai già completato un incarico."
        : "Impossibile aggiungere al talent pool. Riprova.",
    };
  }

  revalidatePath("/company/talent-pool");
  revalidatePath("/company/assignments");
  return {};
}

export async function removeFromTalentPoolAction(workerId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_worker_from_talent_pool", { p_worker_id: workerId });

  if (error) {
    console.error("[removeFromTalentPoolAction] rpc error:", error);
    return { error: "Impossibile rimuovere dal talent pool." };
  }

  revalidatePath("/company/talent-pool");
  return {};
}
