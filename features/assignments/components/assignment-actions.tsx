"use client";

import {
  checkInAction,
  checkOutAction,
  confirmCompletionAction,
  cancelAssignmentAction,
} from "@/features/assignments/actions";
import { ActionButton } from "@/components/action-button";

export function AssignmentActions({
  assignmentId,
  status,
  hasCheckedOut,
  viewerRole,
}: {
  assignmentId: string;
  status: string;
  hasCheckedOut: boolean;
  viewerRole: "worker" | "company";
}) {
  if (status !== "confirmed" && status !== "in_progress") return null;

  return (
    <div className="flex flex-wrap items-start gap-2">
      {viewerRole === "worker" && status === "confirmed" && (
        <ActionButton action={() => checkInAction(assignmentId)} label="Check-in" size="sm" />
      )}
      {viewerRole === "worker" && status === "in_progress" && !hasCheckedOut && (
        <ActionButton action={() => checkOutAction(assignmentId)} label="Check-out" size="sm" />
      )}
      {status === "in_progress" && hasCheckedOut && (
        <ActionButton
          action={() => confirmCompletionAction(assignmentId)}
          label="Conferma completamento"
          size="sm"
        />
      )}
      <ActionButton
        action={() => cancelAssignmentAction(assignmentId)}
        label="Annulla"
        variant="outline"
        size="sm"
      />
    </div>
  );
}
