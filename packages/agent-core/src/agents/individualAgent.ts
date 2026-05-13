import { z } from "zod";
import { callLLM } from "../llm/router.js";
import type { LLMMessage } from "../llm/provider.js";
import { individualPrompt } from "../prompts/individualPrompt.js";
import { buildRagAugmentedMessages, type RagSearchClient } from "../rag.js";

const IndividualAgentOutputSchema = z.object({
  acknowledged: z.boolean(),
  eta_hours: z.number().min(0).max(500),
  questions: z.array(z.string().trim().min(1).max(300)).max(10),
  confidence: z.number().min(0).max(1)
});

export interface IndividualAgentInput {
  taskId: string;
  title: string;
  description?: string | null;
  successCriteria: string;
  assigneeSkills: string[];
  deadline?: string | null;
  parentContext?: string;
  rag?: {
    orgId: string;
    searchClient: RagSearchClient;
    topK?: number;
    maxSnippetChars?: number;
    branchId?: string | null;
    department?: string | null;
    docTypes?: string[];
    knowledgeScopes?: string[];
    sourceFormats?: string[];
    sourceTypes?: string[];
  };
}

export type IndividualAgentOutput = z.infer<typeof IndividualAgentOutputSchema>;

function safeJsonParse(raw: string): unknown {
  const trimmed = raw.trim();
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim()
    : trimmed;
  return JSON.parse(withoutFence);
}

export async function individualAgent(input: IndividualAgentInput): Promise<IndividualAgentOutput> {
  const userPayload = {
    task: {
      id: input.taskId,
      title: input.title,
      description: input.description ?? null,
      success_criteria: input.successCriteria,
      deadline: input.deadline ?? null
    },
    assignee: {
      skills: input.assigneeSkills
    },
    parentContext: input.parentContext ?? null
  };

  let messages: LLMMessage[] = [
    { role: "system", content: `${individualPrompt.system}\nSchema: ${JSON.stringify(individualPrompt.schema)}` },
    { role: "user", content: JSON.stringify(userPayload) }
  ];

  if (input.rag) {
    const query = [input.title, input.description ?? "", input.successCriteria, input.parentContext ?? ""]
      .filter(Boolean)
      .join(" ");
    const augmented = await buildRagAugmentedMessages(messages, input.rag.searchClient, {
      orgId: input.rag.orgId,
      query,
      topK: input.rag.topK ?? 4,
      maxSnippetChars: input.rag.maxSnippetChars ?? 400,
      branchId: input.rag.branchId,
      department: input.rag.department,
      docTypes: input.rag.docTypes,
      knowledgeScopes: input.rag.knowledgeScopes,
      sourceFormats: input.rag.sourceFormats,
      sourceTypes: input.rag.sourceTypes
    });
    messages = augmented.messages;
  }

  const response = await callLLM(messages, { temperature: 0.1, maxTokens: 700 }, {
    agentType: "worker_agent",
    action: "execute",
    taskId: input.taskId
  });

  const parsed = safeJsonParse(response.content);
  const validated = IndividualAgentOutputSchema.parse(parsed);

  if (validated.questions.length > 0 && validated.confidence > 0.8) {
    return {
      ...validated,
      confidence: 0.8
    };
  }

  return validated;
}