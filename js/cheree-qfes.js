/**
 * js/cheree-qfes.js — /book/qfes: pick a QFES client, give the handful of
 * ISA-form fields we can't get anywhere else, save.
 *
 * Deliberately asks for as little as possible. Everything else the real
 * QFES "Individual Support Activity" form wants is sourced elsewhere at
 * actual-submission time:
 *   - Counsellor name/email          — always Cheree McGarry / reachout@…
 *   - Client code                    — the client's Halaxy Patient ID
 *   - Gender / Age                   — read straight off the Halaxy patient record
 *   - Type of activity / Date / Mode / Time spent — appointment data, from
 *     Halaxy/the Board at the time Julian actually submits
 * This page only asks for the profile/context fields that live nowhere
 * else: Area, which of Corporate Support/QFD/Urban FF/Rural FF Cheree is
 * (if any), their concern (work or non-work related, then which one),
 * Client type. Steps 1-4 in the form mirror that order.
 *
 * One row per client (`qfes_client_profiles`, upserted), not one per
 * session — this is stable context, not per-appointment data.
 *
 * No explicit Save button — every field autosaves (debounced) as Cheree
 * fills it in, so the header's back button can't lose anything by being
 * tapped early.
 *
 * STAGING only, same principle as the rest of /book: no Halaxy writes, no
 * submission to the real Microsoft form. Julian still does that manually
 * (or via the live co-pilot flow), combining this with the appointment
 * data he already has. Field list + full option sets:
 * Cheree's business/qfes-isa-form-schema.md.
 *
 * Standalone script (same convention as cheree-book.js/admin-ui.js).
 */

/* ── Form option constants — must match the live form exactly ── */
var QF_AREA = [
  'All regions – Telehealth', 'GBR - Brisbane Metro', 'GBR – Sunshine Coast',
  'Northern region – Townsville (includes Mt Isa area)', 'Northern region – Cairns', 'Northern region – Mackay',
  'Central region – Rockhampton', 'Central region – Maryborough (Wide Bay Burnett area)',
  'South-East – Gold Coast/Beenleigh', 'South-East – West Moreton', 'South-West',
];
// Cheree only ever sees these two in practice (see step 1) — the rest of
// QF_AREA stays here as the authoritative option list for the real form,
// and as a fallback display if an old profile ever has something else.
var QF_AREA_TELEHEALTH = QF_AREA[0];
var QF_AREA_GBR = QF_AREA[1];

var QF_CORPORATE_SUPPORT = ['Finance and Business Support Division', 'Human Resources Division', 'Information Technology Division', 'Public Safety Network Management Centre', 'Family Member'];
var QF_URBAN_FF = ['Permanent', 'Fire Investigation Unit', 'FireCom', 'Tech Rescue', 'Non-Operational', 'Non-Operational Family', 'Firefighters Family', 'Retired Fire and Rescue Personnel', 'Auxiliary Firefighters', 'Auxiliary Firefighters Family'];
var QF_RURAL_FF = ['Volunteers', 'Volunteers Family', 'Staff', 'Staff Family'];
var QF_QFD_STAFF = ['QFD Management', 'QFD Administration'];
var QF_WORK_CONCERNS = ['Transfer', 'Complaint/Investigation/Discipline', 'Trauma or Critical Incident - Work related', 'Workload', 'Injury - work related', 'Organisational Change', 'Retirement/Career Issues', 'Performance Improvement', 'Work Relationships/Conflict', 'Harassment/Bullying - Recipient', 'Harassment/Bullying - Perpetrator', 'Sexual Harassment', 'Dismissal', 'Medical Retirement', 'Workcover Claim', 'Leadership Advice / Liaison'];
var QF_NONWORK_CONCERNS = ['Trauma or Critical Incident - Non work related', 'Domestic Violence - Recipient', 'Domestic Violence - Aggressor', 'Family Relationship/Separation', 'Grief and Loss', 'Personal Health Issue', 'Harassment/Bullying', 'Sexual Harassment', 'Financial Distress', 'Transitional/Life Change', 'Retirement', 'Drugs, Alcohol usage or Gambling', 'Family Health Issue', 'Injury NON-Work', 'Regional/ Remote/ Isolation', 'First nations or cultural stressors'];
var QF_CLIENT_TYPE = [
  { key: 'A', label: 'A: Reduced functioning' },
  { key: 'B', label: 'B: Work-related concerns (no workplace impact)' },
  { key: 'C', label: 'C: Non-work-related concerns (no functioning impact)' },
  { key: 'D', label: 'D: Immediate Family' },
];

