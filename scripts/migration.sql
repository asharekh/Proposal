-- 1. Create semantic chunking table
CREATE TABLE IF NOT EXISTS proposal_chunks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id     UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chunk_index     INT NOT NULL,
  content_text    TEXT NOT NULL,
  embedding       vector(768),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. HNSW cosine index for pgvector semantic search (supersonic speed)
CREATE INDEX IF NOT EXISTS proposal_chunks_embedding_cosine_idx 
ON proposal_chunks USING hnsw (embedding vector_cosine_ops);

-- 3. Standard indexes for query filtering
CREATE INDEX IF NOT EXISTS idx_proposal_chunks_tenant ON proposal_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_proposal_chunks_proposal ON proposal_chunks(proposal_id);
