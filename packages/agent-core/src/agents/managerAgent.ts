import { TaskSchema, type Task } from "@orgos/shared-types";
import { z } from "zod";
import { managerPrompt } from "../prompts/managerPrompt.js";
import { ValidationError } from "../llm/errors.js";
import { callLLM } from "../llm/router.js";
import type { LLMMessage } from "../llm/provider.js";
import { buildRagAugmentedMessages, type RagSearchClient } from "../rag.js";

export interface ManagerAgentInput {
  directive: string;
  department: string;
  existingTasks: Task[];
  deadline: string;
  goalId: string;
  rag?: {
    orgId: string;
    searchClient: RagSearchClient;
    topK?: number;
    maxSnippetChars?: number;
  };
}

const ManagerTaskArraySchema = z.array(TaskSchema).max(6);

export async function managerAgent(input: ManagerAgentInput): Promise<Task[]> {
  const userPayload = {
    directive: input.directive,
    department: input.department,
    deadline: input.deadline,
    existingTasks: input.existingTasks
  };

  let messages: LLMMessage[] = [
    { role: "system", content: `${managerPrompt.system}\nSchema: ${JSON.stringify(managerPrompt.schema)}` },
    { role: "user", content: JSON.stringify(userPayload) }
  ];

  if (input.rag) {
    const query = [input.directive, input.department, input.existingTasks.map((task) => task.title).join(" ")]
      .filter(Boolean)
      .join(" ");
    const augmented = await buildRagAugmentedMessages(messages, input.rag.searchClient, {
      orgId: input.rag.orgId,
      query,
      topK: input.rag.topK ?? 4,
      maxSnippetChars: input.rag.maxSnippetChars ?? 400
    });
    messages = augmented.messages;
  }

  const response = await callLLM(messages, { temperature: 0.2, maxTokens: 2000 }, {
    agentType: "manager_agent",
    action: "decompose",
    goalId: input.goalId
  });

  const parsed = JSON.parse(response.content) as unknown;
  const tasks = ManagerTaskArraySchema.parse(parsed);

  if (tasks.length > 6) {
    throw new ValidationError("Manager agent produced more than 6 tasks");
  }

  for (const task of tasks) {
    if (task.depth > 2) {
      throw new ValidationError("Manager agent produced task depth greater than 2");
    }
  }

  return tasks;
}
