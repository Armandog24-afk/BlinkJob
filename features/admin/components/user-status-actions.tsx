"use client";

import { setUserStatusAction } from "@/features/admin/actions";
import { ActionButton } from "@/components/action-button";
import type { UserStatus } from "@/types/database";

export function UserStatusActions({ userId, status }: { userId: string; status: UserStatus }) {
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "active" && (
        <ActionButton
          action={() => setUserStatusAction(userId, "active")}
          label="Attiva"
          size="sm"
        />
      )}
      {status !== "suspended" && (
        <ActionButton
          action={() => setUserStatusAction(userId, "suspended")}
          label="Sospendi"
          variant="outline"
          size="sm"
        />
      )}
      {status !== "blocked" && (
        <ActionButton
          action={() => setUserStatusAction(userId, "blocked")}
          label="Blocca"
          variant="destructive"
          size="sm"
        />
      )}
    </div>
  );
}
