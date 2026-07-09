CREATE TABLE IF NOT EXISTS token_usage (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  proposal_id        UUID REFERENCES generated_proposals(id) ON DELETE SET NULL,
  call_type          TEXT NOT NULL CHECK (call_type IN ('generation', 'judge')),
  model              TEXT NOT NULL,
  attempt_number     INT,
  prompt_tokens      INT,
  completion_tokens  INT,
  total_tokens       INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_tenant ON token_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_tenant_created ON token_usage(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_proposal ON token_usage(proposal_id);
