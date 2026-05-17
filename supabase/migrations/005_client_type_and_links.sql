-- Migration 005: client_type, parent_client_id, is_contact
-- Run once in the Supabase SQL editor.

-- client_type: individual | couples | child
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type text;

-- parent_client_id: links a child client to their parent/guardian record
ALTER TABLE clients ADD COLUMN IF NOT EXISTS parent_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

-- is_contact: Halaxy-sourced person who is NOT a billable client (e.g. referrer, parent of a child)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_contact boolean NOT NULL DEFAULT false;

-- Index for parent→child lookups
CREATE INDEX IF NOT EXISTS clients_parent_id_idx ON clients (parent_client_id);
