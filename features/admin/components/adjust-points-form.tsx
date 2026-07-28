"use client";

import { useActionState } from "react";
import { adjustPointsAction } from "@/features/admin/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

export function AdjustPointsForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(adjustPointsAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Input
        name="points"
        type="number"
        placeholder="Punti (± )"
        required
        className="w-28"
      />
      <Input name="reason" placeholder="Motivo (obbligatorio)" required className="flex-1" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "..." : "Rettifica punti"}
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
