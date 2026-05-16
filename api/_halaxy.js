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

const HALAXY_TOKEN_URL = 'https://au-api.halaxy.com/main/oauth/token';
const HALAXY_FHIR_BASE = 'https://au-api.halaxy.com/main';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Fetch with a hard timeout — throws AbortError if exceeded. */
function fetchTimeout(url, opts = {}, ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

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

  // Fetch new token (7s timeout)
  const resp = await fetchTimeout(HALAXY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept':       'application/fhir+json',
    },
    body: JSON.stringify({
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

  const resp = await fetchTimeout(url.toString(), {
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

/**
 * Make an authenticated POST request to the Halaxy FHIR API.
 * body should be a plain JS object — serialised as application/fhir+json.
 * Returns parsed JSON or throws (includes full Halaxy error body in message).
 */
export async function halaxyPost(path, body) {
  const token = await getHalaxyToken();

  const resp = await fetchTimeout(HALAXY_FHIR_BASE + path, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/fhir+json',
      Accept:         'application/fhir+json',
    },
    body: JSON.stringify(body),
  }, 10_000); // slightly longer timeout for writes

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Halaxy POST error ${resp.status} on ${path}: ${text}`);
  }

  try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

/**
 * Make an authenticated PATCH request to the Halaxy FHIR API.
 * Used for partial updates (e.g. marking an appointment as fulfilled).
 */
export async function halaxyPatch(path, body) {
  const token = await getHalaxyToken();

  const resp = await fetchTimeout(HALAXY_FHIR_BASE + path, {
    method:  'PATCH',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/merge-patch+json',
      Accept:         'application/fhir+json',
    },
    body: JSON.stringify(body),
  }, 10_000);

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Halaxy PATCH error ${resp.status} on ${path}: ${text}`);
  }

  try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}
