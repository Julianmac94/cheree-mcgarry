/**
 * api/admin-enquiries.js
 *
 * GET  /api/admin-enquiries          — pipeline data (enquiries + clients + Halaxy)
 * PATCH /api/admin-enquiries?id=xxx  — update status, notes, or halaxy_client_url
 */

import { Resend } from 'resend';
import { isAuthed, getSessionUser } from './_auth.js';
import { supabase } from './_supabase.js';
import { halaxyGet, halaxyPost, halaxyPatch } from './_halaxy.js';
import { createCalendarEvent } from './calendar-pending.js';

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
        || n.includes('workcover') || n.includes('return to work')
        || n.includes('worksafe') || n.includes('returntowork'))      billingKey = 'workcover';
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
  const [orgBundle, cidBundle, prBundle] = await Promise.all([
    halaxyGet('/Organization',         { _count: '200' }).catch(e => { console.error('Org fetch:', e.message); return { entry: [] }; }),
    halaxyGet('/ChargeItemDefinition', { status: 'active', _count: '200' }).catch(e => { console.error('CID fetch:', e.message); return { entry: [] }; }),
    halaxyGet('/PractitionerRole',     { _count: '10'  }).catch(e => { console.error('PR fetch:', e.message); return { entry: [] }; }),
  ]);

  // Cache the first PR- prefixed PractitionerRole — used for $book calls
  const prEntries = (prBundle.entry || []).map(e => e.resource).filter(Boolean);
  const prRole = prEntries.find(pr => pr.id && pr.id.startsWith('PR-'));
  if (prRole) {
    console.log(`Halaxy sync: caching PractitionerRole ${prRole.id}`);
    await writeCache(db, 'halaxy_practitioner_role', { id: prRole.id, synced_at: new Date().toISOString() });
  } else {
    console.warn('Halaxy sync: no PR- PractitionerRole found in response');
  }

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

  console.log(`Halaxy sync: ${rawFees.length} raw fees → ${fees.length} after dedup. Sample IDs+names: ${fees.slice(0,8).map(f=>`${f.id}:${f.name}`).join(' | ')}`);

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

/* ─────────────────────────────────────────────────────────────────────────
   FHIR Appointment write-back helpers
   ───────────────────────────────────────────────────────────────────────── */

const HALAXY_FHIR_BASE_URL = 'https://au-api.halaxy.com/main';

/**
 * Build a FHIR Parameters resource for POST /Appointment/$book.
 * Docs: https://developers.halaxy.com/reference/createappointment
 *
 * Required: appt-resource (with PractitionerRole), patient-id, location-type
 * Optional: charge-item-definition-id (triggers auto-invoice + note + reminder in Halaxy)
 */
function buildBookParameters(patientId, start, end, feeId, locationType, practitionerRoleId) {
  const duration = (start && end)
    ? Math.max(1, Math.round((new Date(end) - new Date(start)) / 60000))
    : 60;

  const parameter = [
    {
      name: 'appt-resource',
      resource: {
        resourceType:    'Appointment',
        start:           start  || undefined,
        end:             end    || undefined,
        minutesDuration: duration,
        participant: [{
          actor: {
            // Halaxy $book expects relative references, not absolute URLs
            reference: `PractitionerRole/${practitionerRoleId}`,
            type:      'PractitionerRole',
          },
        }],
      },
    },
    {
      name:           'patient-id',
      valueReference: {
        reference: `Patient/${patientId}`,
        type:      'Patient',
      },
    },
    {
      name:      'location-type',
      valueCode: locationType || 'clinic',
    },
  ];

  // Including the fee triggers Halaxy to auto-create the invoice, clinical note and reminder.
  if (feeId) {
    parameter.push({
      name:           'charge-item-definition-id',
      valueReference: {
        reference: `ChargeItemDefinition/${feeId}`,
        type:      'ChargeItemDefinition',
      },
    });
  }

  return { resourceType: 'Parameters', parameter };
}

/**
 * Build a merge-patch for PATCH /Appointment/{id} — record a session with a fee.
 *
 * Halaxy exposes `supportingInformation` on the PATCH schema with type=ChargeItemDefinition,
 * which is the correct mechanism for attaching a fee to an appointment so Halaxy generates
 * the invoice automatically.  The comment field carries session notes.
 */
function buildRecordedAppt(apptId, patientId, start, end, feeId, feeName, feeAmount, notes) {
  const appt = { resourceType: 'Appointment' };
  if (notes) appt.comment = notes;

  // Attach the fee via supportingInformation → ChargeItemDefinition reference.
  // Halaxy uses this to determine the billing rate and trigger invoice generation.
  if (feeId) {
    appt.supportingInformation = [{
      reference: `ChargeItemDefinition/${feeId}`,
      type:      'ChargeItemDefinition',
    }];
  }

  return appt;
}

// Note: POST /ChargeItem → 404 (Halaxy FHIR API is read-only for billing).
// POST /Invoice → 405. Invoices must be created in the Halaxy web UI.
// The dashboard tracks pending sessions locally and reads real invoices via GET /Invoice.

/**
 * Build a FHIR Appointment resource for PATCH /Appointment/{id} — mark cancelled.
 */
