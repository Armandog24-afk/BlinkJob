"use client";

import { setCompanyStatusAction } from "@/features/admin/actions";
import { ActionButton } from "@/components/action-button";
import type { CompanyStatus } from "@/types/database";

export function CompanyStatusActions({
  companyId,
  status,
}: {
  companyId: string;
  status: CompanyStatus;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "active" && (
        <ActionButton
          action={() => setCompanyStatusAction(companyId, "active")}
          label="Verifica e attiva"
          size="sm"
        />
      )}
      {status !== "limited" && (
        <ActionButton
          action={() => setCompanyStatusAction(companyId, "limited")}
          label="Limita"
          variant="outline"
          size="sm"
        />
      )}
      {status !== "suspended" && (
        <ActionButton
          action={() => setCompanyStatusAction(companyId, "suspended")}
          label="Sospendi"
          variant="destructive"
          size="sm"
        />
      )}
    </div>
  );
}
