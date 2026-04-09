import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "./helpers/createSupabaseMock.js";

const synthesisAgentMock = vi.fn();
const emitMock = vi.fn();

const supabaseMock = createSupabaseMock({
  users: [],
  goals: [{ id: "goal-1", title: "Growth" }],
  tasks: [
    { id: "parent-task", goal_id: "goal-1", title: "Parent", success_criteria: "Done", parent_id: null },
    { id: "child-task-1", parent_id: "parent-task", status: "completed" },
    { id: "child-task-2", parent_id: "parent-task", status: "completed" }
  ],
  reports: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      task_id: "child-task-1",
      insight: "child one insight payload",
      data: { score: 0.9 },
      confidence: 0.8,
      escalate: false
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      task_id: "child-task-2",
      insight: "child two insight payload",
      data: { score: 0.7 },
      confidence: 0.6,
      escalate: false
    }
  ],
  agent_logs: []
});

vi.mock("@orgos/agent-core", () => ({
  synthesisAgent: synthesisAgentMock
}));

vi.mock("../src/services/notifier.js", () => ({
  emitTaskReportSubmittedCascade: emitMock
}));

vi.mock("../src/config/env.js", () => ({
  readEnv: () => ({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "token",
    WEB_ORIGIN: "http://localhost:3000",
    API_PORT: 4000,
    NODE_ENV: "test"
  })
}));

vi.mock("../src/lib/clients.js", () => ({
  createSupabaseServiceClient: () => supabaseMock
}));

vi.mock("../src/queue/index.js", () => ({
  synthesizeQueue: { add: vi.fn(), name: "synthesize" },
  redisConnection: {}
}));

describe("synthesize worker integration", () => {
  beforeEach(() => {
    synthesisAgentMock.mockReset();
    emitMock.mockReset();
    synthesisAgentMock.mockResolvedValue({
      summary: "Synthesized summary",
      key_findings: ["finding-a", "finding-b"],
      contradictions: [],
      recommended_action: "continue",
      flagged_items: [],
      overall_confidence: 0.86
    });
  });

  it("creates a synthesized report and updates the parent task", async () => {
    const workerModule = await import("../src/queue/workers/synthesize.worker.js");

    await workerModule.processSynthesizeJob({ data: { parentTaskId: "parent-task" } } as never);

    expect(synthesisAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parentTask: expect.objectContaining({ id: "parent-task" }),
        childReports: expect.arrayContaining([
          expect.objectContaining({ task_id: "child-task-1" }),
          expect.objectContaining({ task_id: "child-task-2" })
        ]),
        goalContext: expect.stringContaining("Growth")
      })
    );

    expect(supabaseMock.store.reports.some((report) => report.task_id === "parent-task")).toBe(true);
    expect(supabaseMock.store.tasks.find((task) => task.id === "parent-task")?.report_id).toBeDefined();
    expect(emitMock).toHaveBeenCalledWith("parent-task", expect.objectContaining({ reportId: expect.any(String) }));
  });
});
