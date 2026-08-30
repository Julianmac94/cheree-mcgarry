/**
 * api/calendar-pending.js
 * GET → returns upcoming events from the Pending Clients intake calendar.
 * Requires google_refresh_token to be stored in the settings table.
 */

import { isAuthed } from './_auth.js';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { notify } from './_push.js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const CALENDAR_ID = 'c_af1c120054ecb4479786f98965dc27dbf1b52ab7ae3a58db89a11f1f9da16ede@group.calendar.google.com';

/** Same tiny "Key: Value" line parser as the client-side js/cheree-book.js —
 * duplicated rather than shared since this is a server module (that's a
 * browser script). Used to pull Funder/Type/Bill out of an event
 * description for richer notification text. Exported so other server
 * modules (the QFES invoice compiler) can read the same fields instead of
 * re-parsing descriptions themselves. */
export function _parseDesc(desc) {
  const out = {};
  (desc || '').split('\n').forEach(line => {
    const idx = line.indexOf(': ');
    if (idx === -1) return;
    out[line.slice(0, idx).trim()] = line.slice(idx + 2).trim();
  });
  return out;
}

/** Fetch events from the shared practice calendar. Extracted out of the GET
 * handler so other server modules (the billing reconciliation report) can
 * reuse the exact same fetch instead of duplicating the OAuth/range setup.
 * Returns { connected, events }.
 *
 * Accepts either a plain number (legacy — symmetric ±days, single page,
 * capped at 250 results) or an options object { pastDays, futureDays,
 * paginate }. Pass paginate:true to page through Google's nextPageToken
 * instead of trusting a single maxResults:250 call, which silently
 * truncates once a wide date range has more events than that. */