/* Corporate Support / QFD / Urban FF / Rural FF are mutually exclusive on
 * the real form — Cheree is only ever one of these. Step 2 asks her to
 * pick which category first, then which one within it, instead of four
 * separate "Not Applicable" dropdowns. */
var QF_ROLE_CATEGORIES = [
  { key: 'corporate', label: 'Corporate Support', field: 'corporate_support', options: QF_CORPORATE_SUPPORT },
  { key: 'urban', label: 'Urban Firefighter', field: 'urban_firefighters', options: QF_URBAN_FF },
  { key: 'rural', label: 'Rural Firefighter', field: 'rural_firefighters', options: QF_RURAL_FF },
  { key: 'qfd', label: 'QFD Staff', field: 'qfd_staff', options: QF_QFD_STAFF },
];
function _qfRoleCategoryOf(p) {
  if (!p) return null;
  for (var i = 0; i < QF_ROLE_CATEGORIES.length; i++) {
    if (p[QF_ROLE_CATEGORIES[i].field]) return QF_ROLE_CATEGORIES[i].key;
  }
  return null;
}

/* ── Funder matching — duplicated from cheree-book.js (see header) ── */
var _QF_KNOWN_FUNDERS = { NDIS: 1, Medicare: 1, QFES: 1, WorkCover: 1, DVA: 1, Private: 1 };
var _QF_FUNDER_LABEL = { ndis_plan: 'NDIS', ndis_self: 'NDIS', medicare: 'Medicare', private: 'Private', qfes: 'QFES', workcover: 'WorkCover', dva: 'DVA' };
function _qfFunderKey(payorStr) {
  var s = (payorStr || '').toLowerCase();
  if (!s) return null;
  if (s.indexOf('qfes') !== -1 || s.indexOf('fire and emergency') !== -1) return 'qfes';
  if (s.indexOf('medicare') !== -1) return 'medicare';
  if (s.indexOf('ndis') !== -1) return 'ndis_plan';
  if (s.indexOf('workcover') !== -1 || s.indexOf('work cover') !== -1) return 'workcover';
  if (s.indexOf('dva') !== -1 || s.indexOf('veteran') !== -1) return 'dva';
  if (s.indexOf('private') !== -1) return 'private';
  return null;
}
function _qfResolveFunderTokens(raw) {
  if (!raw) return [];
  return String(raw).split(',').map(function(tok) {
    tok = tok.trim();
    if (!tok) return null;
    if (_QF_KNOWN_FUNDERS[tok]) return tok;
    return _QF_FUNDER_LABEL[tok] || null;
  }).filter(Boolean);
}
function _qfInitials(name) {
  if (!name) return '?';
  var p = name.trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}
function _qfEsc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _qfToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.innerHTML = '<div class="toast">' + _qfEsc(msg) + '</div>';
  setTimeout(function() { t.innerHTML = ''; }, 3200);
}

var _qfClientRows = [];
var _qfProfileStatus = {}; // { halaxyId → saved profile row } — who has data, and how much

/* Row exists != actually filled in — a backfilled or half-started profile
 * shouldn't read as "Complete". Counts the 3 things step 1/2/4 ask for
 * (concern, step 3, is optional by design — see _qfRenderConcernFields). */
