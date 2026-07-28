"use client";

import { setFeatureFlagAction } from "@/features/admin/actions";
import { ActionButton } from "@/components/action-button";

export function FeatureFlagToggle({
  flagKey,
  enabledGlobally,
}: {
  flagKey: string;
  enabledGlobally: boolean;
}) {
  return (
    <ActionButton
      action={() => setFeatureFlagAction(flagKey, !enabledGlobally)}
      label={enabledGlobally ? "Disattiva" : "Attiva globalmente"}
      variant={enabledGlobally ? "destructive" : "default"}
      size="sm"
    />
  );
}
