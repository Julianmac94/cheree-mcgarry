-- Migration 009: add a generic funder reference number to clients (idempotent)
-- Run once in the Supabase SQL editor.
-- Holds a funder-issued identifier needed to lodge/reconcile claims — e.g. a QFES
-- Employee ID, an NDIS plan/reference number, or a WorkCover claim number. Label
-- shown per funder is driven client-side by BOOKABLE_MENU's refLabel (js/admin-ui.js).

ALTER TABLE clients ADD COLUMN IF NOT EXISTS funder_ref text;