function _qfCompleteness(profile) {
  if (!profile) return { filled: 0, total: 3 };
  var filled = (profile.area ? 1 : 0) + (_qfRoleCategoryOf(profile) ? 1 : 0) + (profile.client_type ? 1 : 0);
  return { filled: filled, total: 3 };
}
var _qfQuery = '';
var _qfAddMode = false;
var _qfSelected = null; // { halaxyId, name, funders }
var _qfProfile = null;  // currently-loaded saved profile, or null
var _qfArea = null;         // QF_AREA_TELEHEALTH | QF_AREA_GBR | (a legacy value) | null
var _qfRoleCat = null;      // 'corporate' | 'urban' | 'rural' | 'qfd' | null — step 2's chosen category
var _qfConcernCat = null;   // 'work' | 'nonwork' — which list is showing in the open form

/* ── Autosave ── */
var _qfSaveTimer = null;
var _qfDirty = false;

function _qfBuildClientRows(data) {
  var halaxy = data.halaxy || { patients: [], patientFunderMap: {} };
  var clients = data.clients || [];
  var manualFunders = data.client_funders || {};

  var clientByHalaxyId = {};
  clients.forEach(function(c) { if (c.halaxy_id) clientByHalaxyId[String(c.halaxy_id)] = c; });

  return (halaxy.patients || []).map(function(p) {
    var local = clientByHalaxyId[String(p.id)];
    var manualKey = String(p.id);
    var funders = manualFunders[manualKey]
      ? manualFunders[manualKey].slice()
      : (local && local.funder
          ? _qfResolveFunderTokens(local.funder)
          : _qfResolveFunderTokens(_qfFunderKey(halaxy.patientFunderMap && halaxy.patientFunderMap[p.id])));
    return { halaxyId: String(p.id), name: p.name || 'Unnamed', funders: funders };
  }).sort(function(a, b) { return a.name.localeCompare(b.name); });
}

function qfInit() {
  Promise.all([
    fetch('/api/admin-enquiries', { credentials: 'include' }).then(function(r) { return r.json(); }),
    fetch('/api/admin-enquiries?qfes_profiles_all=1', { credentials: 'include' }).then(function(r) { return r.json(); }),
  ]).then(function(results) {
    _qfClientRows = _qfBuildClientRows(results[0]);
    _qfProfileStatus = {};
    (results[1].profiles || []).forEach(function(p) { _qfProfileStatus[String(p.client_halaxy_id)] = p; });
    _qfRenderList();
  }).catch(function(err) {
    document.getElementById('qf-root').innerHTML = '<div class="empty">Could not load clients: ' + _qfEsc(err.message) + '</div>';
  });

  document.getElementById('qf-search').addEventListener('input', function(e) {
    _qfQuery = e.target.value.trim().toLowerCase();
    _qfRenderList();
  });
  document.getElementById('qf-add-btn').addEventListener('click', function() {
    _qfAddMode = true;
    document.getElementById('qf-search').focus();
    _qfRenderList();
  });
  document.getElementById('qf-form-close').addEventListener('click', _qfCloseForm);
  document.getElementById('qf-form-backdrop').addEventListener('click', _qfCloseForm);

  document.getElementById('qf-compile-toggle').addEventListener('click', function() {
    var panel = document.getElementById('qf-compile');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('qf-inv-btn').addEventListener('click', _qfRunCompile);
  document.getElementById('qf-inv-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') _qfRunCompile();
  });
}

/* ── Invoice compile panel — joins calendar sessions tagged with an
 * invoice number to their staged QFES profile + Halaxy demographics via
 * ?qfes_invoice_compile=, replacing the old fully-manual cross-reference.
 * Read-only: nothing here writes to Halaxy or submits anything. ── */
function _qfRoleLabel(s) {
  if (s.corporateSupport) return 'Corporate: ' + s.corporateSupport;
  if (s.urbanFirefighters) return 'Urban FF: ' + s.urbanFirefighters;
  if (s.ruralFirefighters) return 'Rural FF: ' + s.ruralFirefighters;
  if (s.qfdStaff) return 'QFD: ' + s.qfdStaff;
  return '';
}

