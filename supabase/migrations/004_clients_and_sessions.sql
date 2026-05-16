-- Migration 004: create clients + sessions tables (idempotent)
-- Run once in the Supabase SQL editor.
-- These tables were created ad-hoc previously; this migration brings them
-- into the tracked schema and adds any columns that may be missing.

-- ── clients ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz,
  display_name text        NOT NULL,
  funder       text,
  plan_manager text,
  halaxy_id    text,
  enquiry_id   uuid        REFERENCES enquiries(id) ON DELETE SET NULL,
  active       boolean     NOT NULL DEFAULT true,
  notes        text
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Add any columns that may be missing on pre-existing tables
ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at   timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS enquiry_id   uuid REFERENCES enquiries(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS plan_manager text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes        text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS active       boolean NOT NULL DEFAULT true;

-- ── sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  client_id    uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_date date        NOT NULL,
  status       text        NOT NULL DEFAULT 'upcoming',  -- upcoming | completed | cancelled
  invoice_ref  text,
  amount       numeric,
  notes        text
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- ── indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS clients_halaxy_id_idx  ON clients (halaxy_id);
CREATE INDEX IF NOT EXISTS clients_enquiry_id_idx ON clients (enquiry_id);
CREATE INDEX IF NOT EXISTS sessions_client_id_idx ON sessions (client_id);
CREATE INDEX IF NOT EXISTS sessions_date_idx      ON sessions (session_date);
