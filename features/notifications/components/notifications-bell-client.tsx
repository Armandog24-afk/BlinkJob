"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/queries";

function describeNotification(n: NotificationItem): string {
  const p = n.payload;
  const jobTitle = typeof p.job_title === "string" ? p.job_title : "un incarico";

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
    case "dispute_opened":
      return `Segnalazione aperta su "${jobTitle}"`;
    case "dispute_resolved":
      return `Segnalazione su "${jobTitle}" risolta`;
    case "account_status_changed":
      return `Il tuo account è ora: ${p.status}`;
    case "company_status_changed":
      return `Lo stato della tua azienda è ora: ${p.status}`;
    default:
      return n.event_type;
  }
}

export function NotificationsBellClient({
  notifications,
  unreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button variant="ghost" size="sm" className="relative" onClick={() => setOpen((v) => !v)}>
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="animate-pop glow-destructive absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">Notifiche</span>
            {unreadCount > 0 && (
              <ActionButton
                action={markAllNotificationsReadAction}
                label="Segna tutte come lette"
                variant="ghost"
                size="sm"
              />
            )}
          </div>
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                Nessuna notifica.
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${
                    n.read_at ? "opacity-60" : ""
                  }`}
                >
                  <span>{describeNotification(n)}</span>
                  {!n.read_at && (
                    <ActionButton
                      action={() => markNotificationReadAction(n.id)}
                      label="Letta"
                      variant="ghost"
                      size="sm"
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
