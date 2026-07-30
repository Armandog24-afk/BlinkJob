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

export async function updateNotificationPreferencesAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const quietStartRaw = formData.get("quietHoursStart");
  const quietEndRaw = formData.get("quietHoursEnd");
  const digestMode = formData.get("digestMode");

  if (digestMode !== "immediate" && digestMode !== "daily") {
    return { error: "Modalità non valida." };
  }

  const quietHoursStart = quietStartRaw === "" || quietStartRaw == null ? null : Number(quietStartRaw);
  const quietHoursEnd = quietEndRaw === "" || quietEndRaw == null ? null : Number(quietEndRaw);

  if (
    (quietHoursStart === null) !== (quietHoursEnd === null) ||
    (quietHoursStart !== null && (quietHoursStart < 0 || quietHoursStart > 23)) ||
    (quietHoursEnd !== null && (quietHoursEnd < 0 || quietHoursEnd > 23))
  ) {
    return { error: "Imposta sia l'inizio sia la fine delle ore silenziose, tra 0 e 23." };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Sessione non valida." };

  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: userData.user.id,
    quiet_hours_start: quietHoursStart,
    quiet_hours_end: quietHoursEnd,
    digest_mode: digestMode,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[updateNotificationPreferencesAction] error:", error);
    return { error: "Impossibile salvare le preferenze. Riprova." };
  }

  revalidatePath("/notifications");
  return { message: "Preferenze salvate." };
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
