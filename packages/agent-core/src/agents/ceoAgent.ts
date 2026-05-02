import { z } from "zod";
import { sanitizeGoalInput } from "../llm/sanitize.js";
import { callLLM } from "../llm/router.js";
import type { LLMMessage } from "../llm/provider.js";
import { ceoPrompt } from "../prompts/ceoPrompt.js";
import { buildRagAugmentedMessages, type RagSearchClient } from "../rag.js";

const SubDirectiveSchema = z.object({
  assigned_role: z.enum(["ceo", "cfo", "manager", "worker"]),
  directive: z.string().min(1),
  deadline: z.string().datetime()
});

export const GoalStructureSchema = z.object({
  kpi: z.string().min(1),
  feasibility: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  sub_directives: z.array(SubDirectiveSchema).max(6),
  escalate: z.boolean().optional()
});

export interface OrgContext {
  organizationName?: string;
  departments: string[];
  currentRoleCapacity?: Record<string, number>;
}

export interface CEOAgentInput {
  rawGoal: string;
  deadline?: string;
  priority: string;
  orgContext: OrgContext;
  rag?: {
    orgId: string;
    searchClient: RagSearchClient;
    topK?: number;
    maxSnippetChars?: number;
  };
}

export type GoalStructure = z.infer<typeof GoalStructureSchema>;

export async function ceoAgent(input: CEOAgentInput): Promise<GoalStructure> {
  const sanitizedGoal = sanitizeGoalInput(input.rawGoal);
  const userPayload = {
    rawGoal: sanitizedGoal,
    deadline: input.deadline,
    priority: input.priority,
    orgContext: input.orgContext
  };

  let messages: LLMMessage[] = [
    { role: "system", content: `${ceoPrompt.system}\nSchema: ${JSON.stringify(ceoPrompt.schema)}` },
    { role: "user", content: JSON.stringify(userPayload) }
  ];

  if (input.rag) {
    const augmented = await buildRagAugmentedMessages(messages, input.rag.searchClient, {
      orgId: input.rag.orgId,
      query: input.rawGoal,
      topK: input.rag.topK ?? 4,
      maxSnippetChars: input.rag.maxSnippetChars ?? 400
    });
    messages = augmented.messages;
  }

  const response = await callLLM(messages, { temperature: 0.2, maxTokens: 1200 }, {
    agentType: "ceo_agent",
    action: "decompose"
  });

  const parsed = JSON.parse(response.content) as unknown;
  const validated = GoalStructureSchema.parse(parsed);

  if (validated.confidence < 0.6) {
    return {
      ...validated,
      escalate: true
    };
  }

  return {
    ...validated,
    escalate: validated.escalate ?? false
  };
}