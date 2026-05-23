/**
 * api/sessions.js
 * GET    → list sessions for a client (?client_id=xxx)
 * POST   → create session (+ optional GCal event if session_time provided)
 * PATCH  → update session fields
 * DELETE → hard delete session
 */

import { isAuthed } from './_auth.js';
import { createClient } from '@supabase/supabase-js';
import { createCalendarEvent } from './calendar-pending.js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_STATUSES      = ['upcoming', 'completed', 'invoiced', 'submitted', 'paid', 'cancelled'];
const VALID_SESSION_TYPES = ['video', 'in_person', 'phone'];

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  // ── GET ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { client_id } = req.query || {};
    if (!client_id) return res.status(400).json({ error: 'client_id is required' });

    const { data, error } = await db
      .from('sessions')
      .select('*')
      .eq('client_id', client_id)
      .order('session_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── POST ─────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const {
      client_id, session_date, session_time, session_type,
      status, invoice_ref, amount, notes,
      client_name, // used for GCal event title — not stored
    } = body;

    if (!client_id || !session_date) {
      return res.status(400).json({ error: 'client_id and session_date are required' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (session_type && !VALID_SESSION_TYPES.includes(session_type)) {
      return res.status(400).json({ error: 'Invalid session_type' });
    }

    // ── GCal event creation (best-effort — failures don't block save) ──
    let gcal_event_id = null;
    if (session_time) {
      try {
        const typeLabel = session_type === 'video'     ? ' · Video'
                        : session_type === 'phone'     ? ' · Phone'
                        : session_type === 'in_person' ? ' · In Person'
                        : '';
        const title   = (client_name || 'Session') + typeLabel;
        // Build ISO datetimes in Brisbane time (UTC+10 standard / +11 DST — use fixed +10 for storage)
        const startDt = new Date(`${session_date}T${session_time}:00+10:00`);
        const endDt   = new Date(startDt.getTime() + 50 * 60 * 1000); // 50 min default

        const gcal = await createCalendarEvent({
          title,
          start: startDt.toISOString(),
          end:   endDt.toISOString(),
          notes: notes || '',
        });
        gcal_event_id = gcal.id || null;
      } catch (gcalErr) {
        // GCal not connected or scope not yet upgraded — silent skip
        console.warn('[sessions] GCal event skipped:', gcalErr.message);
      }
    }

    const { data, error } = await db
      .from('sessions')
      .insert({
        client_id,
        session_date,
        session_time:  session_time  || null,
        session_type:  session_type  || null,
        status:        status        || 'upcoming',
        invoice_ref:   invoice_ref   || null,
        amount:        amount        || null,
        notes:         notes         || null,
        gcal_event_id: gcal_event_id,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // ── PATCH ─────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const body = req.body || {};
    const { id, ...fields } = body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    if (fields.status && !VALID_STATUSES.includes(fields.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const allowed = [
      'session_date', 'session_time', 'session_type',
      'status', 'invoice_ref', 'amount', 'notes', 'gcal_event_id',
    ];
    const update = Object.fromEntries(
      Object.entries(fields).filter(([k]) => allowed.includes(k))
    );
    update.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('sessions')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── DELETE ────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const body = req.body || {};
    const { id } = body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { error } = await db.from('sessions').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
