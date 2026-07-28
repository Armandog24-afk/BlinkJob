import { createClient } from "@/lib/supabase/server";

export interface NotificationItem {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export async function getMyNotifications(): Promise<{
  notifications: NotificationItem[];
  unreadCount: number;
}> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { notifications: [], unreadCount: 0 };

  const [{ data: notifications }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, event_type, payload, read_at, created_at")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userData.user.id)
      .is("read_at", null),
  ]);

  return { notifications: notifications ?? [], unreadCount: count ?? 0 };
}
