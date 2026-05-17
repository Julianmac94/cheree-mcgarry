-- Phase 3: close reason + intake funder tracking on enquiries
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS closed_reason text;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS intake_funder  text;
