-- Add judge evaluation metric columns to generated_proposals table
ALTER TABLE generated_proposals 
ADD COLUMN IF NOT EXISTS judge_score INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS judge_issues JSONB DEFAULT NULL;
