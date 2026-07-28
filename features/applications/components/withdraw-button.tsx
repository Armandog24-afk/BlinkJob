"use client";

import { withdrawApplicationAction } from "@/features/applications/actions";
import { ActionButton } from "@/components/action-button";

export function WithdrawButton({ applicationId }: { applicationId: string }) {
  return (
    <ActionButton
      action={() => withdrawApplicationAction(applicationId)}
      label="Ritira candidatura"
      variant="outline"
      size="sm"
    />
  );
}
