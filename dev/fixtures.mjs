/**
 * dev/fixtures.mjs
 * Fake data for the local dev harness (see dev/server.mjs).
 *
 * Everyone in here is invented. Nothing comes from Halaxy, Supabase, Gmail
 * or the real Google Calendar, which is the whole point: /book can be worked
 * on locally without credentials on the machine and without any chance of a
 * stray click writing to Cheree's actual calendar.
 *
 * The shapes mirror what the real endpoints return:
 *   GET /api/calendar-pending → { connected, events: [{id,title,description,start,end}] }
 *   GET /api/admin-enquiries  → { enquiries, clients, halaxy:{patients,appointments}, ... }
 * Event descriptions use the same `Key: Value` lines _cbParseDesc() expects.
 */

const DAY = 86400000;

/** A date `daysFromNow` away (negative = past), at a given local hour. */
function slot(daysFromNow, hour, minutes = 0) {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setHours(hour, minutes, 0, 0);
  return d;
}

/** Same field order as _cbBuildDesc() in js/cheree-book.js. */
function buildDesc(fields) {
  const order = ['Funder', 'HalaxyId', 'Type', 'Duration', 'Note', 'Status', 'Bill',
    'Billing', 'Invoice', 'QFES Form', 'AdditionalClient', 'AdditionalHalaxyId', 'BillSeparately',
    'Funder2', 'Billing2', 'Invoice2', 'QFES Form 2'];
  return order.filter(k => fields[k] !== undefined && fields[k] !== null)
    .map(k => k + ': ' + fields[k]).join('\n');
}

let seq = 0;

