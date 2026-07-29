"use client";

import { deleteTemplateAction } from "@/features/jobs/actions";
import { ActionButton } from "@/components/action-button";

export function DeleteTemplateButton({ templateId }: { templateId: string }) {
  return (
    <ActionButton
      action={() => deleteTemplateAction(templateId)}
      label="Elimina"
      variant="outline"
      size="sm"
    />
  );
}
