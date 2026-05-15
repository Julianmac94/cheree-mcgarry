/**
 * api/admin-enquiries.js
 *
 * GET  /api/admin-enquiries          — pipeline data (enquiries + clients + Halaxy)
 * PATCH /api/admin-enquiries?id=xxx  — update status, notes, or halaxy_client_url
 */

import { isAuthed, getSessionUser } from './_auth.js';
import { supabase } from './_supabase.js';
import { halaxyGet } from './_halaxy.js';

/* ─────────────────────────────────────────────
   Halaxy config cache helpers (non-PII data)
   Stores funders + fees in Supabase settings table
   so we only hit Halaxy when explicitly refreshing.
   ───────────────────────────────────────────── */

async function readCache(db, key) {
  try {
    const { data } = await db.from('settings').select('value, updated_at').eq('key', key).single();
    if (!data?.value) return null;
    return JSON.parse(data.value);
  } catch (_) { return null; }
}

async function writeCache(db, key, value) {
  await db.from('settings').upsert({
    key,
    value:      JSON.stringify(value),
    updated_at: new Date().toISOString(),
  });
}

/**
 * Clinical/professional type patterns — these are referrers (GPs, psychiatrists, etc.)
 * not funding bodies. Any Halaxy Organisation whose type matches these is excluded.
 */
const PROFESSIONAL_TYPE_PATTERNS = [
  'general pract', 'general practice', 'gp ', ' gp', '^gp$',
  'psychiatr', 'psycholog', 'mental health professional',
  'physiother', 'occupational therap', 'speech therap', 'speech pathol',
  'social work', 'allied health', 'dietitian', 'optometr', 'podiatr',
  'dental', 'dentist', 'pharmacy', 'pharmacist',
  'specialist', 'surgeon', 'surgery',
  'hospital', 'medical centre', 'health centre', 'medical practice',
  'referrer', 'referring', 'practitioner',
  'nursing', 'midwif', 'paramedic',
];

function isProfessionalOrg(name, typeText) {
  const t = typeText.toLowerCase(), n = name.toLowerCase();
  return PROFESSIONAL_TYPE_PATTERNS.some(p => {
    const rx = new RegExp(p.startsWith('^') ? p : p, 'i');
    return rx.test(t) || rx.test(n);
  });
}

function mapOrgToFunder(org) {
  const typeText = org.type?.[0]?.text || org.type?.[0]?.coding?.[0]?.display || org.type?.[0]?.coding?.[0]?.code || '';
  const name     = org.name || '';
  if (!name || name === 'nil') return null;
  // Skip professionals / clinical referrers — only funding bodies belong in this list
  if (isProfessionalOrg(name, typeText)) return null;
  const t = typeText.toLowerCase(), n = name.toLowerCase();
  let billingKey = 'private';
  if (t === 'medicare' || n === 'medicare')                           billingKey = 'medicare';
  else if (t.includes('ndis') || n.includes('ndis')
        || t.includes('plan management') || n.includes('plan management')
        || n.includes('plan partners')   || n.includes('ndsp'))      billingKey = 'ndis_plan';
  else if (t.includes('bupa adf') || n.includes('bupa adf')
        || n.includes('defence')  || n.includes('dva'))              billingKey = 'dva';
  else if (t.includes('third-party') || t.includes('third party')
        || n.includes('qfes')     || n.includes('eap')
        || n.includes('queensland fire') || n.includes('fire and emergency')) billingKey = 'qfes';
  else if (t.includes('worker')  || t.includes('compensation')
        || n.includes('workcover') || n.includes('return to work'))   billingKey = 'other';
  return { id: org.id, name, type: typeText, billingKey };
}

// Fee names that are junk/admin and should never appear in the billing dropdown
const SKIP_FEE_PATTERNS = [/archived/i, /^test fee$/i, /^business development$/i, /ayurveda/i, /set.up appointment/i];

