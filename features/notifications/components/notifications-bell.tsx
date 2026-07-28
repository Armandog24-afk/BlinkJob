import { getMyNotifications } from "@/features/notifications/queries";
import { NotificationsBellClient } from "@/features/notifications/components/notifications-bell-client";

export async function NotificationsBell() {
  const { notifications, unreadCount } = await getMyNotifications();
  return <NotificationsBellClient notifications={notifications} unreadCount={unreadCount} />;
}