function _qfRunCompile() {
  var input = document.getElementById('qf-inv-input');
  var num = (input.value || '').trim();
  var out = document.getElementById('qf-inv-result');
  if (!num) { out.innerHTML = ''; return; }
  out.innerHTML = '<div class="loading">Compiling&hellip;</div>';
  fetch('/api/admin-enquiries?qfes_invoice_compile=' + encodeURIComponent(num), { credentials: 'include' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) { out.innerHTML = '<div class="empty">Could not compile: ' + _qfEsc(d.error) + '</div>'; return; }
      _qfRenderCompileResult(num, d.sessions || [], d.knownInvoices || []);
    })
    .catch(function(err) {
      out.innerHTML = '<div class="empty">Could not compile: ' + _qfEsc(err.message) + '</div>';
    });
}

function _qfRenderCompileResult(invoiceNumber, sessions, knownInvoices) {
  var out = document.getElementById('qf-inv-result');
  if (!sessions.length) {
    var msg = '<div class="empty">No calendar sessions are tagged with invoice ' + _qfEsc(invoiceNumber) + '.'
      + ' This reads the Board\'s "Invoice:" field on each session, not Halaxy directly — check that these sessions actually have that invoice number set on their Board card.';
    if (knownInvoices && knownInvoices.length) {
      msg += '<br><br>Invoice numbers found on calendar sessions in the last ~14 months: ' + knownInvoices.map(_qfEsc).join(', ');
    } else {
      msg += '<br><br>No sessions in the last ~14 months have an Invoice number set at all.';
    }
    out.innerHTML = msg + '</div>';
    return;
  }
  var cols = ['Date', 'Client', 'Code', 'Funder', 'Mode', 'Duration', 'Status', 'Area', 'Role', 'Concern', 'Client type', 'Gender', 'Age'];
  var rows = sessions.map(function(s) {
    var concern = [s.concernPrimary, s.concernSecondary].filter(Boolean).join(' / ');
    var flagged = !s.halaxyId || s.ambiguous || s.profileIncomplete;
    var cells = [
      (s.date || '').slice(0, 10),
      s.name,
      s.halaxyId || (s.ambiguous ? 'Ambiguous name' : 'Not matched'),
      s.funder || '', s.mode || '', s.duration || '', s.status || '',
      s.area || '', _qfRoleLabel(s), concern, s.clientType || '', s.gender || '', s.ageBracket || '',
    ];
    return { cells: cells, flagged: flagged };
  });

  var html = '<div class="qf-inv-wrap"><table class="qf-inv-table"><thead><tr>'
    + cols.map(function(c) { return '<th>' + c + '</th>'; }).join('')
    + '</tr></thead><tbody>'
    + rows.map(function(r) {
        return '<tr' + (r.flagged ? ' class="warn"' : '') + '>' + r.cells.map(function(c) { return '<td>' + _qfEsc(String(c || '')) + '</td>'; }).join('') + '</tr>';
      }).join('')
    + '</tbody></table></div>';

  var flaggedCount = rows.filter(function(r) { return r.flagged; }).length;
  html += '<div class="qf-inv-actions">'
    + '<button class="qf-copy-btn" id="qf-inv-copy">Copy as table</button>'
    + (flaggedCount ? '<span class="qf-inv-note">' + flaggedCount + ' row' + (flaggedCount === 1 ? '' : 's') + ' need' + (flaggedCount === 1 ? 's' : '') + ' a look — unmatched client, ambiguous name, or incomplete ISA profile</span>' : '<span class="qf-inv-note">' + rows.length + ' session' + (rows.length === 1 ? '' : 's') + ', all matched</span>')
    + '</div>';

  out.innerHTML = html;

  document.getElementById('qf-inv-copy').addEventListener('click', function() {
    var tsv = cols.join('\t') + '\n' + rows.map(function(r) { return r.cells.join('\t'); }).join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(tsv) : Promise.reject())
      .then(function() { _qfToast('Copied — paste into Numbers/Excel'); })
      .catch(function() { _qfToast('Could not copy — select the table manually'); });
  });
}

