"use client";

import { removeFromTalentPoolAction } from "@/features/companies/actions";
import { ActionButton } from "@/components/action-button";

export function RemoveFromTalentPoolButton({ workerId }: { workerId: string }) {
  return (
    <ActionButton
      action={() => removeFromTalentPoolAction(workerId)}
      label="Rimuovi dal talent pool"
      variant="outline"
      size="sm"
    />
  );
}
