/**
 * api/_supabase.js
 * Shared Supabase client (service role — server-side only, never expose to browser).
 *
 * Env vars required:
 *   SUPABASE_URL          — from Supabase project settings
 *   SUPABASE_SERVICE_KEY  — service_role key (Settings → API)
 */

import { createClient } from '@supabase/supabase-js';

let _client = null;

export function supabase() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return _client;
}
