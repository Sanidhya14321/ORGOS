import crypto from "node:crypto";
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
    branchId?: string | null;
    department?: string | null;
    docTypes?: string[];
    knowledgeScopes?: string[];
    sourceFormats?: string[];
    sourceTypes?: string[];
  };
}

const ManagerTaskArraySchema = z.array(TaskSchema).max(6);

const ManagerTaskEnvelopeSchema = z.object({
  tasks: z.array(z.record(z.any())).max(6)
});

function extractJsonPayload(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
      return JSON.parse(objectMatch[0]);
    }

    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch?.[0]) {
      return JSON.parse(arrayMatch[0]);
    }
  }

  throw new ValidationError("Manager agent returned invalid JSON");
}

function normalizeManagerTasks(raw: unknown, input: ManagerAgentInput): Task[] {
  const records = Array.isArray(raw)
    ? raw
    : ManagerTaskEnvelopeSchema.safeParse(raw).success
      ? ManagerTaskEnvelopeSchema.parse(raw).tasks
      : [];

  const normalized = records.map((task, index) => {
    const rawAssignedRole = typeof task.assigned_role === "string" ? task.assigned_role : "worker";
    const assignedRole = rawAssignedRole === "ceo" || rawAssignedRole === "cfo" || rawAssignedRole === "manager" || rawAssignedRole === "worker"
      ? rawAssignedRole
      : "worker";

    const rawDeadline = typeof task.deadline === "string" ? task.deadline : input.deadline;
    const deadline = rawDeadline && !Number.isNaN(Date.parse(rawDeadline))
      ? new Date(rawDeadline).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    return {
      id: crypto.randomUUID(),
      goal_id: input.goalId,
      parent_id: null,
      depth: Math.min(2, Math.max(1, Number(task.depth ?? 1))),
      title: typeof task.title === "string" && task.title.trim().length > 0
        ? task.title.trim()
        : `${input.department} work item ${index + 1}`,
      description: typeof task.description === "string" ? task.description : undefined,
      success_criteria: typeof task.success_criteria === "string" && task.success_criteria.trim().length > 0
        ? task.success_criteria.trim()
        : "Task is completed with documented evidence and communicated status.",
      assigned_to: null,
      assigned_role: assignedRole,
      is_agent_task: typeof task.is_agent_task === "boolean" ? task.is_agent_task : false,
      status: task.status === "in_progress" || task.status === "blocked" || task.status === "completed" || task.status === "cancelled"
        ? task.status
        : "pending",
      deadline
    } satisfies Task;
  });

  return ManagerTaskArraySchema.parse(normalized);
}

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

  const response = await callLLM(messages, { temperature: 0.2, maxTokens: 2000 }, {
    agentType: "manager_agent",
    action: "decompose",
    goalId: input.goalId
  });

  const parsed = extractJsonPayload(response.content);
  const tasks = normalizeManagerTasks(parsed, input);

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
