"use client";

import { useActionState } from "react";
import { importCvAction } from "@/features/workers/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

export function ImportCvForm() {
  const [state, formAction, pending] = useActionState(importCvAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input
        type="file"
        name="cvFile"
        accept=".txt,text/plain"
        required
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
      />
      <p className="text-xs text-muted-foreground">
        Solo file .txt per ora. Riconosciamo competenze per parole chiave e le aggiungiamo al tuo
        profilo — controlla comunque il risultato, è un&apos;euristica semplice.
      </p>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Analisi in corso..." : "Importa CV"}
      </Button>
    </form>
  );
}
