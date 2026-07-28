"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registerAction, type ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AccountKind } from "@/lib/validation/auth";

const initialState: ActionState = {};

export function RegisterForm({ defaultKind = "worker" }: { defaultKind?: AccountKind }) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const [accountKind, setAccountKind] = useState<AccountKind>(defaultKind);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="accountKind" value={accountKind} />

      <Tabs value={accountKind} onValueChange={(v) => setAccountKind(v as AccountKind)}>
        <TabsList className="w-full">
          <TabsTrigger value="worker" className="flex-1">
            Sono un lavoratore
          </TabsTrigger>
          <TabsTrigger value="company" className="flex-1">
            Sono un&apos;azienda
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        <Label htmlFor="fullName">
          {accountKind === "company" ? "Nome e cognome referente" : "Nome e cognome"}
        </Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-muted-foreground">Minimo 8 caratteri.</p>
      </div>

      <div className="flex items-start gap-2">
        <Checkbox id="acceptedTerms" name="acceptedTerms" required />
        <Label htmlFor="acceptedTerms" className="text-sm font-normal text-muted-foreground">
          Accetto i Termini di Servizio e l&apos;Informativa Privacy.
        </Label>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending
          ? "Creazione account..."
          : accountKind === "company"
            ? "Crea account azienda"
            : "Crea account lavoratore"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Hai già un account?{" "}
        <Link href="/login" className="text-primary underline underline-offset-4">
          Accedi
        </Link>
      </p>
    </form>
  );
}
