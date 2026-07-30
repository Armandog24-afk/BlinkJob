"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function GoogleSigninButton({
  disabled = false,
  acceptedTerms = false,
}: {
  disabled?: boolean;
  acceptedTerms?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback${acceptedTerms ? "?acceptedTerms=1" : ""}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      console.error("[GoogleSigninButton] signInWithOAuth error:", error);
      setError("Accesso con Google non disponibile al momento.");
      setPending(false);
    }
    // On success the browser navigates away to Google immediately — no further state update needed.
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full" onClick={handleClick} disabled={pending || disabled}>
        {pending ? "Reindirizzamento..." : "Continua con Google"}
      </Button>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}