function mapCidToFee(r) {
  const name = r.title || r.name || r.description || 'Fee';
  if (SKIP_FEE_PATTERNS.some(p => p.test(name))) return null;
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
  // Halaxy does not embed Organization references in ChargeItemDefinition useContext —
  // funderOrgId/funderName will always be empty; filtering is done client-side by keywords.
  return { id: r.id, name, amount, currency, funderOrgId: '', funderName: '' };
}

const KNOWN_FUNDERS = [
  { id: 'medicare',         name: 'Medicare',                       type: 'Medicare',              billingKey: 'medicare'  },
  { id: 'private',          name: 'Private',                        type: 'Private',               billingKey: 'private'   },
  { id: 'thorne-collins',   name: 'Thorne Collins',                 type: 'Private',               billingKey: 'private'   },
  { id: 'in-choice',        name: 'In Choice Plan Management',      type: 'NDIS',                  billingKey: 'ndis_plan' },
  { id: 'plan-partners',    name: 'Plan Partners',                  type: 'NDIS',                  billingKey: 'ndis_plan' },
  { id: 'ndsp',             name: 'NDSP',                           type: 'NDIS',                  billingKey: 'ndis_plan' },
  { id: 'icasau',           name: 'ICASAU',                         type: 'NDIS',                  billingKey: 'ndis_plan' },
  { id: 'future-by-design', name: 'Future By Design',               type: 'NDIS',                  billingKey: 'ndis_plan' },
  { id: 'freedom-pm',       name: 'Freedom Plan Management',        type: 'NDIS',                  billingKey: 'ndis_plan' },
  { id: 'alliance-pm',      name: 'Alliance Plan Management',       type: 'Third-party body',      billingKey: 'ndis_plan' },
  { id: 'purple-leopard',   name: 'Purple Leopard Plan Management', type: 'NDIS',                  billingKey: 'ndis_plan' },
  { id: 'ndis-direct',      name: 'NDIS',                           type: 'NDIS',                  billingKey: 'ndis_self' },
  { id: 'qfes',             name: 'QFES',                           type: 'Third-party body',      billingKey: 'qfes'      },
  { id: 'bupa-adf',         name: 'BUPA ADF Health Services',       type: 'BUPA ADF',              billingKey: 'dva'       },
  { id: 'rtwsa',            name: 'ReturnToWorkSA',                 type: "Worker's Compensation", billingKey: 'other'     },
  { id: 'workcover-qld',    name: 'WorkCover QLD',                  type: "Worker's Compensation", billingKey: 'other'     },
];

