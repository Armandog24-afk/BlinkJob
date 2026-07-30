"use client";

import { useActionState } from "react";
import { updateNotificationPreferencesAction } from "@/features/notifications/actions";
import type { ActionState } from "@/features/auth/actions";
import type { NotificationPreferences } from "@/features/notifications/queries";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function NotificationPreferencesForm({ preferences }: { preferences: NotificationPreferences }) {
  const [state, formAction, pending] = useActionState(updateNotificationPreferencesAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Ore silenziose — inizio</span>
          <select
            name="quietHoursStart"
            defaultValue={preferences.quiet_hours_start ?? ""}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
          >
            <option value="">Disattivate</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Ore silenziose — fine</span>
          <select
            name="quietHoursEnd"
            defaultValue={preferences.quiet_hours_end ?? ""}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
          >
            <option value="">Disattivate</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Le notifiche create durante le ore silenziose restano nascoste finché la fascia non
        termina.
      </p>

      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Raggruppamento</span>
        <select
          name="digestMode"
          defaultValue={preferences.digest_mode}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm sm:w-64"
        >
          <option value="immediate">Ogni notifica singolarmente</option>
          <option value="daily">Raggruppa per giorno</option>
        </select>
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Salvataggio..." : "Salva preferenze"}
      </Button>
    </form>
  );
}
