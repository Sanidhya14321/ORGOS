-- Migration: add embeddings table and pgvector extension
-- Run this migration after existing migrations

-- Enable pgvector extension (if not already present)
CREATE EXTENSION IF NOT EXISTS vector;

-- Table to store embeddings for RAG
CREATE TABLE IF NOT EXISTS embeddings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    source_type text NOT NULL, -- e.g., 'report', 'meeting', 'goal', 'task'
    source_id uuid NULL,
    chunk_index int NOT NULL,
    text_snippet text NOT NULL,
    embedding vector(1536), -- dimension default; configure as env if needed
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS embeddings_org_idx ON embeddings(org_id);
CREATE INDEX IF NOT EXISTS embeddings_source_idx ON embeddings(source_type, source_id);
CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
