"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

type Status = "checking" | "ready" | "expired";

/**
 * Supabase's recovery link lands here carrying the session either as a URL fragment
 * (#access_token=...&refresh_token=...) or, less commonly, as a PKCE ?code=. Both only ever
 * reach the browser — a fragment is never sent to any server — so establishing the session has
 * to happen client-side, before rendering the actual "set new password" form.
 */
export function ResetPasswordGate() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const supabase = createClient();

    async function establishSession() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = new URLSearchParams(window.location.search).get("code");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", window.location.pathname);
        if (error) return setStatus("expired");
        return setStatus("ready");
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState(null, "", window.location.pathname);
        if (error) return setStatus("expired");
        return setStatus("ready");
      }

      const { data } = await supabase.auth.getUser();
      setStatus(data.user ? "ready" : "expired");
    }

    establishSession();
  }, []);

  if (status === "checking") {
    return <p className="text-center text-sm text-muted-foreground">Verifica del link in corso...</p>;
  }

  if (status === "expired") {
    return (
      <div className="space-y-4 text-center text-sm">
        <p>Il link per reimpostare la password non è valido o è scaduto.</p>
        <Link href="/forgot-password" className="text-primary underline underline-offset-4">
          Richiedi un nuovo link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm />;
}