function _qfRenderList() {
  var root = document.getElementById('qf-root');
  var qfesRows  = _qfClientRows.filter(function(r) { return r.funders.indexOf('QFES') !== -1; });
  var matchRows = _qfQuery ? _qfClientRows.filter(function(r) { return r.name.toLowerCase().indexOf(_qfQuery) !== -1; }) : [];

  function row(r) {
    var c = _qfCompleteness(_qfProfileStatus[r.halaxyId]);
    var status = c.filled === 0
      ? '<span class="qf-status qf-status-todo">Needs info</span>'
      : c.filled === c.total
        ? '<span class="qf-status qf-status-done">&#10003; Complete</span>'
        : '<span class="qf-status qf-status-partial">' + c.filled + '/' + c.total + ' filled</span>';
    return '<div class="qf-row" onclick="_qfOpenClient(\'' + _qfEsc(r.halaxyId) + '\',\'' + _qfEsc(r.name) + '\')">'
      + '<div class="av">' + _qfEsc(_qfInitials(r.name)) + '</div>'
      + '<div><div class="nm">' + _qfEsc(r.name) + '</div><div class="mt">' + (r.funders.indexOf('QFES') !== -1 ? 'QFES' : (r.funders[0] || 'Not tagged QFES yet')) + '</div></div>'
      + status + '</div>';
  }

  var html = '';
  if (_qfAddMode || _qfQuery) {
    html += '<div class="qf-add-hint">Search any client below and open them &mdash; saving their info here adds the QFES tag automatically.</div>';
    html += '<div class="sec-hd">' + (_qfQuery ? matchRows.length + ' match' + (matchRows.length === 1 ? '' : 'es') : 'All clients') + '</div>';
    var list = _qfQuery ? matchRows : _qfClientRows;
    html += list.length ? list.map(row).join('') : '<div class="empty">No one matches "' + _qfEsc(_qfQuery) + '"</div>';
  } else {
    html += '<div class="sec-hd">QFES clients (' + qfesRows.length + ')</div>';
    html += qfesRows.length
      ? qfesRows.map(row).join('')
      : '<div class="empty">No clients tagged QFES yet.<br>Use "+ Add QFES client" above to find and add one.</div>';
  }
  root.innerHTML = html;
}

function _qfOpenClient(halaxyId, name) {
  var row = _qfClientRows.filter(function(r) { return r.halaxyId === halaxyId; })[0] || { funders: [] };
  _qfSelected = { halaxyId: halaxyId, name: name, funders: row.funders };
  document.getElementById('qf-form-name').textContent = name;
  document.getElementById('qf-form-body').innerHTML = '<div class="loading">Loading&hellip;</div>';
  document.getElementById('qf-form-backdrop').classList.add('open');
  document.getElementById('qf-form-sheet').classList.add('open');

  fetch('/api/admin-enquiries?qfes_profile=' + encodeURIComponent(halaxyId), { credentials: 'include' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      _qfProfile = d.profile || null;
      _qfRenderForm();
    })
    .catch(function() {
      _qfProfile = null;
      _qfRenderForm();
    });
}

function _qfCloseForm() {
  function actuallyClose() {
    document.getElementById('qf-form-backdrop').classList.remove('open');
    document.getElementById('qf-form-sheet').classList.remove('open');
    _qfSelected = null;
    _qfProfile = null;
    _qfAddMode = false;
    document.getElementById('qf-search').value = '';
    _qfQuery = '';
    _qfRenderList();
  }
  // Flush any pending autosave first — the back button must never drop
  // an edit made in the last debounce window.
  if (_qfDirty) {
    _qfDoSave(actuallyClose);
  } else {
    actuallyClose();
  }
}

function _qfSelectField(id, label, options, selected) {
  var opts = options.map(function(o) {
    var val = typeof o === 'object' ? o.key : o;
    var lbl = typeof o === 'object' ? o.label : o;
    return '<option value="' + _qfEsc(val) + '"' + (val === selected ? ' selected' : '') + '>' + _qfEsc(lbl) + '</option>';
  }).join('');
  return '<div class="qf-field"><label class="qf-label">' + _qfEsc(label) + '</label>'
    + '<select class="qf-select" id="' + id + '" onchange="_qfScheduleSave()">' + opts + '</select></div>';
}

