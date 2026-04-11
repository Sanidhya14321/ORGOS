import { z } from "zod";

export const OrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  domain: z.string().min(1).optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional()
});

export const OrgSearchResultSchema = OrgSchema.pick({
  id: true,
  name: true,
  domain: true
});

export type Org = z.infer<typeof OrgSchema>;
export type OrgSearchResult = z.infer<typeof OrgSearchResultSchema>;
