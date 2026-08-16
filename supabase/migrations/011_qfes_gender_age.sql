-- Migration 011: gender + age bracket on qfes_client_profiles.
-- Auto-hydrated server-side from the Halaxy patient record the first time
-- a QFES card's details are looked up (see api/admin-enquiries.js's
-- `qfes_profile` GET handler), then cached here so repeat lookups don't
-- need a live Halaxy call. age_bracket stores the exact ISA-form option
-- string (e.g. "30-39"), not a raw age, since that's what gets typed
-- straight into the real form.

ALTER TABLE qfes_client_profiles
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS age_bracket text;
