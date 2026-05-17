import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GroqProvider, injectRagContext, type LLMMessage } from "@orgos/agent-core";
import { sendApiError } from "../lib/errors.js";
import { RAG_HELP_TOP_SECTIONS } from "../services/ragConfig.js";
import { buildRAGContext, retrieveHelpKnowledgeSections } from "../services/ragRetrieval.js";

function looksLikeCompanyKnowledgeQuery(message: string): boolean {
  return /\b(handbook|policy|policies|rere|pto|leave|employee|benefits|remote|vacation|code of conduct)\b/i.test(
    message
  );
}

const HelpChatBodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  pathname: z.string().max(500).optional()
});

const HELP_SYSTEM = `You are ORGOS Help — short, accurate guide for logged-in users.

When reference material from the company knowledge base appears in a separate message below, you MUST answer from that material (summarize key points in bullets). Mention section headings when helpful. Never say you are unsure about a handbook or tell the user to ask their org admin when that material is present.

Product map (when knowledge base has no relevant excerpt):
- Task board: primary execution; workers live here most.
- Goals & OKRs: executives track outcomes; goals decompose into tasks.
- Org tree: reporting lines and position hierarchy.
- Collaboration Hub: threads and seat access.
- Power control: CEO/CFO/manager adjust subordinate authority where permitted.
- Recruitment: jobs and applicants (role-gated).
- Knowledge base (CEO): upload company handbooks/policies for agent retrieval — not the same as importing org positions from a roster file.
- Import positions (CEO): /dashboard/positions-import — upload CSV, XLSX, DOCX, or PDF; parser needs a readable table (title column or pipe-separated table in extracted text). Branches optional in same file.
- Onboarding wizard: /onboarding for initial company setup.
- CEO control: executive dashboards.

LLM stack: agent reasoning uses Groq on the server when GROQ_API_KEY is set; document vector/hybrid embeddings still require a separate embedding provider (OpenAI key) if you choose those retrieval modes — otherwise documents stay vectorless (section keyword search).

Rules: no secrets, no invented URLs beyond paths above, no legal/medical advice. If unknown and no knowledge excerpt applies, say you are unsure and suggest their org admin.`;

const rateBuckets = new Map<string, number[]>();

function allowHelpRequest(userId: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const prev = rateBuckets.get(userId) ?? [];
  const recent = prev.filter((t) => now - t < windowMs);
  if (recent.length >= maxPerMinute) {
    return false;
  }
  recent.push(now);
  rateBuckets.set(userId, recent);
  return true;
}

const helpRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/help/chat", async (request, reply) => {
    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Authentication required");
    }

    if (!allowHelpRequest(request.user.id, 20)) {
      return sendApiError(reply, request, 429, "RATE_LIMITED", "Too many help requests; wait a minute and try again");
    }

    const parsed = HelpChatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid help chat payload", {
        details: parsed.error.flatten()
      });
    }

    if (!process.env.GROQ_API_KEY?.trim()) {
      return sendApiError(
        reply,
        request,
        503,
        "SERVICE_UNAVAILABLE",
        "Help assistant disabled: set GROQ_API_KEY on the API server"
      );
    }

    const { message, pathname } = parsed.data;
    const userContent = pathname?.trim() ? `[Current app path: ${pathname}]\n\n${message}` : message;

    let messages: LLMMessage[] = [
      { role: "system", content: HELP_SYSTEM },
      { role: "user", content: userContent }
    ];

    let orgId = request.userOrgId;
    if (!orgId) {
      const { data: profile } = await fastify.supabaseService
        .from("users")
        .select("org_id")
        .eq("id", request.user.id)
        .maybeSingle();
      orgId = (profile?.org_id as string | null | undefined) ?? null;
    }

    if (orgId) {
      try {
        const sections = await retrieveHelpKnowledgeSections(
          fastify.supabaseService,
          orgId,
          message,
          RAG_HELP_TOP_SECTIONS
        );
        if (sections.length > 0) {
          const { contextInstruction } = buildRAGContext(message, sections);
          messages = injectRagContext(messages, contextInstruction);
          request.log.info({ orgId, sectionCount: sections.length }, "Help chat attached knowledge sections");
        } else if (looksLikeCompanyKnowledgeQuery(message)) {
          return reply.send({
            reply:
              "No matching excerpts found in your organization's knowledge base for that question. If you are the CEO, open Knowledge base and confirm the handbook shows as indexed with sections. Otherwise ask your org admin, or try keywords from the document file name (for example \"RERE\")."
          });
        } else {
          request.log.info({ orgId, query: message }, "Help chat found no knowledge sections for org");
        }
      } catch (error) {
        request.log.warn({ err: error }, "Help chat knowledge retrieval failed; continuing without RAG");
      }
    } else {
      request.log.info({ userId: request.user.id }, "Help chat skipped RAG: user has no org_id");
    }

    const groq = new GroqProvider();
    try {
      const result = await groq.complete(messages, { temperature: 0.25, maxTokens: 900 });
      return reply.send({ reply: result.content.trim() });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Groq request failed";
      return sendApiError(reply, request, 502, "INTERNAL_ERROR", msg);
    }
  });
};

export default helpRoutes;
