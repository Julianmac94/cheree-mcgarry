-- ============================================================
-- Cheree McGarry — Supabase schema
-- Run once in the Supabase SQL editor:
-- supabase.com → your project → SQL Editor → New query
-- ============================================================

-- Client enquiries (from contact + session request forms)
CREATE TABLE IF NOT EXISTS enquiries (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now(),
  source          text,                        -- 'contact', 'home-page-inline', 'session-request'
  first_name      text,
  last_name       text,
  email           text        NOT NULL,
  phone           text,
  reason          text,                        -- reach-out reason
  service         text,                        -- session service type
  coverage        text,                        -- funding/coverage
  client_type     text,                        -- new / existing
  preferred_times text,
  message         text,
  status          text        DEFAULT 'new',   -- new | contacted | in_halaxy | closed
  notes           text                         -- admin private notes
);

-- Row-level security: only service role can read/write (we use service key server-side)
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

-- Tasks (admin to-do list)
CREATE TABLE IF NOT EXISTS tasks (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  title      text        NOT NULL,
  completed  boolean     DEFAULT false
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Index for fast status filtering
CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries (status);
CREATE INDEX IF NOT EXISTS enquiries_created_idx ON enquiries (created_at DESC);
