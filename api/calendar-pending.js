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

const CALENDAR_ID = 'c_af1c120054ecb4479786f98965dc27dbf1b52ab7ae3a58db89a11f1f9da16ede@group.calendar.google.com';

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'Unauthorised' });
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
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixWeeksOut   = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: thirtyDaysAgo.toISOString(), // include past 30 days for "needs logging"
      timeMax: sixWeeksOut.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
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
