import { z } from "zod";

export const accountKindSchema = z.enum(["worker", "company"]);
export type AccountKind = z.infer<typeof accountKindSchema>;

export const registerSchema = z.object({
  accountKind: accountKindSchema,
  fullName: z.string().trim().min(2, "Inserisci nome e cognome").max(120),
  email: z.string().trim().email("Email non valida"),
  password: z.string().min(8, "Minimo 8 caratteri"),
  acceptedTerms: z.literal(true, {
    error: "Devi accettare i termini e l'informativa privacy",
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("Email non valida"),
  password: z.string().min(1, "Password richiesta"),
});
export type LoginInput = z.infer<typeof loginSchema>;
