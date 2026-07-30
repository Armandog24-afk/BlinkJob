"use client";

import { useActionState, useState } from "react";
import { appealDisputeAction } from "@/features/disputes/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

export function AppealDisputeForm({ disputeId }: { disputeId: string }) {
  const [state, formAction, pending] = useActionState(appealDisputeAction, initialState);
  const [open, setOpen] = useState(false);

  if (state.message) {
    return <p className="text-xs text-muted-foreground">{state.message}</p>;
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Fai appello
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="disputeId" value={disputeId} />
      <Input name="reason" placeholder="Perché non sei d'accordo con la risoluzione?" maxLength={300} />
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Invio..." : "Invia appello"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
