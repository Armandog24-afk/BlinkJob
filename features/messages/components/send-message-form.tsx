"use client";

import { useActionState } from "react";
import { sendMessageAction } from "@/features/messages/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionState = {};

export function SendMessageForm({
  conversationId,
  jobId,
  workerId,
}: {
  conversationId: string;
  jobId: string;
  workerId: string;
}) {
  const [state, formAction, pending] = useActionState(sendMessageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t pt-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="workerId" value={workerId} />
      <Textarea
        name="body"
        required
        maxLength={2000}
        rows={2}
        placeholder="Scrivi un messaggio... (email e numeri di telefono vengono rimossi automaticamente)"
      />
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending} className="self-end">
        {pending ? "Invio..." : "Invia"}
      </Button>
    </form>
  );
}
