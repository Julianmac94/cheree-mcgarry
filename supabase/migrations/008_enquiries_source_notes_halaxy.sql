-- Migration 008: add missing columns to enquiries (idempotent)
-- Run in Supabase SQL editor.
--
-- These columns were referenced in code but never formally migrated:
--   source           — tracks where the enquiry came from (website, admin, etc.)
--   notes            — admin notes on the enquiry
--   halaxy_client_url — link to the client's Halaxy profile

ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS source           text;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS notes            text;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS halaxy_client_url text;
