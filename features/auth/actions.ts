"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/utils";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import type { UserRole } from "@/types/database";

export interface ActionState {
  error?: string;
}

const ROLE_HOME: Record<UserRole, string> = {
  worker: "/worker/dashboard",
  recruiter: "/company/dashboard",
  company_owner: "/company/dashboard",
  support: "/admin/dashboard",
  admin: "/admin/dashboard",
};

function mapAuthError(message: string): string {
  const known: Record<string, string> = {
    "Invalid login credentials": "Email o password non corretti.",
    "User already registered": "Esiste già un account con questa email.",
    "Email not confirmed": "Devi prima confermare l'email che ti abbiamo inviato.",
  };
  if (message.includes("is invalid")) return "Indirizzo email non valido.";
  return known[message] ?? "Si è verificato un errore. Riprova.";
}

export async function registerAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    accountKind: formData.get("accountKind"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    acceptedTerms: formData.get("acceptedTerms") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const { accountKind, fullName, email, password } = parsed.data;
  const role: UserRole = accountKind === "company" ? "company_owner" : "worker";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role },
      emailRedirectTo: `${getSiteURL()}/auth/callback`,
    },
  });

  if (error) {
    console.error("[registerAction] supabase.auth.signUp error:", error);
    return { error: mapAuthError(error.message) };
  }

  if (data.session) {
    redirect(role === "worker" ? "/worker/onboarding" : "/company/onboarding");
  }

  redirect(`/register/check-email?email=${encodeURIComponent(email)}`);
}

export async function loginAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const redirectTo = formData.get("redirectTo");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", data.user.id)
    .single();

  const home = profile ? ROLE_HOME[profile.role] : "/";
  const safeRedirect =
    typeof redirectTo === "string" && redirectTo.startsWith("/") ? redirectTo : home;

  redirect(safeRedirect);
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
