# ADR 0004: Optional Postgres FTS on document sections

## Status

Accepted

## Context

Keyword-array Jaccard scoring scales poorly; interview story wants “vectorless but serious retrieval.”

## Decision

- Migration [`017_org_document_sections_tsvector.sql`](../packages/db/schema/017_org_document_sections_tsvector.sql): generated `content_tsv`, GIN index, RPC `match_org_document_sections_tsvector` (filters align with lexical path: org, branch, department, doc_types, knowledge_scopes overlap, source_formats).
- API: `ORGOS_SECTION_TSVECTOR=1` → `retrieveRelevantSections` calls RPC first; empty/error → existing lexical path (no behavior change when flag off or migration missing).

## Consequences

- Ops must apply 017 before enabling flag in prod.
- Extra column on large section tables → migration time cost acceptable for v1.