function buildCancelledAppt(apptId, patientId, start, end, notes) {
  const appt = {
    resourceType: 'Appointment',
    status: 'cancelled',
    participant: [{ actor: { reference: `Patient/${patientId}` }, status: 'declined' }],
    cancelationReason: { text: notes || 'Client cancellation' },
  };
  if (apptId) appt.id      = apptId;
  if (start)  appt.start   = start;
  if (end)    appt.end     = end;
  return appt;
}

/* ─────────────────────────────────────────────────────────────────────────
   48-hour appointment reminder helpers
   (merged from api/admin-reminder.js to stay under Vercel Hobby 12-fn limit)
   ───────────────────────────────────────────────────────────────────────── */

const _resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const RC = {
  cream:    '#F3EFE6',
  tealDeep: '#192E2A',
  teal:     '#2A5850',
  tealMid:  '#376B62',
  soft:     '#7A948F',
  mid:      '#3E5C56',
};

function _reminderEscapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _reminderFmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane',
  });
}

function _reminderFmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'Australia/Brisbane',
  });
}

function _reminderLocationLabel(type) {
  return { clinic: 'In-clinic (Mitchelton)', telehealth: 'Telehealth — video call', phone: 'Phone call', online: 'Online' }[type] || 'In-clinic';
}

