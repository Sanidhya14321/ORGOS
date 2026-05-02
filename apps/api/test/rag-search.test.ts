import { describe, it, expect, vi } from "vitest";
import { createSupabaseMock } from "./helpers/createSupabaseMock.js";
import { createSupabaseRagSearchClient } from "../src/services/ragSearchClient.js";

const { embedTextsMock } = vi.hoisted(() => ({
  embedTextsMock: vi.fn()
}));

vi.mock("../src/services/embeddingService.js", () => ({
  default: {
    embedTexts: embedTextsMock
  }
});

describe("rag search client", () => {
  it("returns scored results ordered by cosine similarity", async () => {
    const supabase = createSupabaseMock({
      embeddings: [
        {
          id: "e1",
          org_id: "org-1",
          source_type: "report",
          source_id: "r1",
          chunk_index: 0,
          text_snippet: "first snippet",
          embedding: [1, 0, 0]
        },
        {
          id: "e2",
          org_id: "org-1",
          source_type: "report",
          source_id: "r2",
          chunk_index: 0,
          text_snippet: "second snippet",
          embedding: [0, 1, 0]
        }
      ]
    });

    embedTextsMock.mockResolvedValue([[1, 0, 0]]);

    const client = createSupabaseRagSearchClient(supabase as never);

    const results = await client.search({ orgId: "org-1", query: "query text", topK: 2 });

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("e1");
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[0].textSnippet).toBe("first snippet");
  });
});