/* ── Step 1: Area ── */
function _qfRenderArea() {
  var legacy = _qfArea && _qfArea !== QF_AREA_TELEHEALTH && _qfArea !== QF_AREA_GBR;
  return '<div class="qf-toggle-row">'
    + '<div class="qf-toggle-opt' + (_qfArea === QF_AREA_TELEHEALTH ? ' sel' : '') + '" id="qf-area-telehealth" onclick="_qfSetArea(\'' + _qfEsc(QF_AREA_TELEHEALTH) + '\')">Telehealth</div>'
    + '<div class="qf-toggle-opt' + (_qfArea === QF_AREA_GBR ? ' sel' : '') + '" id="qf-area-gbr" onclick="_qfSetArea(\'' + _qfEsc(QF_AREA_GBR) + '\')">GBR Brisbane Metro</div>'
    + '</div>'
    + (legacy ? '<div class="qf-hint">Saved area: &ldquo;' + _qfEsc(_qfArea) + '&rdquo; — pick Telehealth or GBR Brisbane Metro above to update it.</div>' : '');
}
function _qfSetArea(val) {
  _qfArea = _qfArea === val ? null : val;
  document.getElementById('qf-area-telehealth').classList.toggle('sel', _qfArea === QF_AREA_TELEHEALTH);
  document.getElementById('qf-area-gbr').classList.toggle('sel', _qfArea === QF_AREA_GBR);
  _qfScheduleSave();
}

/* ── Step 2: Role (Corporate Support / QFD / Urban FF / Rural FF) ── */
function _qfRenderRoleFields() {
  if (!_qfRoleCat) {
    return '<div class="qf-hint">Pick which one Cheree is, if any — leave unpicked if none apply.</div>';
  }
  var cat = QF_ROLE_CATEGORIES.filter(function(c) { return c.key === _qfRoleCat; })[0];
  var p = _qfProfile || {};
  var current = _qfRoleCategoryOf(p) === _qfRoleCat ? p[cat.field] : null;
  return _qfSelectField('qf-role-sub', cat.label + ' — which one', ['— select —'].concat(cat.options), current || '— select —');
}
function _qfSetRoleCategory(key) {
  _qfRoleCat = _qfRoleCat === key ? null : key;
  QF_ROLE_CATEGORIES.forEach(function(c) {
    var el = document.getElementById('qf-rolecat-' + c.key);
    if (el) el.classList.toggle('sel', _qfRoleCat === c.key);
  });
  document.getElementById('qf-role-fields').innerHTML = _qfRenderRoleFields();
  _qfScheduleSave();
}

/* ── Step 3: Concern ── */
function _qfConcernList() { return _qfConcernCat === 'nonwork' ? QF_NONWORK_CONCERNS : QF_WORK_CONCERNS; }

/* Neither the category toggle nor a specific concern is a hard-required
 * field on the real form (just soft "please select at least one" guidance
 * text, no red asterisk) — so this stays fully skippable. Nothing is
 * pre-picked; Cheree only sees the dropdowns once she's chosen a category. */
function _qfRenderConcernFields() {
  if (!_qfConcernCat) {
    return '<div class="qf-hint">Pick Work-related or Non-work-related above if known — leave both unpicked if you\'re not sure yet, this isn\'t required.</div>';
  }
  var p = _qfProfile || {};
  var sameCat = p.concern_category === _qfConcernCat;
  return _qfSelectField('qf-concern-p', 'Primary concern', ['— not specified —'].concat(_qfConcernList()), sameCat ? (p.concern_primary || '— not specified —') : '— not specified —')
    + _qfSelectField('qf-concern-s', 'Secondary concern (optional)', ['— none —'].concat(_qfConcernList()), sameCat ? (p.concern_secondary || '— none —') : '— none —');
}
function _qfSetConcernCategory(cat) {
  _qfConcernCat = _qfConcernCat === cat ? null : cat; // clicking the active one clears it
  document.getElementById('qf-cat-work').classList.toggle('sel', _qfConcernCat === 'work');
  document.getElementById('qf-cat-nonwork').classList.toggle('sel', _qfConcernCat === 'nonwork');
  document.getElementById('qf-concern-fields').innerHTML = _qfRenderConcernFields();
  _qfScheduleSave();
}

