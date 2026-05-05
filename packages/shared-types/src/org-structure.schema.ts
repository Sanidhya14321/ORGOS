import { z } from "zod";

/**
 * Supported organization structure kinds used across the platform
 */
export const OrgStructureKindSchema = z.enum([
  "hierarchical",
  "functional",
  "flat",
  "divisional",
  "matrix",
  "team",
  "network",
  "process",
  "circular",
  "line",
]);

export type OrgStructureKind = z.infer<typeof OrgStructureKindSchema>;

export default OrgStructureKindSchema;
