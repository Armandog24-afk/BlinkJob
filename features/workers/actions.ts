"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toEwktPoint } from "@/lib/geo";
import { workerOnboardingSchema } from "@/lib/validation/worker";
import type { ActionState } from "@/features/auth/actions";

function computeCompletenessScore(input: {
  bio?: string;
  skillCount: number;
  availabilityCount: number;
}): number {
  let score = 40; // birth date + location + radius, always present once this form is submitted
  if (input.bio && input.bio.length > 0) score += 10;
  score += Math.min(input.skillCount, 3) * 10; // up to 30
  score += Math.min(input.availabilityCount, 2) * 10; // up to 20
  return Math.min(score, 100);
}

export async function completeWorkerOnboardingAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = workerOnboardingSchema.safeParse({
    birthDate: formData.get("birthDate"),
    bio: formData.get("bio"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    operatingRadiusKm: formData.get("operatingRadiusKm"),
    skillIds: formData.getAll("skillIds"),
    availabilityDays: formData.getAll("availabilityDays"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const {
    birthDate,
    bio,
    lat,
    lng,
    operatingRadiusKm,
    skillIds,
    availabilityDays,
    startTime,
    endTime,
  } = parsed.data;

  const { error: profileError } = await supabase.from("worker_profiles").upsert({
    user_id: user.id,
    birth_date: birthDate,
    bio: bio || null,
    home_location: toEwktPoint(lat, lng),
    operating_radius_km: operatingRadiusKm,
    completeness_score: computeCompletenessScore({
      bio,
      skillCount: skillIds.length,
      availabilityCount: availabilityDays.length,
    }),
  });

  if (profileError) {
    console.error("[completeWorkerOnboardingAction] worker_profiles upsert error:", profileError);
    return { error: "Impossibile salvare il profilo. Riprova." };
  }

  await supabase.from("worker_skills").delete().eq("worker_id", user.id);
  const { error: skillsError } = await supabase
    .from("worker_skills")
    .insert(skillIds.map((skill_id) => ({ worker_id: user.id, skill_id })));

  if (skillsError) {
    console.error("[completeWorkerOnboardingAction] worker_skills insert error:", skillsError);
    return { error: "Impossibile salvare le competenze. Riprova." };
  }

  await supabase.from("worker_availability").delete().eq("worker_id", user.id);
  const { error: availabilityError } = await supabase.from("worker_availability").insert(
    availabilityDays.map((day_of_week) => ({
      worker_id: user.id,
      day_of_week,
      start_time: startTime,
      end_time: endTime,
    }))
  );

  if (availabilityError) {
    console.error(
      "[completeWorkerOnboardingAction] worker_availability insert error:",
      availabilityError
    );
    return { error: "Impossibile salvare la disponibilità. Riprova." };
  }

  await supabase
    .from("users")
    .update({ status: "pending_verification" })
    .eq("id", user.id)
    .eq("status", "incomplete");

  redirect("/worker/dashboard");
}

export async function updateBlinknowOptInAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const optIn = formData.get("blinknowOptIn") === "on";

  const { error } = await supabase
    .from("worker_profiles")
    .update({ blinknow_opt_in: optIn })
    .eq("user_id", user.id);

  if (error) {
    console.error("[updateBlinknowOptInAction] error:", error);
    return { error: "Impossibile salvare la preferenza. Riprova." };
  }

  return {};
}

export async function importCvAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get("cvFile");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Carica un file .txt con il testo del tuo CV." };
  }
  if (!file.name.toLowerCase().endsWith(".txt")) {
    return { error: "Per ora è supportato solo il formato .txt (copia il testo del CV in un file di testo)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const text = (await file.text()).toLowerCase();

  const [{ data: allSkills }, { data: ownedSkills }] = await Promise.all([
    supabase.from("skill_taxonomy").select("id, name, synonyms"),
    supabase.from("worker_skills").select("skill_id").eq("worker_id", user.id),
  ]);

  const ownedIds = new Set((ownedSkills ?? []).map((s) => s.skill_id));

  const matchedIds = (allSkills ?? [])
    .filter((skill) => !ownedIds.has(skill.id))
    .filter((skill) => {
      const terms = [skill.name, ...(skill.synonyms ?? [])];
      return terms.some((term) => term.length > 2 && text.includes(term.toLowerCase()));
    })
    .map((skill) => skill.id);

  if (matchedIds.length === 0) {
    return { message: "Nessuna competenza riconosciuta nel testo caricato — il matching per parole chiave è un'euristica semplice, non un'analisi linguistica reale." };
  }

  const { error } = await supabase
    .from("worker_skills")
    .insert(matchedIds.map((skill_id) => ({ worker_id: user.id, skill_id })));

  if (error) {
    console.error("[importCvAction] worker_skills insert error:", error);
    return { error: "Competenze riconosciute ma non è stato possibile salvarle. Riprova." };
  }

  const { data: addedSkills } = await supabase
    .from("skill_taxonomy")
    .select("name")
    .in("id", matchedIds);

  revalidatePath("/worker/profile");
  return {
    message: `Aggiunte ${matchedIds.length} competenze dal CV: ${(addedSkills ?? []).map((s) => s.name).join(", ")}.`,
  };
}
