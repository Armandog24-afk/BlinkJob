import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import type { Database } from "@/types/database";

function loadEnv(): Record<string, string> {
  const text = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );
}

export const env = loadEnv();

export function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function createAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Signs up (or logs in, if it already exists) and returns a client authenticated as that user. */
export async function signUpAndSignIn(
  email: string,
  password: string,
  fullName: string,
  role: "worker" | "company_owner"
): Promise<{ client: SupabaseClient<Database>; userId: string }> {
  const client = createAnonClient();

  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role } },
  });

  if (signUpError && !signUpError.message.includes("already registered")) {
    throw signUpError;
  }

  if (!signUpData.session) {
    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw signInError;
    return { client, userId: signInData.user.id };
  }

  return { client, userId: signUpData.user!.id };
}

export const SKILL_MOVIMENTAZIONE_MERCI = "00000000-0000-0000-0000-000000000101";
export const SKILL_SERVIZIO_SALA = "00000000-0000-0000-0000-000000000104";
