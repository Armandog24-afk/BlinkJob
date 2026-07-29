"use client";

import { createTemplateFromJobAction } from "@/features/jobs/actions";
import { ActionButton } from "@/components/action-button";

export function SaveAsTemplateButton({ jobId }: { jobId: string }) {
  return (
    <ActionButton
      action={() => createTemplateFromJobAction(jobId)}
      label="Salva come template"
      variant="outline"
    />
  );
}
