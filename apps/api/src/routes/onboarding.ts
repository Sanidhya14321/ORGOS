/**
 * Onboarding Routes
 * CEO onboarding flow: company setup, position import, org structure suggestion, credentials export
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors.js";
import {
  OrgStructureSuggestionRequestSchema,
  ApplyStructureSuggestionSchema,
  DocumentUploadRequestSchema
} from "@orgos/shared-types";
import {
  createPositionCredentials,
  exportOrgCredentials,
  resetPositionCredentials
} from "../services/credentialService.js";
import {
  getOrgDocuments,
  archiveDocument,
  indexDocument
} from "../services/ragRetrieval.js";

/**
 * Suggested org structure configurations
 */
const ORG_STRUCTURE_CONFIG: Record<
  string,
  {
    kind: string;
    reason: string;
    defaultHierarchy: Array<{ title: string; level: number; count: number }>;
  }
> = {
  flat: {
    kind: "flat",
    reason: "Startup with <15 people. All employees report to CEO for rapid decision-making.",
    defaultHierarchy: [
      { title: "CEO", level: 0, count: 1 },
      { title: "Individual Contributor", level: 1, count: 10 }
    ]
  },
  functional: {
    kind: "functional",
    reason: "Mid-size company. Organized by department with department heads reporting to CEO.",
    defaultHierarchy: [
      { title: "CEO", level: 0, count: 1 },
      { title: "Department Head", level: 1, count: 3 },
      { title: "Team Lead", level: 2, count: 6 },
      { title: "Individual Contributor", level: 3, count: 15 }
    ]
  },
  divisional: {
    kind: "divisional",
    reason: "Enterprise or multi-product. Organized by division/product with clear P&L ownership.",
    defaultHierarchy: [
      { title: "CEO", level: 0, count: 1 },
      { title: "Division Head", level: 1, count: 2 },
      { title: "Department Head", level: 2, count: 4 },
      { title: "Manager", level: 3, count: 8 },
      { title: "Individual Contributor", level: 4, count: 20 }
    ]
  },
  hierarchical: {
    kind: "hierarchical",
    reason: "Enterprise standard. Clear hierarchy with multiple management levels.",
    defaultHierarchy: [
      { title: "CEO", level: 0, count: 1 },
      { title: "VP", level: 1, count: 2 },
      { title: "Senior Manager", level: 2, count: 4 },
      { title: "Manager", level: 3, count: 8 },
      { title: "Team Lead", level: 4, count: 12 },
      { title: "Individual Contributor", level: 5, count: 25 }
    ]
  }
};

/**
 * Suggest org structure based on company size and position count
 */
function suggestOrgStructure(
  companySize: string,
  positionCount: number,
  branchCount: number,
  departmentCount: number
): {
  kind: string;
  reason: string;
  positionAssignments: Array<{ position_title: string; suggested_level: number; suggested_reports_to: string | null; rationale: string }>;
  confidence: number;
} {
  let suggested = "hierarchical";
  let confidence = 0.7;

  if (companySize === "startup" && positionCount < 15) {
    suggested = "flat";
    confidence = 0.95;
  } else if (companySize === "startup" || positionCount < 30) {
    suggested = "functional";
    confidence = 0.85;
  } else if (branchCount > 2 || departmentCount > 4) {
    suggested = "divisional";
    confidence = 0.8;
  }

  const config = ORG_STRUCTURE_CONFIG[suggested as keyof typeof ORG_STRUCTURE_CONFIG];

  if (!config) {
    return {
      kind: "hierarchical",
      reason: "Default hierarchical structure",
      positionAssignments: [],
      confidence: 0.7
    };
  }

  return {
    kind: config.kind,
    reason: config.reason,
    positionAssignments: config.defaultHierarchy.map((h) => ({
      position_title: h.title,
      suggested_level: h.level,
      suggested_reports_to: h.level === 0 ? null : `Level ${h.level - 1} position`,
      rationale: `${h.title} at level ${h.level} in ${config.kind} structure`
    })),
    confidence
  };
}

