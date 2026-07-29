"use client";

import { checkInAction, checkOutAction } from "@/features/assignments/actions";
import { ActionButton } from "@/components/action-button";

export function QrCheckinButton({
  assignmentId,
  mode,
}: {
  assignmentId: string;
  mode: "check-in" | "check-out";
}) {
  return mode === "check-in" ? (
    <ActionButton action={() => checkInAction(assignmentId, "qr")} label="Conferma arrivo" />
  ) : (
    <ActionButton action={() => checkOutAction(assignmentId, "qr")} label="Conferma uscita" />
  );
}
