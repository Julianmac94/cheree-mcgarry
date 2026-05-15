-- Migration 003: activity log + tasks created_by
-- Run in Supabase SQL editor

-- Activity log: tracks who did what on each enquiry
CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id  uuid        REFERENCES enquiries(id) ON DELETE CASCADE,
  actor       text        NOT NULL,
  action      text        NOT NULL,  -- 'status' | 'notes' | 'halaxy' | 'intake_sent'
  detail      text,                  -- e.g. status value, client type
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_enquiry_idx ON activity_log(enquiry_id, created_at DESC);

-- Tasks: track who created each task
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by text;
