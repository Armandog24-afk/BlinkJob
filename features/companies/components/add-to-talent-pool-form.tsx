"use client";

import { useActionState, useState } from "react";
import { addToTalentPoolAction } from "@/features/companies/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

export function AddToTalentPoolForm({ workerId }: { workerId: string }) {
  const [state, formAction, pending] = useActionState(addToTalentPoolAction, initialState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Aggiungi al talent pool
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="workerId" value={workerId} />
      <Input name="note" placeholder="Nota (opzionale)" maxLength={200} />
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Aggiunta..." : "Conferma"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
