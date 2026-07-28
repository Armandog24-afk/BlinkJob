"use client";

import { confirmPaymentAction, markPaymentPaidAction } from "@/features/payments/actions";
import { ActionButton } from "@/components/action-button";

export function PaymentActions({ paymentId, status }: { paymentId: string; status: string }) {
  if (status === "pending") {
    return (
      <ActionButton
        action={() => confirmPaymentAction(paymentId)}
        label="Confermare importo"
        size="sm"
      />
    );
  }
  if (status === "confirmed") {
    return (
      <ActionButton
        action={() => markPaymentPaidAction(paymentId)}
        label="Segna come pagato"
        size="sm"
      />
    );
  }
  return null;
}
