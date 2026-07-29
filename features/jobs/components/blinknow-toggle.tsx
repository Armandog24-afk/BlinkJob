"use client";

import { setJobBlinknowAction } from "@/features/jobs/actions";
import { ActionButton } from "@/components/action-button";
import { BLINKNOW_FEE_CENTS } from "@/lib/blinknow/config";
import { formatCents } from "@/lib/utils";

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
    <div className="flex flex-col gap-1">
      <ActionButton
        action={() => setJobBlinknowAction(jobId, true)}
        label={`Attiva BlinkNow (urgenza) — fee ${formatCents(BLINKNOW_FEE_CENTS, "EUR")}`}
        variant="outline"
      />
      <p className="text-xs text-muted-foreground">
        Fee premium addebitata (ledger tracciato, non un pagamento reale) e rimborsata
        automaticamente se nessuna posizione viene coperta entro la scadenza.
      </p>
    </div>
  );
}
