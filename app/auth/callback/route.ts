import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordTermsAcceptance } from "@/features/auth/actions";
import type { UserRole } from "@/types/database";

const ROLE_HOME: Record<UserRole, string> = {
  worker: "/worker/onboarding",
  recruiter: "/company/dashboard",
  company_owner: "/company/onboarding",
  support: "/admin/dashboard",
  admin: "/admin/dashboard",
};

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const acceptedTerms = searchParams.get("acceptedTerms") === "1";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Il form email/password registra l'accettazione Termini/Privacy in registerAction —
        // un login OAuth (Google) non passa da lì, quindi va verificato/registrato qui. Se è un
        // account nuovo arrivato senza il checkbox già confermato (es. bottone Google nella
        // pagina di login), si ferma su un'interstiziale prima di procedere.
        const { data: existingAcceptance } = await supabase
          .from("document_acceptances")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (!existingAcceptance) {
          if (!acceptedTerms) {
            return NextResponse.redirect(`${origin}/register/accept-terms`);
          }
          await recordTermsAcceptance(user.id);
        }

        const { data: profile } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();

        const home = profile ? ROLE_HOME[profile.role] : "/";
        return NextResponse.redirect(`${origin}${home}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
