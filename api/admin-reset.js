/**
 * api/admin-reset.js
 * POST → deletes all manually-entered dashboard data.
 * Keeps: settings (Google token, config).
 * Halaxy and Google Calendar data is fetched live — nothing to wipe.
 */

import { isAuthed } from './_auth.js';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const { confirm } = req.body || {};
  if (confirm !== 'RESET') {
    return res.status(400).json({ error: 'Confirmation token required' });
  }

  try {
    // Order matters: activity_log → sessions → enquiries → clients → tasks
    // (FK constraints: activity_log refs enquiries; sessions refs clients)
    const [
      { count: activityCount, error: e1 },
      { count: sessionsCount, error: e2 },
      { count: enquiriesCount, error: e3 },
      { count: clientsCount, error: e4 },
      { count: tasksCount, error: e5 },
    ] = await Promise.all([
      db.from('activity_log').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id', { count: 'exact', head: true }),
      db.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id', { count: 'exact', head: true }),
      db.from('enquiries').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id', { count: 'exact', head: true }),
      db.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id', { count: 'exact', head: true }),
      db.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id', { count: 'exact', head: true }),
    ]);

    const firstErr = e1 || e2 || e3 || e4 || e5;
    if (firstErr) throw new Error(firstErr.message);

    return res.status(200).json({
      ok: true,
      deleted: {
        activity_log: activityCount || 0,
        sessions: sessionsCount || 0,
        enquiries: enquiriesCount || 0,
        clients: clientsCount || 0,
        tasks: tasksCount || 0,
      },
    });
  } catch (err) {
    console.error('[admin-reset] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
