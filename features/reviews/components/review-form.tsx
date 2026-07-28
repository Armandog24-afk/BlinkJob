"use client";

import { useActionState, useState } from "react";
import { submitReviewAction } from "@/features/reviews/actions";
import type { ActionState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const initialState: ActionState = {};

export function ReviewForm({ assignmentId }: { assignmentId: string }) {
  const [state, formAction, pending] = useActionState(submitReviewAction, initialState);
  const [rating, setRating] = useState(5);

  return (
    <form action={formAction} className="space-y-3 rounded-md border p-3">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="overall" value={rating} />

      <div>
        <p className="mb-1 text-sm font-medium">Lascia una recensione</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} stelle`}
            >
              <Star
                className={cn(
                  "size-5",
                  n <= rating ? "fill-primary text-primary" : "text-muted-foreground"
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <Textarea name="comment" placeholder="Commento (opzionale)" rows={2} maxLength={1000} />

      {state.error && <p className="text-xs text-destructive">{state.error}</p>}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Invio..." : "Invia recensione"}
      </Button>
    </form>
  );
}
