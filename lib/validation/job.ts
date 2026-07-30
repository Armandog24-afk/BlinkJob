import { z } from "zod";

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "ID non valido");

export const jobSchema = z
  .object({
    title: z.string().trim().min(3, "Titolo richiesto").max(150),
    description: z.string().trim().min(10, "Descrizione richiesta (min. 10 caratteri)").max(4000),
    category: z.string().trim().min(2, "Categoria richiesta").max(80),
    locationId: uuidLike,
    positionsCount: z.coerce.number().int().min(1).max(500),
    payAmountCents: z.coerce.number().int().min(100, "Compenso minimo 1€"),
    startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data/ora inizio non valida"),
    endsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data/ora fine non valida"),
    applicationDeadline: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Scadenza candidature non valida"),
    mandatorySkillIds: z.array(uuidLike).default([]),
    preferredSkillIds: z.array(uuidLike).default([]),
    maxDistanceKm: z.coerce.number().positive().max(500).optional(),
    recurrence: z.enum(["none", "weekly"]).default("none"),
    occurrences: z.coerce.number().int().min(2).max(12).optional(),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: "L'orario di fine deve essere dopo l'inizio",
    path: ["endsAt"],
  })
  .refine((data) => new Date(data.applicationDeadline) <= new Date(data.startsAt), {
    message: "La scadenza candidature deve precedere l'inizio incarico",
    path: ["applicationDeadline"],
  })
  .refine((data) => data.recurrence === "none" || data.occurrences != null, {
    message: "Indica il numero di ripetizioni",
    path: ["occurrences"],
  });
export type JobInput = z.infer<typeof jobSchema>;
