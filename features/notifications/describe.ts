import type { NotificationItem } from "@/features/notifications/queries";

export function describeNotification(n: NotificationItem): string {
  const p = n.payload;
  const jobTitle = typeof p.job_title === "string" ? p.job_title : "un incarico";
  const suffix = n.occurrences > 1 ? ` (×${n.occurrences})` : "";

  const base = (() => {
    switch (n.event_type) {
      case "application_received":
        return `Nuova candidatura per "${jobTitle}"`;
      case "invite_received":
        return `Hai ricevuto un invito per "${jobTitle}"`;
      case "blinknow_job_available":
        return `Nuovo incarico urgente BlinkNow: "${jobTitle}"`;
      case "application_accepted":
        return `La tua candidatura per "${jobTitle}" è stata confermata`;
      case "invite_accepted":
        return `Il lavoratore ha accettato l'invito per "${jobTitle}"`;
      case "assignment_checked_in":
        return `Check-in effettuato per "${jobTitle}"`;
      case "assignment_completed":
        return `Incarico "${jobTitle}" completato`;
      case "payment_paid":
        return `Pagamento ricevuto per "${jobTitle}"`;
      case "review_received":
        return `Hai ricevuto una nuova recensione (${p.rating ?? "-"}/5)`;
      case "message_received":
        return `Nuovo messaggio per "${jobTitle}"`;
      case "dispute_opened":
        return `Segnalazione aperta su "${jobTitle}"`;
      case "dispute_resolved":
        return `Segnalazione su "${jobTitle}" risolta`;
      case "dispute_appealed":
        return `Appello ricevuto su "${jobTitle}"`;
      case "account_status_changed":
        return `Il tuo account è ora: ${p.status}`;
      case "company_status_changed":
        return `Lo stato della tua azienda è ora: ${p.status}`;
      default:
        return n.event_type;
    }
  })();

  return base + suffix;
}
