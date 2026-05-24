/**
 * api/admin-tasks.js
 * GET    /api/admin-tasks            — list all tasks
 * POST   /api/admin-tasks            — create task  { title }
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
    const { title, enquiry_id, client_label } = req.body || {};
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
