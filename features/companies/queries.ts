import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CompanyMemberRole } from "@/types/database";

export interface CurrentMembership {
  companyId: string;
  role: CompanyMemberRole;
}

/** Returns the caller's company membership, or null if they haven't created/joined one yet. */
export async function getCurrentMembership(userId: string): Promise<CurrentMembership | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;
  return { companyId: data.company_id, role: data.role };
}
