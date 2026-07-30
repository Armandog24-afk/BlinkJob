import { createClient } from "@/lib/supabase/server";

export interface NotificationItem {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  occurrences: number;
  created_at: string;
}

export async function getMyNotifications(): Promise<{
  notifications: NotificationItem[];
  unreadCount: number;
}> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { notifications: [], unreadCount: 0 };

  const nowIso = new Date().toISOString();
  const [{ data: notifications }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, event_type, payload, read_at, occurrences, created_at")
      .eq("user_id", userData.user.id)
      .lte("visible_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userData.user.id)
      .lte("visible_at", nowIso)
      .is("read_at", null),
  ]);

  return { notifications: notifications ?? [], unreadCount: count ?? 0 };
}

export async function getMyNotificationHistory(): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data } = await supabase
    .from("notifications")
    .select("id, event_type, payload, read_at, occurrences, created_at")
    .eq("user_id", userData.user.id)
    .lte("visible_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  return data ?? [];
}

export interface NotificationPreferences {
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  digest_mode: "immediate" | "daily";
}

export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { quiet_hours_start: null, quiet_hours_end: null, digest_mode: "immediate" };

  const { data } = await supabase
    .from("notification_preferences")
    .select("quiet_hours_start, quiet_hours_end, digest_mode")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return data ?? { quiet_hours_start: null, quiet_hours_end: null, digest_mode: "immediate" };
}
