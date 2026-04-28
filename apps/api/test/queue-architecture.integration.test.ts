import { beforeEach, describe, expect, it, vi } from "vitest";

const queueNames: string[] = [];
const queueEventNames: string[] = [];

vi.mock("../src/config/env.js", () => ({
  readEnv: () => ({
    UPSTASH_REDIS_URL: "rediss://default:token@localhost:6380",
    UPSTASH_REDIS_TOKEN: "token"
  })
}));

vi.mock("bullmq", () => {
  class Queue {
    name: string;

    constructor(name: string) {
      this.name = name;
      queueNames.push(name);
    }

    async getJob(): Promise<null> {
      return null;
    }

    async add(): Promise<void> {
      return;
    }
  }

  class QueueEvents {
    constructor(name: string) {
      queueEventNames.push(name);
    }

    async waitUntilReady(): Promise<void> {
      return;
    }

    on(): void {
      return;
    }
  }

  return { Queue, QueueEvents };
});

describe("queue architecture", () => {
  beforeEach(() => {
    queueNames.length = 0;
    queueEventNames.length = 0;
    vi.resetModules();
  });

  it("initializes tiered queues and forwarding without legacy decompose queue", async () => {
    const mod = await import("../src/queue/index.js");

    mod.getCsuiteQueue();
    mod.getManagerQueue();
    mod.getIndividualQueue();
    mod.getSlaQueue();
    mod.getExecuteQueue();
    mod.getSynthesizeQueue();
    mod.initializeQueueForwarding();

    await Promise.resolve();
    await Promise.resolve();

    expect(queueNames).toEqual(
      expect.arrayContaining([
        "dead_letter",
        "queue-csuite",
        "queue-manager",
        "queue-individual",
        "queue-sla",
        "execute",
        "synthesize"
      ])
    );

    expect(queueNames).not.toContain("decompose");

    expect(queueEventNames).toEqual(
      expect.arrayContaining([
        "queue-csuite",
        "queue-manager",
        "queue-individual",
        "queue-sla",
        "execute",
        "synthesize"
      ])
    );

    expect(queueEventNames).not.toContain("decompose");
  });
});
