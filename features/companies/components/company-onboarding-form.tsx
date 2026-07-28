"use client";

import { useActionState } from "react";
import { createCompanyAction } from "@/features/companies/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function CompanyOnboardingForm() {
  const [state, formAction, pending] = useActionState(createCompanyAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="legalName">Ragione sociale</Label>
        <Input id="legalName" name="legalName" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="vatNumber">Partita IVA (opzionale ora)</Label>
        <Input id="vatNumber" name="vatNumber" />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creazione..." : "Crea azienda"}
      </Button>
    </form>
  );
}
