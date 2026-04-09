import { z } from "zod";

const SourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  accessed: z.string().datetime()
});

export const ReportStatusSchema = z.enum(["completed", "partial", "blocked"]);

export const ReportSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  submitted_by: z.string().uuid().optional(),
  is_agent: z.boolean(),
  status: ReportStatusSchema,
  insight: z.string().min(10),
  data: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  sources: z.array(SourceSchema).optional(),
  escalate: z.boolean()
});

export type Report = z.infer<typeof ReportSchema>;
