"use client";

import { useActionState } from "react";
import { addTeamMemberAction } from "@/features/companies/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function TeamInviteForm() {
  const [state, formAction, pending] = useActionState(addTeamMemberAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor="email">Email collega</Label>
          <Input id="email" name="email" type="email" placeholder="collega@azienda.it" required />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Aggiunta..." : "Aggiungi al team"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
