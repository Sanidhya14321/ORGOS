import { z } from "zod";

export const PositionLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const PositionSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  level: PositionLevelSchema,
  is_custom: z.boolean().default(false),
  confirmed: z.boolean().default(false),
  created_at: z.string().datetime().optional()
});

export type Position = z.infer<typeof PositionSchema>;
