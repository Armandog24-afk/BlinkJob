"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/features/auth/actions";

export async function markNotificationReadAction(notificationId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);

  if (error) {
    console.error("[markNotificationReadAction] error:", error);
    return { error: "Non è stato possibile aggiornare la notifica." };
  }

  revalidatePath("/", "layout");
  return {};
}

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Sessione non valida." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userData.user.id)
    .is("read_at", null);

  if (error) {
    console.error("[markAllNotificationsReadAction] error:", error);
    return { error: "Non è stato possibile aggiornare le notifiche." };
  }

  revalidatePath("/", "layout");
  return {};
}
