# ADR 0003: PDF page numbers as source of truth for sections

## Status

Accepted

## Context

Vectorless RAG exposes `page_start` / `page_end` for citations. Flat PDF text loses page boundaries.

## Decision

For `source_format === "pdf"`, `pdf-parse` `getText()` returns per-page entries. Parser attaches `pdfPages[]`. Indexer builds **one primary section per non-empty page** with `page_start === page_end === pageNumber` (1-based). Non-PDF formats keep paragraph-based `splitIntoSections` with heuristic page span.

## Consequences

- Page-accurate retrieval for PDFs; docx/xlsx unchanged.  
- Very long single pages may map to one large section (acceptable v1).
