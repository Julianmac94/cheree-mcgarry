/**
 * api/_halaxy.js
 * Halaxy FHIR R4 API helper.
 * Handles OAuth 2.0 client credentials flow and token caching in Supabase.
 *
 * Env vars required:
 *   HALAXY_CLIENT_ID
 *   HALAXY_CLIENT_SECRET
 */

import { createClient } from '@supabase/supabase-js';

const HALAXY_TOKEN_URL = 'https://www.halaxy.com/api/oauth2/token';
const HALAXY_FHIR_BASE = 'https://www.halaxy.com/api/fhir/r4';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Returns a valid Halaxy access token, using Supabase as a cache.
 * Fetches a new token when the cached one is missing or within 2 min of expiry.
 */
export async function getHalaxyToken() {
  // Check cache
  try {
    const { data } = await db
      .from('settings')
      .select('value')
      .eq('key', 'halaxy_token_cache')
      .single();

    if (data?.value) {
      const cached = JSON.parse(data.value);
      if (cached.expires_at && Date.now() < cached.expires_at - 120_000) {
        return cached.access_token;
      }
    }
  } catch (_) {}

  // Fetch new token
  const resp = await fetch(HALAXY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     process.env.HALAXY_CLIENT_ID,
      client_secret: process.env.HALAXY_CLIENT_SECRET,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Halaxy token error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const token = data.access_token;
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

  // Cache it
  await db.from('settings').upsert({
    key:        'halaxy_token_cache',
    value:      JSON.stringify({ access_token: token, expires_at: expiresAt }),
    updated_at: new Date().toISOString(),
  });

  return token;
}

/**
 * Make an authenticated GET request to the Halaxy FHIR API.
 * Returns parsed JSON or throws.
 */
export async function halaxyGet(path, params = {}) {
  const token = await getHalaxyToken();
  const url   = new URL(HALAXY_FHIR_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/fhir+json',
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Halaxy API error ${resp.status} on ${path}: ${text}`);
  }

  return resp.json();
}
