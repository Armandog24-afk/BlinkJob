"use client";

import { useActionState } from "react";
import { resolveDisputeAction } from "@/features/admin/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

export function ResolveDisputeForm({ disputeId }: { disputeId: string }) {
  const [state, formAction, pending] = useActionState(resolveDisputeAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="disputeId" value={disputeId} />
      <Input name="resolution" placeholder="Nota di risoluzione" required className="flex-1" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "..." : "Risolvi"}
      </Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
