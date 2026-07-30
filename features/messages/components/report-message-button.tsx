"use client";

import { useActionState, useState } from "react";
import { reportMessageAction } from "@/features/messages/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

export function ReportMessageButton({
  messageId,
  jobId,
  workerId,
}: {
  messageId: string;
  jobId: string;
  workerId: string;
}) {
  const [state, formAction, pending] = useActionState(reportMessageAction, initialState);
  const [open, setOpen] = useState(false);

  if (state.message) {
    return <p className="text-xs text-muted-foreground">{state.message}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Segnala
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="workerId" value={workerId} />
      <Input name="reason" placeholder="Motivo della segnalazione (opzionale)" maxLength={200} />
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="xs" variant="outline" disabled={pending}>
          {pending ? "Invio..." : "Conferma segnalazione"}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(false)}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
