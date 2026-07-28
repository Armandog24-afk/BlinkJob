"use client";

import { useActionState } from "react";
import { applyToJobAction } from "@/features/applications/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";

const initialState: ActionState = {};

export function ApplyButton({
  jobId,
  score,
  reasons,
}: {
  jobId: string;
  score: number;
  reasons: string[];
}) {
  const [state, formAction, pending] = useActionState(applyToJobAction, initialState);

  return (
    <div className="flex flex-col items-start gap-1">
      <form action={formAction}>
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="score" value={score} />
        <input type="hidden" name="reasons" value={JSON.stringify(reasons)} />
        <Button type="submit" disabled={pending}>
          {pending ? "Invio..." : "Candidati"}
        </Button>
      </form>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}
