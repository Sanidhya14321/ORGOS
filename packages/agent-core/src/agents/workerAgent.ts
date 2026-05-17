import crypto from "node:crypto";
import { ReportSchema, type Report, type Task } from "@orgos/shared-types";
import { readInternalData } from "../tools/readInternalData.js";
import { webSearch, type WebSearchResponse } from "../tools/webSearch.js";
import { buildRagAugmentedMessages, DEFAULT_RAG_SNIPPET_CHARS, type RagSearchClient } from "../rag.js";
import type { LLMMessage } from "../llm/provider.js";

export interface WorkerAgentInput {
  task: Task;
  goalContext: string;
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

interface ToolExecutionState {
  callCount: number;
  webSearches: WebSearchResponse[];
  internalRows: Record<string, unknown>[];
}

function buildPlan(task: Task): string[] {
  const steps: string[] = [];
  steps.push(`Understand objective: ${task.success_criteria}`);
  steps.push(`Gather evidence for: ${task.title}`);
  if (task.description) {
    steps.push(`Use context detail: ${task.description}`);
  }
  return steps.slice(0, 3);
}

function scoreSuccessCriteria(insight: string, successCriteria: string): number {
  const words = successCriteria
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);

  if (words.length === 0) {
    return 0.6;
  }

  const matched = words.filter((word) => insight.toLowerCase().includes(word)).length;
  return Math.min(1, matched / words.length);
}

function scoreNoContradictions(sources: WebSearchResponse[]): number {
  if (sources.length === 0) {
    return 0.7;
  }

  let contradictionSignals = 0;
  for (const source of sources) {
    const text = source.results.map((item) => item.snippet.toLowerCase()).join(" ");
    if (text.includes("however") && text.includes("not")) {
      contradictionSignals += 1;
    }
  }

  return contradictionSignals > 0 ? 0.6 : 1;
}

export async function workerAgent(input: WorkerAgentInput): Promise<Report> {
  const state: ToolExecutionState = {
    callCount: 0,
    webSearches: [],
    internalRows: []
  };

  const runTool = async <T>(fn: () => Promise<T>): Promise<T> => {
    state.callCount += 1;
    if (state.callCount > 3) {
      throw new Error("workerAgent exceeded maximum of 3 tool calls");
    }
    return fn();
  };

  const plan = buildPlan(input.task);

  const baseMessages: LLMMessage[] = [
    {
      role: "system",
      content: "You are ORGOS worker agent. Return concise JSON outputs when asked."
    },
    {
      role: "user",
      content: JSON.stringify({
        task: input.task,
        goalContext: input.goalContext
      })
    }
  ];

  const ragQuery = `${input.task.title} ${input.goalContext} ${input.task.description ?? ""}`.trim();
  const ragDocuments = input.rag
    ? (
        await buildRagAugmentedMessages(baseMessages, input.rag.searchClient, {
          orgId: input.rag.orgId,
          query: ragQuery,
          topK: input.rag.topK ?? 4,
          maxSnippetChars: input.rag.maxSnippetChars ?? DEFAULT_RAG_SNIPPET_CHARS,
          branchId: input.rag.branchId,
          department: input.rag.department,
          docTypes: input.rag.docTypes,
          knowledgeScopes: input.rag.knowledgeScopes,
          sourceFormats: input.rag.sourceFormats,
          sourceTypes: input.rag.sourceTypes
        })
      ).documents
    : [];

  if (input.task.goal_id) {
    const rows = await runTool(() => readInternalData("goals", { id: input.task.goal_id }));
    state.internalRows.push(...rows);
  }

  const searchResult = await runTool(() => webSearch(`${input.task.title} ${input.goalContext}`));
  state.webSearches.push(searchResult);

  if (input.task.description) {
    const extraSearch = await runTool(() => webSearch(input.task.description as string));
    state.webSearches.push(extraSearch);
  }

  const sources = state.webSearches
    .flatMap((result) => result.results)
    .slice(0, 10)
    .map((result) => ({
      url: result.url,
      title: result.title,
      accessed: new Date().toISOString()
    }));

  const insightParts = [
    `Task objective: ${input.task.title}.`,
    `Success criteria: ${input.task.success_criteria}.`,
    sources.length > 0
      ? `Collected ${sources.length} external references and ${state.internalRows.length} internal records.`
      : `No external references found, relied on ${state.internalRows.length} internal records.`
  ];

  if (ragDocuments.length > 0) {
    insightParts.push(`Retrieved ${ragDocuments.length} org context snippets for alignment.`);
  }

  const insight = insightParts.join(" ");

  const relevance = sources.length > 0 || state.internalRows.length > 0 ? 1 : 0;
  const criteriaScore = scoreSuccessCriteria(insight, input.task.success_criteria);
  const contradictionScore = scoreNoContradictions(state.webSearches);

  const confidence = Number((relevance * 0.3 + criteriaScore * 0.5 + contradictionScore * 0.2).toFixed(3));
  const escalate = confidence < 0.65;

  const report: Report = {
    id: crypto.randomUUID(),
    task_id: input.task.id,
    is_agent: true,
    status: confidence >= 0.75 ? "completed" : confidence >= 0.45 ? "partial" : "blocked",
    insight,
    data: {
      plan,
      tool_calls: state.callCount,
      internal_rows: state.internalRows,
      web_searches: state.webSearches,
      rag_context: ragDocuments
    },
    confidence,
    sources,
    escalate
  };

  return ReportSchema.parse(report);
}