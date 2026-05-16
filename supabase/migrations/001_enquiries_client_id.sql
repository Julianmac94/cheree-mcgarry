-- Migration: add client_id to enquiries for the "link enquiry to existing client" flow.
-- Run this once in the Supabase SQL editor.

ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS enquiries_client_id_idx ON enquiries (client_id);
