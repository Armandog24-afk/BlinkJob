"use client";

import { useActionState, useState } from "react";
import { createDocumentVersionAction } from "@/features/admin/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionState = {};

export function NewDocumentVersionForm({
  scope,
  documentKey,
  currentTitle,
}: {
  scope: "platform" | "assignment";
  documentKey: string;
  currentTitle: string;
}) {
  const [state, formAction, pending] = useActionState(createDocumentVersionAction, initialState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Pubblica nuova versione
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="key" value={documentKey} />
      <Input name="title" defaultValue={currentTitle} placeholder="Titolo" required />
      <Textarea name="body" placeholder="Testo del documento" required rows={5} />
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state.message && <p className="text-xs text-muted-foreground">{state.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Pubblicazione..." : "Pubblica"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
