"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/features/companies/queries";
import { jobSchema } from "@/lib/validation/job";
import type { ActionState } from "@/features/auth/actions";

function readSkillIds(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((v): v is string => typeof v === "string" && v.length > 0);
}

export async function createJobAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = jobSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    locationId: formData.get("locationId"),
    positionsCount: formData.get("positionsCount"),
    payAmountCents: formData.get("payAmountCents"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    applicationDeadline: formData.get("applicationDeadline"),
    mandatorySkillIds: readSkillIds(formData, "mandatorySkillIds"),
    preferredSkillIds: readSkillIds(formData, "preferredSkillIds"),
    maxDistanceKm: formData.get("maxDistanceKm") || undefined,
    recurrence: formData.get("recurrence") || undefined,
    occurrences: formData.get("occurrences") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) return { error: "Devi prima creare la tua azienda." };

  const { data: location } = await supabase
    .from("company_locations")
    .select("id")
    .eq("id", parsed.data.locationId)
    .eq("company_id", membership.companyId)
    .maybeSingle();

  if (!location) {
    return { error: "Sede non valida per questa azienda." };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      company_id: membership.companyId,
      location_id: parsed.data.locationId,
      created_by: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      positions_count: parsed.data.positionsCount,
      pay_amount_cents: parsed.data.payAmountCents,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      application_deadline: parsed.data.applicationDeadline,
      max_distance_km: parsed.data.maxDistanceKm ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    console.error("[createJobAction] jobs insert error:", jobError);
    return { error: "Impossibile creare l'incarico. Riprova." };
  }

  const requirements = [
    ...parsed.data.mandatorySkillIds.map((skill_id) => ({
      job_id: job.id,
      skill_id,
      mandatory: true,
    })),
    ...parsed.data.preferredSkillIds.map((skill_id) => ({
      job_id: job.id,
      skill_id,
      mandatory: false,
    })),
  ];

  if (requirements.length > 0) {
    const { error: reqError } = await supabase.from("job_requirements").insert(requirements);
    if (reqError) {
      console.error("[createJobAction] job_requirements insert error:", reqError);
      return { error: "Incarico creato ma non è stato possibile salvare i requisiti." };
    }
  }

  if (parsed.data.recurrence === "weekly" && parsed.data.occurrences) {
    const addDays = (iso: string, days: number) =>
      new Date(new Date(iso).getTime() + days * 86400000).toISOString();

    for (let i = 1; i < parsed.data.occurrences; i++) {
      const offsetDays = i * 7;
      const { data: occurrenceJob, error: occurrenceError } = await supabase
        .from("jobs")
        .insert({
          company_id: membership.companyId,
          location_id: parsed.data.locationId,
          created_by: user.id,
          title: parsed.data.title,
          description: parsed.data.description,
          category: parsed.data.category,
          positions_count: parsed.data.positionsCount,
          pay_amount_cents: parsed.data.payAmountCents,
          starts_at: addDays(parsed.data.startsAt, offsetDays),
          ends_at: addDays(parsed.data.endsAt, offsetDays),
          application_deadline: addDays(parsed.data.applicationDeadline, offsetDays),
          max_distance_km: parsed.data.maxDistanceKm ?? null,
          status: "draft",
        })
        .select("id")
        .single();

      if (occurrenceError || !occurrenceJob) {
        console.error("[createJobAction] recurring occurrence insert error:", occurrenceError);
        continue;
      }

      if (requirements.length > 0) {
        await supabase
          .from("job_requirements")
          .insert(requirements.map((r) => ({ ...r, job_id: occurrenceJob.id })));
      }
    }
  }

  redirect(`/company/jobs/${job.id}`);
}

async function transitionJobStatus(
  jobId: string,
  from: string[],
  to: "draft" | "published" | "canceled",
  userId: string
): Promise<ActionState> {
  const supabase = await createClient();
  const membership = await getCurrentMembership(userId);
  if (!membership) return { error: "Devi far parte di un'azienda." };

  const { data: job } = await supabase
    .from("jobs")
    .select("id, status, company_id")
    .eq("id", jobId)
    .single();

  if (!job || job.company_id !== membership.companyId) {
    return { error: "Incarico non trovato." };
  }

  if (!from.includes(job.status)) {
    return { error: `Impossibile passare da "${job.status}" a "${to}".` };
  }

  const { error } = await supabase.from("jobs").update({ status: to }).eq("id", jobId);

  if (error) {
    console.error("[transitionJobStatus] update error:", error);
    return { error: "Impossibile aggiornare lo stato dell'incarico." };
  }

  revalidatePath(`/company/jobs/${jobId}`);
  revalidatePath("/company/jobs");
  return {};
}

export async function publishJobAction(jobId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return transitionJobStatus(jobId, ["draft"], "published", user.id);
}

export async function unpublishJobAction(jobId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return transitionJobStatus(jobId, ["published"], "draft", user.id);
}

export async function cancelJobAction(jobId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return transitionJobStatus(jobId, ["draft", "published"], "canceled", user.id);
}

export async function createTemplateFromJobAction(jobId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  if (!membership) return { error: "Devi far parte di un'azienda." };

  const [{ data: job }, { data: requirements }] = await Promise.all([
    supabase
      .from("jobs")
      .select("title, category, description, positions_count, pay_amount_cents, pay_currency, company_id")
      .eq("id", jobId)
      .single(),
    supabase.from("job_requirements").select("skill_id, mandatory").eq("job_id", jobId),
  ]);

  if (!job || job.company_id !== membership.companyId) {
    return { error: "Incarico non trovato." };
  }

  const { data: template, error: templateError } = await supabase
    .from("job_templates")
    .insert({
      company_id: membership.companyId,
      created_by: user.id,
      title: job.title,
      category: job.category,
      description: job.description,
      positions_count: job.positions_count,
      pay_amount_cents: job.pay_amount_cents,
      pay_currency: job.pay_currency,
    })
    .select("id")
    .single();

  if (templateError || !template) {
    console.error("[createTemplateFromJobAction] job_templates insert error:", templateError);
    return { error: "Impossibile salvare il template. Riprova." };
  }

  if (requirements && requirements.length > 0) {
    const { error: reqError } = await supabase.from("job_template_requirements").insert(
      requirements.map((r) => ({
        template_id: template.id,
        skill_id: r.skill_id,
        mandatory: r.mandatory,
      }))
    );
    if (reqError) {
      console.error("[createTemplateFromJobAction] job_template_requirements insert error:", reqError);
      return { error: "Template creato ma non è stato possibile salvare le competenze." };
    }
  }

  revalidatePath("/company/jobs/templates");
  return {};
}

export async function deleteTemplateAction(templateId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("job_templates").delete().eq("id", templateId);

  if (error) {
    console.error("[deleteTemplateAction] delete error:", error);
    return { error: "Impossibile eliminare il template." };
  }

  revalidatePath("/company/jobs/templates");
  return {};
}

export async function setJobBlinknowAction(jobId: string, enabled: boolean): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_job_blinknow", {
    p_job_id: jobId,
    p_enabled: enabled,
  });

  if (error) {
    console.error("[setJobBlinknowAction] error:", error);
    return { error: error.message.includes("not enabled")
      ? "BlinkNow non è ancora attivo per questa categoria di incarico."
      : error.message.includes("verified")
        ? "Solo le aziende verificate possono attivare BlinkNow."
        : "Impossibile aggiornare la modalità urgente." };
  }

  revalidatePath(`/company/jobs/${jobId}`);
  return {};
}
