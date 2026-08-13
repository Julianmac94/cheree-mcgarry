/**
 * api/calendar-pending.js
 * GET → returns upcoming events from the Pending Clients intake calendar.
 * Requires google_refresh_token to be stored in the settings table.
 */

import { isAuthed } from './_auth.js';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const CALENDAR_ID = 'c_af1c120054ecb4479786f98965dc27dbf1b52ab7ae3a58db89a11f1f9da16ede@group.calendar.google.com';

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  // ── PATCH — rename and/or reschedule a calendar event ─────────────
  // Body: { title? }  and/or  { start?, end? } (ISO datetimes with offset).
  // At least one of title/end must be given.
  if (req.method === 'PATCH') {
    const eventId = req.query?.eventId;
    const { title, start, end } = req.body || {};
    if (!eventId) return res.status(400).json({ error: 'eventId is required' });
    if (!title?.trim() && !end) return res.status(400).json({ error: 'title or end is required' });
    try {
      const oauth2   = await getOAuth2Client();
      const calendar = google.calendar({ version: 'v3', auth: oauth2 });
      const TZ       = 'Australia/Brisbane';
      const resource = {};
      if (title?.trim()) resource.summary = title.trim();
      if (start) resource.start = { dateTime: start, timeZone: TZ };
      if (end)   resource.end   = { dateTime: end,   timeZone: TZ };
      await calendar.events.patch({ calendarId: CALENDAR_ID, eventId, resource });
      return res.status(200).json({ ok: true });
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
    // Load refresh token from Supabase settings
    const { data: setting } = await db
      .from('settings')
      .select('value')
      .eq('key', 'google_refresh_token')
      .single();

    if (!setting?.value) {
      return res.status(200).json({ connected: false, events: [] });
    }

    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: setting.value });

    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    const now = new Date();
    // -180d/+91d: the past window is wider than the schedule's ±12-week paging range
    // so the Inbox's "Not in Halaxy" bucket can still catch a session from several
    // months back that was never set up in Halaxy (see _dhUnlinkedCalAppts).
    const rangeStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const rangeEnd   = new Date(now.getTime() + 91 * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const events = (response.data.items || []).map(e => ({
      id: e.id,
      title: e.summary || '(no title)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      description: e.description || '',
      allDay: !e.start?.dateTime,
    }));

    return res.status(200).json({ connected: true, events });
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
