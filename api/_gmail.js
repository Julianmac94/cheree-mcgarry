/**
 * api/_gmail.js
 * Gmail read helper — searches practice mailboxes for funder remittance emails.
 *
 * Auth: ordinary **user OAuth** (a refresh token granted the gmail.readonly
 * scope via the existing /api/google-auth consent flow). No service-account key
 * — the org policy `iam.disableServiceAccountKeyCreation` blocks those, and a
 * refresh token is the simpler, unblocked path that reuses the Calendar wiring.
 *
 * Tokens live in the Supabase `settings` table:
 *   gmail_tokens          — JSON map { "<email>": "<refresh_token>", ... }, one
 *                           entry per connected mailbox (admin@, reachout@, …).
 *   google_refresh_token  — the Calendar token; used as a fallback single mailbox
 *                           (it also carries gmail.readonly after re-consent).
 *
 * Leaf module — no imports of route handlers. Imported by admin-enquiries.js.
 */

import { google } from 'googleapis';
import { supabase } from './_supabase.js';

/** Load { label → refresh_token } for every connected mailbox. */
async function _loadMailboxTokens() {
  const db = supabase();
  let map = {};
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'gmail_tokens').single();
    if (data?.value) map = JSON.parse(data.value) || {};
  } catch (_) {}
  // Back-compat: before any mailbox is explicitly connected, fall back to the
  // Calendar refresh token as a single unnamed mailbox (it gains gmail.readonly
  // once the consent flow is re-run with the expanded scope).
  if (!map || !Object.keys(map).length) {
    try {
      const { data } = await db.from('settings').select('value').eq('key', 'google_refresh_token').single();
      if (data?.value) map = { 'connected mailbox': data.value };
    } catch (_) {}
  }
  return map;
}

function _oauthClient(refreshToken) {
  const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  o.setCredentials({ refresh_token: refreshToken });
  return o;
}

/** Search one mailbox; return up to `max` matching message summaries. */
async function _searchOne(label, refreshToken, q, max) {
  const gmail = google.gmail({ version: 'v1', auth: _oauthClient(refreshToken) });
  const list  = await gmail.users.messages.list({ userId: 'me', q, maxResults: max });
  const msgs  = list.data.messages || [];
  const out   = [];
  for (const m of msgs) {
    const msg = await gmail.users.messages.get({
      userId: 'me', id: m.id, format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'Date', 'Message-ID'],
    });
    const h = {};
    (msg.data.payload?.headers || []).forEach(x => { h[x.name.toLowerCase()] = x.value; });
    out.push({
      mailbox:      label,
      id:           m.id,
      // RFC822 Message-ID (angle brackets stripped) — drives a robust
      // `rfc822msgid:` deep link that survives multi-account browsers.
      rfc822msgid:  (h['message-id'] || '').replace(/[<>]/g, '').trim(),
      subject:      h['subject'] || '(no subject)',
      from:         h['from']    || '',
      date:         h['date']    || '',
      internalDate: msg.data.internalDate ? Number(msg.data.internalDate) : null,
      snippet:      msg.data.snippet || '',
    });
  }
  return out;
}

/**
 * Search all connected mailboxes for a funder remittance advice: the invoice
 * number AND a remittance term (subject/body/indexable attachments — Gmail uses
 * the same index as the web UI). Anchoring on "remittance" drops the noise (the
 * invoice we sent, client threads) so a hit is the funder's payment landing.
 * Returns:
 *   { found, hits: [{mailbox, subject, from, date, internalDate, snippet}], errors: [{mailbox, error}] }
 * Never throws for per-mailbox failures — those land in `errors` so a single
 * mailbox without the Gmail scope doesn't sink the whole check.
 */
export async function searchRemittance(invoiceNumber, { max = 5 } = {}) {
  const num = String(invoiceNumber || '').trim();
  if (!num) return { found: false, hits: [], errors: [{ mailbox: '*', error: 'no invoice number' }] };
  // Require the invoice number AND a remittance term. The bare number alone
  // surfaces noise — client threads and the invoice WE sent — so anchoring on
  // "remittance" focuses the result on the funder's actual remittance advice.
  // (Common synonyms included so a real advice email isn't missed on phrasing.)
  const q = `"${num}" (remittance OR remitted OR "payment advice" OR "remittance advice")`;

  const tokens  = await _loadMailboxTokens();
  const entries = Object.entries(tokens);
  if (!entries.length) {
    return { found: false, hits: [], errors: [{ mailbox: '*', error: 'no mailbox connected — visit /api/google-auth while logged in' }] };
  }

  const settled = await Promise.allSettled(entries.map(([label, rt]) => _searchOne(label, rt, q, max)));
  const hits = [], errors = [];
  settled.forEach((r, i) => {
    const label = entries[i][0];
    if (r.status === 'fulfilled') hits.push(...r.value);
    else errors.push({ mailbox: label, error: r.reason?.message || String(r.reason) });
  });
  hits.sort((a, b) => (b.internalDate || 0) - (a.internalDate || 0));
  return { found: hits.length > 0, hits, errors };
}
