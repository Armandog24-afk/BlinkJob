"use client";

import { confirmCandidateAction, rejectApplicationAction } from "@/features/applications/actions";
import { ActionButton } from "@/components/action-button";

export function ApplicationDecisionButtons({
  applicationId,
  jobId,
}: {
  applicationId: string;
  jobId: string;
}) {
  return (
    <div className="flex gap-2">
      <ActionButton
        action={() => confirmCandidateAction(applicationId, jobId)}
        label="Conferma"
        size="sm"
      />
      <ActionButton
        action={() => rejectApplicationAction(applicationId, jobId)}
        label="Rifiuta"
        variant="outline"
        size="sm"
      />
    </div>
  );
}
