"use client";

import { inviteWorkerAction } from "@/features/applications/actions";
import { ActionButton } from "@/components/action-button";

export function InviteButton({ jobId, workerId }: { jobId: string; workerId: string }) {
  return (
    <ActionButton
      action={() => inviteWorkerAction(jobId, workerId)}
      label="Invita"
      variant="outline"
      size="sm"
    />
  );
}
