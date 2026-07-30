"use client";

import { useActionState, useState } from "react";
import { createJobAction } from "@/features/jobs/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface LocationOption {
  id: string;
  label: string;
  address: string;
}

export interface SkillOption {
  id: string;
  name: string;
  category: string;
}

const initialState: ActionState = {};

export interface JobFormDefaultValues {
  title?: string;
  category?: string;
  description?: string;
  positionsCount?: number;
  payAmountEuro?: string;
  mandatorySkillIds?: string[];
  preferredSkillIds?: string[];
}

export function JobForm({
  locations,
  skills,
  defaultValues,
}: {
  locations: LocationOption[];
  skills: SkillOption[];
  defaultValues?: JobFormDefaultValues;
}) {
  const [state, formAction, pending] = useActionState(createJobAction, initialState);
  const mandatoryDefaults = new Set(defaultValues?.mandatorySkillIds ?? []);
  const preferredDefaults = new Set(defaultValues?.preferredSkillIds ?? []);
  const [recurrence, setRecurrence] = useState<"none" | "weekly">("none");

  return (
    <form action={formAction} className="space-y-8">
      {defaultValues && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Precompilato da un template — rivedi i campi prima di salvare, in particolare luogo e
          orari (non salvati nei template).
        </p>
      )}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Ruolo e descrizione</h2>
        <div className="space-y-2">
          <Label htmlFor="title">Titolo</Label>
          <Input
            id="title"
            name="title"
            placeholder="Cameriere per evento aziendale"
            defaultValue={defaultValues?.title}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Categoria</Label>
          <Input
            id="category"
            name="category"
            placeholder="hospitality"
            defaultValue={defaultValues?.category}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Descrizione attività</Label>
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={defaultValues?.description}
            required
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Luogo e orari</h2>
        <div className="space-y-2">
          <Label>Sede</Label>
          <Select name="locationId">
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Scegli una sede" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.label} — {loc.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="startsAt">Inizio</Label>
            <Input id="startsAt" name="startsAt" type="datetime-local" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endsAt">Fine</Label>
            <Input id="endsAt" name="endsAt" type="datetime-local" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="applicationDeadline">Scadenza candidature</Label>
            <Input id="applicationDeadline" name="applicationDeadline" type="datetime-local" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxDistanceKm">Distanza massima candidati (km, opzionale)</Label>
          <Input id="maxDistanceKm" name="maxDistanceKm" type="number" min={1} step="1" placeholder="Nessun limite oltre al raggio del lavoratore" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Ricorrenza</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Ripeti</Label>
            <Select value={recurrence} onValueChange={(v) => v && setRecurrence(v as "none" | "weekly")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Solo questa data</SelectItem>
                <SelectItem value="weekly">Ogni settimana</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="recurrence" value={recurrence} />
          </div>
          {recurrence === "weekly" && (
            <div className="space-y-2">
              <Label htmlFor="occurrences">Numero di occorrenze</Label>
              <Input id="occurrences" name="occurrences" type="number" min={2} max={12} defaultValue={4} required />
            </div>
          )}
        </div>
        {recurrence === "weekly" && (
          <p className="text-xs text-muted-foreground">
            Verranno creati incarichi separati, uno a settimana, tutti in bozza da pubblicare
            singolarmente.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Compenso e posizioni</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="payAmountEuro">Compenso (€)</Label>
            <Input
              id="payAmountEuro"
              type="number"
              min={1}
              step="0.01"
              placeholder="80.00"
              defaultValue={defaultValues?.payAmountEuro}
              required
              onChange={(e) => {
                const hidden = document.getElementById("payAmountCents") as HTMLInputElement | null;
                if (hidden) hidden.value = String(Math.round(Number(e.target.value) * 100));
              }}
            />
            <input
              id="payAmountCents"
              name="payAmountCents"
              type="hidden"
              defaultValue={
                defaultValues?.payAmountEuro
                  ? String(Math.round(Number(defaultValues.payAmountEuro) * 100))
                  : undefined
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="positionsCount">Numero posizioni</Label>
            <Input
              id="positionsCount"
              name="positionsCount"
              type="number"
              min={1}
              defaultValue={defaultValues?.positionsCount ?? 1}
              required
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Competenze richieste</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Obbligatorie
            </p>
            <div className="space-y-2">
              {skills.map((skill) => (
                <label key={skill.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="mandatorySkillIds"
                    value={skill.id}
                    defaultChecked={mandatoryDefaults.has(skill.id)}
                  />
                  {skill.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Preferenziali
            </p>
            <div className="space-y-2">
              {skills.map((skill) => (
                <label key={`pref-${skill.id}`} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="preferredSkillIds"
                    value={skill.id}
                    defaultChecked={preferredDefaults.has(skill.id)}
                  />
                  {skill.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Salvataggio..." : "Salva come bozza"}
      </Button>
    </form>
  );
}
