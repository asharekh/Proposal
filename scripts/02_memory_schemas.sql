-- Create table tenant_client_guidelines for cognitive memory distillation
CREATE TABLE IF NOT EXISTS tenant_client_guidelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  guidelines TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index to prevent duplicate guideline rows per tenant and client
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_client ON tenant_client_guidelines(tenant_id, client_name);
