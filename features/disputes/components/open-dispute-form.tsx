"use client";

import { useActionState, useState } from "react";
import { openDisputeAction } from "@/features/disputes/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

export function OpenDisputeForm({ assignmentId }: { assignmentId: string }) {
  const [state, formAction, pending] = useActionState(openDisputeAction, initialState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Segnala un problema
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Input name="type" placeholder="Descrivi brevemente il problema" required maxLength={200} />
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Invio..." : "Invia segnalazione"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
