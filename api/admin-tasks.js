/**
 * api/admin-tasks.js
 * GET    /api/admin-tasks            — list all tasks
 * POST   /api/admin-tasks            — create task { title } OR reset dashboard { confirm:'RESET' }
 * PATCH  /api/admin-tasks?id=xxx     — toggle/update { completed?, title? }
 * DELETE /api/admin-tasks?id=xxx     — delete task
 */

import { isAuthed, getSessionUser } from './_auth.js';
import { supabase } from './_supabase.js';

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorised' });

  const id    = req.query?.id || (req.url && new URL(req.url, 'http://x').searchParams.get('id'));
  const actor = getSessionUser(req)?.name || 'Admin';
  const db    = supabase();

  if (req.method === 'GET') {
    const { data, error } = await db
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    // ── Dashboard reset (confirm token required) ──────────────────
    if (body.confirm === 'RESET') {
      try {
        const SENTINEL = '00000000-0000-0000-0000-000000000000';
        const [r1, r2, r3, r4, r5] = await Promise.all([
          db.from('activity_log').delete().neq('id', SENTINEL),
          db.from('sessions').delete().neq('id', SENTINEL),
          db.from('enquiries').delete().neq('id', SENTINEL),
          db.from('clients').delete().neq('id', SENTINEL),
          db.from('tasks').delete().neq('id', SENTINEL),
        ]);
        const err = r1.error || r2.error || r3.error || r4.error || r5.error;
        if (err) throw new Error(err.message);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[admin-tasks/reset]', err);
        return res.status(500).json({ error: err.message });
      }
    }

    // ── Normal task creation ──────────────────────────────────────
    const { title, enquiry_id, client_label } = body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const { data, error } = await db
      .from('tasks')
      .insert({
        title:        title.trim(),
        completed:    false,
        created_by:   actor,
        enquiry_id:   enquiry_id   || null,
        client_label: client_label || null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { completed, title, enquiry_id, client_label } = req.body || {};
    const update = {};
    if (completed     !== undefined) update.completed     = completed;
    if (title         !== undefined) update.title         = title.trim();
    if (enquiry_id    !== undefined) update.enquiry_id    = enquiry_id    || null;
    if (client_label  !== undefined) update.client_label  = client_label  || null;
    const { error } = await db.from('tasks').update(update).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { error } = await db.from('tasks').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
