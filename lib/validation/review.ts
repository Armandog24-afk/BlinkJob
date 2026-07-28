import { z } from "zod";

export const reviewSchema = z.object({
  overall: z.coerce.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type ReviewInput = z.infer<typeof reviewSchema>;