async function syncHalaxyConfig(db) {
  const [orgBundle, cidBundle] = await Promise.all([
    halaxyGet('/Organization',         { _count: '200' }).catch(e => { console.error('Org fetch:', e.message); return { entry: [] }; }),
    halaxyGet('/ChargeItemDefinition', { status: 'active', _count: '200' }).catch(e => { console.error('CID fetch:', e.message); return { entry: [] }; }),
  ]);

  // ── Funders ──────────────────────────────────────────────────────────
  const normalise = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // Get all Halaxy orgs (mapOrgToFunder still filters obvious professionals by type text)
  const halaxyOrgs = (orgBundle.entry || []).map(e => e.resource).filter(Boolean).map(mapOrgToFunder).filter(Boolean);
  console.log(`Halaxy /Organization returned ${(orgBundle.entry||[]).length} total, ${halaxyOrgs.length} after professional filter`);

  // Build a lookup: normalised name → Halaxy org (for name-matching)
  const halaxyOrgByName = {};
  halaxyOrgs.forEach(o => { halaxyOrgByName[normalise(o.name)] = o; });

  // Merge strategy — KNOWN_FUNDERS is the canonical allowlist:
  //  1. For each KNOWN_FUNDER, look for a Halaxy org with a matching name.
  //     If found, swap in the real Halaxy ID so feeMap lookups work.
  //  2. Only add a Halaxy org that isn't in KNOWN_FUNDERS if its type text
  //     explicitly marks it as a funding body (not just any unknown org).
  //     This prevents referrer clinics and practitioners leaking through.
  const funders = KNOWN_FUNDERS.map(kf => {
    const match = halaxyOrgByName[normalise(kf.name)];
    if (match) return { ...kf, id: match.id, halaxyId: match.id };
    return kf;
  });

  // Add Halaxy orgs not in KNOWN_FUNDERS ONLY if their type clearly marks them as a funder
  const knownNames = new Set(KNOWN_FUNDERS.map(kf => normalise(kf.name)));
  const EXPLICIT_FUNDER_TYPE_PATTERNS = [
    'medicare', 'ndis', 'plan management', 'plan manager',
    'insurance', 'insurer', 'workers comp', "worker's comp",
    'dva', 'defence', 'adf', 'eap', 'third.party', 'government fund',
  ];
  halaxyOrgs.forEach(o => {
    if (knownNames.has(normalise(o.name))) return; // already included via KNOWN_FUNDERS
    const t = (o.type || '').toLowerCase(), n = normalise(o.name);
    const looksLikeFunder = EXPLICIT_FUNDER_TYPE_PATTERNS.some(p => t.includes(p) || n.includes(p));
    if (looksLikeFunder) {
      console.log(`Adding unlisted funder from Halaxy: ${o.name} (${o.type})`);
      funders.push(o);
    } else {
      console.log(`Skipping Halaxy org (not a known funder): ${o.name} (${o.type})`);
    }
  });

  const funderSource = halaxyOrgs.length > 0 ? 'halaxy+seed' : 'seed';
  console.log(`Halaxy sync: ${halaxyOrgs.length} filtered Halaxy orgs → ${funders.length} funders (${funderSource})`);

  // ── Fees ─────────────────────────────────────────────────────────────
  // Halaxy has no funder references inside ChargeItemDefinition — feeMap will be empty
  // and client-side keyword matching is the only filter mechanism.
  const rawFees = (cidBundle.entry || []).map(e => e.resource).filter(Boolean).map(mapCidToFee).filter(Boolean);

  // Deduplicate by name+amount (Halaxy often has the same fee set up multiple times)
  const seen = new Set();
  const fees = rawFees.filter(f => {
    const key = `${f.name}|${f.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Halaxy sync: ${rawFees.length} raw fees → ${fees.length} after dedup. Sample: ${fees.slice(0,8).map(f=>f.name).join(' | ')}`);

  const feeMap = {}; // always empty — Halaxy doesn't provide org refs in fees

  await Promise.all([
    writeCache(db, 'halaxy_funders_cache', { funders, synced_at: new Date().toISOString(), source: funderSource }),
    writeCache(db, 'halaxy_fees_cache',    { fees,    synced_at: new Date().toISOString() }),
    writeCache(db, 'halaxy_fee_funder_map', feeMap),
  ]);
  return { funders, fees, feeMap };
}

/**
 * Extract the full legal name from a FHIR Patient resource.
 * Prefers name entries with use='official', then 'usual', then first available.
 * Always returns given + family so the displayed name is unambiguous.
 */
function fhirPatientLegalName(p) {
  const names = p.name || [];
  const pick  = names.find(n => n.use === 'official')
             || names.find(n => n.use === 'usual')
             || names[0]
             || {};
  const given  = [...(pick.given || [])].join(' ');
  const family = pick.family || '';
  return [given, family].filter(Boolean).join(' ') || p.id || 'Unknown';
}

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorised' });

  /* ── POST ?halaxy_sync=1 — force re-fetch funders + fees from Halaxy and cache ── */
  if (req.method === 'POST' && (req.query?.halaxy_sync || new URL(req.url, 'http://x').searchParams.get('halaxy_sync'))) {
    if (!process.env.HALAXY_CLIENT_ID) return res.status(200).json({ ok: false, error: 'Halaxy not configured' });
    const db = supabase();
    try {
      const { funders, fees, feeMap } = await syncHalaxyConfig(db);
      return res.status(200).json({ ok: true, funders: funders.length, fees: fees.length, feeMapEntries: Object.keys(feeMap).length });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  const db           = supabase();
  const params       = req.url ? new URL(req.url, 'http://x').searchParams : new URLSearchParams();
  const id           = req.query?.id           || params.get('id');
  const halaxySearch = req.query?.halaxy_search || params.get('halaxy_search');
  const user  = getSessionUser(req);
  const actor = user?.name || 'Admin';

  /* ── GET /api/admin-enquiries?halaxy_fees=1 — read fees from Supabase cache ── */
  if (req.method === 'GET' && (req.query?.halaxy_fees || params.get('halaxy_fees'))) {
    if (!process.env.HALAXY_CLIENT_ID) return res.status(200).json({ fees: [] });
    try {
      // Serve from cache if available
      const cached = await readCache(db, 'halaxy_fees_cache');
      if (cached?.fees?.length) return res.status(200).json({ fees: cached.fees, synced_at: cached.synced_at });
      // Cache empty — fetch live and store
      const query  = { status: 'active', _count: '200' };
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

  /* ── GET ?halaxy_fees_raw=1 — diagnostic: fee names + funder fields ── */
  if (req.method === 'GET' && params.get('halaxy_fees_raw')) {
    if (!process.env.HALAXY_CLIENT_ID) return res.status(200).json({ fees: [] });
    try {
      const bundle = await halaxyGet('/ChargeItemDefinition', { status: 'active', _count: '200' });
      const fees = (bundle.entry || []).map(e => e.resource).filter(Boolean).map(r => {
        const name = r.title || r.name || r.description || 'Fee';
        let amount = null;
        if (r.propertyGroup) {
          for (const pg of r.propertyGroup) {
            for (const pc of (pg.priceComponent || [])) {
              if (pc.amount?.value != null) { amount = pc.amount.value; break; }
            }
            if (amount !== null) break;
          }
        }
        // Capture all useContext entries and extensions so we can see what Halaxy sends
        const useContextSummary = (r.useContext || []).map(uc => ({
          code: uc.code?.code, valueRef: uc.valueReference?.reference,
          valueDisplay: uc.valueReference?.display, valueConcept: uc.valueCodeableConcept?.text,
        }));
        const extSummary = (r.extension || []).slice(0, 3).map(e => ({
          url: e.url, valueRef: e.valueReference?.reference, valueDisplay: e.valueReference?.display,
        }));
        return { name, amount, useContext: useContextSummary, extensions: extSummary };
      });
      return res.status(200).json({ count: fees.length, fees });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /* ── GET ?halaxy_appts_raw=1 — diagnostic: dump full raw appointment resources ── */
  if (req.method === 'GET' && params.get('halaxy_appts_raw')) {
    if (!process.env.HALAXY_CLIENT_ID) return res.status(200).json({ appointments: [] });
    try {
      const now = new Date();
      // Fetch first 5 appointments with _include AND dump the raw resource so we can see every field
      const apptBundle = await halaxyGet('/Appointment', {
        date: `ge${now.toISOString().slice(0, 10)}`, _sort: 'date', _count: '5', _include: 'Appointment:patient',
      });
      // Also fetch a single appointment individually to see if it has more fields
      const firstId = apptBundle.entry?.[0]?.resource?.id;
      let singleAppt = null;
      if (firstId) {
        try { singleAppt = await halaxyGet(`/Appointment/${firstId}`); } catch (_) {}
      }
      return res.status(200).json({
        bundleEntries: (apptBundle.entry || []).map(e => e.resource),
        singleAppt,
      });
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
      const patients = (bundle.entry || []).map(e => e.resource).filter(Boolean).map(p => ({
        id: p.id, name: fhirPatientLegalName(p),
      }));
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
      const patients = (bundle.entry || []).map(e => e.resource).filter(Boolean).map(p => ({
        id: p.id, name: fhirPatientLegalName(p),
      }));
      return res.status(200).json({ patients });
    } catch (err) {
      return res.status(200).json({ patients: [], error: err.message });
    }
  }

  /* ── GET — pipeline data ── */
  if (req.method === 'GET') {
    const [
      { data: enquiries }, { data: clients }, { data: activityRaw },
      fundersCached, feesCached, feeMapCached,
    ] = await Promise.all([
      db.from('enquiries').select('*').order('created_at', { ascending: false }),
      db.from('clients').select(`
        id, display_name, funder, plan_manager, halaxy_id, enquiry_id,
        active, notes, created_at,
        sessions (id, session_date, status, invoice_ref, amount, notes)
      `).order('display_name', { ascending: true }),
      db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200),
      readCache(db, 'halaxy_funders_cache'),
      readCache(db, 'halaxy_fees_cache'),
      readCache(db, 'halaxy_fee_funder_map'),
    ]);

    // Auto-sync config from Halaxy if cache is empty (first run)
    let cachedFunders = fundersCached?.funders || [];
    let cachedFees    = feesCached?.fees       || [];
    let cachedFeeMap  = feeMapCached           || {};
    if (process.env.HALAXY_CLIENT_ID && (!cachedFunders.length || !cachedFees.length)) {
      try {
        const synced  = await syncHalaxyConfig(db);
        cachedFunders = synced.funders;
        cachedFees    = synced.fees;
        cachedFeeMap  = synced.feeMap;
      } catch (e) { console.error('Auto-sync failed:', e.message); }
    }

    const activityByEnquiry = {};
    (activityRaw || []).forEach(a => {
      if (!activityByEnquiry[a.enquiry_id]) activityByEnquiry[a.enquiry_id] = [];
      if (activityByEnquiry[a.enquiry_id].length < 5) activityByEnquiry[a.enquiry_id].push(a);
    });

    const enrichedEnquiries = (enquiries || []).map(e => ({
      ...e,
      activity: activityByEnquiry[e.id] || [],
    }));

    let halaxy = { connected: false, appointments: [], patients: [], funders: cachedFunders, fees: cachedFees, feeMap: cachedFeeMap };
    if (process.env.HALAXY_CLIENT_ID && process.env.HALAXY_CLIENT_SECRET) {
      try {
        const now           = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const [apptBundle, patientBundle] = await Promise.all([
          halaxyGet('/Appointment', {
            date:     `ge${thirtyDaysAgo.toISOString().slice(0, 10)}`, // past 30 days + future
            _sort:    'date',
            _count:   '200',
            _include: 'Appointment:patient',
          }),
          halaxyGet('/Patient', { _count: '200' }),
        ]);
        // _include=Appointment:patient adds Patient resources as extra entries —
        // split by resourceType so we don't treat Patient records as Appointments.
        const allBundleResources = (apptBundle.entry || []).map(e => e.resource).filter(Boolean);
        const appointments       = allBundleResources.filter(r => r.resourceType === 'Appointment');
        const includedPatients   = allBundleResources.filter(r => r.resourceType === 'Patient');

        // Build a fast id→name map from the included Patient resources
        const patientMap = {};
        includedPatients.forEach(p => {
          if (!p.id) return;
          const n = fhirPatientLegalName(p);
          if (n) patientMap[p.id] = n;
        });

        halaxy = {
          connected:    true,
          appointments,
          patientMap,
          patients:     (patientBundle.entry || []).map(e => e.resource).filter(Boolean).map(p => ({
            id: p.id, name: fhirPatientLegalName(p),
          })),
          funders:      cachedFunders,
          fees:         cachedFees,
          feeMap:       cachedFeeMap,
          funders_synced_at: fundersCached?.synced_at || null,
          fees_synced_at:    feesCached?.synced_at    || null,
        };
      } catch (err) {
        console.error('Halaxy API error:', err.message);
        halaxy = { connected: false, error: err.message, appointments: [], patients: [], funders: cachedFunders, fees: cachedFees, feeMap: cachedFeeMap };
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
