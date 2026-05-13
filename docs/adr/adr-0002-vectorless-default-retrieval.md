# ADR 0002: Vectorless default + embedding ingest rules

## Status

Accepted

## Context

ORGOS indexes org documents for hierarchical agents. Full embedding pipeline needs `OPENAI_API_KEY` and BullMQ ingest worker.

## Decision

- Default `retrieval_mode`: **vectorless** (keyword sections in `org_document_sections`, no embedding rows required).  
- **vector** / **hybrid**: enqueue embedding job only when `OPENAI_API_KEY` is set at upload time.  
- If key missing but user requested vector/hybrid: persist `retrieval_mode` as **vectorless**, append human-readable note to `ingestion_warnings`, do not enqueue ingest.

## Consequences

- Predictable local/staging behavior without OpenAI.  
- Product copy should explain why mode may differ from request (see warnings / API response `embedding_enqueued`).
