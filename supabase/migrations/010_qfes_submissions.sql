-- Migration 010: qfes_client_profiles — the QFES ISA form fields that
-- CAN'T be auto-collected (from Halaxy or the appointment itself), staged
-- by Cheree ahead of the real submission. One row per client, upserted
-- in place — this is profile/context data (area, role, concern type),
-- not per-appointment data (date/mode/duration come from Halaxy/the Board
-- at actual-submission time; gender/age come from the Halaxy patient
-- record). Schema: see Cheree's business/qfes-isa-form-schema.md.
--
-- Replaces the earlier per-submission qfes_submissions design (not yet
-- run in production as of 2026-08-09 — if you already ran that version,
-- `DROP TABLE IF EXISTS qfes_submissions;` first).
--
-- Renumbered from 009 to 010 — 009 was independently taken by
-- 009_client_funder_ref.sql on main while this branch was unmerged.

CREATE TABLE IF NOT EXISTS qfes_client_profiles (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  client_halaxy_id   text        NOT NULL, -- = the QFES "Client code"
  client_name        text,                 -- denormalised for display without a Halaxy round-trip
  area               text,
  corporate_support  text,
  urban_firefighters text,
  rural_firefighters text,
  qfd_staff          text,
  concern_category   text, -- 'work' | 'nonwork' — which list Primary/Secondary were picked from
  concern_primary    text,
  concern_secondary  text,
  client_type        text,
  notes              text
);

ALTER TABLE qfes_client_profiles ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS qfes_client_profiles_client_idx ON qfes_client_profiles (client_halaxy_id);
