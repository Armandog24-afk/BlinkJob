"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSigninButton } from "@/features/auth/components/google-signin-button";
import { REGISTRATION_ENABLED } from "@/lib/config";

const initialState: ActionState = {};

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            Password dimenticata?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Accesso in corso..." : "Accedi"}
      </Button>

      <div className="relative py-1 text-center text-xs text-muted-foreground">
        <span className="relative bg-background px-2">oppure</span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t" />
      </div>
      <GoogleSigninButton />

      {REGISTRATION_ENABLED && (
        <p className="text-center text-sm text-muted-foreground">
          Non hai un account?{" "}
          <Link href="/register" className="text-primary underline underline-offset-4">
            Registrati
          </Link>
        </p>
      )}
    </form>
  );
}
