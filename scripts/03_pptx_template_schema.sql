-- Add template_metadata JSONB column to proposals table to store AI-extracted layout rules
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS template_metadata JSONB DEFAULT NULL;
