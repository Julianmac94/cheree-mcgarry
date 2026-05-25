/**
 * api/admin-tasks.js
 * GET    /api/admin-tasks            — list all tasks
 * POST   /api/admin-tasks            — create task { title } OR reset dashboard { confirm:'RESET' }
 * POST   /api/admin-tasks?brief=1    — stream AI receptionist brief (calls Anthropic)
 * PATCH  /api/admin-tasks?id=xxx     — toggle/update { completed?, title? }
 * DELETE /api/admin-tasks?id=xxx     — delete task
 */

import { isAuthed, getSessionUser } from './_auth.js';
import { supabase } from './_supabase.js';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const BRIEF_MODEL   = 'claude-haiku-4-5';

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
    const brief = req.query?.brief || (req.url && new URL(req.url, 'http://x').searchParams.get('brief'));

    // ── AI receptionist brief ─────────────────────────────────────
    if (brief) {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });

      const {
        todaySessions    = [],
        nextAppt         = null,
        critCount        = 0,
        awaitingPayCount = 0,
        unlinkedCount    = 0,
        newEnquiries     = 0,
      } = body;

      const lines = [];
      if (todaySessions.length === 0) {
        lines.push('No sessions today.');
      } else {
        lines.push('Sessions today: ' + todaySessions.map(s => s.name + (s.time ? ' at ' + s.time : '')).join(', ') + '.');
      }
      if (nextAppt) {
        lines.push('Next appointment: ' + nextAppt.name + (nextAppt.day ? ' on ' + nextAppt.day : '') + (nextAppt.time ? ' at ' + nextAppt.time : '') + '.');
      } else {
        lines.push('No upcoming appointments scheduled.');
      }
      const issues = [];
      if (critCount        > 0) issues.push(critCount        + ' appointment' + (critCount        !== 1 ? 's' : '') + ' missing an invoice');
      if (awaitingPayCount > 0) issues.push(awaitingPayCount + ' invoice'     + (awaitingPayCount !== 1 ? 's' : '') + ' awaiting payment');
      if (unlinkedCount    > 0) issues.push(unlinkedCount    + ' unlinked calendar event' + (unlinkedCount !== 1 ? 's' : ''));
      lines.push(issues.length ? 'Admin: ' + issues.join(', ') + '.' : 'No admin issues.');
      lines.push(newEnquiries > 0 ? newEnquiries + ' new enquir' + (newEnquiries === 1 ? 'y' : 'ies') + ' in inbox.' : 'No new enquiries.');

      const prompt = `You are the front-desk assistant for Cheree McGarry, a psychologist. When she opens her practice dashboard give her a short, warm briefing — like a receptionist would say when she walks in the door. Write exactly 2–3 sentences in a natural, conversational tone. Do NOT use bullet points or lists. Do NOT start with a greeting (it is shown separately). Refer to clients by first name only. Be specific about the actual numbers and names.\n\nDashboard data:\n${lines.join('\n')}\n\nWrite only the briefing, nothing else.`;

      try {
        const upstream = await fetch(ANTHROPIC_API, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: BRIEF_MODEL, max_tokens: 160, messages: [{ role: 'user', content: prompt }] }),
        });
        if (!upstream.ok) {
          const err = await upstream.text();
          console.error('[brief] Anthropic error', upstream.status, err);
          return res.status(502).json({ error: 'Upstream error' });
        }
        const result = await upstream.json();
        const text   = result.content?.[0]?.text || '';
        return res.status(200).json({ text });
      } catch (err) {
        console.error('[brief]', err);
        return res.status(500).json({ error: err.message });
      }
    }

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
    const { title, enquiry_id, client_label, description } = body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const { data, error } = await db
      .from('tasks')
      .insert({
        title:        title.trim(),
        description:  description  || null,
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
    const { completed, title, enquiry_id, client_label, description } = req.body || {};
    const update = {};
    if (completed     !== undefined) update.completed     = completed;
    if (title         !== undefined) update.title         = title.trim();
    if (enquiry_id    !== undefined) update.enquiry_id    = enquiry_id    || null;
    if (client_label  !== undefined) update.client_label  = client_label  || null;
    if (description   !== undefined) update.description   = description   || null;
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
