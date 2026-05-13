import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GroqProvider } from "@orgos/agent-core";
import { sendApiError } from "../lib/errors.js";

const HelpChatBodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  pathname: z.string().max(500).optional()
});

const HELP_SYSTEM = `You are ORGOS Help — short, accurate product guide for logged-in users.

Product map:
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

LLM stack: agent reasoning uses Groq on the server when GROQ_API_KEY is set; document vector/hybrid embeddings still require a separate embedding provider (OpenAI key) if you choose those retrieval modes — otherwise documents stay vectorless.

Rules: no secrets, no invented URLs beyond paths above, no legal/medical advice. If unknown, say you are unsure and suggest Settings or their org admin.`;

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

    const groq = new GroqProvider();
    try {
      const result = await groq.complete(
        [
          { role: "system", content: HELP_SYSTEM },
          { role: "user", content: userContent }
        ],
        { temperature: 0.25, maxTokens: 900 }
      );
      return reply.send({ reply: result.content.trim() });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Groq request failed";
      return sendApiError(reply, request, 502, "INTERNAL_ERROR", msg);
    }
  });
};

export default helpRoutes;
