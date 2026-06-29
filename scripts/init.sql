CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Institute (tenant)
CREATE TABLE IF NOT EXISTS tenants (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,           -- Arabic name
  name_en          TEXT,
  logo_url         TEXT,
  license_number   TEXT,
  phone            TEXT,
  email            TEXT,
  address          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Institute style profile (auto-learned from past proposals)
CREATE TABLE IF NOT EXISTS tenant_proposal_profiles (
  tenant_id           UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  writing_style       TEXT,
  fixed_terms         JSONB DEFAULT '{}',
  pricing_ranges      JSONB DEFAULT '[]',
  specializations     TEXT[] DEFAULT '{}',
  last_updated        TIMESTAMPTZ DEFAULT NOW()
);

-- Reference proposals (uploaded by institute)
CREATE TABLE IF NOT EXISTS proposals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rfp_title       TEXT NOT NULL,
  training_type   TEXT,
  sector          TEXT,
  content_text    TEXT NOT NULL,
  status          TEXT CHECK (status IN ('won','lost','pending')) DEFAULT 'pending',
  embedding       vector(768), -- Adjusted to 768 dimensions for Google text-embedding-004
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Reference proposal indexes
CREATE INDEX IF NOT EXISTS idx_proposals_tenant ON proposals(tenant_id);

-- AI-generated proposals
CREATE TABLE IF NOT EXISTS generated_proposals (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rfp_data               JSONB NOT NULL,
  draft_content          JSONB NOT NULL,
  review_status          TEXT DEFAULT 'draft'
                         CHECK (review_status IN ('draft','in_review','approved','exported')),
  compliance_score       INT DEFAULT 0,
  compliance_checklist   JSONB DEFAULT '[]',
  reference_proposal_ids JSONB DEFAULT '[]',
  reviewer_id            UUID,
  reviewed_at            TIMESTAMPTZ,
  exported_pdf_url       TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- AI generated proposals indexes
CREATE INDEX IF NOT EXISTS idx_generated_proposals_tenant ON generated_proposals(tenant_id);

-- Seed demo tenant
INSERT INTO tenants (id, name, license_number, phone, email)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'معهد التميز للتدريب',
  'TVTC-12345',
  '+966501234567',
  'info@excellence-training.sa'
) ON CONFLICT (id) DO NOTHING;
