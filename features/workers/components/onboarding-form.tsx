"use client";

import { useActionState, useState } from "react";
import { completeWorkerOnboardingAction } from "@/features/workers/actions";
import type { ActionState } from "@/features/auth/actions";
import { DAY_LABELS } from "@/lib/geo";
import { LocationPicker } from "@/components/location-picker";
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

const RADIUS_OPTIONS = [5, 10, 15, 25, 50, 100];

export interface SkillOption {
  id: string;
  name: string;
  category: string;
}

const initialState: ActionState = {};

export function WorkerOnboardingForm({ skills }: { skills: SkillOption[] }) {
  const [state, formAction, pending] = useActionState(
    completeWorkerOnboardingAction,
    initialState
  );
  const [radius, setRadius] = useState("15");

  const categories = Array.from(new Set(skills.map((s) => s.category)));

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Dati personali</h2>
        <div className="space-y-2">
          <Label htmlFor="birthDate">Data di nascita</Label>
          <Input id="birthDate" name="birthDate" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Breve presentazione (opzionale)</Label>
          <Textarea id="bio" name="bio" maxLength={500} rows={3} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Area operativa</h2>
        <LocationPicker />

        <div className="space-y-2">
          <Label>Raggio di disponibilità</Label>
          <Select value={radius} onValueChange={(v) => v && setRadius(v)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RADIUS_OPTIONS.map((km) => (
                <SelectItem key={km} value={String(km)}>
                  {km} km
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="operatingRadiusKm" value={radius} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Competenze</h2>
        <div className="space-y-3">
          {categories.map((category) => (
            <div key={category}>
              <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                {category}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {skills
                  .filter((s) => s.category === category)
                  .map((skill) => (
                    <label key={skill.id} className="flex items-center gap-2 text-sm">
                      <Checkbox name="skillIds" value={skill.id} />
                      {skill.name}
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Disponibilità</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {DAY_LABELS.map((day, index) => (
            <label key={day} className="flex items-center gap-2 text-sm">
              <Checkbox name="availabilityDays" value={String(index)} />
              {day}
            </label>
          ))}
        </div>
        <div className="flex gap-4">
          <div className="space-y-2">
            <Label htmlFor="startTime">Dalle</Label>
            <Input id="startTime" name="startTime" type="time" defaultValue="09:00" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endTime">Alle</Label>
            <Input id="endTime" name="endTime" type="time" defaultValue="18:00" required />
          </div>
        </div>
      </section>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Salvataggio..." : "Completa il profilo"}
      </Button>
    </form>
  );
}