const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
  async function ensureOwnedOrg(orgId: string, ownerId: string): Promise<boolean> {
    const { data: org, error } = await fastify.supabaseService
      .from("orgs")
      .select("id")
      .eq("id", orgId)
      .eq("created_by", ownerId)
      .maybeSingle();

    return !error && Boolean(org?.id);
  }

  /**
   * POST /onboarding/structure-suggestion
   * Suggest org structure based on company size/position count
   */
  fastify.post("/onboarding/structure-suggestion", async (request, reply) => {
    const parsed = OrgStructureSuggestionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid structure suggestion payload", {
        details: parsed.error.flatten()
      });
    }

    const { org_id, company_size, position_count, branch_count, department_count } = parsed.data;

    // Verify CEO owns this org
    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can request structure suggestions");
    }

    const ownsOrg = await ensureOwnedOrg(org_id, request.user.id);
    if (!ownsOrg) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found or not owned by you");
    }

    // Generate suggestion
    const suggestion = suggestOrgStructure(company_size, position_count, branch_count, department_count);

    // Store suggestion in DB
    const { data: stored, error: storeError } = await fastify.supabaseService
      .from("org_structure_suggestions")
      .insert({
        org_id,
        company_size,
        position_count,
        branch_count,
        department_count,
        suggested_kind: suggestion.kind,
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        position_assignments: suggestion.positionAssignments,
        ceo_reviewed: false,
        ceo_approved: false,
        applied: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (storeError) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", `Failed to store suggestion: ${storeError.message}`);
    }

    return reply.send({
      suggestion_id: stored.id,
      ...suggestion
    });
  });

  /**
   * POST /onboarding/apply-structure-suggestion
   * CEO applies suggested structure to their org
   */
  fastify.post("/onboarding/apply-structure-suggestion", async (request, reply) => {
    const parsed = ApplyStructureSuggestionSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid apply payload", {
        details: parsed.error.flatten()
      });
    }

    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can apply suggestions");
    }

    const { org_id, suggestion_id } = parsed.data;

    const ownsOrg = await ensureOwnedOrg(org_id, request.user.id);
    if (!ownsOrg) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found");
    }

    // Update suggestion status
    const { error: updateError } = await fastify.supabaseService
      .from("org_structure_suggestions")
      .update({
        ceo_reviewed: true,
        ceo_approved: true,
        ceo_approved_at: new Date().toISOString(),
        applied: true,
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", suggestion_id)
      .eq("org_id", org_id);

    if (updateError) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to apply suggestion");
    }

    return reply.status(204).send();
  });

  /**
   * POST /onboarding/positions/import
   * CEO imports positions via CSV or manual entry
   */
  fastify.post("/onboarding/positions/import", async (request, reply) => {
    const bodySchema = z.object({
      org_id: z.string().uuid(),
      positions: z.array(
        z.object({
          title: z.string().min(1).max(100),
          department: z.string().optional(),
          level: z.number().int().min(0).max(5),
          email_prefix: z.string().min(1), // e.g., "engineer-1"
          auto_generate_credentials: z.boolean().default(true)
        })
      )
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid import payload", {
        details: parsed.error.flatten()
      });
    }

    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can import positions");
    }

    const { org_id, positions } = parsed.data;

    // Get org domain for email generation
    const { data: org, error: orgError } = await fastify.supabaseService
      .from("orgs")
      .select("id, domain, name")
      .eq("id", org_id)
      .eq("created_by", request.user.id)
      .maybeSingle();

    if (orgError || !org) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found");
    }

    const domain = org.domain || "orgos.ai";
    const createdPositions = [];
    const credentials = [];

    for (const pos of positions) {
      // Create position
      const { data: position, error: posError } = await fastify.supabaseService
        .from("positions")
        .insert({
          org_id,
          name: pos.title,
          slug: pos.title.toLowerCase().replace(/\s+/g, "-"),
          level: pos.level,
          department: pos.department,
          power_level: Math.max(0, 100 - pos.level * 10),
          created_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (posError || !position) {
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", `Failed to create position ${pos.title}`);
      }

      createdPositions.push(position.id);

      // Generate credentials if requested
      if (pos.auto_generate_credentials) {
        const email = `${pos.email_prefix}@${domain}`;
        const cred = await createPositionCredentials(fastify.supabaseService, org_id, position.id, email);
        credentials.push({
          position_id: position.id,
          position_title: pos.title,
          email: cred.email,
          plaintext_password: cred.plaintext_password
        });
      }
    }

    return reply.send({
      created_positions: createdPositions.length,
      credentials
    });
  });

  /**
   * GET /onboarding/org/:org_id/positions-with-credentials
   * CEO views all positions with credential status
   */
  fastify.get("/onboarding/org/:org_id/positions-with-credentials", async (request, reply) => {
    const { org_id } = request.params as { org_id: string };

    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can view credentials");
    }

    // Verify ownership
    const ownsOrg = await ensureOwnedOrg(org_id, request.user.id);
    if (!ownsOrg) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found");
    }

    const positions = await exportOrgCredentials(fastify.supabaseService, org_id);

    return reply.send({ positions });
  });

  /**
   * POST /onboarding/org/:org_id/positions/:position_id/reset-password
   * CEO resets credentials for a position
   */
  fastify.post("/onboarding/org/:org_id/positions/:position_id/reset-password", async (request, reply) => {
    const { org_id, position_id } = request.params as { org_id: string; position_id: string };

    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can reset passwords");
    }

    const ownsOrg = await ensureOwnedOrg(org_id, request.user.id);
    if (!ownsOrg) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found");
    }

    const result = await resetPositionCredentials(fastify.supabaseService, org_id, position_id);

    return reply.send({
      plaintext_password: result.plaintext_password,
      email: result.email,
      message: "Password reset. Share the new password with the employee. They must change it on first login."
    });
  });

  /**
   * GET /onboarding/org/:org_id/export-credentials
   * CEO exports all credentials as CSV (plaintext passwords shown once)
   */
  fastify.get("/onboarding/org/:org_id/export-credentials", async (request, reply) => {
    const { org_id } = request.params as { org_id: string };

    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can export credentials");
    }

    // Verify ownership
    const { data: org, error: orgError } = await fastify.supabaseService
      .from("orgs")
      .select("name")
      .eq("id", org_id)
      .eq("created_by", request.user.id)
      .maybeSingle();

    if (orgError || !org) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found");
    }

    const positions = await exportOrgCredentials(fastify.supabaseService, org_id);

    // Build CSV
    const csvLines = [
      "Position Title,Email,Password Reset Required,Level",
      ...positions.map((p) => `"${p.position_title}","${p.email}",${p.force_password_change ? "yes" : "no"},${p.level}`)
    ];
    const csv = csvLines.join("\n");

    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", `attachment; filename="orgos-credentials-${org_id}.csv"`);
    return reply.send(csv);
  });
};

export default onboardingRoutes;