function ev(name, daysFromNow, hour, durationMins, fields) {
  const start = slot(daysFromNow, hour);
  const end = new Date(start.getTime() + durationMins * 60000);
  let suffix = '';
  if (fields.Status === 'Attended') suffix = 'Attended';
  else if ((fields.Status || '').startsWith('Cancelled by ')) {
    suffix = 'Cancelled (' + fields.Status.slice('Cancelled by '.length) + ')';
  }
  // Same shape as _cbBuildTitle in js/cheree-book.js.
  let title = [name, fields.Funder, fields.Type].filter(Boolean).join(' — ');
  if (fields.AdditionalClient) {
    title += ' — with ' + fields.AdditionalClient
      + (fields.BillSeparately === 'Yes' ? ' · bill separately' : '');
  }
  if (suffix) title += ' — ' + suffix;
  return {
    id: 'dev-evt-' + (++seq),
    title,
    description: buildDesc(fields),
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

const attended = (extra = {}) => ({ Status: 'Attended', Bill: 'Yes', ...extra });

export const events = [
  // ── To bill (Attended, no Billing line yet) ──────────────────────────
  ev('Marguerite Albury', -48, 16, 90, attended({
    Funder: 'QFES', HalaxyId: 'h-201', Type: 'In person', Duration: '1.5 hrs',
    Note: 'Session with support person present', Invoice: '1110791523',
  })),
  ev('Desmond Ngata', -46, 10, 60, attended({
    Funder: 'QFES', HalaxyId: 'h-202', Type: 'In person', Duration: '1 hr',
    Invoice: '1110791523',
  })),
  ev('Priya Raghunathan', -37, 13, 60, attended({
    Funder: 'NDIS', HalaxyId: 'h-203', Type: 'Online', Duration: '1 hr',
  })),
  ev('Tobias Ferraro', -34, 9, 60, attended({
    Funder: 'Private', HalaxyId: 'h-204', Type: 'In person', Duration: '1 hr',
    Note: 'Rescheduled from the week before',
  })),
  ev('Marguerite Albury', -30, 15, 60, attended({
    Funder: 'QFES', HalaxyId: 'h-201', Type: 'Online', Duration: '1 hr',
  })),
  ev('Joanne Kirkbride', -25, 11, 60, attended({
    Funder: 'Medicare', HalaxyId: 'h-205', Type: 'In person', Duration: '1 hr',
  })),
  // Two people, two bills, two funders — this session is queued twice and
  // can't close until both sides are settled.
  ev('Desmond Ngata', -18, 14, 90, attended({
    Funder: 'QFES', HalaxyId: 'h-202', Type: 'In person', Duration: '1.5 hrs',
    AdditionalClient: 'Lena Ngata', AdditionalHalaxyId: 'h-206', BillSeparately: 'Yes',
    Funder2: 'Private',
  })),
  // Half-done: his side is away with the funder, hers still needs a decision.
  ev('Callum Ridgeway', -21, 10, 60, attended({
    Funder: 'NDIS', HalaxyId: 'h-208', Type: 'In person', Duration: '1 hr',
    Billing: 'Funder — awaiting remittance', Invoice: '1110740210',
    AdditionalClient: 'Rosalind Beattie', AdditionalHalaxyId: 'h-209', BillSeparately: 'Yes',
    Funder2: 'QFES',
  })),
  ev('Hamish Vo', -11, 16, 60, attended({
    Funder: 'Private', HalaxyId: 'h-207', Type: 'Online', Duration: '1 hr',
  })),

  // ── Awaiting payment (billed, waiting on the funder/client) ──────────
  ev('Priya Raghunathan', -60, 10, 60, attended({
    Funder: 'NDIS', HalaxyId: 'h-203', Type: 'In person', Duration: '1 hr',
    Billing: 'Funder — awaiting remittance', Invoice: '1110740021',
  })),
  ev('Tobias Ferraro', -52, 13, 60, attended({
    Funder: 'Private', HalaxyId: 'h-204', Type: 'Online', Duration: '1 hr',
    Billing: 'Invoice sent', Invoice: '1110740088',
  })),
  ev('Joanne Kirkbride', -44, 9, 60, attended({
    Funder: 'Medicare', HalaxyId: 'h-205', Type: 'In person', Duration: '1 hr',
    Billing: 'Invoice sent', Invoice: '1110740104',
  })),
  ev('Marguerite Albury', -41, 15, 90, attended({
    Funder: 'QFES', HalaxyId: 'h-201', Type: 'In person', Duration: '1.5 hrs',
    Billing: 'Funder — awaiting remittance', Invoice: '1110740133',
    'QFES Form': 'ISA-2026-0412',
  })),

  // ── Needs an outcome (past, still 'Scheduled') ───────────────────────
  ev('Desmond Ngata', -3, 10, 60, { Funder: 'QFES', HalaxyId: 'h-202', Type: 'In person', Duration: '1 hr', Status: 'Scheduled' }),
  ev('Hamish Vo', -1, 16, 60, { Funder: 'Private', HalaxyId: 'h-207', Type: 'Online', Duration: '1 hr', Status: 'Scheduled' }),

  // ── Legacy hand-typed entry: no Status line at all ───────────────────
  { id: 'dev-evt-legacy', title: 'Lindsay Pethick review', description: '',
    start: slot(-9, 11).toISOString(), end: slot(-9, 12).toISOString() },

  // ── Upcoming ─────────────────────────────────────────────────────────
  ev('Priya Raghunathan', 1, 13, 60, { Funder: 'NDIS', HalaxyId: 'h-203', Type: 'Online', Duration: '1 hr', Status: 'Scheduled' }),
  ev('Hamish Vo', 3, 16, 60, { Funder: 'Private', HalaxyId: 'h-207', Type: 'In person', Duration: '1 hr', Status: 'Scheduled', Note: 'First session back' }),
  ev('Marguerite Albury', 6, 15, 90, { Funder: 'QFES', HalaxyId: 'h-201', Type: 'In person', Duration: '1.5 hrs', Status: 'Scheduled' }),

  // ── Closed (not billable / settled in Halaxy) ────────────────────────
  ev('Tobias Ferraro', -20, 9, 60, { Funder: 'Private', HalaxyId: 'h-204', Type: 'In person', Duration: '1 hr', Status: 'Attended', Bill: 'No' }),
  ev('Joanne Kirkbride', -15, 11, 60, attended({
    Funder: 'Medicare', HalaxyId: 'h-205', Type: 'In person', Duration: '1 hr',
    Billing: 'Halaxy direct', Invoice: '1110739900',
  })),
  ev('Priya Raghunathan', -8, 13, 60, { Funder: 'NDIS', HalaxyId: 'h-203', Type: 'Online', Duration: '1 hr', Status: 'Cancelled by client' }),
];

export const patients = [
  { id: 'h-201', name: 'Marguerite Albury' },
  { id: 'h-202', name: 'Desmond Ngata' },
  { id: 'h-203', name: 'Priya Raghunathan' },
  { id: 'h-204', name: 'Tobias Ferraro' },
  { id: 'h-205', name: 'Joanne Kirkbride' },
  { id: 'h-206', name: 'Lena Ngata' },
  { id: 'h-207', name: 'Hamish Vo' },
  { id: 'h-208', name: 'Rosalind Beattie' },
];

export const clients = [
  { id: 1, halaxy_id: 'h-201', first_name: 'Marguerite', last_name: 'Albury', email: 'marguerite@example.com', funder: 'QFES' },
  { id: 2, halaxy_id: 'h-203', first_name: 'Priya', last_name: 'Raghunathan', email: 'priya@example.com', funder: 'NDIS' },
  { id: 3, halaxy_id: 'h-207', first_name: 'Hamish', last_name: 'Vo', email: 'hamish@example.com', funder: null },
];

export const enquiries = [
  { id: 901, first_name: 'Rosalind', last_name: 'Beattie', email: 'rosalind@example.com', phone: '0400 000 111',
    status: 'new', funder: 'QFES', message: 'Referred by a colleague, after hours preferred.',
    created_at: new Date(Date.now() - 2 * DAY).toISOString() },
  { id: 902, first_name: 'Callum', last_name: 'Ridgeway', email: 'callum@example.com', phone: '0400 000 222',
    status: 'contacted', funder: 'Private', message: 'Asked about fees and availability.',
    created_at: new Date(Date.now() - 6 * DAY).toISOString() },
];

export const pipeline = {
  enquiries,
  clients,
  halaxy: { patients, appointments: [], patientFunderMap: {} },
  client_funders: { 'h-201': ['QFES', 'Private'], 'h-203': ['NDIS'] },
  notification_activity: [],
  vapid_public_key: null, // push is a no-op locally
};

export const qfesProfile = {
  area: 'Brisbane Metro',
  role: 'Firefighter',
  concern: 'Workplace stress',
  updated_at: new Date(Date.now() - 12 * DAY).toISOString(),
};
