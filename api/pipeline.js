/**
 * api/pipeline.js
 * GET → returns all data needed to render the unified pipeline dashboard.
 *
 * Returns:
 *   enquiries  — from Supabase
 *   clients    — from Supabase (with sessions)
 *   halaxy     — { appointments, patients, connected } from Halaxy API (non-fatal if unavailable)
 */

import { isAuthed } from './_auth.js';
import { supabase } from './_supabase.js';
import { halaxyGet } from './_halaxy.js';

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const db = supabase();

  // Fetch Supabase data in parallel
  const [{ data: enquiries }, { data: clients }, { data: activityRaw }] = await Promise.all([
    db.from('enquiries').select('*').order('created_at', { ascending: false }),
    db.from('clients').select(`
      id, display_name, funder, plan_manager, halaxy_id, enquiry_id,
      active, notes, created_at,
      sessions (id, session_date, status, invoice_ref, amount, notes)
    `).order('display_name', { ascending: true }),
    db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200),
  ]);

  // Group activity by enquiry_id
  const activityByEnquiry = {};
  (activityRaw || []).forEach(a => {
    if (!activityByEnquiry[a.enquiry_id]) activityByEnquiry[a.enquiry_id] = [];
    if (activityByEnquiry[a.enquiry_id].length < 5) activityByEnquiry[a.enquiry_id].push(a);
  });

  // Attach activity to enquiries
  const enrichedEnquiries = (enquiries || []).map(e => ({
    ...e,
    activity: activityByEnquiry[e.id] || [],
  }));

  // Fetch Halaxy data — non-fatal, returns connected: false if unavailable
  let halaxy = { connected: false, appointments: [], patients: [] };

  if (process.env.HALAXY_CLIENT_ID && process.env.HALAXY_CLIENT_SECRET) {
    try {
      const now    = new Date();
      const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days out

      const [apptBundle, patientBundle] = await Promise.all([
        halaxyGet('/Appointment', {
          date:   `ge${now.toISOString().slice(0, 10)}`,
          _sort:  'date',
          _count: '100',
        }),
        halaxyGet('/Patient', { _count: '200' }),
      ]);

      const appointments = (apptBundle.entry || []).map(e => e.resource).filter(Boolean);
      const patients     = (patientBundle.entry || []).map(e => e.resource).filter(Boolean);

      halaxy = { connected: true, appointments, patients };
    } catch (err) {
      console.error('Halaxy API error:', err.message);
      halaxy = { connected: false, error: err.message, appointments: [], patients: [] };
    }
  }

  return res.status(200).json({
    enquiries: enrichedEnquiries,
    clients:   clients || [],
    halaxy,
  });
}
