/**
 * api/sessions.js
 * GET    → list sessions for a client (?client_id=xxx)
 * POST   → create session
 * PATCH  → update session (status, invoice_ref, amount, notes)
 * DELETE → hard delete session
 */

import { isAuthed } from './_auth.js';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_STATUSES = ['upcoming', 'completed', 'invoiced', 'submitted', 'paid', 'cancelled'];

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
    const { client_id, session_date, status, invoice_ref, amount, notes } = body;

    if (!client_id || !session_date) {
      return res.status(400).json({ error: 'client_id and session_date are required' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data, error } = await db
      .from('sessions')
      .insert({
        client_id,
        session_date,
        status: status || 'upcoming',
        invoice_ref: invoice_ref || null,
        amount: amount || null,
        notes: notes || null,
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

    const allowed = ['session_date', 'status', 'invoice_ref', 'amount', 'notes'];
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
