/**
 * api/google-callback.js
 * Google OAuth callback — exchanges code for tokens, stores refresh token
 * in Supabase settings table, redirects back to admin.
 */

import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { CALENDAR_ID } from './calendar-pending.js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // No isAuthed check here — SameSite=Strict blocks the session cookie
  // on cross-site redirects from Google. The auth code itself is the proof.
  const { code, error } = req.query || {};

  if (error) {
    res.writeHead(302, { Location: '/admin?tab=clients&gcal=error' });
    return res.end();
  }

  if (!code) {
    res.writeHead(302, { Location: '/admin?tab=clients&gcal=missing' });
    return res.end();
  }

  try {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google-callback';
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await oauth2.getToken(code);

    if (!tokens.refresh_token) {
      // No refresh token returned — user already authorised previously.
      // Re-visit /api/google-auth with prompt=consent to force a new one.
      res.writeHead(302, { Location: '/admin?tab=clients&gcal=no_refresh' });
      return res.end();
    }

    // Which Google account just consented? Decode the id_token (came straight
    // from Google over TLS — no verification needed) to key the mailbox map.
    let email = null;
    try {
      if (tokens.id_token) {
        const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString('utf8'));
        email = (payload.email || '').toLowerCase() || null;
      }
    } catch (_) {}

    const now = new Date().toISOString();

    // Calendar reads google_refresh_token to fetch the SHARED "Pending Clients"
    // calendar. A Gmail-only reconnect (admin@ / reachout@) must NOT clobber that
    // token unless the consenting account can actually read the calendar —
    // otherwise the schedule goes blank. Verify access before repointing; this is
    // self-healing (reconnect as the calendar-owning account to restore it).
    let canReadCalendar = false;
    try {
      const calOauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
      calOauth.setCredentials({ refresh_token: tokens.refresh_token });
      const calendar = google.calendar({ version: 'v3', auth: calOauth });
      await calendar.events.list({ calendarId: CALENDAR_ID, maxResults: 1 });
      canReadCalendar = true;
    } catch (_) { canReadCalendar = false; }

    // First-time bootstrap: if there's no calendar token yet, set it regardless so
    // we don't end up with none. Otherwise only update when this account can read.
    let hasCalToken = false;
    try {
      const { data } = await db.from('settings').select('value').eq('key', 'google_refresh_token').single();
      hasCalToken = !!data?.value;
    } catch (_) {}

    if (canReadCalendar || !hasCalToken) {
      await db.from('settings').upsert({ key: 'google_refresh_token', value: tokens.refresh_token, updated_at: now });
    }

    // Per-mailbox token map for Gmail remittance search — merge, don't clobber,
    // so admin@ and reachout@ can each be connected by consenting in turn.
    try {
      const { data } = await db.from('settings').select('value').eq('key', 'gmail_tokens').single();
      let map = {};
      if (data?.value) { try { map = JSON.parse(data.value) || {}; } catch (_) {} }
      map[email || 'connected mailbox'] = tokens.refresh_token;
      await db.from('settings').upsert({ key: 'gmail_tokens', value: JSON.stringify(map), updated_at: now });
    } catch (_) {}

    res.writeHead(302, { Location: '/admin?tab=clients&gcal=connected' + (email ? '&mb=' + encodeURIComponent(email) : '') + '&cal=' + (canReadCalendar ? 'ok' : 'no') });
    res.end();
  } catch (err) {
    console.error('google-callback error', err);
    res.writeHead(302, { Location: '/admin?tab=clients&gcal=error' });
    res.end();
  }
}
