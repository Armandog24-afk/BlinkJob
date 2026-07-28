import { z } from "zod";

// Postgres `uuid` only requires the 128-bit hex-with-dashes shape, not RFC4122 version/variant
// bits — zod's built-in `.uuid()` is stricter and rejects seed values like
// `00000000-0000-0000-0000-000000000101`, so a plain shape check is used instead.
const uuidLike = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "ID non valido");

export const workerOnboardingSchema = z.object({
  birthDate: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Data di nascita non valida"),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  operatingRadiusKm: z.coerce.number().min(1).max(200),
  skillIds: z
    .array(uuidLike)
    .min(1, "Seleziona almeno una competenza"),
  availabilityDays: z
    .array(z.coerce.number().int().min(0).max(6))
    .min(1, "Seleziona almeno un giorno di disponibilità"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Orario non valido"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Orario non valido"),
}).refine((data) => data.endTime > data.startTime, {
  message: "L'orario di fine deve essere dopo l'orario di inizio",
  path: ["endTime"],
});
export type WorkerOnboardingInput = z.infer<typeof workerOnboardingSchema>;
