"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteURL } from "@/lib/utils";
import { REGISTRATION_ENABLED } from "@/lib/config";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import type { UserRole } from "@/types/database";

export interface ActionState {
  error?: string;
  message?: string;
}

const ROLE_HOME: Record<UserRole, string> = {
  worker: "/worker/dashboard",
  recruiter: "/company/dashboard",
  company_owner: "/company/dashboard",
  support: "/admin/dashboard",
  admin: "/admin/dashboard",
};

export async function recordTermsAcceptance(userId: string): Promise<void> {
  const admin = createAdminClient();
  const hdrs = await headers();
  const ipAddress = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent");

  const { data: documents } = await admin
    .from("document_templates")
    .select("id, key, version")
    .eq("scope", "platform")
    .in("key", ["terms_of_service", "privacy_policy"])
    .order("version", { ascending: false });

  const currentByKey = new Map<string, string>();
  for (const doc of documents ?? []) {
    if (!currentByKey.has(doc.key)) currentByKey.set(doc.key, doc.id);
  }

  const rows = Array.from(currentByKey.values()).map((documentTemplateId) => ({
    document_template_id: documentTemplateId,
    user_id: userId,
    ip_address: ipAddress,
    user_agent: userAgent,
  }));

  if (rows.length === 0) return;

  const { error } = await admin.from("document_acceptances").insert(rows);
  if (error) {
    console.error("[recordTermsAcceptance] insert error:", error);
  }
}

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
  if (!REGISTRATION_ENABLED) {
    return { error: "La registrazione è temporaneamente sospesa." };
  }

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

  if (data.user) {
    await recordTermsAcceptance(data.user.id);
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

export async function requestPasswordResetAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState & { success?: boolean }> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    // Straight to /reset-password (not via /auth/callback): Supabase's recovery link redirects
    // with the session in a URL fragment (#access_token=...), which browsers never send to any
    // server — a server route handler can never see it. Only client-side JS on the landing page
    // itself can read window.location.hash, so the landing page must be that page directly.
    redirectTo: `${getSiteURL()}/reset-password`,
  });

  // Never reveal whether the email is registered — same success message either way,
  // otherwise this endpoint becomes an account-enumeration oracle.
  if (error) {
    console.error("[requestPasswordResetAction] resetPasswordForEmail error:", error);
  }

  return { success: true };
}

export async function updatePasswordAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "Link scaduto o non valido. Richiedi un nuovo reset password." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("[updatePasswordAction] updateUser error:", error);
    return { error: "Non è stato possibile aggiornare la password. Riprova." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  redirect(profile ? ROLE_HOME[profile.role] : "/login");
}

export async function acceptTermsAndContinueAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (formData.get("acceptedTerms") !== "on") {
    return { error: "Devi accettare i Termini di Servizio e l'Informativa Privacy per continuare." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await recordTermsAcceptance(user.id);

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  redirect(profile ? ROLE_HOME[profile.role] : "/");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
