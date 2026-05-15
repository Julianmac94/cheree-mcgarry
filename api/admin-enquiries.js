/**
 * api/admin-enquiries.js
 *
 * GET  /api/admin-enquiries          — pipeline data (enquiries + clients + Halaxy)
 * PATCH /api/admin-enquiries?id=xxx  — update status, notes, or halaxy_client_url
 */

import { isAuthed, getSessionUser } from './_auth.js';
import { supabase } from './_supabase.js';
import { halaxyGet } from './_halaxy.js';

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorised' });

  const db           = supabase();
  const params       = req.url ? new URL(req.url, 'http://x').searchParams : new URLSearchParams();
  const id           = req.query?.id           || params.get('id');
  const halaxySearch = req.query?.halaxy_search || params.get('halaxy_search');
  const user  = getSessionUser(req);
  const actor = user?.name || 'Admin';

  /* ── GET /api/admin-enquiries?halaxy_fees=1[&org_id=<id>] — fetch ChargeItemDefinition list ── */
  if (req.method === 'GET' && (req.query?.halaxy_fees || params.get('halaxy_fees'))) {
    if (!process.env.HALAXY_CLIENT_ID) return res.status(200).json({ fees: [] });
    try {
      const orgId    = req.query?.org_id || params.get('org_id') || null;
      const query    = { status: 'active', _count: '200' };
      // If an org ID is supplied, try filtering fees by that funder organisation
      if (orgId) query['context'] = `Organization/${orgId}`;
      const bundle = await halaxyGet('/ChargeItemDefinition', query);
      const fees   = (bundle.entry || []).map(e => e.resource).filter(Boolean).map(r => {
        const name = r.title || r.name || r.description || 'Fee';
        // Skip archived fees (Halaxy doesn't always honour status filter)
        if (/archived/i.test(name)) return null;

        // Extract price from propertyGroup[].priceComponent[].amount
        let amount = null, currency = 'AUD';
        if (r.propertyGroup) {
          for (const pg of r.propertyGroup) {
            for (const pc of (pg.priceComponent || [])) {
              if (pc.amount?.value != null) { amount = pc.amount.value; currency = pc.amount.currency || 'AUD'; break; }
            }
            if (amount !== null) break;
          }
        }
        if (amount === null) return null;

        // Try to extract funder org reference from useContext or extensions
        let funderOrgId = '', funderName = '';
        for (const uc of (r.useContext || [])) {
          const ref = uc.valueReference?.reference || '';
          if (ref.startsWith('Organization/')) { funderOrgId = ref.replace('Organization/', ''); funderName = uc.valueReference?.display || ''; break; }
          const v = uc.valueCodeableConcept?.text || uc.valueCodeableConcept?.coding?.[0]?.display || '';
          if (v) { funderName = v; break; }
        }
        // Check extensions for funder reference (Halaxy may use proprietary extension)
        if (!funderOrgId) {
          for (const ext of (r.extension || [])) {
            if (ext.valueReference?.reference?.startsWith('Organization/')) {
              funderOrgId = ext.valueReference.reference.replace('Organization/', '');
              funderName  = ext.valueReference.display || funderName;
              break;
            }
          }
        }
        return { id: r.id, name, amount, currency, funderOrgId, funderName };
      }).filter(Boolean);
      return res.status(200).json({ fees });
    } catch (err) {
      return res.status(200).json({ fees: [], error: err.message });
    }
  }

  /* ── GET ?halaxy_fees_raw=1 — return first 5 raw ChargeItemDefinition resources for debugging ── */
  if (req.method === 'GET' && params.get('halaxy_fees_raw')) {
    if (!process.env.HALAXY_CLIENT_ID) return res.status(200).json({ raw: [] });
    try {
      const bundle = await halaxyGet('/ChargeItemDefinition', { status: 'active', _count: '5' });
      const raw = (bundle.entry || []).slice(0, 5).map(e => e.resource).filter(Boolean);
      return res.status(200).json({ raw });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /* ── GET ?halaxy_funders=1 — fetch Organisation list (funders) ── */
  if (req.method === 'GET' && params.get('halaxy_funders')) {
    if (!process.env.HALAXY_CLIENT_ID) return res.status(200).json({ funders: [] });
    try {
      const bundle = await halaxyGet('/Organization', { _count: '100' });
      const funders = (bundle.entry || []).map(e => e.resource).filter(Boolean).map(org => {
        const typeText = org.type?.[0]?.text || org.type?.[0]?.coding?.[0]?.display || org.type?.[0]?.coding?.[0]?.code || '';
        const name     = org.name || '';
        if (!name || name === 'nil') return null;

        // Map Halaxy funder type → our billing workflow key
        const t = typeText.toLowerCase();
        const n = name.toLowerCase();
        let billingKey = 'private';
        if (t === 'medicare')                                          billingKey = 'medicare';
        else if (t === 'ndis')                                         billingKey = 'ndis_plan';
        else if (t.includes('bupa adf') || n.includes('bupa adf')
              || n.includes('defence') || n.includes('dva'))          billingKey = 'dva';
        else if (t.includes('third-party') || t.includes('third party')
              || n.includes('qfes') || n.includes('eap'))             billingKey = 'qfes';
        else if (t.includes('worker') || t.includes('compensation'))  billingKey = 'other';

        return { id: org.id, name, type: typeText, billingKey };
      }).filter(Boolean);
      return res.status(200).json({ funders });
    } catch (err) {
      return res.status(200).json({ funders: [], error: err.message });
    }
  }

  /* ── GET ?halaxy_patient_name=<query> — search Halaxy patients by name ── */
  if (req.method === 'GET' && params.get('halaxy_patient_name')) {
    const q = params.get('halaxy_patient_name').trim();
    if (!q || !process.env.HALAXY_CLIENT_ID) return res.status(200).json({ patients: [] });
    try {
      const bundle   = await halaxyGet('/Patient', { name: q, _count: '10' });
      const patients = (bundle.entry || []).map(e => e.resource).filter(Boolean).map(p => {
        const n    = p.name?.[0] || {};
        const name = [[...(n.given || [])].join(' '), n.family].filter(Boolean).join(' ') || p.id;
        return { id: p.id, name };
      });
      return res.status(200).json({ patients });
    } catch (err) {
      return res.status(200).json({ patients: [], error: err.message });
    }
  }

  /* ── GET ?halaxy_coverage=<patientId> — fetch patient's Coverage (funder) ── */
  if (req.method === 'GET' && params.get('halaxy_coverage')) {
    const patientId = params.get('halaxy_coverage').trim();
    if (!patientId || !process.env.HALAXY_CLIENT_ID) return res.status(200).json({ coverage: [] });
    try {
      const bundle   = await halaxyGet('/Coverage', { patient: patientId, _count: '5' });
      const coverage = (bundle.entry || []).map(e => e.resource).filter(Boolean).map(c => ({
        id:       c.id,
        payor:    c.payor?.[0]?.display || c.payor?.[0]?.reference || '',
        typeText: c.type?.text || c.type?.coding?.[0]?.display || '',
        status:   c.status,
      }));
      return res.status(200).json({ coverage });
    } catch (err) {
      return res.status(200).json({ coverage: [], error: err.message });
    }
  }

  /* ── GET /api/admin-enquiries?halaxy_search=<email> — find Halaxy patient by email ── */
  if (req.method === 'GET' && halaxySearch) {
    if (!process.env.HALAXY_CLIENT_ID) return res.status(200).json({ patients: [] });
    try {
      const bundle   = await halaxyGet('/Patient', { email: halaxySearch.trim(), _count: '5' });
      const patients = (bundle.entry || []).map(e => e.resource).filter(Boolean);
      return res.status(200).json({ patients });
    } catch (err) {
      return res.status(200).json({ patients: [], error: err.message });
    }
  }

  /* ── GET — pipeline data ── */
  if (req.method === 'GET') {
    const [{ data: enquiries }, { data: clients }, { data: activityRaw }] = await Promise.all([
      db.from('enquiries').select('*').order('created_at', { ascending: false }),
      db.from('clients').select(`
        id, display_name, funder, plan_manager, halaxy_id, enquiry_id,
        active, notes, created_at,
        sessions (id, session_date, status, invoice_ref, amount, notes)
      `).order('display_name', { ascending: true }),
      db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200),
    ]);

    const activityByEnquiry = {};
    (activityRaw || []).forEach(a => {
      if (!activityByEnquiry[a.enquiry_id]) activityByEnquiry[a.enquiry_id] = [];
      if (activityByEnquiry[a.enquiry_id].length < 5) activityByEnquiry[a.enquiry_id].push(a);
    });

    const enrichedEnquiries = (enquiries || []).map(e => ({
      ...e,
      activity: activityByEnquiry[e.id] || [],
    }));

    let halaxy = { connected: false, appointments: [], patients: [] };
    if (process.env.HALAXY_CLIENT_ID && process.env.HALAXY_CLIENT_SECRET) {
      try {
        const now    = new Date();
        const [apptBundle, patientBundle] = await Promise.all([
          halaxyGet('/Appointment', {
            date:   `ge${now.toISOString().slice(0, 10)}`,
            _sort:  'date',
            _count: '100',
          }),
          halaxyGet('/Patient', { _count: '200' }),
        ]);
        halaxy = {
          connected:    true,
          appointments: (apptBundle.entry    || []).map(e => e.resource).filter(Boolean),
          patients:     (patientBundle.entry || []).map(e => e.resource).filter(Boolean),
        };
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

  /* ── PATCH — update enquiry ── */
  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const { status, notes, halaxy_client_url } = req.body || {};
    const update = {};
    if (status            !== undefined) update.status            = status;
    if (notes             !== undefined) update.notes             = notes;
    if (halaxy_client_url !== undefined) update.halaxy_client_url = halaxy_client_url;

    const { error } = await db.from('enquiries').update(update).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });

    const logs = [];
    if (status            !== undefined) logs.push({ enquiry_id: id, actor, action: 'status', detail: status });
    if (notes             !== undefined) logs.push({ enquiry_id: id, actor, action: 'notes',  detail: null });
    if (halaxy_client_url !== undefined) logs.push({ enquiry_id: id, actor, action: 'halaxy', detail: halaxy_client_url ? 'linked' : 'cleared' });
    if (logs.length) await db.from('activity_log').insert(logs).catch(() => {});

    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
