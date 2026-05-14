/**
 * api/admin-enquiries.js
 * PATCH /api/admin-enquiries?id=xxx  — update status or notes on an enquiry
 *
 * Body: { status?, notes? }
 * All reads happen in api/admin.js (server-rendered page).
 */

import { isAuthed } from './_auth.js';
import { supabase } from './_supabase.js';

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorised' });

  const id = req.query?.id || (req.url && new URL(req.url, 'http://x').searchParams.get('id'));

  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const { status, notes } = req.body || {};
    const update = {};
    if (status !== undefined) update.status = status;
    if (notes  !== undefined) update.notes  = notes;

    const { error } = await supabase()
      .from('enquiries')
      .update(update)
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
