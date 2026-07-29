"use client";

import { useActionState } from "react";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "default",
  size = "default",
}: {
  action: () => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  size?: "default" | "sm";
}) {
  const [state, formAction, pending] = useActionState(() => action(), initialState);

  return (
    <div className="inline-flex flex-col gap-1">
      <form action={formAction}>
        <Button type="submit" variant={variant} size={size} disabled={pending}>
          {pending ? (pendingLabel ?? "...") : label}
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state.message && <p className="text-xs text-muted-foreground">{state.message}</p>}
    </div>
  );
}
