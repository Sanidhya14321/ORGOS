import { describe, expect, it } from "vitest";
import { buildRoutingMemoryContext } from "../../apps/api/src/services/routingMemory.js";

describe("routing memory context", () => {
  it("prioritizes assignees with stronger historical support", () => {
    const context = buildRoutingMemoryContext({
      historyRows: [
        {
          suggested: [
            {
              assigneeId: "11111111-1111-4111-8111-111111111111",
              confidence: 0.8,
              reason: "high skill overlap",
              requiredSkills: ["engineering", "delivery"]
            },
            {
              assigneeId: "22222222-2222-4222-8222-222222222222",
              confidence: 0.6,
              reason: "has availability",
              requiredSkills: ["engineering"]
            }
          ],
          confirmed: []
        },
        {
          suggested: [],
          confirmed: [
            {
              assigneeId: "11111111-1111-4111-8111-111111111111",
              confidence: 0.9,
              reason: "consistent delivery",
              requiredSkills: ["engineering"]
            }
          ]
        }
      ],
      candidateIds: new Set([
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222"
      ]),
      taskSkills: ["engineering"]
    });

    expect(context.sampleSize).toBe(2);
    expect(context.topSignals[0]?.assigneeId).toBe("11111111-1111-4111-8111-111111111111");
    expect(context.topSignals[0]?.support).toBe(2);
  });
});
