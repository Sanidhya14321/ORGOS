import { beforeEach, describe, expect, it, vi } from "vitest";

const { callLLMMock } = vi.hoisted(() => ({
  callLLMMock: vi.fn()
}));

vi.mock("@orgos/agent-core", () => ({
  callLLM: callLLMMock
}));

import { suggestRoutingForTask } from "../src/services/agentService.js";

type Row = Record<string, unknown>;

type TableName = "tasks" | "users" | "routing_suggestions";

type QueryFilter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "neq"; column: string; value: unknown }
  | { kind: "in"; column: string; value: unknown[] };

class QueryBuilder {
  private readonly rows: Row[];
  private readonly filters: QueryFilter[] = [];
  private limitCount: number | null = null;

  constructor(rows: Row[]) {
    this.rows = rows;
  }

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ kind: "neq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ kind: "in", column, value });
    return this;
  }

  order(_column: string, _opts?: { ascending?: boolean }) {
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private executeRows(): Row[] {
    let filtered = this.rows.filter((row) => {
      return this.filters.every((filter) => {
        const actual = row[filter.column];
        if (filter.kind === "eq") {
          return actual === filter.value;
        }
        if (filter.kind === "neq") {
          return actual !== filter.value;
        }
        return filter.value.includes(actual);
      });
    });

    if (typeof this.limitCount === "number") {
      filtered = filtered.slice(0, this.limitCount);
    }

    return filtered;
  }

  async maybeSingle() {
    const rows = this.executeRows();
    return { data: (rows[0] ?? null) as Row | null, error: null };
  }

  then(resolve: (value: { data: Row[]; error: null }) => void, reject: (reason?: unknown) => void) {
    Promise.resolve({ data: this.executeRows(), error: null }).then(resolve).catch(reject);
  }
}

function createSupabaseServiceMock(data: Record<TableName, Row[]>) {
  return {
    from(table: TableName) {
      return new QueryBuilder(data[table]);
    }
  };
}

describe("suggestRoutingForTask", () => {
  beforeEach(() => {
    callLLMMock.mockReset();
  });

  it("injects routing memory context into the LLM prompt", async () => {
    callLLMMock.mockResolvedValue({
      content: JSON.stringify({
        suggestions: [
          {
            assigneeId: "00000000-0000-4000-8000-0000000000a1",
            reason: "Strong historical fit",
            confidence: 0.9
          }
        ]
      })
    });

    const supabaseService = createSupabaseServiceMock({
      tasks: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          title: "Current Task",
          description: "Current task description",
          required_skills: ["typescript", "ops"],
          assigned_role: "worker",
          org_id: "20000000-0000-4000-8000-000000000001"
        },
        {
          id: "10000000-0000-4000-8000-000000000002",
          title: "Old Task",
          required_skills: ["typescript"],
          assigned_role: "worker",
          org_id: "20000000-0000-4000-8000-000000000001"
        }
      ],
      users: [
        {
          id: "00000000-0000-4000-8000-0000000000a1",
          role: "worker",
          status: "active",
          skills: ["typescript", "ops"],
          open_task_count: 2,
          org_id: "20000000-0000-4000-8000-000000000001"
        },
        {
          id: "00000000-0000-4000-8000-0000000000a2",
          role: "worker",
          status: "active",
          skills: ["finance"],
          open_task_count: 1,
          org_id: "20000000-0000-4000-8000-000000000001"
        }
      ],
      routing_suggestions: [
        {
          task_id: "10000000-0000-4000-8000-000000000002",
          suggested: [
            {
              assigneeId: "00000000-0000-4000-8000-0000000000a1",
              reason: "Worked well for similar TypeScript execution",
              confidence: 0.85,
              requiredSkills: ["typescript"]
            }
          ],
          confirmed: [
            {
              assigneeId: "00000000-0000-4000-8000-0000000000a1",
              reason: "Confirmed by CFO",
              confidence: 0.9,
              requiredSkills: ["typescript"]
            }
          ],
          created_at: "2026-04-16T09:00:00.000Z"
        }
      ]
    });

    const fastify = {
      supabaseService,
      log: {
        warn: vi.fn(),
        error: vi.fn()
      }
    } as unknown as Parameters<typeof suggestRoutingForTask>[0];

    const result = await suggestRoutingForTask(fastify, "10000000-0000-4000-8000-000000000001");

    expect(result.suggestions).toHaveLength(1);
    expect(callLLMMock).toHaveBeenCalledTimes(1);

    const llmArgs = callLLMMock.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
    const userMessage = llmArgs.find((message) => message.role === "user");
    expect(userMessage).toBeDefined();

    const payload = JSON.parse(userMessage?.content ?? "{}");
    expect(payload.routingMemory).toBeDefined();
    expect(payload.routingMemory.sampleSize).toBeGreaterThan(0);
    expect(payload.routingMemory.topSignals[0].assigneeId).toBe("00000000-0000-4000-8000-0000000000a1");
  });
});
