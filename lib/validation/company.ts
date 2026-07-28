import { z } from "zod";

export const companyOnboardingSchema = z.object({
  legalName: z.string().trim().min(2, "Ragione sociale richiesta").max(200),
  vatNumber: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type CompanyOnboardingInput = z.infer<typeof companyOnboardingSchema>;
