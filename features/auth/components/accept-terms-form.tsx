"use client";

import { useActionState } from "react";
import Link from "next/link";
import { acceptTermsAndContinueAction } from "@/features/auth/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const initialState: ActionState = {};

export function AcceptTermsForm() {
  const [state, formAction, pending] = useActionState(acceptTermsAndContinueAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex items-start gap-2">
        <Checkbox id="acceptedTerms" name="acceptedTerms" required />
        <Label htmlFor="acceptedTerms" className="text-sm font-normal text-muted-foreground">
          Accetto i{" "}
          <Link href="/legal/terms_of_service" target="_blank" className="text-primary underline underline-offset-4">
            Termini di Servizio
          </Link>{" "}
          e l&apos;
          <Link href="/legal/privacy_policy" target="_blank" className="text-primary underline underline-offset-4">
            Informativa Privacy
          </Link>
          .
        </Label>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Un attimo..." : "Continua"}
      </Button>
    </form>
  );
}
