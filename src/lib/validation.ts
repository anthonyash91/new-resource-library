import { z } from "zod";

export const resourceFiltersSchema = z.object({
  q: z.string().optional(),
  state: z.string().optional(),
  county: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  sort: z.enum(["name", "newest"]).default("name"),
});

export type ResourceFiltersInput = z.infer<typeof resourceFiltersSchema>;

export const PAGE_SIZE = 24;
