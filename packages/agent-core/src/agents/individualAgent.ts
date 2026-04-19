import { z } from "zod";
import { callLLM } from "../llm/router.js";
import { individualPrompt } from "../prompts/individualPrompt.js";

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
  const response = await callLLM(
    [
      { role: "system", content: `${individualPrompt.system}\nSchema: ${JSON.stringify(individualPrompt.schema)}` },
      {
        role: "user",
        content: JSON.stringify({
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
        })
      }
    ],
    { temperature: 0.1, maxTokens: 700 },
    {
      agentType: "worker_agent",
      action: "execute",
      taskId: input.taskId
    }
  );

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
