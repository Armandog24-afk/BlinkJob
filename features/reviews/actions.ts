"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/features/companies/queries";
import { reviewSchema } from "@/lib/validation/review";
import type { ActionState } from "@/features/auth/actions";

export async function submitReviewAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const assignmentId = formData.get("assignmentId");
  if (typeof assignmentId !== "string" || !assignmentId) {
    return { error: "Incarico non valido." };
  }

  const parsed = reviewSchema.safeParse({
    overall: formData.get("overall"),
    comment: formData.get("comment"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: assignment } = await supabase
    .from("assignments")
    .select("worker_id, status, jobs(created_by, company_id)")
    .eq("id", assignmentId)
    .single();

  if (!assignment) {
    return { error: "Incarico non trovato." };
  }

  if (assignment.status !== "completed") {
    return { error: "Puoi lasciare una recensione solo dopo il completamento dell'incarico." };
  }

  const job = Array.isArray(assignment.jobs) ? assignment.jobs[0] : assignment.jobs;
  if (!job) {
    return { error: "Incarico non trovato." };
  }

  let recipientId: string;
  if (assignment.worker_id === user.id) {
    recipientId = job.created_by;
  } else {
    const membership = await getCurrentMembership(user.id);
    if (!membership || membership.companyId !== job.company_id) {
      return { error: "Non sei autorizzato/a a recensire questo incarico." };
    }
    recipientId = assignment.worker_id;
  }

  const { error } = await supabase.from("reviews").insert({
    assignment_id: assignmentId,
    author_id: user.id,
    recipient_id: recipientId,
    rating_dimensions: { overall: parsed.data.overall },
    comment: parsed.data.comment ?? null,
    moderation_status: "published",
    published_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[submitReviewAction] insert error:", error);
    return {
      error:
        error.code === "23505"
          ? "Hai già lasciato una recensione per questo incarico."
          : "Impossibile salvare la recensione. Riprova.",
    };
  }

  revalidatePath("/worker/assignments");
  revalidatePath("/company/assignments");
  return {};
}
