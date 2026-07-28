"use client";

import { useActionState } from "react";
import { addCompanyLocationAction } from "@/features/companies/actions";
import type { ActionState } from "@/features/auth/actions";
import { LocationPicker } from "@/components/location-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function CompanyLocationForm() {
  const [state, formAction, pending] = useActionState(addCompanyLocationAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="label">Etichetta sede</Label>
        <Input id="label" name="label" placeholder="Sede centrale" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Indirizzo</Label>
        <Input id="address" name="address" placeholder="Via Roma 1, Milano" required />
      </div>
      <LocationPicker />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Salvataggio..." : "Aggiungi sede"}
      </Button>
    </form>
  );
}
