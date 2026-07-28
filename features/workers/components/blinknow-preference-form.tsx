"use client";

import { useActionState } from "react";
import { updateBlinknowOptInAction } from "@/features/workers/actions";
import type { ActionState } from "@/features/auth/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

export function BlinknowPreferenceForm({ optIn }: { optIn: boolean }) {
  const [state, formAction, pending] = useActionState(updateBlinknowOptInAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <Checkbox name="blinknowOptIn" defaultChecked={optIn} />
        <span>
          Ricevi notifiche per incarichi urgenti BlinkNow
          <br />
          <span className="text-xs text-muted-foreground">
            Solo su tua richiesta esplicita: nessuna notifica urgente senza questo consenso.
          </span>
        </span>
      </label>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Salvataggio..." : "Salva preferenza"}
      </Button>
    </form>
  );
}
