"use client";

import { markNotificationReadAction } from "@/features/notifications/actions";
import { ActionButton } from "@/components/action-button";

export function MarkReadButton({ notificationId }: { notificationId: string }) {
  return (
    <ActionButton
      action={() => markNotificationReadAction(notificationId)}
      label="Letta"
      variant="ghost"
      size="sm"
    />
  );
}
