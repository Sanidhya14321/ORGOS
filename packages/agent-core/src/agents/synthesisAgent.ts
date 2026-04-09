import { z } from "zod";
import { callLLM } from "../llm/router.js";

export interface SynthesisTaskRef {
  id: string;
  title: string;
  success_criteria: string;
}

export interface SynthesisReportInput {
  parentTask: SynthesisTaskRef;
  childReports: Array<{
    id: string;
    task_id: string;
    insight: string;
    data: Record<string, unknown>;
    confidence: number;
    escalate: boolean;
  }>;
  goalContext: string;
}

export const SynthesisReportSchema = z.object({
  summary: z.string().min(1),
  key_findings: z.array(z.string()),
  contradictions: z.array(z.string()),
  recommended_action: z.string().min(1),
  overall_confidence: z.number().min(0).max(1),
  flagged_items: z.array(z.string())
});

export type SynthesisReport = z.infer<typeof SynthesisReportSchema>;

function estimateDataWeight(data: Record<string, unknown>): number {
  const size = JSON.stringify(data).length;
  return Math.max(1, Math.min(size, 5000));
}

function weightedConfidence(input: SynthesisReportInput): number {
  if (input.childReports.length === 0) {
    return 0;
  }

  const weighted = input.childReports.map((report) => ({
    weight: estimateDataWeight(report.data),
    confidence: report.confidence
  }));

  const numerator = weighted.reduce((sum, item) => sum + item.weight * item.confidence, 0);
  const denominator = weighted.reduce((sum, item) => sum + item.weight, 0);

  return Number((numerator / denominator).toFixed(3));
}

function trimToMaxWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return value.trim();
  }
  return `${words.slice(0, maxWords).join(" ")} ...`;
}

export async function synthesisAgent(input: SynthesisReportInput): Promise<SynthesisReport> {
  const systemPrompt = [
    "You are ORGOS synthesis agent.",
    "Never reference data not in childReports.",
    "Explicitly identify contradictions between reports.",
    "Return JSON only with keys: summary,key_findings,contradictions,recommended_action,flagged_items.",
    "Summary must be concise."
  ].join(" ");

  const response = await callLLM(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          parentTask: input.parentTask,
          goalContext: input.goalContext,
          childReports: input.childReports
        })
      }
    ],
    { temperature: 0.1, maxTokens: 500 },
    { agentType: "synthesis_agent", action: "synthesize", taskId: input.parentTask.id }
  );

  const parsed = JSON.parse(response.content) as unknown;

  const InterimSchema = z.object({
    summary: z.string().min(1),
    key_findings: z.array(z.string()).default([]),
    contradictions: z.array(z.string()).default([]),
    recommended_action: z.string().min(1),
    flagged_items: z.array(z.string()).default([])
  });

  const interim = InterimSchema.parse(parsed);

  const output: SynthesisReport = {
    summary: trimToMaxWords(interim.summary, 500),
    key_findings: interim.key_findings,
    contradictions: interim.contradictions,
    recommended_action: interim.recommended_action,
    overall_confidence: weightedConfidence(input),
    flagged_items: interim.flagged_items
  };

  return SynthesisReportSchema.parse(output);
}