export async function fetchCalendarEvents(opts) {
  const { pastDays, futureDays, paginate } =
    typeof opts === 'number' ? { pastDays: opts, futureDays: opts, paginate: false } : (opts || {});

  const { data: setting } = await db
    .from('settings')
    .select('value')
    .eq('key', 'google_refresh_token')
    .single();

  if (!setting?.value) {
    return { connected: false, events: [] };
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: setting.value });

  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  const now = new Date();
  const rangeStart = new Date(now.getTime() - pastDays * 24 * 60 * 60 * 1000);
  const rangeEnd   = new Date(now.getTime() + futureDays * 24 * 60 * 60 * 1000);

  const items = [];
  let pageToken;
  let pages = 0;
  do {
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    });
    items.push(...(response.data.items || []));
    pageToken = paginate ? response.data.nextPageToken : undefined;
    pages++;
  } while (pageToken && pages < 20); // 20 * 250 = 5000 events — generous ceiling, not a real limit for a solo practice

  const events = items.map(e => ({
    id: e.id,
    title: e.summary || '(no title)',
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    description: e.description || '',
    allDay: !e.start?.dateTime,
  }));

  return { connected: true, events };
}

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  // ── PATCH — rename, reschedule, and/or update the description of a
  // calendar event. Any subset of { title, start, end, description } may be
  // given. start/end reschedule an event's time (session-duration edits);
  // description is used by /book to stamp outcome/billing info directly onto
  // the event Cheree already looks at. ──────────────────────────────────
  if (req.method === 'PATCH') {
    const eventId = req.query?.eventId;
    const { title, start, end, description } = req.body || {};
    if (!eventId) return res.status(400).json({ error: 'eventId is required' });
    if (!title?.trim() && !end && description === undefined) {
      return res.status(400).json({ error: 'title, end, or description is required' });
    }
    try {
      const oauth2   = await getOAuth2Client();
      const calendar = google.calendar({ version: 'v3', auth: oauth2 });
      const TZ       = 'Australia/Brisbane';
      const resource = {};
      if (title?.trim()) resource.summary = title.trim();
      if (start) resource.start = { dateTime: start, timeZone: TZ };
      if (end)   resource.end   = { dateTime: end,   timeZone: TZ };
      if (description !== undefined) resource.description = description;
      await calendar.events.patch({ calendarId: CALENDAR_ID, eventId, resource });

      // Notify Julian when this PATCH is Cheree recording an outcome (/book).
      // Detected by the Status line she writes — other PATCH callers (rename,
      // duration edits, the board's Billing-stage actions) never write
      // "Status: Attended"/"Status: Cancelled by...", so this can't misfire.
      if (description && /Status: (Attended|Cancelled by)/.test(description)) {
        const fields = _parseDesc(description);
        const name = (title || '').split(' — ')[0] || 'A client';
        const attended = fields.Status === 'Attended';
        const pushTitle = attended ? 'Attended' : fields.Status; // "Cancelled by Cheree" / "Cancelled by client"
        const billNote = fields.Bill === 'Yes' ? 'needs billing' : fields.Bill === 'No' ? 'no charge' : '';
        const bodyParts = [name];
        if (fields.Funder) bodyParts.push(fields.Funder);
        if (billNote) bodyParts.push(billNote);
        // Awaited (not fire-and-forget) — a serverless function can be frozen
        // the instant the response is sent, which would silently kill an
        // un-awaited push before it actually goes out. The .catch keeps a
        // push failure from ever turning into a failed outcome-save.
        await notify({
          title: pushTitle,
          body: bodyParts.join(' · '),
          url: '/book',
          tag: 'outcome-' + eventId,
          kind: 'outcome',
          detail: { name, funder: fields.Funder || null, status: fields.Status, bill: fields.Bill || null },
        }).catch(() => {});
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST — create a calendar event. Used by Cheree's booking tool
  // (/book) to write clean, structured events directly onto the calendar
  // she actually looks at — replaces her hand-typing ad hoc titles like
  // "Ember ndis cancelled by me". Body { title, description, start, end }.
  // Title/description text is built client-side (js/cheree-book.js) so the
  // labelling convention lives in one place; this just creates the event. ──
  if (req.method === 'POST') {
    const { title, description, start, end } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    if (!start || !end) return res.status(400).json({ error: 'start and end are required' });
    try {
      const result = await createCalendarEvent({ title: title.trim(), notes: description, start, end });

      const fields = _parseDesc(description);
      const name = title.trim().split(' — ')[0] || 'A client';
      const when = new Date(start).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      const bodyParts = [when];
      if (fields.Funder) bodyParts.push(fields.Funder);
      if (fields.Type) bodyParts.push(fields.Type);
      await notify({
        title: 'New booking: ' + name,
        body: bodyParts.join(' · '),
        url: '/book',
        tag: 'booking-' + result.id,
        kind: 'booking',
        detail: { name, funder: fields.Funder || null, type: fields.Type || null, when },
      }).catch(() => {});

      return res.status(201).json({ ok: true, id: result.id, htmlLink: result.htmlLink });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE — remove a calendar event ─────────────────────────────
  if (req.method === 'DELETE') {
    const eventId = req.query?.eventId;
    if (!eventId) return res.status(400).json({ error: 'eventId is required' });
    try {
      await deleteCalendarEvent(eventId);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    // Explicit ?days=N overrides the default. With no override: -180d/+91d
    // (asymmetric) so a session from months back that was never set up
    // anywhere still surfaces on request, rather than a tight symmetric
    // window silently truncating old history for any caller that forgets
    // to ask for it explicitly.
    if (req.query?.days) {
      const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 91));
      const result = await fetchCalendarEvents(days);
      return res.status(200).json(result);
    }
    const result = await fetchCalendarEvents({ pastDays: 180, futureDays: 91 });
    return res.status(200).json(result);
  } catch (err) {
    console.error('calendar-pending error', err);
    return res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
}

async function getOAuth2Client() {
  const { data: setting } = await db
    .from('settings')
    .select('value')
    .eq('key', 'google_refresh_token')
    .single();

  if (!setting?.value) throw new Error('Google Calendar not connected');

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: setting.value });
  return oauth2;
}

export async function createCalendarEvent({ title, start, end, notes }) {
  const oauth2   = await getOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  const TZ       = 'Australia/Brisbane';

  const event = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    resource: {
      summary:     title,
      description: notes || '',
      start: { dateTime: start, timeZone: TZ },
      end:   { dateTime: end,   timeZone: TZ },
    },
  });

  return { id: event.data.id, htmlLink: event.data.htmlLink };
}

export async function deleteCalendarEvent(eventId) {
  if (!eventId) return;
  const oauth2   = await getOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  try {
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
  } catch (err) {
    // 404/410 means already deleted — safe to ignore
    const code = err.code || err.status;
    if (code !== 404 && code !== 410) throw err;
  }
}
