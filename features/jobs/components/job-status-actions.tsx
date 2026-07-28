"use client";

import { publishJobAction, unpublishJobAction, cancelJobAction } from "@/features/jobs/actions";
import { ActionButton } from "@/components/action-button";

export function JobStatusActions({ jobId, status }: { jobId: string; status: string }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      {status === "draft" && (
        <ActionButton action={() => publishJobAction(jobId)} label="Pubblica" />
      )}
      {status === "published" && (
        <ActionButton
          action={() => unpublishJobAction(jobId)}
          label="Metti in pausa (torna a bozza)"
          variant="outline"
        />
      )}
      {(status === "draft" || status === "published") && (
        <ActionButton
          action={() => cancelJobAction(jobId)}
          label="Annulla incarico"
          variant="destructive"
        />
      )}
    </div>
  );
}
