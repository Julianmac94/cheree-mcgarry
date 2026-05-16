/**
 * api/clients.js
 * GET    → list all clients (active by default, ?all=1 includes inactive)
 * POST   → create client
 * PATCH  → update client fields
 * DELETE → deactivate client (sets active = false)
 */

import { isAuthed } from './_auth.js';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  // ── GET ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const all = req.query?.all === '1';
    let query = db
      .from('clients')
      .select(`
        id, display_name, funder, plan_manager, halaxy_id, active, notes,
        created_at,
        sessions (id, session_date, status, invoice_ref, amount, notes)
      `)
      .order('display_name', { ascending: true });

    if (!all) query = query.eq('active', true);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── POST ─────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const { display_name, funder, plan_manager, halaxy_id, notes } = body;

    if (!display_name) {
      return res.status(400).json({ error: 'display_name is required' });
    }

    const { data, error } = await db
      .from('clients')
      .insert({ display_name, funder, plan_manager: plan_manager || null, halaxy_id: halaxy_id || null, notes: notes || null })
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

    const allowed = ['display_name', 'funder', 'plan_manager', 'halaxy_id', 'active', 'notes'];
    const update = Object.fromEntries(
      Object.entries(fields).filter(([k]) => allowed.includes(k))
    );
    update.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('clients')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── DELETE — hard-delete the dashboard record (Halaxy is untouched) ──
  if (req.method === 'DELETE') {
    const id = req.query?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: 'id is required' });

    // Delete sessions first (cascade may handle this, but be explicit)
    await db.from('sessions').delete().eq('client_id', id);

    const { error } = await db.from('clients').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
