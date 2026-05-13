/**
 * Onboarding Routes
 * CEO onboarding flow: company setup, position import, org structure suggestion, credentials export
 */

import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sendApiError } from "../lib/errors.js";
import {
  OrgStructureSuggestionRequestSchema,
  ApplyStructureSuggestionSchema,
  OnboardingPositionImportSchema,
  OnboardingPositionParsePreviewRequestSchema,
  OnboardingPositionParsePreviewResponseSchema
} from "@orgos/shared-types";
import {
  createPositionCredentials,
  ensurePositionAssignment,
  exportOrgCredentials,
  resetPositionCredentials
} from "../services/credentialService.js";
import { parsePositionImportPreview } from "../services/positionImportParser.js";

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

function slugify(input: string): string {
  const value = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return value || "orgos";
}

async function readUploadedFile(
  request: FastifyRequest
): Promise<{
  fileName: string;
  mimeType: string | null;
  buffer: Buffer;
  fields: Record<string, string>;
} | null> {
  const multipartRequest = request as typeof request & {
    isMultipart?: () => boolean;
    parts?: () => AsyncIterable<{
      type?: string;
      fieldname?: string;
      value?: unknown;
      filename?: string;
      mimetype?: string;
      toBuffer?: () => Promise<Buffer>;
    }>;
  };

  if (typeof multipartRequest.isMultipart !== "function" || !multipartRequest.isMultipart()) {
    return null;
  }

  const fields: Record<string, string> = {};
  let fileName = "";
  let mimeType: string | null = null;
  let buffer: Buffer | null = null;

  if (typeof multipartRequest.parts !== "function") {
    return null;
  }

  for await (const part of multipartRequest.parts()) {
    if (part.type === "file") {
      fileName = part.filename ?? "";
      mimeType = part.mimetype ?? null;
      buffer = part.toBuffer ? await part.toBuffer() : Buffer.alloc(0);
      continue;
    }

    if (part.fieldname) {
      fields[part.fieldname] = typeof part.value === "string" ? part.value : String(part.value ?? "");
    }
  }

  if (!fileName || !buffer) {
    return null;
  }

  return { fileName, mimeType, buffer, fields };
}

