import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getMyNotificationHistory,
  getMyNotificationPreferences,
  type NotificationItem,
} from "@/features/notifications/queries";
import { describeNotification } from "@/features/notifications/describe";
import { NotificationPreferencesForm } from "@/features/notifications/components/notification-preferences-form";
import { MarkReadButton } from "@/features/notifications/components/mark-read-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DASHBOARD_BY_ROLE: Record<string, string> = {
  worker: "/worker/dashboard",
  company_owner: "/company/dashboard",
  recruiter: "/company/dashboard",
  admin: "/admin/dashboard",
  support: "/admin/dashboard",
};

function groupByDay(items: NotificationItem[]) {
  const groups = new Map<string, NotificationItem[]>();
  for (const item of items) {
    const day = new Date(item.created_at).toLocaleDateString("it-IT");
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(item);
  }
  return groups;
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/notifications");

  const [history, preferences] = await Promise.all([
    getMyNotificationHistory(),
    getMyNotificationPreferences(),
  ]);

  const dashboardHref = DASHBOARD_BY_ROLE[user.role] ?? "/";
  const grouped = preferences.digest_mode === "daily" ? groupByDay(history) : null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Blink<span className="text-primary">Job</span>
          </Link>
          <Link href={dashboardHref} className="text-sm text-muted-foreground underline underline-offset-4">
            Torna alla dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Notifiche</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferenze</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationPreferencesForm preferences={preferences} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {history.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nessuna notifica ancora.
              </CardContent>
            </Card>
          )}

          {grouped
            ? Array.from(grouped.entries()).map(([day, items]) => (
                <Card key={day}>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">{day}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.map((n) => (
                      <div
                        key={n.id}
                        className={`flex items-center justify-between gap-2 text-sm ${n.read_at ? "opacity-60" : ""}`}
                      >
                        <span>{describeNotification(n)}</span>
                        {!n.read_at && <MarkReadButton notificationId={n.id} />}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
            : history.map((n) => (
                <Card key={n.id}>
                  <CardContent className={`flex items-center justify-between gap-2 py-3 text-sm ${n.read_at ? "opacity-60" : ""}`}>
                    <div>
                      <p>{describeNotification(n)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("it-IT")}
                      </p>
                    </div>
                    {!n.read_at && <MarkReadButton notificationId={n.id} />}
                  </CardContent>
                </Card>
              ))}
        </div>
      </section>
    </div>
  );
}