function _reminderHtml({ clientName, dateLabel, timeLabel, locationLabel }) {
  const name = clientName || 'there';
  const e = _reminderEscapeHtml;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your appointment reminder</title>
</head>
<body style="margin:0;padding:0;background:${RC.cream};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${RC.cream};padding:40px 20px 60px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="padding:0 0 28px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:14px;vertical-align:middle;">
                  <div style="width:38px;height:38px;background:${RC.teal};border-radius:50%;"></div>
                </td>
                <td style="vertical-align:middle;">
                  <span style="display:block;font-size:17px;font-weight:500;color:${RC.teal};letter-spacing:0.01em;">Cheree McGarry</span>
                  <span style="display:block;font-size:9px;font-weight:400;letter-spacing:0.14em;text-transform:uppercase;color:${RC.soft};margin-top:2px;">Counselling &amp; Wellness</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:14px;border:1px solid rgba(42,88,80,0.10);overflow:hidden;padding:36px 40px 40px;">
            <p style="font-size:16px;font-weight:500;color:${RC.tealDeep};margin:0 0 20px;">Hi ${e(name)},</p>
            <p style="font-size:14px;color:${RC.mid};line-height:1.7;margin:0 0 24px;">
              This is a friendly reminder that you have an appointment with Cheree coming up in
              <strong style="color:${RC.tealDeep}">approximately 48 hours</strong>.
            </p>
            <div style="background:rgba(42,88,80,0.05);border-radius:10px;border:1px solid rgba(42,88,80,0.12);padding:18px 22px;margin:0 0 28px;">
              <table cellpadding="0" cellspacing="0" style="width:100%">
                <tr>
                  <td style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${RC.teal};padding-bottom:12px;" colspan="2">Appointment details</td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:${RC.soft};padding-bottom:6px;width:100px">Date</td>
                  <td style="font-size:13px;font-weight:500;color:${RC.tealDeep};padding-bottom:6px">${e(dateLabel)}</td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:${RC.soft};padding-bottom:6px">Time</td>
                  <td style="font-size:13px;font-weight:500;color:${RC.tealDeep};padding-bottom:6px">${e(timeLabel)}</td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:${RC.soft}">Format</td>
                  <td style="font-size:13px;font-weight:500;color:${RC.tealDeep}">${e(locationLabel)}</td>
                </tr>
              </table>
            </div>
            <p style="font-size:13.5px;color:${RC.mid};line-height:1.7;margin:0 0 16px;">
              If you need to reschedule or have any questions, please get in touch as soon as possible —
              ideally <strong>more than 24 hours before your appointment</strong> to avoid a late cancellation fee.
            </p>
            <p style="font-size:13.5px;color:${RC.mid};line-height:1.7;margin:0 0 28px;">We look forward to seeing you soon.</p>
            <p style="font-size:13.5px;color:${RC.mid};line-height:1.7;margin:0;">
              Warm regards,<br>
              <strong style="color:${RC.tealDeep};font-weight:500;">Cheree McGarry</strong><br>
              <span style="color:${RC.soft};font-size:12px;">Counselling &amp; Wellness</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 0 0;text-align:center;">
            <p style="font-size:11px;color:${RC.soft};margin:0 0 6px;">Cheree McGarry Counselling &amp; Wellness</p>
            <p style="font-size:11px;color:${RC.soft};margin:0;">
              <a href="https://chereemcgarry.com" style="color:${RC.soft};text-decoration:underline;">chereemcgarry.com</a>
              &nbsp;&middot;&nbsp;
              <a href="mailto:reachout@chereemcgarry.com" style="color:${RC.soft};text-decoration:underline;">reachout@chereemcgarry.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  /* ── Cron mode: scan Halaxy for appointments ~48 hrs away and send reminders ──
   * Called by Vercel cron: GET /api/admin-enquiries?reminder_cron=1
   * Also triggered by x-vercel-cron header (no auth required — runs server-side only).
   * ─────────────────────────────────────────────────────────────────────────── */
  if (req.method === 'GET' && (req.query?.reminder_cron === '1' || req.headers['x-vercel-cron'])) {
    if (!process.env.HALAXY_CLIENT_ID) {
      return res.status(200).json({ ok: false, reason: 'Halaxy not configured' });
    }
    if (!_resend) {
      return res.status(200).json({ ok: false, reason: 'Resend not configured' });
    }
    try {
      const now   = new Date();
      const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const in50h = new Date(now.getTime() + 50 * 60 * 60 * 1000);
      const dateFrom = in48h.toISOString().slice(0, 10);
      const dateTo   = in50h.toISOString().slice(0, 10);

      const bundle = await halaxyGet('/Appointment', {
        date:     `ge${dateFrom}`,
        _sort:    'date',
        _count:   '50',
        _include: 'Appointment:patient',
      });

      const entries  = (bundle.entry || []).map(e => e.resource).filter(Boolean);
      const appts    = entries.filter(r => r.resourceType === 'Appointment'
        && r.status !== 'cancelled' && r.status !== 'entered-in-error' && r.status !== 'noshow');
      const patients = entries.filter(r => r.resourceType === 'Patient');

      const patientEmailMap = {};
      const patientNameMap  = {};
      patients.forEach(p => {
        if (!p.id) return;
        patientNameMap[p.id]  = ((p.name || []).find(n => n.use === 'official') || p.name?.[0] || {});
        const emailTelecom = (p.telecom || []).find(t => t.system === 'email' && t.value);
        if (emailTelecom) patientEmailMap[p.id] = emailTelecom.value;
      });

      let sent = 0, skipped = 0;
      for (const appt of appts) {
        if (!appt.start) { skipped++; continue; }
        const apptMs = new Date(appt.start).getTime();
        if (apptMs < in48h.getTime() || apptMs > in50h.getTime()) { skipped++; continue; }

        const patRef = (appt.participant || []).find(p => p.actor?.type === 'Patient' || (p.actor?.reference || '').includes('Patient/'));
        const pid    = patRef?.actor?.reference?.split('/').pop();
        if (!pid || !patientEmailMap[pid]) { skipped++; continue; }

        const nameObj  = patientNameMap[pid] || {};
        const fullName = [(nameObj.given || []).join(' '), nameObj.family].filter(Boolean).join(' ') || 'there';
        const email    = patientEmailMap[pid];
        const locType  = (appt.appointmentType?.text || '').toLowerCase().includes('video') ? 'telehealth'
                       : (appt.appointmentType?.text || '').toLowerCase().includes('phone') ? 'phone'
                       : 'clinic';

        await _resend.emails.send({
          from:    'Cheree McGarry <reachout@chereemcgarry.com>',
          to:      email,
          subject: 'Appointment reminder — ' + _reminderFmtDate(appt.start),
          html:    _reminderHtml({
            clientName:    fullName,
            dateLabel:     _reminderFmtDate(appt.start),
            timeLabel:     _reminderFmtTime(appt.start),
            locationLabel: _reminderLocationLabel(locType),
          }),
        });
        sent++;
      }

      return res.status(200).json({ ok: true, sent, skipped });
    } catch (err) {
      console.error('Reminder cron error:', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

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

  /* ── POST ?halaxy_appt_action=1 — record attended or cancel a session in Halaxy ──
   *
   * Body fields:
   *   action        'record' | 'cancel'               (required)
   *   patientId     Halaxy Patient FHIR ID             (required)
   *   halaxyApptId  Halaxy Appointment FHIR ID         (optional — omit for Google Cal events)
   *   apptStart     ISO datetime string                (optional, e.g. "2026-05-12T10:00:00")
   *   apptEnd       ISO datetime string                (optional)
   *   feeId         ChargeItemDefinition FHIR ID       (required for 'record')
   *   feeName       Human-readable fee name            (optional)
   *   feeAmount     Numeric dollar amount              (required for 'record')
   *   notes         Session notes / cancellation note  (optional)
   *
   * For Google Cal events (no halaxyApptId): first calls POST /Appointment/$book to
   * create the appointment in Halaxy, then PATCHes it with the fee / cancelled status.
   * ─────────────────────────────────────────────────────────────────────────────────── */
  if (req.method === 'POST' && (req.query?.halaxy_appt_action || new URL(req.url, 'http://x').searchParams.get('halaxy_appt_action'))) {
    if (!process.env.HALAXY_CLIENT_ID) {
      return res.status(400).json({ error: 'Halaxy not configured' });
    }

    const {
      action, halaxyApptId, patientId, apptStart, apptEnd,
      feeId, feeName, feeAmount, notes, locationType,
    } = req.body || {};

    // Log received fields so we can confirm feeId is arriving correctly
    console.log('halaxy_appt_action:', JSON.stringify({ action, patientId, feeId: feeId || null, feeAmount: feeAmount || null, hasApptId: !!halaxyApptId }));

    if (!action || !patientId) {
      return res.status(400).json({ error: 'action and patientId are required' });
    }
    if (action === 'record' && feeAmount == null) {
      return res.status(400).json({ error: 'feeAmount is required to record a session' });
    }
    if (action !== 'record' && action !== 'cancel') {
      return res.status(400).json({ error: 'action must be "record" or "cancel"' });
    }

    try {
      let apptId = halaxyApptId || null;

      // No existing Halaxy appointment (Google Cal-only event) — use $book to create one.
      // $book with charge-item-definition-id auto-creates invoice + clinical note + reminder.
      if (!apptId) {
        const db2 = supabase();
        const prCache = await readCache(db2, 'halaxy_practitioner_role');
        const practitionerRoleId = prCache?.id;

        if (!practitionerRoleId) {
          console.warn('No PractitionerRole cached — run a Halaxy sync first. Returning calOnly.');
          return res.status(200).json({ ok: true, calOnly: true, noSync: true, halaxyApptId: null });
        }

        console.log(`Halaxy $book: patient=${patientId} start=${apptStart} pr=${practitionerRoleId} fee=${feeId || 'none'} location=${locationType || 'clinic'}`);
        const booked = await halaxyPost('/Appointment/$book',
          buildBookParameters(patientId, apptStart || null, apptEnd || null, feeId || null, locationType || 'clinic', practitionerRoleId)
        );

        apptId = booked.id
               || booked.entry?.[0]?.resource?.id
               || (booked.parameter || []).find(p => p.name === 'appointment')?.resource?.id;

        if (!apptId) {
          throw new Error('$book did not return an appointment ID. Response: ' + JSON.stringify(booked).slice(0, 300));
        }
        console.log(`Halaxy $book: created appointment ${apptId} — invoice auto-created by Halaxy`);

        // $book already created the invoice — no PATCH needed
        return res.status(200).json({ ok: true, booked: true, halaxyApptId: apptId });
      }

      let patchResult = null;

      if (action === 'record') {
        // PATCH appointment with fee via supportingInformation → ChargeItemDefinition.
        // This is the Halaxy-documented mechanism for attaching a billing rate to an appointment.
        console.log(`Halaxy PATCH: recording appointment ${apptId} with fee ${feeId || 'manual'} ($${feeAmount})`);
        patchResult = await halaxyPatch(
          `/Appointment/${apptId}`,
          buildRecordedAppt(apptId, patientId, apptStart || null, apptEnd || null, feeId || null, feeName || '', feeAmount, notes || null)
        );
        console.log('PATCH result:', JSON.stringify(patchResult).slice(0, 300));
      } else {
        // Cancel: PATCH appointment status to cancelled
        console.log(`Halaxy PATCH: cancelling appointment ${apptId}`);
        patchResult = await halaxyPatch(
          `/Appointment/${apptId}`,
          buildCancelledAppt(apptId, patientId, apptStart || null, apptEnd || null, notes || null)
        );
      }

      return res.status(200).json({ ok: true, halaxyApptId: apptId, patchResult });
    } catch (err) {
      console.error('Halaxy appt action error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  /* ── POST ?halaxy_create_patient=1 — create a new patient in Halaxy + dashboard client ──
   * Creates a FHIR R4 Patient in Halaxy, then saves a Supabase client record linked to them.
   *
   * Body fields:
   *   firstName     string   (required)
   *   lastName      string   (required)
   *   phone         string   (optional)
   *   email         string   (optional)
   *   dob           string   YYYY-MM-DD (optional)
   *   gender        string   male|female|other|unknown (optional)
   *   funder        string   billing key e.g. 'private', 'medicare', 'ndis_plan' (optional)
   *   planManager   string   plan manager name for ndis_plan (optional)
   *   notes         string   dashboard notes (optional)
   * ──────────────────────────────────────────────────────────────────────────────────── */
  if (req.method === 'POST' && (req.query?.halaxy_create_patient || new URL(req.url, 'http://x').searchParams.get('halaxy_create_patient'))) {
    if (!process.env.HALAXY_CLIENT_ID) {
      return res.status(400).json({ error: 'Halaxy not configured' });
    }

    const { firstName, lastName, phone, email, dob, gender, funder, planManager, notes,
            client_type, is_contact, parent_client_id } = req.body || {};
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }

    try {
      // Build FHIR R4 Patient resource
      const patientResource = {
        resourceType: 'Patient',
        name: [{ use: 'official', given: [firstName.trim()], family: lastName.trim() }],
      };
      if (dob)    patientResource.birthDate = dob;
      if (gender) patientResource.gender    = gender;
      const telecom = [];
      if (phone) telecom.push({ system: 'phone', value: phone.trim(), use: 'mobile' });
      if (email) telecom.push({ system: 'email', value: email.trim() });
      if (telecom.length) patientResource.telecom = telecom;

      console.log('Creating Halaxy patient:', firstName, lastName);
      const created   = await halaxyPost('/Patient', patientResource);
      const halaxyId  = created.id;
      if (!halaxyId) throw new Error('Halaxy did not return a patient ID. Response: ' + JSON.stringify(created).slice(0, 300));
      console.log('Halaxy patient created:', halaxyId);

      // Build privacy-safe display name (first name + last initial)
      const displayName = firstName.trim() + ' ' + lastName.trim()[0] + '.';

      // Create Supabase client record
      const db2 = supabase();
      const { data: client, error: clientErr } = await db2
        .from('clients')
        .insert({
          display_name:     displayName,
          halaxy_id:        halaxyId,
          funder:           funder            || null,
          plan_manager:     planManager       || null,
          notes:            notes             || null,
          client_type:      client_type       || null,
          is_contact:       is_contact        || false,
          parent_client_id: parent_client_id  || null,
          active:           true,
        })
        .select()
        .single();

      if (clientErr) throw new Error('Supabase client insert failed: ' + clientErr.message);
      console.log('Supabase client created:', client.id, 'linked to Halaxy', halaxyId);

      return res.status(201).json({ ok: true, client, halaxyId });
    } catch (err) {
      console.error('halaxy_create_patient error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  /* ── POST ?new_session=1 — create a session from the dashboard ──────────────────────
   * Creates a Google Calendar event and, for Halaxy clients, $books the appointment
   * in Halaxy (which auto-creates invoice + clinical note + reminder).
   *
   * Body fields:
   *   clientName    string   Display name for the calendar event title  (required)
   *   start         ISO      Appointment start datetime                  (required)
   *   end           ISO      Appointment end datetime                    (required)
   *   notes         string   Event description / session notes           (optional)
   *   halaxyPatientId string Halaxy Patient FHIR ID — triggers $book    (optional)
   *   feeId         string   ChargeItemDefinition ID — for auto-invoice  (optional)
   *   locationType  string   clinic|telehealth|phone|online              (optional)
   * ─────────────────────────────────────────────────────────────────────────────── */
  if (req.method === 'POST' && (req.query?.new_session || new URL(req.url, 'http://x').searchParams.get('new_session'))) {
    const { clientName, start, end, notes, halaxyPatientId, feeId, locationType } = req.body || {};

    if (!clientName || !start || !end) {
      return res.status(400).json({ error: 'clientName, start and end are required' });
    }

    try {
      // 1. Create Google Calendar event
      const calTitle = clientName + ' — session';
      const calEvent = await createCalendarEvent({ title: calTitle, start, end, notes: notes || '' });
      console.log(`New session: Cal event created ${calEvent.id} for ${clientName}`);

      // 2. If this is a Halaxy client, $book the appointment (auto-creates invoice)
      let halaxyApptId = null;
      let halaxyBooked = false;

      if (halaxyPatientId) {
        const db2 = supabase();
        const prCache = await readCache(db2, 'halaxy_practitioner_role');
        const practitionerRoleId = prCache?.id;

        if (practitionerRoleId) {
          console.log(`New session: $booking Halaxy appt for patient ${halaxyPatientId} fee=${feeId || 'none'}`);
          const booked = await halaxyPost('/Appointment/$book',
            buildBookParameters(halaxyPatientId, start, end, feeId || null, locationType || 'clinic', practitionerRoleId)
          );
          halaxyApptId = booked.id
                      || booked.entry?.[0]?.resource?.id
                      || (booked.parameter || []).find(p => p.name === 'appointment')?.resource?.id;
          if (halaxyApptId) {
            halaxyBooked = true;
            console.log(`New session: Halaxy appointment ${halaxyApptId} created — invoice auto-generated`);
          }
        } else {
          console.warn('New session: no PractitionerRole cached — skipping $book. Run a sync first.');
        }
      }

      return res.status(201).json({
        ok:           true,
        calEventId:   calEvent.id,
        halaxyApptId: halaxyApptId || null,
        halaxyBooked,
      });
    } catch (err) {
      console.error('New session error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  /* ── POST ?new_appt=1 — book a new appointment directly in Halaxy (no Google Cal) ─────────
   * Halaxy IS the calendar for client appointments. This endpoint books via $book and returns
   * the created appointment ID. Passing a feeId triggers Halaxy to auto-create invoice + note.
   *
   * Body fields:
   *   patientId     string   Halaxy Patient FHIR ID   (required)
   *   start         ISO      Appointment start         (required)
   *   end           ISO      Appointment end           (required)
   *   feeId         string   ChargeItemDefinition ID   (optional — triggers auto-invoice)
   *   locationType  string   clinic|telehealth|phone   (optional, default 'clinic')
   * ─────────────────────────────────────────────────────────────────────────────────── */
  if (req.method === 'POST' && (req.query?.new_appt || new URL(req.url, 'http://x').searchParams.get('new_appt'))) {
    if (!process.env.HALAXY_CLIENT_ID) {
      return res.status(400).json({ error: 'Halaxy not configured' });
    }
    const { patientId, start, end, feeId, locationType } = req.body || {};
    if (!patientId || !start || !end) {
      return res.status(400).json({ error: 'patientId, start and end are required' });
    }
    try {
      const db3 = supabase();
      const prCache = await readCache(db3, 'halaxy_practitioner_role');
      const practitionerRoleId = prCache?.id;
      if (!practitionerRoleId) {
        return res.status(400).json({ error: 'No PractitionerRole cached — run a Halaxy sync first' });
      }
      console.log(`new_appt: $booking patient=${patientId} start=${start} pr=${practitionerRoleId} fee=${feeId || 'none'} location=${locationType || 'clinic'}`);
      const booked = await halaxyPost('/Appointment/$book',
        buildBookParameters(patientId, start, end, feeId || null, locationType || 'clinic', practitionerRoleId)
      );
      const halaxyApptId = booked.id
        || booked.entry?.[0]?.resource?.id
        || (booked.parameter || []).find(p => p.name === 'appointment')?.resource?.id;
      if (!halaxyApptId) {
        throw new Error('$book did not return an appointment ID. Response: ' + JSON.stringify(booked).slice(0, 300));
      }
      console.log(`new_appt: Halaxy appointment ${halaxyApptId} created — invoice auto-generated`);
      return res.status(201).json({ ok: true, halaxyApptId });
    } catch (err) {
      console.error('new_appt error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  /* ── POST ?reminder=1 — manually send a 48hr reminder email for a specific appointment ──
   * Body fields:
   *   clientEmail      string  (required)
   *   clientName       string  (optional)
   *   appointmentDate  string  YYYY-MM-DD (required)
   *   appointmentTime  string  HH:MM (optional)
   *   locationType     string  clinic|telehealth|phone|online (optional)
   * ─────────────────────────────────────────────────────────────────────────────────── */
  if (req.method === 'POST' && (req.query?.reminder === '1' || new URL(req.url, 'http://x').searchParams.get('reminder') === '1')) {
    if (!_resend) return res.status(500).json({ error: 'Resend not configured' });

    const { clientEmail, clientName, appointmentDate, appointmentTime, locationType } = req.body || {};
    if (!clientEmail)     return res.status(400).json({ error: 'clientEmail is required' });
    if (!appointmentDate) return res.status(400).json({ error: 'appointmentDate is required' });

    try {
      const isoStr   = appointmentDate + (appointmentTime ? 'T' + appointmentTime + ':00' : '');
      const dateStr  = _reminderFmtDate(isoStr);
      const timeStr  = appointmentTime ? _reminderFmtTime(isoStr) : 'Time TBC';
      const locLabel = _reminderLocationLabel(locationType || 'clinic');

      const { data, error } = await _resend.emails.send({
        from:    'Cheree McGarry <reachout@chereemcgarry.com>',
        to:      clientEmail,
        subject: 'Appointment reminder — ' + dateStr,
        html:    _reminderHtml({
          clientName:    clientName || 'there',
          dateLabel:     dateStr,
          timeLabel:     timeStr,
          locationLabel: locLabel,
        }),
      });

      if (error) throw new Error(error.message || 'Resend error');
      return res.status(200).json({ ok: true, emailId: data?.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
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
        return { id: r.id, url: r.url, name, amount, useContext: useContextSummary, extensions: extSummary };
      });
      return res.status(200).json({ count: fees.length, fees });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /* ── GET ?halaxy_appts_raw=1 — diagnostic: dump raw appointment resources (past 30d + future) ── */
  if (req.method === 'GET' && params.get('halaxy_appts_raw')) {
    if (!process.env.HALAXY_CLIENT_ID) return res.status(200).json({ appointments: [] });
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const apptBundle = await halaxyGet('/Appointment', {
        date: `ge${thirtyDaysAgo.toISOString().slice(0, 10)}`, _sort: 'date', _count: '50', _include: 'Appointment:patient',
      });
      // Also fetch a single appointment individually to see if it has more fields
      const firstId = apptBundle.entry?.[0]?.resource?.id;
      let singleAppt = null;
      if (firstId) {
        try { singleAppt = await halaxyGet(`/Appointment/${firstId}`); } catch (_) {}
      }
      return res.status(200).json({
        count: (apptBundle.entry || []).length,
        bundleEntries: (apptBundle.entry || []).map(e => e.resource),
        singleAppt,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /* ── GET ?halaxy_invoices_raw=1 — diagnostic: dump raw Invoice resources ── */
  if (req.method === 'GET' && params.get('halaxy_invoices_raw')) {
    if (!process.env.HALAXY_CLIENT_ID) return res.status(200).json({ invoices: [] });
    try {
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const bundle = await halaxyGet('/Invoice', {
        _sort:   '-created',
        _count:  '20',
        _include: 'Invoice:recipient',
      });
      return res.status(200).json({
        count:   (bundle.entry || []).length,
        entries: (bundle.entry || []).map(e => e.resource),
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

  /* ── POST ?halaxy_coverage=1 — write Coverage (funder) to Halaxy ── */
  if (req.method === 'POST' && params.get('halaxy_coverage')) {
    const { patientId, payorId, payorName } = req.body || {};
    if (!patientId || (!payorId && !payorName))
      return res.status(400).json({ error: 'patientId and payor required' });
    const coverageResource = {
      resourceType: 'Coverage',
      status:       'active',
      beneficiary:  { reference: `Patient/${patientId}` },
      payor:        [payorId
        ? { reference: `Organization/${payorId}`, display: payorName || '' }
        : { display: payorName }
      ],
    };
    try {
      const result = await halaxyPost('/Coverage', coverageResource);
      return res.status(201).json({ ok: true, coverageId: result.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
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
      { data: enquiries }, clientsResult, { data: activityRaw },
      fundersCached, feesCached, feeMapCached,
      { data: tasksRaw },
    ] = await Promise.all([
      db.from('enquiries').select('*').order('created_at', { ascending: false }),
      db.from('clients').select(`
        id, display_name, funder, plan_manager, halaxy_id, enquiry_id,
        active, notes, client_type, parent_client_id, is_contact, created_at,
        sessions (id, session_date, status, invoice_ref, amount, notes)
      `).order('display_name', { ascending: true }),
      db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200),
      readCache(db, 'halaxy_funders_cache'),
      readCache(db, 'halaxy_fees_cache'),
      readCache(db, 'halaxy_fee_funder_map'),
      db.from('tasks').select('*').order('created_at', { ascending: true }),
    ]);

    // If the full clients query failed (e.g. enquiry_id column not yet migrated),
    // fall back to a minimal select without it so clients still render.
    let clients = clientsResult.data;
    if (!clients && clientsResult.error) {
      console.warn('clients full-select failed (' + clientsResult.error.message + '), retrying without enquiry_id');
      const fallback = await db.from('clients').select(`
        id, display_name, funder, plan_manager, halaxy_id,
        active, notes, created_at,
        sessions (id, session_date, status, invoice_ref, amount, notes)
      `).order('display_name', { ascending: true });
      clients = fallback.data;
      if (!clients && fallback.error) {
        console.warn('clients fallback-select also failed (' + fallback.error.message + '), retrying without sessions');
        const bare = await db.from('clients').select(
          'id, display_name, funder, plan_manager, halaxy_id, active, notes, created_at'
        ).order('display_name', { ascending: true });
        clients = bare.data;
        if (bare.error) console.error('clients bare-select failed:', bare.error.message);
      }
    }

    // Auto-sync config from Halaxy if cache is empty or older than 24 hours.
    // This keeps funders + fees current without hammering Halaxy on every page view.
    let cachedFunders = fundersCached?.funders || [];
    let cachedFees    = feesCached?.fees       || [];
    let cachedFeeMap  = feeMapCached           || {};
    const SYNC_TTL_MS = 24 * 60 * 60 * 1000;
    const lastSyncedAt = fundersCached?.synced_at ? new Date(fundersCached.synced_at).getTime() : 0;
    const syncStale = Date.now() - lastSyncedAt > SYNC_TTL_MS;
    if (process.env.HALAXY_CLIENT_ID && (!cachedFunders.length || !cachedFees.length || syncStale)) {
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

    const halaxyConfigured = !!(process.env.HALAXY_CLIENT_ID && process.env.HALAXY_CLIENT_SECRET);
    let halaxy = { connected: false, configured: halaxyConfigured, appointments: [], patients: [], funders: cachedFunders, fees: cachedFees, feeMap: cachedFeeMap };
    if (halaxyConfigured) {
      try {
        const now           = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Australian financial year: 1 July – 30 June.
        // fyStartStr is always July 1 of the FY that contains today.
        const fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        const fyStartStr  = `${fyStartYear}-07-01`;

        const [apptBundle, patientBundle, fyInvoiceBundle, preFyInvoiceBundle, coverageBundle] = await Promise.all([
          halaxyGet('/Appointment', {
            date:     `ge${fyStartStr}`, // full FY — matches invoice window so client detail is consistent
            _sort:    'date',
            _count:   '500',
            _include: 'Appointment:patient',
          }),
          halaxyGet('/Patient', { _count: '500' }),
          // FY invoices: paid + unpaid since July 1 (full financial year)
          halaxyGet('/Invoice', {
            created:  `ge${fyStartStr}`,
            _sort:    '-created',
            _count:   '500',
            _include: 'Invoice:recipient',
          }).catch(() => ({ entry: [] })),
          // Pre-FY invoices: older entries to catch any still-unpaid invoices from before this FY.
          // We fetch up to 300 and the UI filters to show only unpaid ones.
          halaxyGet('/Invoice', {
            created:  `lt${fyStartStr}`,
            _sort:    '-created',
            _count:   '300',
            _include: 'Invoice:recipient',
          }).catch(() => ({ entry: [] })),
          // Bulk Coverage fetch: one call gives us every patient's funder.
          // This is the authoritative source — we build a patientId → funderKey map
          // so the client never has to fall back to stale Supabase funder fields.
          halaxyGet('/Coverage', { _count: '500' }).catch(() => ({ entry: [] })),
        ]);

        // Merge invoice bundles (FY + pre-FY), deduplicate by id
        const invoiceBundle = {
          entry: [
            ...(fyInvoiceBundle.entry || []),
            ...(preFyInvoiceBundle.entry || []),
          ].filter((e, idx, arr) => {
            const id = e?.resource?.id;
            return id ? arr.findIndex(x => x?.resource?.id === id) === idx : true;
          }),
        };
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

        // Split Invoice bundle entries — _include adds Patient resources alongside Invoice resources
        const allInvBundleResources = (invoiceBundle.entry || []).map(e => e.resource).filter(Boolean);
        const invoiceResources = allInvBundleResources.filter(r => r?.resourceType === 'Invoice');
        const invoicePatients  = allInvBundleResources.filter(r => r?.resourceType === 'Patient');

        // Extend patientMap with any patients included in the Invoice bundle
        invoicePatients.forEach(p => {
          if (p.id && !patientMap[p.id]) {
            const n = fhirPatientLegalName(p);
            if (n) patientMap[p.id] = n;
          }
        });

        // Map Invoice resources → clean billing objects.
        // Halaxy uses "recipient" (not "subject") for the patient reference,
        // and "created" (not "date") for the invoice date.
        const invoices = invoiceResources
          .map(inv => {
            const status = inv.status;
            if (!status || status === 'cancelled') return null;

            // recipient can be an array or a single reference — check both
            const recipientList = Array.isArray(inv.recipient) ? inv.recipient : (inv.recipient ? [inv.recipient] : []);
            let patientId = null;
            for (const r of recipientList) {
              const ref = r?.reference || '';
              if (ref.toLowerCase().includes('patient/')) {
                patientId = ref.split('/').pop();
                break;
              }
            }
            // Also check subject as a fallback (standard FHIR field)
            if (!patientId) {
              const subjectRef = inv.subject?.reference || '';
              if (subjectRef.includes('/')) patientId = subjectRef.split('/').pop();
            }
            // Keep invoices even without a resolvable patientId so the date-based
            // fallback in the dashboard can still detect that billing happened on a day.
            // patientId will be null — the dashboard handles this gracefully.

            // Halaxy date field is "created"; fall back to "date" for standard FHIR
            const invoiceDate = (inv.created || inv.date || '').slice(0, 10) || null;
            if (!invoiceDate) return null; // need at least a date to be useful

            // Halaxy uses totalBalance (remaining owing) and totalPaid to indicate payment state.
            // totalBalance=0 means fully paid even if status is still "active".
            const totalBalance = inv.totalBalance?.value ?? null;
            const totalPaid    = inv.totalPaid?.value    ?? null;
            const totalAmount  = inv.totalGross?.value   ?? inv.totalNet?.value ?? null;

            // Extract fee name from lineItem for funder inference
            const lineItem = (inv.lineItem || [])[0];
            const feeName  = lineItem?.chargeItemReference?.display
                          || lineItem?.chargeItemCodeableConcept?.text
                          || '';

            return {
              id:           inv.id,
              status,
              patientId,
              date:         invoiceDate,
              amount:       totalAmount,
              totalBalance,
              totalPaid,
              feeName,
              currency:     inv.totalGross?.currency || inv.totalNet?.currency || 'AUD',
              ref:          inv.identifier?.[0]?.value || inv.id,
            };
          })
          .filter(Boolean);

        // Build patientId → payor name map from bulk Coverage fetch.
        // Storing the raw payor display name so the client can apply its own
        // _mapCoverageToFunderKey() without duplicating mapping logic server-side.
        // This is the authoritative Halaxy funder source — no per-patient calls needed.
        const patientFunderMap = {};
        (coverageBundle.entry || []).forEach(e => {
          const cov = e.resource;
          if (!cov || cov.resourceType !== 'Coverage') return;
          // beneficiary.reference can be "Patient/123" or an absolute URL
          const benefRef = cov.beneficiary?.reference || '';
          const patId    = benefRef.split('/').pop();
          if (!patId) return;
          const payor = cov.payor?.[0]?.display || cov.payor?.[0]?.reference || '';
          if (payor) patientFunderMap[patId] = payor;
        });

        halaxy = {
          connected:    true,
          appointments,
          patientMap,
          patientFunderMap,
          patients:     (patientBundle.entry || []).map(e => e.resource).filter(Boolean).map(p => ({
            id: p.id, name: fhirPatientLegalName(p),
          })),
          invoices,
          funders:      cachedFunders,
          fees:         cachedFees,
          feeMap:       cachedFeeMap,
          funders_synced_at: fundersCached?.synced_at || null,
          fees_synced_at:    feesCached?.synced_at    || null,
          webUrl:       process.env.HALAXY_WEB_URL    || null,
        };
      } catch (err) {
        console.error('Halaxy API error:', err.message);
        halaxy = { connected: false, configured: true, error: err.message, appointments: [], patients: [], funders: cachedFunders, fees: cachedFees, feeMap: cachedFeeMap };
      }
    }

    return res.status(200).json({
      enquiries: enrichedEnquiries,
      clients:   clients || [],
      tasks:     tasksRaw || [],
      halaxy,
    });
  }

  /* ── PATCH — update enquiry ── */
  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'Missing id' });

    try {
      const {
        status, notes, halaxy_client_url, client_id,
        closed_reason, intake_funder,
        log_action, log_detail,   // manual interaction log (no row update needed)
      } = req.body || {};

      // ── Log-only path: just insert to activity_log, no enquiry row update ──
      if (log_action) {
        await db.from('activity_log').insert({
          enquiry_id: id, actor, action: log_action, detail: log_detail || null,
        }).catch(() => {});
        return res.status(200).json({ ok: true });
      }

      const update = {};
      if (status            !== undefined) update.status            = status;
      if (notes             !== undefined) update.notes             = notes;
      if (halaxy_client_url !== undefined) update.halaxy_client_url = halaxy_client_url;
      if (client_id         !== undefined) update.client_id         = client_id;
      if (closed_reason     !== undefined) update.closed_reason     = closed_reason;
      if (intake_funder     !== undefined) update.intake_funder     = intake_funder;
      // Linking to a client always marks as converted
      if (client_id && !status) update.status = 'converted';

      if (!Object.keys(update).length) return res.status(200).json({ ok: true }); // nothing to update

      const { error } = await db.from('enquiries').update(update).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });

      const logs = [];
      if (status            !== undefined) logs.push({ enquiry_id: id, actor, action: 'status',    detail: status + (status === 'closed' && closed_reason ? ':' + closed_reason : '') });
      if (notes             !== undefined) logs.push({ enquiry_id: id, actor, action: 'notes',     detail: null });
      if (halaxy_client_url !== undefined) logs.push({ enquiry_id: id, actor, action: 'halaxy',    detail: halaxy_client_url ? 'linked' : 'cleared' });
      if (client_id         !== undefined) logs.push({ enquiry_id: id, actor, action: 'converted', detail: String(client_id) });
      if (intake_funder     !== undefined) logs.push({ enquiry_id: id, actor, action: 'intake',    detail: intake_funder });
      if (logs.length) await db.from('activity_log').insert(logs).catch(() => {});

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('PATCH enquiry error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
