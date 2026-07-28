"use client";

import { setJobBlinknowAction } from "@/features/jobs/actions";
import { ActionButton } from "@/components/action-button";

export function BlinkNowToggle({
  jobId,
  urgencyTier,
  eligible,
}: {
  jobId: string;
  urgencyTier: "standard" | "blinknow";
  eligible: boolean;
}) {
  if (urgencyTier === "blinknow") {
    return (
      <ActionButton
        action={() => setJobBlinknowAction(jobId, false)}
        label="Disattiva BlinkNow"
        variant="outline"
      />
    );
  }

  if (!eligible) return null;

  return (
    <ActionButton
      action={() => setJobBlinknowAction(jobId, true)}
      label="Attiva BlinkNow (urgenza)"
      variant="outline"
    />
  );
}