/* ── Step 4: Client type ── */
function _qfRenderClientType(selectedKey) {
  return '<div class="qf-ct-list" id="qf-clienttype" data-val="' + _qfEsc(selectedKey || '') + '">' + QF_CLIENT_TYPE.map(function(c) {
    var desc = c.label.slice(c.label.indexOf(':') + 1).trim();
    return '<div class="qf-ct-opt' + (c.key === selectedKey ? ' sel' : '') + '" data-key="' + c.key + '" onclick="_qfPickClientType(\'' + c.key + '\')">'
      + '<div class="qf-ct-key">' + c.key + '</div><div class="qf-ct-desc">' + _qfEsc(desc) + '</div></div>';
  }).join('') + '</div>';
}
function _qfPickClientType(key) {
  var group = document.getElementById('qf-clienttype');
  var already = group.getAttribute('data-val') === key;
  var next = already ? '' : key;
  Array.prototype.forEach.call(group.children, function(el) {
    el.classList.toggle('sel', el.getAttribute('data-key') === next);
  });
  group.setAttribute('data-val', next);
  _qfScheduleSave();
}
function _qfClientTypeVal() {
  var el = document.getElementById('qf-clienttype');
  return el ? (el.getAttribute('data-val') || null) : null;
}

function _qfSavebarText(p) {
  return p && p.updated_at
    ? 'Saved automatically &middot; last updated ' + new Date(p.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Nothing filled in yet — saves automatically as you go';
}

function _qfRenderForm() {
  var body = document.getElementById('qf-form-body');
  var p = _qfProfile || {};

  _qfArea = p.area || null;
  _qfRoleCat = _qfRoleCategoryOf(p);
  _qfConcernCat = p.concern_category || null;
  _qfDirty = false;
  clearTimeout(_qfSaveTimer);

  var html = '';

  html += '<div class="qf-section">'
    + '<div class="qf-section-lbl"><span class="qf-step">1</span>Area</div>'
    + _qfRenderArea()
    + '</div>';

  html += '<div class="qf-section">'
    + '<div class="qf-section-lbl"><span class="qf-step">2</span>Role</div>'
    + '<div class="qf-toggle-grid">' + QF_ROLE_CATEGORIES.map(function(c) {
        return '<div class="qf-toggle-opt' + (_qfRoleCat === c.key ? ' sel' : '') + '" id="qf-rolecat-' + c.key + '" onclick="_qfSetRoleCategory(\'' + c.key + '\')">' + _qfEsc(c.label) + '</div>';
      }).join('') + '</div>'
    + '<div id="qf-role-fields">' + _qfRenderRoleFields() + '</div>'
    + '</div>';

  html += '<div class="qf-section"><div class="qf-section-lbl"><span class="qf-step">3</span>Concern</div>'
    + '<div class="qf-toggle-row">'
    + '<div class="qf-toggle-opt' + (_qfConcernCat === 'work' ? ' sel' : '') + '" id="qf-cat-work" onclick="_qfSetConcernCategory(\'work\')">Work-related</div>'
    + '<div class="qf-toggle-opt' + (_qfConcernCat === 'nonwork' ? ' sel' : '') + '" id="qf-cat-nonwork" onclick="_qfSetConcernCategory(\'nonwork\')">Non-work-related</div>'
    + '</div>'
    + '<div id="qf-concern-fields">' + _qfRenderConcernFields() + '</div>'
    + '</div>';

  html += '<div class="qf-section"><div class="qf-section-lbl"><span class="qf-step">4</span>Client type</div>';
  html += _qfRenderClientType(p.client_type || null);
  html += '</div>';

  html += '<div class="qf-field qf-notes"><label class="qf-label">Notes (not part of the QFES form)</label>'
    + '<textarea class="qf-input" id="qf-notes" rows="2" oninput="_qfScheduleSave()">' + _qfEsc(p.notes || '') + '</textarea></div>';

  html += '<div class="qf-savebar" id="qf-savebar">' + _qfSavebarText(p) + '</div>';

  body.innerHTML = html;
}

function _qfCollectPayload() {
  var roleFields = { corporate_support: null, urban_firefighters: null, rural_firefighters: null, qfd_staff: null };
  if (_qfRoleCat) {
    var cat = QF_ROLE_CATEGORIES.filter(function(c) { return c.key === _qfRoleCat; })[0];
    var subEl = document.getElementById('qf-role-sub');
    if (cat && subEl && subEl.value !== '— select —') roleFields[cat.field] = subEl.value;
  }
  var primaryEl = document.getElementById('qf-concern-p');
  var secondaryEl = document.getElementById('qf-concern-s');
  var primary = primaryEl && primaryEl.value !== '— not specified —' ? primaryEl.value : null;
  var secondary = secondaryEl && secondaryEl.value !== '— none —' ? secondaryEl.value : null;
  var notesEl = document.getElementById('qf-notes');

  return {
    clientHalaxyId: _qfSelected.halaxyId,
    clientName: _qfSelected.name,
    area: _qfArea,
    corporateSupport: roleFields.corporate_support,
    urbanFirefighters: roleFields.urban_firefighters,
    ruralFirefighters: roleFields.rural_firefighters,
    qfdStaff: roleFields.qfd_staff,
    concernCategory: _qfConcernCat,
    concernPrimary: primary,
    concernSecondary: secondary,
    clientType: _qfClientTypeVal(),
    notes: notesEl ? notesEl.value : '',
  };
}

function _qfScheduleSave() {
  _qfDirty = true;
  var bar = document.getElementById('qf-savebar');
  if (bar) { bar.textContent = 'Saving…'; bar.classList.add('saving'); }
  clearTimeout(_qfSaveTimer);
  _qfSaveTimer = setTimeout(function() { _qfDoSave(); }, 700);
}

/* onSaved is only used by the close flow, to hold the sheet open until an
 * in-flight edit is actually persisted. */
function _qfDoSave(onSaved) {
  if (!_qfSelected) { if (onSaved) onSaved(); return; }
  clearTimeout(_qfSaveTimer);
  var payload = _qfCollectPayload();

  var tagPromise = _qfSelected.funders.indexOf('QFES') !== -1
    ? Promise.resolve()
    : fetch('/api/admin-enquiries?client_funders_set=1', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: _qfSelected.halaxyId, funders: _qfSelected.funders.concat(['QFES']) }),
      });

  tagPromise.then(function() {
    return fetch('/api/admin-enquiries?qfes_profile_save=1', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }).then(function(r) { return r.json(); }).then(function(d) {
    var bar = document.getElementById('qf-savebar');
    if (d.error) {
      _qfToast('Could not save: ' + d.error);
      if (bar) { bar.textContent = 'Could not save — try again'; bar.classList.remove('saving'); }
      if (onSaved) onSaved();
      return;
    }
    _qfDirty = false;
    _qfProfile = d.profile;
    _qfProfileStatus[_qfSelected.halaxyId] = d.profile;
    if (_qfSelected.funders.indexOf('QFES') === -1) _qfSelected.funders.push('QFES');
    if (bar) { bar.textContent = _qfSavebarText(d.profile); bar.classList.remove('saving'); }
    if (onSaved) onSaved();
  }).catch(function(err) {
    _qfToast('Could not save: ' + err.message);
    var bar = document.getElementById('qf-savebar');
    if (bar) { bar.textContent = 'Could not save — try again'; bar.classList.remove('saving'); }
    if (onSaved) onSaved();
  });
}

document.addEventListener('DOMContentLoaded', qfInit);
