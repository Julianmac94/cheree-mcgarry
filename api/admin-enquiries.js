/**
 * api/admin-enquiries.js
 * PATCH /api/admin-enquiries?id=xxx  — update status or notes on an enquiry
 *
 * Body: { status?, notes? }
 * All reads happen in api/admin.js (server-rendered page).
 */

import { isAuthed, getSessionUser } from './_auth.js';
import { supabase } from './_supabase.js';

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorised' });

  const id   = req.query?.id || (req.url && new URL(req.url, 'http://x').searchParams.get('id'));
  const user = getSessionUser(req);
  const actor = user?.name || 'Admin';

  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const { status, notes, halaxy_client_url } = req.body || {};
    const update = {};
    if (status            !== undefined) update.status            = status;
    if (notes             !== undefined) update.notes             = notes;
    if (halaxy_client_url !== undefined) update.halaxy_client_url = halaxy_client_url;

    const db = supabase();
    const { error } = await db.from('enquiries').update(update).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    // Log activity
    const logs = [];
    if (status !== undefined) logs.push({ enquiry_id: id, actor, action: 'status', detail: status });
    if (notes  !== undefined) logs.push({ enquiry_id: id, actor, action: 'notes',  detail: null });
    if (halaxy_client_url !== undefined) logs.push({ enquiry_id: id, actor, action: 'halaxy', detail: halaxy_client_url ? 'linked' : 'cleared' });
    if (logs.length) await db.from('activity_log').insert(logs).catch(() => {}); // non-fatal

    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
