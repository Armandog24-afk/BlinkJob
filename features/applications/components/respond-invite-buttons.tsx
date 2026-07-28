"use client";

import { respondToInviteAction } from "@/features/applications/actions";
import { ActionButton } from "@/components/action-button";

export function RespondInviteButtons({ applicationId }: { applicationId: string }) {
  return (
    <div className="flex gap-2">
      <ActionButton
        action={() => respondToInviteAction(applicationId, true)}
        label="Accetta invito"
        size="sm"
      />
      <ActionButton
        action={() => respondToInviteAction(applicationId, false)}
        label="Rifiuta"
        variant="outline"
        size="sm"
      />
    </div>
  );
}