function derivePowerLevel(level: number): number {
  if (level <= 0) {
    return 100;
  }
  if (level === 1) {
    return 80;
  }
  if (level === 2) {
    return 60;
  }
  if (level === 3) {
    return 40;
  }
  return 20;
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

  fastify.post("/onboarding/positions/parse-preview", async (request, reply) => {
    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can parse position files");
    }

    const uploaded = await readUploadedFile(request);
    let orgId = "";
    let fileName = "";
    let mimeType: string | null = null;
    let buffer = Buffer.alloc(0);

    if (uploaded) {
      orgId = uploaded.fields.org_id ?? "";
      fileName = uploaded.fileName;
      mimeType = uploaded.mimeType;
      buffer = Buffer.from(uploaded.buffer);
    } else {
      const parsed = OnboardingPositionParsePreviewRequestSchema.safeParse((request as { body?: unknown }).body);
      if (!parsed.success) {
        return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid position parse payload", {
          details: parsed.error.flatten()
        });
      }
      orgId = parsed.data.org_id;
      fileName = parsed.data.file_name;
      mimeType = parsed.data.mime_type ?? null;
      buffer = Buffer.from(parsed.data.file_content_base64, "base64");
    }

    const ownsOrg = await ensureOwnedOrg(orgId, request.user.id);
    if (!ownsOrg) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found or not owned by you");
    }

    const preview = await parsePositionImportPreview({
      buffer,
      fileName,
      mimeType
    });

    if (preview.positions.length === 0) {
      return sendApiError(reply, request, 422, "VALIDATION_ERROR", "No positions could be parsed from the uploaded file", {
        warnings: preview.warnings
      });
    }

    const validated = OnboardingPositionParsePreviewResponseSchema.parse(preview);
    return reply.send(validated);
  });

  /**
   * POST /onboarding/positions/import
   * CEO imports positions via CSV or manual entry
   */
  fastify.post("/onboarding/positions/import", async (request, reply) => {
    const parsed = OnboardingPositionImportSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid import payload", {
        details: parsed.error.flatten()
      });
    }

    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can import positions");
    }

    const { org_id, branches, positions, import_source } = parsed.data;

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

    const domain = (org.domain || `${slugify(org.name)}.orgos.ai`).toLowerCase();
    const createdPositions: string[] = [];
    const credentials: Array<Record<string, unknown>> = [];
    const branchIdByCode = new Map<string, string>();
    const positionIdsByTitle = new Map<string, string>();

    if (branches.length > 0) {
      for (const branch of branches) {
        const branchInsert = await fastify.supabaseService
          .from("org_branches")
          .upsert({
            org_id,
            name: branch.name,
            code: branch.code,
            city: branch.city ?? null,
            country: branch.country ?? null,
            timezone: branch.timezone ?? "UTC",
            is_headquarters: branch.is_headquarters,
            updated_at: new Date().toISOString()
          }, { onConflict: "org_id,code" })
          .select("id, code")
          .single();

        if (branchInsert.error || !branchInsert.data) {
          return sendApiError(reply, request, 500, "INTERNAL_ERROR", `Failed to create branch ${branch.name}`);
        }

        branchIdByCode.set(String(branchInsert.data.code), String(branchInsert.data.id));
      }
    }

    for (const pos of positions) {
      const branchId = pos.branch_code ? branchIdByCode.get(pos.branch_code) ?? null : null;
      const { data: position, error: posError } = await fastify.supabaseService
        .from("positions")
        .insert({
          org_id,
          branch_id: branchId,
          title: pos.title,
          department: pos.department ?? null,
          level: pos.level,
          power_level: pos.power_level ?? derivePowerLevel(pos.level),
          visibility_scope: pos.visibility_scope,
          max_concurrent_tasks: pos.max_concurrent_tasks ?? 10,
          compensation_band: pos.compensation_band ?? {},
          is_custom: true,
          confirmed: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (posError || !position) {
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", `Failed to create position ${pos.title}`);
      }

      createdPositions.push(position.id);
      positionIdsByTitle.set(pos.title.toLowerCase(), position.id);

      await ensurePositionAssignment(fastify.supabaseService, {
        orgId: org_id,
        positionId: position.id,
        branchId,
        inviteEmail: pos.invite_email ?? `${pos.email_prefix}@${domain}`,
        seatLabel: pos.seat_label ?? pos.title,
        assignmentStatus: "invited",
        activationState: "pending",
        invitedBy: request.user.id
      });

      const email = `${pos.email_prefix}@${domain}`;
      const cred = await createPositionCredentials(fastify.supabaseService, org_id, position.id, email, {
        ...(pos.invite_email ? { inviteEmail: pos.invite_email } : {}),
        issueMode: pos.issue_mode,
        invitationBaseUrl: fastify.env.WEB_ORIGIN
      });
      credentials.push({
        position_id: position.id,
        position_title: pos.title,
        email: cred.email,
        plaintext_password: cred.plaintext_password,
        invite_code: cred.invite_code,
        invitation_url: cred.invitation_url,
        issued_mode: cred.issued_mode
      });
    }

    for (const pos of positions) {
      if (!pos.reports_to_title) {
        continue;
      }
      const childId = positionIdsByTitle.get(pos.title.toLowerCase());
      const parentId = positionIdsByTitle.get(pos.reports_to_title.toLowerCase());
      if (!childId || !parentId) {
        continue;
      }
      await fastify.supabaseService
        .from("positions")
        .update({ reports_to_position_id: parentId, updated_at: new Date().toISOString() })
        .eq("id", childId);
    }

    return reply.send({
      import_source,
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

  fastify.get("/onboarding/org/:org_id/team-directory", async (request, reply) => {
    const { org_id } = request.params as { org_id: string };

    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can view the team directory access sheet");
    }

    const ownsOrg = await ensureOwnedOrg(org_id, request.user.id);
    if (!ownsOrg) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found");
    }

    const positions = await exportOrgCredentials(fastify.supabaseService, org_id);
    return reply.send({ items: positions });
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

    const result = await resetPositionCredentials(fastify.supabaseService, org_id, position_id, {
      invitationBaseUrl: fastify.env.WEB_ORIGIN
    });

    return reply.send({
      plaintext_password: result.plaintext_password,
      email: result.email,
      invite_code: result.invite_code,
      invitation_url: result.invitation_url,
      message: "Access reset. Share the invite link or temporary password with the employee."
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
      "Position Title,Login Email,Invite Code,Invite URL,Activation Status,Password Reset Required,Level",
      ...positions.map((p) => [
        `"${p.position_title}"`,
        `"${p.email ?? ""}"`,
        `"${p.invite_code ?? ""}"`,
        `"${p.invitation_url ?? ""}"`,
        `"${p.activation_status ?? p.activation_state}"`,
        p.force_password_change ? "yes" : "no",
        p.level
      ].join(","))
    ];
    const csv = csvLines.join("\n");

    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", `attachment; filename="orgos-credentials-${org_id}.csv"`);
    return reply.send(csv);
  });
};

export default onboardingRoutes;
