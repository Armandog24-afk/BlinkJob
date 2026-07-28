import { z } from "zod";

export const companyLocationSchema = z.object({
  label: z.string().trim().min(2, "Etichetta richiesta (es. Sede centrale)").max(120),
  address: z.string().trim().min(5, "Indirizzo richiesto").max(300),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type CompanyLocationInput = z.infer<typeof companyLocationSchema>;

export const teamInviteSchema = z.object({
  email: z.string().trim().email("Email non valida"),
});
export type TeamInviteInput = z.infer<typeof teamInviteSchema>;
