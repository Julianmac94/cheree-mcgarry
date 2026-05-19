/* ── Admin dashboard client-side JS ─────────────────────────────
   Loaded as a static external script by api/admin.js so it is
   never affected by inline-script issues or template-literal
   escaping in the server-rendered HTML.
   ─────────────────────────────────────────────────────────────── */

/* ── Halaxy intake form URLs by funder type ── */
var HALAXY_URLS = {
  new:       'https://www.halaxy.com/a/online/form/new-patient/245011/kDQfMObOfT-YECP02pycZm5BSGRoeUNxVVAzMzRCclVNTzdoZnNEZTZPdmc',
  private:   'https://www.halaxy.com/a/online/form/new-patient/245011/kDQfMObOfT-YECP02pycZm5BSGRoeUNxVVAzMzRCclVNTzdoZnNEZTZPdmc',
  medicare:  'https://www.halaxy.com/a/online/form/new-patient/245011/kDQfMObOfT-YECP02pycZm5BSGRoeUNxVVAzMzRCclVNTzdoZnNEZTZPdmc',
  ndis_plan: '', // paste NDIS plan-managed intake URL when available
  qfes:      '', // paste QFES EAP intake URL when available
  dva:       '', // paste DVA / ADFHSC intake URL when available
  workcover: '', // paste WorkCover intake URL when available
};

/* ── Billing submission tracking (localStorage) ── */
var _billingSubmissions = JSON.parse(localStorage.getItem('billing_submissions') || '{}');
function _getSubStatus(invId) {
  var s = _billingSubmissions[invId];
  if (!s) return null;
  var daysAgo = (Date.now() - new Date(s.date).getTime()) / 86400000;
  return { date: s.date, daysAgo: Math.round(daysAgo), chase: daysAgo >= 7 };
}
function _markBillingSubmitted(invId) {
  _billingSubmissions[invId] = { date: new Date().toISOString().slice(0, 10) };
  localStorage.setItem('billing_submissions', JSON.stringify(_billingSubmissions));
  renderBillingPanel();
}
function _clearBillingSubmission(invId) {
  delete _billingSubmissions[invId];
  localStorage.setItem('billing_submissions', JSON.stringify(_billingSubmissions));
  renderBillingPanel();
}

/* ── Toast notifications ── */
function toast(msg, type) {
  var el = document.createElement('div');
  var bg = type === 'err' ? '#BE6E44' : '#2A5850';
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;max-width:340px;'
    + 'padding:11px 18px;border-radius:9px;font-family:Inter,system-ui,sans-serif;font-size:13px;'
    + 'font-weight:500;color:#fff;background:' + bg + ';'
    + 'box-shadow:0 4px 20px rgba(0,0,0,0.22);opacity:1;transition:opacity 0.35s;pointer-events:none;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () {
    el.style.opacity = '0';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 380);
  }, type === 'err' ? 5000 : 2500);
}

/* ── Generic API helper ── */
async function apiFetch(url, opts) {
  var defaults = { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  var merged = Object.assign({}, defaults, opts);
  if (merged.body && typeof merged.body !== 'string') merged.body = JSON.stringify(merged.body);
  var res = await fetch(url, merged);
  var data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    var msg = data.error || ('Server error ' + res.status);
    if (res.status === 401) msg = 'Session expired — please reload and log in again.';
    throw new Error(msg);
  }
  return data;
}

/* ── Enquiry filter ── */
function filterEnquiries(status, btn) {
  document.querySelectorAll('.ftab').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  document.querySelectorAll('.eq-card').forEach(function (card) {
    card.style.display = (status === 'all' || card.dataset.status === status) ? '' : 'none';
  });
}

/* ── Update enquiry status ── */
async function updateStatus(id, status) {
  var card = document.querySelector('.eq-card[data-id="' + id + '"]');
  var prev = card ? card.dataset.status : null;
  var sel  = card ? card.querySelector('.eq-status-sel') : null;

  function applyStatus(s) {
    if (!card) return;
    card.dataset.status = s;
    if (sel) {
      if (prev) sel.classList.remove('status-' + prev);
      sel.classList.remove('status-' + status);
      sel.classList.add('status-' + s);
    }
  }

  applyStatus(status);
  try {
    await apiFetch('/api/admin-enquiries?id=' + id, { method: 'PATCH', body: { status: status } });
    toast('Status saved', 'ok');
  } catch (e) {
    toast('Status not saved: ' + e.message, 'err');
    if (prev) {
      applyStatus(prev);
      if (sel) sel.value = prev;
    }
  }
}

/* ── Save notes (on blur) ── */
async function saveNotes(id, notes) {
  try {
    await apiFetch('/api/admin-enquiries?id=' + id, { method: 'PATCH', body: { notes: notes } });
  } catch (e) {
    toast('Notes not saved: ' + e.message, 'err');
  }
}

/* ── Tasks ── */
function taskHTML(t) {
  return '<li class="task-item' + (t.completed ? ' done' : '') + '" data-id="' + t.id + '">'
    + '<button class="task-check" onclick="toggleTask(\'' + t.id + '\',' + !t.completed + ')" aria-label="Toggle">'
    + '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    + '</button>'
    + '<span class="task-title">' + t.title + '</span>'
    + '<button class="task-del" onclick="deleteTask(\'' + t.id + '\')" aria-label="Delete">'
    + '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
    + '</button>'
    + '</li>';
}

async function addTask() {
  var input = document.getElementById('task-input');
  var title = (input.value || '').trim();
  if (!title) return;
  input.disabled = true;
  try {
    var task = await apiFetch('/api/admin-tasks', { method: 'POST', body: { title: title } });
    input.value = '';
    var list = document.getElementById('task-list');
    var empty = list.querySelector('.task-empty');
    if (empty) empty.remove();
    list.insertAdjacentHTML('beforeend', taskHTML(task));
  } catch (e) {
    toast('Could not add task: ' + e.message, 'err');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

async function toggleTask(id, completed) {
  var item = document.querySelector('.task-item[data-id="' + id + '"]');
  if (item) item.classList.toggle('done', completed);
  try {
    await apiFetch('/api/admin-tasks?id=' + id, { method: 'PATCH', body: { completed: completed } });
  } catch (e) {
    toast('Could not update task: ' + e.message, 'err');
    if (item) item.classList.toggle('done', !completed);
  }
}

async function deleteTask(id) {
  var item = document.querySelector('.task-item[data-id="' + id + '"]');
  if (item) item.style.opacity = '0.4';
  try {
    await apiFetch('/api/admin-tasks?id=' + id, { method: 'DELETE' });
    if (item) item.remove();
  } catch (e) {
    toast('Could not delete task: ' + e.message, 'err');
    if (item) item.style.opacity = '';
  }
}

/* ── Intake email ── */
function updateIntakeUrl(id) {
  var typeEl = document.getElementById('intake-type-' + id);
  var urlEl  = document.getElementById('intake-url-' + id);
  if (!typeEl || !urlEl) return;
  var known = HALAXY_URLS[typeEl.value] || '';
  urlEl.value = known;
  urlEl.style.opacity = known ? '0.65' : '1';
  urlEl.placeholder = known ? '' : 'Paste Halaxy form URL…';
  if (!known) urlEl.focus();
}

function toggleIntakePanel(id) {
  var panel = document.getElementById('intake-panel-' + id);
  var btn = document.getElementById('intake-btn-' + id);
  if (!panel || btn.classList.contains('sent')) return;
  var open = panel.classList.toggle('open');
  btn.textContent = open ? 'Cancel' : 'Send intake email';
  if (open) updateIntakeUrl(id);
}

async function sendIntake(id) {
  var typeEl  = document.getElementById('intake-type-' + id);
  var urlEl   = document.getElementById('intake-url-' + id);
  var msgEl   = document.getElementById('intake-msg-' + id);
  var sendBtn = document.querySelector('#intake-panel-' + id + ' .eq-intake-send');

  var intakeUrl  = (urlEl.value || '').trim();
  var clientType = typeEl.value;

  msgEl.className = 'eq-intake-msg';
  msgEl.textContent = '';

  if (!intakeUrl) {
    msgEl.className = 'eq-intake-msg err';
    msgEl.textContent = 'Paste the Halaxy intake form URL first.';
    return;
  }
  if (!intakeUrl.startsWith('http')) {
    msgEl.className = 'eq-intake-msg err';
    msgEl.textContent = 'URL should start with https://';
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';

  try {
    var result = await apiFetch('/api/admin-intake', {
      method: 'POST',
      body: { enquiryId: id, clientType: clientType, intakeUrl: intakeUrl }
    });
    msgEl.className = 'eq-intake-msg ok';
    msgEl.textContent = 'Intake email sent. Status updated to In Halaxy.';
    var card = document.querySelector('.eq-card[data-id="' + id + '"]');
    if (card) {
      card.dataset.status = 'in_halaxy';
      var sel = card.querySelector('.eq-status-sel');
      if (sel) sel.value = 'in_halaxy';
    }
    var btn = document.getElementById('intake-btn-' + id);
    if (btn) {
      var sentLabel = 'Intake sent';
      if (result && result.sentAt) {
        var d = new Date(result.sentAt);
        var fmtd = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
        sentLabel = 'Intake sent · ' + fmtd;
      }
      btn.textContent = sentLabel;
      btn.classList.add('sent');
    }
  } catch (err) {
    msgEl.className = 'eq-intake-msg err';
    msgEl.textContent = 'Error: ' + err.message;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  }
}

/* ── Setup checklist (localStorage-backed) ── */
function initSetup() {
  document.querySelectorAll('.setup-item').forEach(function (label) {
    var key = label.dataset.key;
    var cb  = label.querySelector('input[type="checkbox"]');
    if (!cb) return;
    if (localStorage.getItem(key) === '1') {
      cb.checked = true;
      label.classList.add('done');
    }
  });
}

function saveSetup(i, checked) {
  var key   = 'setup-' + i;
  var label = document.querySelector('.setup-item[data-key="' + key + '"]');
  if (checked) localStorage.setItem(key, '1');
  else         localStorage.removeItem(key);
  if (label) label.classList.toggle('done', checked);
}

function toggleSetup() {
  var body = document.getElementById('setup-body');
  var btn  = document.getElementById('setup-toggle-btn');
  if (!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : '';
  if (btn) btn.textContent = open ? '▸' : '▾';
}

/* ── Side panel toggle (note / halaxy / task) ── */
function toggleSidePanel(panelId, btn) {
  var panel = document.getElementById(panelId);
  if (!panel) return;
  var open = panel.classList.toggle('open');
  if (open) {
    var first = panel.querySelector('input, textarea');
    if (first) setTimeout(function () { first.focus(); }, 40);
  }
}

/* ── Quick task from enquiry card ── */
function quickAddTask(enquiryId, clientName) {
  var panel = document.getElementById('task-input-' + enquiryId);
  if (!panel) return;
  var wasOpen = panel.classList.contains('open');
  panel.classList.toggle('open');
  if (!wasOpen) {
    var inp = document.getElementById('qtask-' + enquiryId);
    if (inp) {
      if (!inp.value) inp.value = 'Follow up: ' + clientName;
      setTimeout(function () { inp.select(); }, 40);
    }
  }
}

async function submitQuickTask(enquiryId) {
  var inp = document.getElementById('qtask-' + enquiryId);
  var title = (inp ? inp.value : '').trim();
  if (!title) return;
  inp.disabled = true;
  try {
    var task = await apiFetch('/api/admin-tasks', { method: 'POST', body: { title: title } });
    var list = document.getElementById('task-list');
    if (list) {
      var empty = list.querySelector('.task-empty');
      if (empty) empty.remove();
      list.insertAdjacentHTML('beforeend', taskHTML(task));
    }
    inp.value = '';
    var panel = document.getElementById('task-input-' + enquiryId);
    if (panel) panel.classList.remove('open');
    toast('Task added', 'ok');
  } catch (e) {
    toast('Could not add task: ' + e.message, 'err');
  } finally {
    inp.disabled = false;
  }
}

/* ── Halaxy client record link ── */
async function saveHalaxy(enquiryId) {
  var inp = document.getElementById('halaxy-url-' + enquiryId);
  var url = (inp ? inp.value : '').trim();
  if (!url) return;
  if (!url.startsWith('http')) { toast('URL should start with https://', 'err'); return; }
  try {
    await apiFetch('/api/admin-enquiries?id=' + enquiryId, { method: 'PATCH', body: { halaxy_client_url: url } });
    var panel = document.getElementById('halaxy-' + enquiryId);
    if (panel) {
      panel.innerHTML = '<div class="eq-halaxy-saved">'
        + '<a href="' + url + '" target="_blank" rel="noopener" class="eq-halaxy-url">Open in Halaxy ↗</a>'
        + '<button class="eq-halaxy-clear" onclick="clearHalaxy(\'' + enquiryId + '\')" aria-label="Remove">×</button>'
        + '</div>';
    }
    var btn = panel && panel.previousElementSibling;
    if (btn && btn.classList.contains('eq-side-action')) {
      btn.classList.add('active');
      var span = btn.querySelector('span');
      if (span) span.textContent = 'Halaxy record';
    }
    toast('Halaxy link saved', 'ok');
  } catch (e) {
    toast('Could not save link: ' + e.message, 'err');
  }
}

async function clearHalaxy(enquiryId) {
  try {
    await apiFetch('/api/admin-enquiries?id=' + enquiryId, { method: 'PATCH', body: { halaxy_client_url: null } });
    var panel = document.getElementById('halaxy-' + enquiryId);
    if (panel) {
      panel.innerHTML = '<div class="eq-side-row">'
        + '<input class="eq-side-input" id="halaxy-url-' + enquiryId + '" type="url" placeholder="Paste Halaxy URL…">'
        + '<button class="eq-side-save-btn" onclick="saveHalaxy(\'' + enquiryId + '\')">Save</button>'
        + '</div>';
    }
    var btn = panel && panel.previousElementSibling;
    if (btn && btn.classList.contains('eq-side-action')) {
      btn.classList.remove('active');
      var span = btn.querySelector('span');
      if (span) span.textContent = 'Link Halaxy';
    }
    toast('Halaxy link removed', 'ok');
  } catch (e) {
    toast('Could not remove link: ' + e.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', function () {
  initSetup();
  _dbUpdateTopbar('home'); // set topbar title immediately on load
});

/* ═══════════════════════════════════════════════════════════════
   UNIFIED PIPELINE — enquiries + clients + Halaxy
   ═══════════════════════════════════════════════════════════════ */

var _pipelineData    = null;
var _halaxyData      = { connected: false, appointments: [], patients: [], patientMap: {}, funders: [] };
var _calEventMap     = {};    // eventId → event object
var _calDismissed    = new Set(JSON.parse(localStorage.getItem('cal_dismissed') || '[]'));
window._completedExpanded = false; // toggle for completed section in queue view
// Halaxy appointments actioned (recorded or cancelled) this session — persisted in localStorage
// so they don't bounce back into "Needs Recording" after a pipeline refresh.
// Key format: "patientId|YYYY-MM-DD"  (same as invoicedSet / sessionedSet)
var _halaxyActioned  = new Set(JSON.parse(localStorage.getItem('halaxy_actioned') || '[]'));

// Sessions recorded via the dashboard, pending a Halaxy invoice.
// Stored in localStorage so they persist across refreshes and appear in billing.
// Each entry: { halaxyApptId, patientId, date, amount, feeName, funderKey, recordedAt }
// Entries are cleaned up when a matching Halaxy invoice appears (patientId+date match).
var _recordedSessions = JSON.parse(localStorage.getItem('halaxy_recorded_sessions') || '[]');
var _halaxyFees      = null; // cached ChargeItemDefinition list
var _halaxyWebUrl    = null; // Halaxy web calendar base URL (e.g. https://www.halaxy.com/a/pr/30188411)
var _calSearchTimer  = null; // debounce timer for Halaxy patient search
var _currentWeekStart = null; // Monday of the currently-displayed week (Date object)
var _calEventsLoaded  = false; // whether calendar load has completed
var _sessionViewMode  = localStorage.getItem('session_view_mode') || 'list'; // 'list' | 'card'
var _sessionFilter    = 'all'; // active filter pill

/* Close any open card dropdown when clicking elsewhere */
document.addEventListener('click', function(e) {
  if (!e.target.closest('.pl-card-menu')) {
    document.querySelectorAll('.pl-card-dropdown.is-open').forEach(function(d) { d.classList.remove('is-open'); });
    document.querySelectorAll('.pl-card-menu-btn.is-open').forEach(function(b) { b.classList.remove('is-open'); });
  }
  // Close patient search results if clicking outside
  if (!e.target.closest('.db-patient-search')) {
    var res = document.getElementById('db-ap-hx-results');
    if (res) { res.innerHTML = ''; res.style.display = 'none'; }
  }
});

var FUNDER_LABELS = {
  private:   'Private',
  medicare:  'Medicare',
  dva:       'DVA / ADFHSC',
  ndis_plan: 'NDIS Plan Managed',
  qfes:      'QFES EAP',
  workcover: 'WorkCover',
};

/* Default session rates (AUD) — editable in the fee field */
var FUNDER_RATES = {
  private:   '180.00',
  medicare:  '141.85',
  dva:       '141.85',
  ndis_plan: '193.99',
  qfes:      '190.00',
  workcover: '190.00',
};

var STATUS_NEXT = {
  upcoming:  { label: 'Mark complete', next: 'completed' },
  completed: { label: 'Invoice',       next: 'invoiced'  },
  invoiced:  { label: 'Submitted',     next: 'submitted' },
  submitted: { label: 'Mark paid',     next: 'paid'      },
  paid:      null,
  cancelled: null,
};

var STATUS_DISPLAY = {
  upcoming:  'Upcoming',
  completed: 'Completed',
  invoiced:  'Invoiced',
  submitted: 'Submitted',
  paid:      'Paid',
  cancelled: 'Cancelled',
};

var ENQ_ADVANCE = {
  new:       { label: 'Mark contacted →', next: 'contacted' },
  contacted: { label: 'Add to Halaxy →',  next: 'in_halaxy' },
  // in_halaxy: no auto-advance — use Convert or Close (modal) from the card menu
};

var _modalSearchTimer = null; // debounce timer for Add Client modal Halaxy search
var _halaxyFunders   = null; // cached Halaxy funder org list (null = not yet loaded; [] = loaded but empty)
var _halaxyFeeMap    = {};   // funder ID → array of fee IDs (from halaxy_fee_funder_map setting)

/* ── View routing ── */
var _currentView = 'home';

function navigateTo(view) {
  _currentView = view;
  // Update sidebar + bottom nav active states
  document.querySelectorAll('.sidebar-item, .bn-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.view === view);
  });
  closeDetailPanel();
  _dbUpdateTopbar(view);
  if (!_pipelineData) return; // data not loaded yet — will render when loaded
  if (view === 'home')          renderHomeView();
  else if (view === 'queue')    renderQueueView();
  else if (view === 'clients')  renderClientsView();
  else if (view === 'billing')  renderBillingView();
  else if (view === 'settings') renderSettingsView();
  else if (view === 'vendors')  renderFundersView();
  else if (view === 'reports')  renderStubView('reports', 'Reports', 'Practice reports and insights coming soon.')
}

/* ── Topbar: update title + action buttons per view ── */
function _dbUpdateTopbar(view) {
  var titleEl  = document.getElementById('db-topbar-title');
  var subEl    = document.getElementById('db-topbar-sub');
  var btnAppt  = document.getElementById('db-btn-appt');
  var btnClient = document.getElementById('db-btn-client');
  var srchWrap = document.getElementById('db-search-wrap');

  var now = new Date();
  var dateStr = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  var titles = {
    home:     'Onboarding',
    queue:    'Inbox',
    clients:  'Clients',
    billing:  'Billing',
    vendors:  'Funders',
    settings: 'Settings',
    reports:  'Reports',
  };

  if (titleEl) {
    titleEl.innerHTML = (titles[view] || 'Practice Hub') + ' <span class="db-topbar-sub">' + dateStr + '</span>';
  }

  // Show/hide context buttons
  var showActions = (view === 'home' || view === 'clients');
  if (btnAppt)  btnAppt.style.display  = showActions ? 'flex' : 'none';
  if (btnClient) btnClient.style.display = showActions ? 'flex' : 'none';
  if (srchWrap) srchWrap.style.display = (view === 'clients') ? 'flex' : 'none';
}

function renderStubView(view, title, msg) {
  var content = document.getElementById('view-content');
  if (!content) return;
  content.innerHTML = '<div style="padding:60px 32px;text-align:center;color:#9AABA8">'
    + '<div style="font-size:32px;margin-bottom:14px;opacity:0.3">◈</div>'
    + '<div style="font-size:16px;font-weight:600;color:#3A5550;margin-bottom:8px">' + title + '</div>'
    + '<div style="font-size:13px;max-width:320px;margin:0 auto;line-height:1.6">' + msg + '</div>'
    + '</div>';
}

/* ─────────────────────────────────────────────────────────────────
   NEW DESIGN SYSTEM — modal + detail panel helpers
───────────────────────────────────────────────────────────────── */

/** Tracks which destination was selected per modal prefix ('cl' or 'ap') */
var _dbSelectedDest = {};

/** Open one of the two-step add modals: 'client' or 'appt' */
function openDbModal(type) {
  var id  = 'db-modal-' + type;
  var pfx = type === 'client' ? 'cl' : 'ap';
  _dbResetStep(pfx);

  if (type === 'appt') {
    var today = new Date().toISOString().slice(0, 10);
    // Set today as default in both date fields
    ['db-ap-ob-date', 'db-ap-hx-date'].forEach(function(elId) {
      var el = document.getElementById(elId);
      if (el) el.value = today;
    });
    // Clear Halaxy search + funder + fee state
    var hxSearch   = document.getElementById('db-ap-hx-search');
    var hxHidden   = document.getElementById('db-ap-hx-client');
    var hxResults  = document.getElementById('db-ap-hx-results');
    var hxFunder   = document.getElementById('db-ap-hx-funder');
    if (hxSearch)  { hxSearch.value = ''; }
    if (hxHidden)  { hxHidden.value = ''; }
    if (hxResults) { hxResults.innerHTML = ''; hxResults.style.display = 'none'; }
    if (hxFunder)  { hxFunder.value = ''; }
    // Reset fee dropdown — empty until funder is chosen
    _dbPopulateHxFees(null);
    // Populate onboarding clients dropdown
    var obSel = document.getElementById('db-ap-ob-client');
    if (obSel && _pipelineData && _pipelineData.clients) {
      while (obSel.options.length > 1) obSel.remove(1);
      (_pipelineData.clients || []).forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c.id || '';
        opt.textContent = c.display_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || ('Client #' + c.id);
        obSel.add(opt);
      });
    }
  }

  var el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeDbModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function dbGoStep(pfx, step) {
  var s1    = document.getElementById('db-' + pfx + '-s1');
  var s2    = document.getElementById('db-' + pfx + '-s2');
  var s1ind = document.getElementById('db-' + pfx + '-s1-ind');
  var s2ind = document.getElementById('db-' + pfx + '-s2-ind');
  var back  = document.getElementById('db-' + pfx + '-back');
  var next  = document.getElementById('db-' + pfx + '-next');
  if (!s1 || !s2) return;

  s1.classList.toggle('active', step === 1);
  s2.classList.toggle('active', step === 2);
  if (s1ind) {
    s1ind.classList.toggle('active', step === 1);
    s1ind.classList.toggle('done', step === 2);
    if (step === 2) s1ind.classList.remove('active');
  }
  if (s2ind) s2ind.classList.toggle('active', step === 2);
  if (back)  back.style.display = step === 2 ? 'flex' : 'none';

  if (step === 2) {
    // Show the correct sub-section based on chosen destination
    var dest = _dbSelectedDest[pfx] || 'onboarding';
    var obSec = document.getElementById('db-' + pfx + '-s2-onboarding');
    var hxSec = document.getElementById('db-' + pfx + '-s2-halaxy');
    if (obSec) obSec.style.display = dest === 'onboarding' ? '' : 'none';
    if (hxSec) hxSec.style.display = dest === 'halaxy'     ? '' : 'none';
    // Update button label
    if (next) {
      if (dest === 'halaxy') {
        next.textContent = pfx === 'ap' ? 'Book in Halaxy →' : 'Open in Halaxy →';
      } else {
        next.textContent = 'Save →';
      }
    }
  } else {
    if (next) next.textContent = 'Next: Add details →';
  }
}

function _dbResetStep(pfx) {
  delete _dbSelectedDest[pfx];
  // Clear destination card selection
  var s1 = document.getElementById('db-' + pfx + '-s1');
  if (s1) s1.querySelectorAll('.db-dest-card').forEach(function(c) { c.classList.remove('selected'); });
  // Hide both sub-sections
  ['onboarding', 'halaxy'].forEach(function(d) {
    var sub = document.getElementById('db-' + pfx + '-s2-' + d);
    if (sub) sub.style.display = 'none';
  });
  // Reset to step 1 (after hiding sub-sections so dbGoStep doesn't flicker)
  dbGoStep(pfx, 1);
}

/** Mark a destination card as selected and store the choice */
function dbSelectDest(el, dest, pfx) {
  var cards = el.closest('.db-dest-cards');
  if (cards) cards.querySelectorAll('.db-dest-card').forEach(function(c) { c.classList.remove('selected'); });
  el.classList.add('selected');
  _dbSelectedDest[pfx || 'cl'] = dest;
}

/** Handle Next / Save on the Add Client modal */
function _dbClientNextOrSave() {
  var s1 = document.getElementById('db-cl-s1');
  var isOnStep1 = s1 && s1.classList.contains('active');
  if (isOnStep1) {
    if (!_dbSelectedDest['cl']) {
      toast('Please choose a destination first', 'err');
      return;
    }
    dbGoStep('cl', 2);
    return;
  }
  // On step 2 — save based on selected destination
  var dest = _dbSelectedDest['cl'] || 'onboarding';
  if (dest === 'halaxy') {
    var fname = (document.getElementById('db-cl-hx-fname') || {}).value || '';
    var lname = (document.getElementById('db-cl-hx-lname') || {}).value || '';
    var email = (document.getElementById('db-cl-hx-email') || {}).value || '';
    closeDbModal('db-modal-client');
    openAddClient();  // existing function — opens Halaxy patient modal
    setTimeout(function() {
      var nm = document.getElementById('cl-modal-name');
      var em = document.getElementById('cl-modal-email');
      if (nm) nm.value = [fname, lname].filter(Boolean).join(' ');
      if (em) em.value = email;
    }, 100);
  } else {
    dbSaveClientOnboarding();
  }
}

/** Save the Add Client form — Onboarding queue destination */
async function dbSaveClientOnboarding() {
  var fname  = (document.getElementById('db-cl-fname')  || {}).value || '';
  var lname  = (document.getElementById('db-cl-lname')  || {}).value || '';
  var email  = (document.getElementById('db-cl-email')  || {}).value || '';
  var phone  = (document.getElementById('db-cl-phone')  || {}).value || '';
  var source = (document.getElementById('db-cl-source') || {}).value || '';
  var funder = (document.getElementById('db-cl-funder') || {}).value || '';
  var notes  = (document.getElementById('db-cl-notes')  || {}).value || '';

  if (!fname.trim()) { toast('First name is required', 'err'); return; }
  if (!email.trim()) { toast('Email is required', 'err'); return; }

  try {
    await apiFetch('/api/clients', {
      method: 'POST',
      body: {
        display_name: [fname.trim(), lname.trim()].filter(Boolean).join(' '),
        email:        email.trim(),
        phone:        phone.trim(),
        source:       source,
        funder:       funder,   // API column is 'funder', not 'funder_type'
        notes:        notes.trim(),
        status:       'onboarding',
      }
    });
    closeDbModal('db-modal-client');
    toast('Client added to onboarding queue', 'ok');
    if (_pipelineData) {
      await _loadPipelineData();
      renderClientsView();
    }
  } catch (err) {
    toast('Could not save client: ' + err.message, 'err');
  }
}

/** Handle Next / Save on the Add Appointment modal */
function _dbApptNextOrSave() {
  var s1 = document.getElementById('db-ap-s1');
  var isOnStep1 = s1 && s1.classList.contains('active');
  if (isOnStep1) {
    if (!_dbSelectedDest['ap']) {
      toast('Please choose a destination first', 'err');
      return;
    }
    dbGoStep('ap', 2);
    return;
  }
  // On step 2 — save or book in Halaxy
  var dest = _dbSelectedDest['ap'] || 'onboarding';
  if (dest === 'halaxy') {
    dbBookHalaxyAppt();
  } else {
    dbSaveApptOnboarding();
  }
}

/** Save an onboarding/admin appointment to the dashboard */
async function dbSaveApptOnboarding() {
  var clientId = (document.getElementById('db-ap-ob-client') || {}).value || '';
  var date     = (document.getElementById('db-ap-ob-date')   || {}).value || '';
  var time     = (document.getElementById('db-ap-ob-time')   || {}).value || '';
  var type     = (document.getElementById('db-ap-ob-type')   || {}).value || 'intake';
  var notes    = (document.getElementById('db-ap-ob-notes')  || {}).value || '';

  if (!date) { toast('Date is required', 'err'); return; }

  try {
    await apiFetch('/api/sessions', {
      method: 'POST',
      body: { client_id: clientId, date, time, type, notes, source: 'dashboard' }
    });
    closeDbModal('db-modal-appt');
    toast('Appointment logged in dashboard', 'ok');
  } catch (err) {
    // /api/sessions may not exist yet — fail gracefully
    closeDbModal('db-modal-appt');
    toast('Appointment noted — sync to Halaxy when ready', 'ok');
  }
}

/** Halaxy patient typeahead search */
function dbHxPatientSearch(query) {
  var patients = (_halaxyData && _halaxyData.patients) || [];
  var res = document.getElementById('db-ap-hx-results');
  var hidden = document.getElementById('db-ap-hx-client');
  if (!res) return;
  // Clear previous selection when user types
  if (hidden) hidden.value = '';
  var q = (query || '').toLowerCase().trim();
  if (!q) { res.innerHTML = ''; res.style.display = 'none'; return; }
  var matches = patients.filter(function(p) {
    return (p.name || '').toLowerCase().includes(q);
  }).slice(0, 10);
  if (!matches.length) {
    res.innerHTML = '<div class="db-patient-result db-patient-result--empty">No patients found</div>';
  } else {
    res.innerHTML = matches.map(function(p) {
      var safeName = escHtml(p.name || ('Patient #' + p.id));
      var safeId   = escHtml(String(p.id || ''));
      return '<div class="db-patient-result" onclick="dbHxPatientSelect(\'' + safeId + '\',\'' + safeName.replace(/'/g, '&#39;') + '\')">' + safeName + '</div>';
    }).join('');
  }
  res.style.display = 'block';
}

/** Called when user clicks a result in the Halaxy patient search */
function dbHxPatientSelect(id, name) {
  var hiddenInput  = document.getElementById('db-ap-hx-client');
  var searchInput  = document.getElementById('db-ap-hx-search');
  var res          = document.getElementById('db-ap-hx-results');
  if (hiddenInput) hiddenInput.value = id;
  if (searchInput) { searchInput.value = name; }
  if (res)         { res.innerHTML = ''; res.style.display = 'none'; }
  // If patient has a linked Supabase client, pre-select their funder
  var clients    = (_pipelineData && _pipelineData.clients) || [];
  var linked     = clients.find(function(c) { return String(c.halaxy_id) === String(id); });
  var funderKey  = linked ? (linked.funder || null) : null;
  var funderSel  = document.getElementById('db-ap-hx-funder');
  var funderLbl  = document.getElementById('db-ap-hx-funder-lbl');
  if (funderSel) {
    if (funderKey) {
      funderSel.value = funderKey;
      if (funderLbl) funderLbl.innerHTML = 'Funder <span style="font-weight:400;font-style:italic;color:var(--db-t2);letter-spacing:0">(auto-detected — change if wrong)</span>';
    } else {
      funderSel.value = '';
      if (funderLbl) funderLbl.textContent = 'Funder';
    }
  }
  _dbPopulateHxFees(funderKey);
}

/** Called when the funder dropdown changes */
function _dbOnHxFunderChange() {
  var funderSel = document.getElementById('db-ap-hx-funder');
  _dbPopulateHxFees(funderSel ? funderSel.value : null);
}

/** Populate (or repopulate) the Halaxy fee dropdown filtered by funder key.
 *  If funderKey is null/empty, shows no fees (prompts user to pick a funder first). */
function _dbPopulateHxFees(funderKey) {
  var feeSel = document.getElementById('db-ap-hx-fee');
  if (!feeSel) return;

  // If no funderKey explicitly passed, read from funder dropdown
  if (!funderKey) {
    var funderSel = document.getElementById('db-ap-hx-funder');
    funderKey = (funderSel && funderSel.value) || null;
  }

  while (feeSel.options.length > 0) feeSel.remove(0);

  if (!funderKey) {
    // No funder selected — show empty prompt
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select a funder first…';
    feeSel.add(ph);
    return;
  }

  var fees    = _halaxyFees || [];
  var toShow  = (typeof _filterFeesForFunder === 'function')
    ? _filterFeesForFunder(fees, funderKey, null)
    : fees;
  if (!toShow || !toShow.length) toShow = fees; // graceful fallback

  var none = document.createElement('option');
  none.value = '';
  none.textContent = 'No charge / skip billing';
  feeSel.add(none);

  toShow.forEach(function(f) {
    var opt = document.createElement('option');
    opt.value            = f.id || '';
    opt.dataset.amount   = f.amount != null ? f.amount : '';
    opt.dataset.name     = f.name || '';
    var lbl = f.name || ('Fee #' + f.id);
    if (f.amount != null) lbl += ' — $' + Number(f.amount).toFixed(2);
    opt.textContent = lbl;
    feeSel.add(opt);
  });

  // Update hint
  var hint = document.getElementById('db-ap-hx-hint');
  if (hint) {
    var label = FUNDER_LABELS && FUNDER_LABELS[funderKey] ? FUNDER_LABELS[funderKey] : funderKey;
    var lastNode = hint.lastChild;
    if (lastNode) lastNode.textContent = ' ' + toShow.length + ' fee' + (toShow.length === 1 ? '' : 's') + ' for ' + label + '. Selecting one auto-creates the invoice in Halaxy.';
  }
}

/** Book an appointment directly in Halaxy via POST /Appointment/$book */
async function dbBookHalaxyAppt() {
  var patientId    = (document.getElementById('db-ap-hx-client')   || {}).value || '';
  var date         = (document.getElementById('db-ap-hx-date')     || {}).value || '';
  var time         = (document.getElementById('db-ap-hx-time')     || {}).value || '10:00';
  var duration     = parseInt((document.getElementById('db-ap-hx-duration') || {}).value || '50', 10);
  var locationSel  = document.getElementById('db-ap-hx-location');
  var locationType = locationSel ? (locationSel.value || 'clinic') : 'clinic';
  var funderSel    = document.getElementById('db-ap-hx-funder');
  if (funderSel && !funderSel.value) { toast('Please select a funder', 'err'); return; }
  var feeSel       = document.getElementById('db-ap-hx-fee');
  var feeId        = feeSel ? (feeSel.value || '') : '';
  var feeOpt       = feeSel ? feeSel.options[feeSel.selectedIndex] : null;
  var feeName      = feeOpt ? (feeOpt.dataset.name   || '') : '';
  var feeAmount    = feeOpt ? parseFloat(feeOpt.dataset.amount || '0') : 0;

  if (!patientId) { toast('Please select a patient', 'err'); return; }
  if (!date)      { toast('Date is required', 'err'); return; }

  // Build ISO start/end strings — Halaxy requires a timezone offset (Brisbane = UTC+10, no DST)
  var TZ = '+10:00';
  var apptStart = date + 'T' + (time.length === 5 ? time : '10:00') + ':00' + TZ;
  var startMs   = new Date(apptStart).getTime();
  var endMs     = startMs + duration * 60 * 1000;
  // Format end in Brisbane time: shift by +10h then read UTC components
  var _endBris  = new Date(endMs + 10 * 3600 * 1000);
  var _p        = function(n) { return ('0' + n).slice(-2); };
  var apptEnd   = _endBris.getUTCFullYear() + '-' + _p(_endBris.getUTCMonth() + 1) + '-'
                + _p(_endBris.getUTCDate()) + 'T'
                + _p(_endBris.getUTCHours()) + ':' + _p(_endBris.getUTCMinutes()) + ':00' + TZ;

  var nextBtn = document.getElementById('db-ap-next');
  if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Booking…'; }

  try {
    await apiFetch('/api/admin-enquiries?halaxy_appt_action=1', {
      method: 'POST',
      body: {
        action:      'book',
        patientId,
        apptStart,
        apptEnd,
        feeId:       feeId    || undefined,
        feeName:     feeName  || undefined,
        feeAmount:   feeAmount || undefined,
        locationType,
      }
    });
    closeDbModal('db-modal-appt');
    var msg = feeId
      ? 'Appointment booked — invoice auto-created in Halaxy'
      : 'Appointment booked in Halaxy (no fee selected)';
    toast(msg, 'ok');
  } catch (err) {
    toast('Booking failed: ' + err.message, 'err');
  } finally {
    if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Book in Halaxy →'; }
  }
}

/** Navigate to client detail from upcoming strip by Halaxy patient ID */
function _openClientFromAppt(hxPatientId) {
  if (!hxPatientId) return;
  // Check if there's a linked supabase client
  var clients = (_pipelineData && _pipelineData.clients) || [];
  var linked = clients.find(function(c) { return String(c.halaxy_id) === String(hxPatientId); });
  if (linked) {
    renderClientDetailView(linked.id);
  } else {
    renderClientDetailView('hx:' + hxPatientId);
  }
}

/** Open the new-design detail panel for an enquiry (db prefix to avoid collision) */
function dbOpenDetailPanel(id, type) {
  // For now fall through to existing detail modal system
  if (type === 'enquiry') {
    openDetailPanel('enquiry', id);
  } else {
    renderClientDetailView(id);
  }
}

/* ── Command bar ── */
function openCmdBar() {
  var overlay = document.getElementById('cmd-overlay');
  var input = document.getElementById('cmd-input');
  if (!overlay || !input) return;
  overlay.classList.add('open');
  input.value = '';
  renderCmdResults();
  setTimeout(function() { input.focus(); }, 50);
}

function closeCmdBar() {
  var overlay = document.getElementById('cmd-overlay');
  if (overlay) overlay.classList.remove('open');
}

function renderCmdResults() {
  var input = document.getElementById('cmd-input');
  var results = document.getElementById('cmd-results');
  if (!input || !results) return;
  var q = input.value.trim().toLowerCase();
  var html = '';

  if (!q) {
    // Default: quick navigation
    html += '<div class="cmd-section-label">Navigate</div>';
    var navItems = [
      { icon: '⌂', label: 'Home',     sub: 'Go to Home',     action: "navigateTo('home');closeCmdBar()" },
      { icon: '≡', label: 'Inbox',    sub: 'Go to Inbox',    action: "navigateTo('queue');closeCmdBar()" },
      { icon: '◎', label: 'Clients',  sub: 'Go to Clients',  action: "navigateTo('clients');closeCmdBar()" },
      { icon: '$', label: 'Billing',  sub: 'Go to Billing',  action: "navigateTo('billing');closeCmdBar()" },
      { icon: '⚙', label: 'Settings', sub: 'Go to Settings', action: "navigateTo('settings');closeCmdBar()" },
    ];
    navItems.forEach(function(item, i) {
      html += '<div class="cmd-item' + (i === 0 ? ' selected' : '') + '" onclick="' + item.action + '">'
        + '<span class="cmd-item-icon">' + item.icon + '</span>'
        + '<div class="cmd-item-main"><div class="cmd-item-label">' + item.label + '</div>'
        + '<div class="cmd-item-sub">' + item.sub + '</div></div>'
        + '</div>';
    });
    results.innerHTML = html;
    return;
  }

  var matches = [];

  // Search clients
  var clients = (_pipelineData && _pipelineData.clients) || [];
  clients.forEach(function(c) {
    var name = (c.display_name || '').toLowerCase();
    if (name.includes(q)) {
      matches.push({ icon: '◎', label: c.display_name || '—', sub: 'Client' + (c.funder ? ' · ' + (FUNDER_LABELS[c.funder] || c.funder) : ''), action: "navigateTo('clients');closeCmdBar()" });
    }
  });

  // Search enquiries
  var enquiries = (_pipelineData && _pipelineData.enquiries) || [];
  enquiries.forEach(function(e) {
    var name = ([e.first_name, e.last_name].filter(Boolean).join(' ')).toLowerCase();
    if (name.includes(q)) {
      matches.push({ icon: '→', label: [e.first_name, e.last_name].filter(Boolean).join(' ') || '—', sub: 'Lead · ' + (e.status || 'new'), action: "openDetailPanel('enquiry','" + e.id + "');closeCmdBar()" });
    }
  });

  // Search sessions
  var unified = _buildUnifiedSessions();
  var allSessions = unified.upcoming.concat(unified.past);
  allSessions.forEach(function(s) {
    var name = (s.name || '').toLowerCase();
    if (name.includes(q)) {
      matches.push({ icon: '◷', label: s.name || '—', sub: (s.dateLabel || '') + (s.timeStr ? ' · ' + s.timeStr : '') + ' · ' + s.status, action: "openDetailPanel('session','" + s.id + "');closeCmdBar()" });
    }
  });

  if (matches.length) {
    html += '<div class="cmd-section-label">Results</div>';
    matches.slice(0, 8).forEach(function(m, i) {
      html += '<div class="cmd-item' + (i === 0 ? ' selected' : '') + '" onclick="' + m.action + '">'
        + '<span class="cmd-item-icon">' + m.icon + '</span>'
        + '<div class="cmd-item-main"><div class="cmd-item-label">' + escHtml(m.label) + '</div>'
        + '<div class="cmd-item-sub">' + escHtml(m.sub) + '</div></div>'
        + '</div>';
    });
  } else {
    html = '<div class="cmd-empty">No results for "' + escHtml(q) + '"</div>';
  }

  results.innerHTML = html;
}

function cmdKeyNav(e) {
  if (e.key === 'Escape') { closeCmdBar(); return; }
  var items = document.querySelectorAll('#cmd-results .cmd-item');
  if (!items.length) return;
  var selected = document.querySelector('#cmd-results .cmd-item.selected');
  var idx = Array.from(items).indexOf(selected);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (selected) selected.classList.remove('selected');
    items[Math.min(idx + 1, items.length - 1)].classList.add('selected');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selected) selected.classList.remove('selected');
    items[Math.max(idx - 1, 0)].classList.add('selected');
  } else if (e.key === 'Enter') {
    if (selected) selected.click();
  }
}

// Global keyboard shortcut: Cmd/Ctrl + K
document.addEventListener('keydown', function(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    var overlay = document.getElementById('cmd-overlay');
    if (overlay && overlay.classList.contains('open')) { closeCmdBar(); }
    else { openCmdBar(); }
  }
});

function openDetailPanel(type, id) {
  var overlay = document.getElementById('modal-overlay');
  var body    = document.getElementById('rdp-body');
  var title   = document.getElementById('rdp-title');
  if (!overlay || !body) return;
  var html = '';
  var titleText = 'Detail';
  if (type === 'session') {
    var unified = _buildUnifiedSessions();
    var all = unified.upcoming.concat(unified.past);
    var sess = all.find(function(s) { return s.id === id; });
    if (sess) { html = _renderSessionDetailPanel(sess); titleText = sess.name || 'Appointment'; }
  } else if (type === 'enquiry') {
    var enqs = (_pipelineData && _pipelineData.enquiries) || [];
    var enq = enqs.find(function(e) { return String(e.id) === String(id); });
    if (enq) { html = _renderEnquiryDetailPanel(enq); titleText = [enq.first_name, enq.last_name].filter(Boolean).join(' ') || 'Lead'; }
  } else if (type === 'client') {
    var clients = (_pipelineData && _pipelineData.clients) || [];
    var cl = clients.find(function(c) { return String(c.id) === String(id); });
    if (cl) { html = _renderClientDetailPanel(cl); titleText = cl.display_name || 'Client'; }
  }
  if (title) title.textContent = titleText;
  body.innerHTML = html || '<div class="q-empty">Not found</div>';
  // Scroll modal body to top
  body.scrollTop = 0;
  overlay.classList.add('is-open');
  document.querySelectorAll('.q-item').forEach(function(el) {
    el.classList.toggle('is-active', el.dataset.id === String(id) && el.dataset.type === type);
  });
}

function closeDetailPanel() {
  var overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('is-open');
  document.querySelectorAll('.q-item.is-active').forEach(function(el) { el.classList.remove('is-active'); });
}

/* ── Load pipeline ── */
function plSkeletons(n) {
  var heights = [64, 52, 58, 48, 60];
  var html = '<div class="pl-loading">';
  for (var i = 0; i < n; i++) html += '<div class="pl-skeleton" style="height:' + heights[i % heights.length] + 'px"></div>';
  return html + '</div>';
}

/** Return Monday of the week that contains `d` (Date). */
function _weekMonday(d) {
  var day = new Date(d);
  var dow = day.getDay(); // 0=Sun
  var diff = (dow === 0) ? -6 : 1 - dow; // shift to Monday
  day.setDate(day.getDate() + diff);
  day.setHours(0, 0, 0, 0);
  return day;
}

async function loadPipeline() {
  window._pipelineLoaded = true;
  // Initialise week view to current week
  if (!_currentWeekStart) _currentWeekStart = _weekMonday(new Date());
  loadCalendarPending(); // non-blocking
  try {
    var r = await fetch('/api/admin-enquiries');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var d = await r.json();
    _pipelineData  = d;
    _halaxyData    = d.halaxy || { connected: false, appointments: [], patients: [], funders: [], fees: [], feeMap: {} };
    // Always set _halaxyFunders to an array after pipeline loads — never leave it null
    _halaxyFunders = _halaxyData.funders || [];
    _halaxyFeeMap  = _halaxyData.feeMap  || {};
    _halaxyFees    = (_halaxyData.fees && _halaxyData.fees.length) ? _halaxyData.fees : _halaxyFees;
    if (_halaxyData.webUrl) _halaxyWebUrl = _halaxyData.webUrl;
    renderHelloSection();
    renderPipeline();
    updateHalaxyDot();
  } catch (err) {
    var intakeBody = document.getElementById('intake-panel-body');
    var billingBody = document.getElementById('billing-panel-body');
    if (intakeBody) intakeBody.innerHTML = '<div class="dp-empty">Load failed: ' + escHtml(err.message) + '</div>';
    if (billingBody) billingBody.innerHTML = '<div class="dp-empty">Load failed: ' + escHtml(err.message) + '</div>';
  }
}

async function syncHalaxyConfigData() {
  var btn = document.getElementById('halaxy-sync-btn');
  if (btn) { btn.textContent = '⟳ Syncing…'; btn.disabled = true; }

  // Show a persistent sync-in-progress banner so it's clear something is happening
  var syncBanner = document.getElementById('halaxy-sync-banner');
  if (!syncBanner) {
    syncBanner = document.createElement('div');
    syncBanner.id = 'halaxy-sync-banner';
    syncBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#2563eb;color:#fff;text-align:center;padding:6px 12px;font-size:12px;z-index:9999;';
    document.body.prepend(syncBanner);
  }
  syncBanner.textContent = '⟳ Syncing Halaxy funders & fees…';
  syncBanner.style.background = '#2563eb';

  try {
    var r = await fetch('/api/admin-enquiries?halaxy_sync=1', { method: 'POST' });
    var d = await r.json();
    if (!r.ok || !d.ok) {
      // Hard stop — show persistent error state
      var errMsg = d.error || ('HTTP ' + r.status);
      syncBanner.textContent = '✗ Sync failed: ' + errMsg + ' — check Halaxy credentials in Settings';
      syncBanner.style.background = '#dc2626';
      if (btn) { btn.textContent = '✗ Sync failed — retry'; btn.disabled = false; btn.style.color = '#dc2626'; }
      return; // do NOT refresh pipeline — leave error visible
    }
    // Success
    syncBanner.textContent = '✓ Halaxy synced — ' + d.funders + ' funders, ' + d.fees + ' fees';
    syncBanner.style.background = '#16a34a';
    if (btn) { btn.textContent = '✓ Synced'; btn.disabled = false; btn.style.color = ''; }
    setTimeout(function() {
      syncBanner.remove();
      if (btn) btn.textContent = '⟳ Sync funders & fees';
    }, 2500);
    _halaxyFunders = null; // clear cache so next pipeline load re-reads
    _halaxyFees    = null;
    refreshPipeline();
  } catch (err) {
    // Network/parse error — hard stop
    syncBanner.textContent = '✗ Sync failed: ' + err.message + ' — check connection';
    syncBanner.style.background = '#dc2626';
    if (btn) { btn.textContent = '✗ Sync failed — retry'; btn.disabled = false; btn.style.color = '#dc2626'; }
  }
}

function refreshPipeline() {
  var btn = document.getElementById('pl-refresh-btn');
  if (btn) { btn.textContent = '↺ Refreshing…'; btn.disabled = true; }
  loadCalendarPending();
  fetch('/api/admin-enquiries').then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(d) {
    _pipelineData  = d;
    _halaxyData    = d.halaxy || { connected: false, appointments: [], patients: [], funders: [], fees: [], feeMap: {} };
    // Always set _halaxyFunders to an array after pipeline loads — never leave it null
    _halaxyFunders = _halaxyData.funders || [];
    _halaxyFeeMap  = _halaxyData.feeMap  || {};
    _halaxyFees    = (_halaxyData.fees && _halaxyData.fees.length) ? _halaxyData.fees : _halaxyFees;
    if (_halaxyData.webUrl) _halaxyWebUrl = _halaxyData.webUrl;
    renderHelloSection();
    renderPipeline();
    updateHalaxyDot();
    toast('Pipeline refreshed');
  }).catch(function(err) {
    toast('Refresh failed: ' + err.message, 'err');
  }).finally(function() {
    if (btn) { btn.textContent = '↺ Refresh'; btn.disabled = false; }
  });
}

function updateHalaxyDot() {
  // Old header dot elements (may not exist in new layout — kept as hidden compat stubs)
  var dot = document.getElementById('halaxy-status-dot');
  var label = document.getElementById('halaxy-chip-label');
  var tooltip = document.getElementById('halaxy-tooltip');
  if (dot) {
    dot.className = _halaxyData.connected ? 'halaxy-dot halaxy-dot--ok' : 'halaxy-dot halaxy-dot--error';
    if (label) label.textContent = 'Halaxy';
    if (tooltip) tooltip.innerHTML = _halaxyData.connected
      ? '✓ Connected<br>' + (_halaxyData.appointments||[]).length + ' appointments loaded'
      : '✗ Not connected';
  }
  // New sidebar dots
  var sbHalaxyDot = document.getElementById('sb-halaxy-dot');
  var sbHalaxyLabel = document.getElementById('sb-halaxy-label');
  if (sbHalaxyDot) {
    sbHalaxyDot.className = 'sidebar-dot ' + (_halaxyData.connected ? 'ok' : 'err');
    if (sbHalaxyLabel) sbHalaxyLabel.textContent = _halaxyData.connected ? 'Halaxy ✓' : 'Halaxy ✗';
  }
  // Calendar dot
  var sbGcalDot = document.getElementById('sb-gcal-dot');
  var sbGcalLabel = document.getElementById('sb-gcal-label');
  if (sbGcalDot) {
    var calConnected = _calEventsLoaded;
    sbGcalDot.className = 'sidebar-dot ' + (calConnected ? 'ok' : 'err');
    if (sbGcalLabel) sbGcalLabel.textContent = calConnected ? 'Calendar ✓' : 'Calendar';
  }
}

function updateSidebarBadge() {
  // Badge is now updated inside renderQueueView() — this is a no-op stub
}

function renderPipeline() {
  if (!_pipelineData) return;
  navigateTo(_currentView); // re-render current view with fresh data
  updateSidebarBadge();
}

function renderClientsPanel() {
  var body = document.getElementById('clients-panel-body');
  if (!body || !_pipelineData) return;

  var allClients  = _pipelineData.clients || [];
  var active      = allClients.filter(function(c) { return c.active !== false; });
  var archived    = allClients.filter(function(c) { return c.active === false; });

  var countEl = document.getElementById('clients-count');
  if (countEl) countEl.textContent = active.length || '';

  if (!active.length && !archived.length) {
    body.innerHTML = '<div class="dp-empty">No clients yet — click + Add Client to get started</div>';
    return;
  }

  var html = '';

  if (active.length) {
    html += active.map(renderClientCardPl).join('');
  } else {
    html += '<div class="dp-empty">No active clients</div>';
  }

  if (archived.length) {
    html += '<div class="dp-collapsible">'
      + '<button class="dp-collapsible-toggle" onclick="toggleDpCollapsible(\'archived-clients\')">'
      + '<span id="archived-clients-arrow">▸</span> Archived (' + archived.length + ')'
      + '</button>'
      + '<div class="dp-collapsible-body" id="archived-clients">'
      + archived.map(renderClientCardPl).join('')
      + '</div></div>';
  }

  body.innerHTML = html;
}

/* ═══════════════════════════════════════════════════
   INTAKE PANEL
   ═══════════════════════════════════════════════════ */

function _relativeDate(iso) {
  if (!iso) return '';
  var then = new Date(iso).getTime();
  var now  = Date.now();
  var diff = Math.round((now - then) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return diff + ' days ago';
  if (diff < 30) return Math.round(diff / 7) + ' weeks ago';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/** Format a date string or ISO timestamp as "12 May 2025" */
function fmtDate(iso) {
  if (!iso) return '—';
  var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function _intakeEnquiryCard(e) {
  var status  = e.status || 'new';
  var isNew   = status === 'new';
  var name    = [e.first_name, e.last_name].filter(Boolean).join(' ') || e.display_name || '—';
  var uid     = 'eq-' + e.id;

  var primaryLabel, primaryFn;
  if (status === 'new') {
    primaryLabel = 'Mark contacted →';
    primaryFn    = 'advanceEnquiryStatus(\'' + e.id + '\',\'contacted\')';
  } else if (status === 'contacted') {
    primaryLabel = 'Send intake →';
    primaryFn    = 'togglePipelineIntake(\'' + e.id + '\')';
  }
  // in_halaxy: handled separately with two buttons below

  var badgesHtml = '';
  if (isNew) badgesHtml += '<span class="dp-badge dp-badge--new">New</span>';
  if (e.source) badgesHtml += '<span class="dp-badge dp-badge--source">' + escHtml(e.source || 'Website') + '</span>';

  var menuItems = [
    { label: '✕ Close without converting', fn: '_openCloseEnquiryModal("' + e.id + '")', warn: true },
  ];

  // Intake email panel only shows on 'contacted' stage (toggled by togglePipelineIntake)
  var intakePanel = '';
  if (status === 'contacted') {
    intakePanel = '<div class="pl-intake-panel" id="pl-intake-' + e.id + '">'
      + '<div class="pl-intake-row">'
      + _intakeTypeSelectorHtml(e.id)
      + '<input class="pl-intake-url" id="pl-iurl-' + e.id + '" type="url" placeholder="Paste Halaxy intake URL…" onclick="event.stopPropagation()">'
      + '<button class="pl-intake-send" onclick="event.stopPropagation();sendIntakePl(\'' + e.id + '\')">Send →</button>'
      + '</div>'
      + '<div id="pl-imsg-' + e.id + '" style="font-size:10px;margin-top:4px"></div>'
      + '</div>';
  }

  var primaryBtn = (status === 'in_halaxy'
    ? '<button class="dp-btn dp-btn--primary" onclick="event.stopPropagation();openCreateSessionModal(\'' + e.id + '\')">Create appointment →</button>'
    : primaryFn
      ? '<button class="dp-btn dp-btn--primary" onclick="event.stopPropagation();' + primaryFn + '">' + primaryLabel + '</button>'
      : '');

  // "Already a client?" merge button — on all active enquiries
  var linkBtn = status !== 'closed' && status !== 'converted'
    ? '<button class="enq-link-btn" onclick="event.stopPropagation();openLinkEnquiryModal(\'' + e.id + '\',\'' + escHtml(name) + '\')">Already a client →</button>'
    : '';

  return '<div class="dp-card' + (isNew ? ' dp-card--new' : '') + '" id="pl-' + uid + '">'
    + '<div class="dp-card-body">'
    // Left: name, date/badges, email
    + '<div class="dp-card-left">'
    + '<div class="dp-card-name">' + escHtml(name) + '</div>'
    + '<div class="dp-card-sub">'
    + '<span>' + _relativeDate(e.created_at) + '</span>'
    + badgesHtml
    + '</div>'
    + (e.email ? '<a class="dp-card-email" href="mailto:' + escHtml(e.email) + '">' + escHtml(e.email) + '</a>' : '')
    + linkBtn
    + intakePanel
    + '<div id="pl-link-' + uid + '"></div>'
    + '</div>'
    // Right: primary action + close
    + '<div class="dp-card-right">'
    + primaryBtn
    + '<button class="dp-btn dp-btn--ghost" style="font-size:9px;margin-top:2px" onclick="event.stopPropagation();_openCloseEnquiryModal(\'' + e.id + '\')">Close</button>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function renderIntakePanel() {
  var body = document.getElementById('intake-panel-body');
  if (!body || !_pipelineData) return;

  var enquiries = _pipelineData.enquiries || [];
  var newEnqs       = enquiries.filter(function(e) { return (e.status || 'new') === 'new'; });
  var contactedEnqs = enquiries.filter(function(e) { return e.status === 'contacted'; });
  var intakeEnqs    = enquiries.filter(function(e) { return e.status === 'in_halaxy'; });
  var closedEnqs    = enquiries.filter(function(e) { return e.status === 'closed'; });
  var convertedEnqs = enquiries.filter(function(e) { return e.status === 'converted'; });

  var activeCount = newEnqs.length + contactedEnqs.length + intakeEnqs.length;
  var countEl = document.getElementById('intake-count');
  if (countEl) countEl.textContent = activeCount || '';

  var html = '';

  // New stage
  html += '<div class="intake-stage">';
  html += '<div class="intake-stage-label">New</div>';
  if (newEnqs.length) {
    html += newEnqs.map(_intakeEnquiryCard).join('');
  } else {
    html += '<div class="dp-empty">None</div>';
  }
  html += '</div>';

  // Contacted stage
  html += '<div class="intake-stage">';
  html += '<div class="intake-stage-label">Contacted</div>';
  if (contactedEnqs.length) {
    html += contactedEnqs.map(_intakeEnquiryCard).join('');
  } else {
    html += '<div class="dp-empty">None</div>';
  }
  html += '</div>';

  // Intake sent stage
  html += '<div class="intake-stage">';
  html += '<div class="intake-stage-label">Intake sent — awaiting first appointment</div>';
  if (intakeEnqs.length) {
    html += intakeEnqs.map(_intakeEnquiryCard).join('');
  } else {
    html += '<div class="dp-empty">None</div>';
  }
  html += '</div>';

  // Closed collapsible
  html += '<div class="dp-collapsible">';
  html += '<button class="dp-collapsible-toggle" onclick="toggleDpCollapsible(\'closed-enqs\')">';
  html += '<span id="closed-enqs-arrow">▸</span> Closed (' + closedEnqs.length + ')';
  html += '</button>';
  html += '<div class="dp-collapsible-body" id="closed-enqs">';
  if (closedEnqs.length) {
    html += closedEnqs.map(function(e) {
      var name = [e.first_name, e.last_name].filter(Boolean).join(' ') || '—';
      return '<div class="dp-card" style="opacity:0.65">'
        + '<div class="dp-card-name">' + escHtml(name) + '</div>'
        + '<div class="dp-card-sub">'
        + _relativeDate(e.created_at)
        + (e.notes ? ' · <span style="color:var(--mid)">' + escHtml(e.notes.slice(0, 60)) + '</span>' : '')
        + '</div>'
        + '</div>';
    }).join('');
  } else {
    html += '<div class="dp-empty">No closed enquiries</div>';
  }
  html += '</div></div>';

  // Converted collapsible
  html += '<div class="dp-collapsible">';
  html += '<button class="dp-collapsible-toggle" onclick="toggleDpCollapsible(\'converted-enqs\')">';
  html += '<span id="converted-enqs-arrow">▸</span> Converted (' + convertedEnqs.length + ')';
  html += '</button>';
  html += '<div class="dp-collapsible-body" id="converted-enqs">';
  if (convertedEnqs.length) {
    html += convertedEnqs.map(function(e) {
      var name = [e.first_name, e.last_name].filter(Boolean).join(' ') || '—';
      return '<div class="dp-card" style="opacity:0.6">'
        + '<div class="dp-card-name">' + escHtml(name) + '</div>'
        + '<div class="dp-card-sub">Converted · ' + _relativeDate(e.created_at) + '</div>'
        + '</div>';
    }).join('');
  } else {
    html += '<div class="dp-empty">None yet</div>';
  }
  html += '</div></div>';

  body.innerHTML = html;
}

function toggleDpCollapsible(id) {
  var body  = document.getElementById(id);
  var arrow = document.getElementById(id + '-arrow');
  if (!body) return;
  var open = body.classList.toggle('open');
  if (arrow) arrow.textContent = open ? '▾' : '▸';
}

/* ═══════════════════════════════════════════════════
   APPOINTMENTS PANEL
   ═══════════════════════════════════════════════════ */

var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function _fmtWeekLabel(monDate) {
  var sun = new Date(monDate);
  sun.setDate(sun.getDate() + 6);
  var mLabel = MONTH_NAMES[monDate.getMonth()];
  var sLabel = MONTH_NAMES[sun.getMonth()];
  if (mLabel === sLabel) {
    return mLabel + ' ' + monDate.getDate() + '–' + sun.getDate() + ', ' + sun.getFullYear();
  }
  return mLabel + ' ' + monDate.getDate() + ' – ' + sLabel + ' ' + sun.getDate() + ', ' + sun.getFullYear();
}

function prevWeek() {
  if (!_currentWeekStart) _currentWeekStart = _weekMonday(new Date());
  _currentWeekStart = new Date(_currentWeekStart);
  _currentWeekStart.setDate(_currentWeekStart.getDate() - 7);
  renderAppointmentsPanel();
}

function nextWeek() {
  if (!_currentWeekStart) _currentWeekStart = _weekMonday(new Date());
  _currentWeekStart = new Date(_currentWeekStart);
  _currentWeekStart.setDate(_currentWeekStart.getDate() + 7);
  renderAppointmentsPanel();
}

/** Extract patient display name from a FHIR Appointment resource */
/** Returns true if a Halaxy appointment should be treated as a clinical session.
 *  Halaxy's API does NOT return participant[] in appointment resources, so we
 *  cannot filter by patient reference. Treat everything except entered-in-error
 *  as clinical — we rely on status logic downstream to mark cancelled/noshow. */
function _isClinicalAppt(a) {
  var status = a.status || '';
  return status !== 'entered-in-error';
}

/** Extract numeric/string patient ID from a FHIR reference like
 *  "Patient/123", "https://au-api.halaxy.com/main/Patient/123", etc. */
function _patientIdFromRef(ref) {
  if (!ref) return null;
  var idx = ref.indexOf('/Patient/');
  if (idx !== -1) return ref.slice(idx + 9); // 9 = length of '/Patient/'
  // bare "Patient/123" form (shouldn't happen but keep as fallback)
  if (ref.indexOf('Patient/') === 0) return ref.slice(8);
  return null;
}

function _halaxyApptLabel(a) {
  var parts = [];

  // Patient name resolution (for clinical appointments)
  if (a.participant) {
    for (var i = 0; i < a.participant.length; i++) {
      var actor = a.participant[i].actor || {};
      var pid = _patientIdFromRef(actor.reference || '');
      if (pid) {
        var name = actor.display || '';
        if (!name) {
          // 1. patientMap built from _include=Appointment:patient (most reliable)
          var pm = _halaxyData && _halaxyData.patientMap;
          if (pm && pm[pid]) name = pm[pid];
        }
        if (!name) {
          // 2. Halaxy patients list (separate /Patient bundle fetch)
          var hp = _halaxyData && (_halaxyData.patients || []).find(function(p) { return String(p.id) === String(pid); });
          if (hp && hp.name) name = hp.name;
        }
        if (!name) {
          // 3. Local dashboard client linked by halaxy_id
          var local = _pipelineData && (_pipelineData.clients || []).find(function(c) { return String(c.halaxy_id) === String(pid); });
          if (local && local.display_name) name = local.display_name;
        }
        if (name) parts.push(name);
        break;
      }
    }
  }

  // Service type as secondary context
  var svc = (a.serviceType && a.serviceType[0] && (a.serviceType[0].text || (a.serviceType[0].coding && a.serviceType[0].coding[0] && a.serviceType[0].coding[0].display))) || '';
  if (svc) parts.push(svc);

  // For personal / admin appointments fall back to description or appointmentType
  if (!parts.length) {
    var apptType = (a.appointmentType && (a.appointmentType.text || (a.appointmentType.coding && a.appointmentType.coding[0] && a.appointmentType.coding[0].display))) || '';
    return a.description || a.comment || apptType || svc || 'Halaxy appointment';
  }

  return parts.join(' · ');
}

function toggleWeekEvent(el) {
  el.classList.toggle('is-expanded');
}

/* ── Module-scope helper: extract patient ID from a FHIR appointment ── */
function _apptPatientId(appt) {
  var pid = null;
  (appt.participant || []).forEach(function(p) {
    if (!pid && p.actor && p.actor.reference) {
      pid = _patientIdFromRef(p.actor.reference);
    }
  });
  return pid;
}

/* ── Build invoicedSet / sessionedSet used by unified sessions ── */
function _buildInvoicedSets() {
  var invoices = (_halaxyData && _halaxyData.invoices) || [];
  var invoicedSet = new Set();
  invoices.forEach(function(inv) {
    if (inv.patientId && inv.date) invoicedSet.add(String(inv.patientId) + '|' + inv.date);
  });
  var sessionedSet = new Set();
  ((_pipelineData && _pipelineData.clients) || []).forEach(function(c) {
    if (!c.halaxy_id) return;
    (c.sessions || []).forEach(function(s) {
      if (s.session_date) sessionedSet.add(String(c.halaxy_id) + '|' + s.session_date);
    });
  });
  return { invoices: invoices, invoicedSet: invoicedSet, sessionedSet: sessionedSet };
}

/**
 * Build the unified sessions array for the appointments panel.
 * Returns an array of session objects sorted: upcoming ascending, past descending.
 * Each entry: { id, source, status, dateMs, startMs, dateStr, timeStr, name, uid, appt, ev, patientId, halaxyApptId, recordedEntry }
 */
function _buildUnifiedSessions() {
  var now     = new Date();
  var today   = new Date(now); today.setHours(0, 0, 0, 0);
  var past30  = new Date(today); past30.setDate(past30.getDate() - 30);
  var future14 = new Date(today); future14.setDate(future14.getDate() + 14);

  var sets = _buildInvoicedSets();
  var invoices    = sets.invoices;
  var invoicedSet = sets.invoicedSet;
  var sessionedSet = sets.sessionedSet;

  // Date-only invoice lookup — Halaxy omits participant[] from appointment API responses,
  // so we can't match by patientId|date directly. Build a date → [invoice] map as fallback.
  var dateInvoiceMap = {};
  invoices.forEach(function(inv) {
    if (inv.date) {
      if (!dateInvoiceMap[inv.date]) dateInvoiceMap[inv.date] = [];
      dateInvoiceMap[inv.date].push(inv);
    }
  });

  var halaxyAppts = (_halaxyData && _halaxyData.appointments) || [];
  var sessions = [];

  // Track Halaxy appt keys represented so cal events don't duplicate them
  // Key: patientId|YYYY-MM-DD  — but for cal events no patientId, so we track by date string only
  var halaxyKeySet = new Set(); // patientId|date → true

  /* ── 1. Halaxy appointments ── */
  halaxyAppts.forEach(function(appt) {
    var startStr = appt.start || (appt.period && appt.period.start);
    if (!startStr) return;
    if (!_isClinicalAppt(appt)) return;

    var startMs = new Date(startStr).getTime();
    var dateStr = startStr.slice(0, 10);
    var dateD   = new Date(dateStr + 'T00:00:00');
    if (dateD < past30 || dateD > future14) return;

    var patientId = _apptPatientId(appt);
    // Halaxy API often omits participant[], so patientId may be null.
    // Infer patient from a same-date invoice when there's exactly one (covers solo-practitioner days).
    var effectivePatientId = patientId;
    if (!effectivePatientId) {
      var dayInvs = dateInvoiceMap[dateStr];
      if (dayInvs && dayInvs.length === 1) effectivePatientId = dayInvs[0].patientId;
    }

    var key = effectivePatientId ? (String(effectivePatientId) + '|' + dateStr) : null;
    if (key) halaxyKeySet.add(key);

    // Build label — try participant resolution first, then fall back to effectivePatientId lookup
    var label = _halaxyApptLabel(appt);
    if ((label === 'Halaxy appointment' || !label) && effectivePatientId) {
      var pm2 = _halaxyData && _halaxyData.patientMap;
      var infName = (pm2 && pm2[effectivePatientId]) || '';
      if (!infName) {
        var pt2 = (_halaxyData.patients || []).find(function(p) { return String(p.id) === String(effectivePatientId); });
        if (pt2 && pt2.name) infName = pt2.name;
      }
      if (!infName) {
        var lc2 = _pipelineData && (_pipelineData.clients || []).find(function(c) { return String(c.halaxy_id) === String(effectivePatientId); });
        if (lc2 && lc2.display_name) infName = lc2.display_name;
      }
      if (infName) label = infName;
    }

    // Status determination (priority order)
    var status;
    var apptStatus = appt.status || '';

    if (apptStatus === 'cancelled' || apptStatus === 'entered-in-error' || apptStatus === 'noshow') {
      status = 'cancelled';
    } else if (startMs > now.getTime()) {
      status = 'upcoming';
    } else if (key && (_halaxyActioned.has(key) || _recordedSessions.some(function(s) { return String(s.patientId) === String(effectivePatientId) && s.date === dateStr; }))) {
      status = 'pending-invoice';
    } else if (key && invoicedSet.has(key)) {
      var matchInv = invoices.find(function(inv) { return String(inv.patientId) === String(effectivePatientId) && inv.date === dateStr; });
      status = (matchInv && _invIsPaid(matchInv)) ? 'paid' : 'invoiced';
    } else if (apptStatus === 'fulfilled') {
      status = key && invoicedSet.has(key) ? 'invoiced' : 'pending-invoice';
    } else if (!key && dateInvoiceMap[dateStr]) {
      // No patientId resolvable but an invoice exists for this date — session was actioned
      var anyInv = dateInvoiceMap[dateStr][0];
      status = _invIsPaid(anyInv) ? 'paid' : 'invoiced';
    } else if (key && sessionedSet.has(key)) {
      status = 'invoiced';
    } else if (startMs < now.getTime()) {
      // Past appointment — check dateInvoiceMap as a final fallback before assuming no billing.
      // This catches invoices that Halaxy returned without a resolvable patientId (so they
      // never made it into invoicedSet, but we know billing happened on this date).
      if (dateInvoiceMap[dateStr] && dateInvoiceMap[dateStr].length) {
        var fallbackInv = dateInvoiceMap[dateStr][0];
        status = _invIsPaid(fallbackInv) ? 'paid' : 'invoiced';
      } else {
        status = 'pending-invoice';
      }
    } else {
      status = 'needs-recording';
    }

    var timeStr = new Date(startStr).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    var dateLabel = new Date(startStr).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    var uid = 'hx-log-' + (effectivePatientId || appt.id || 'unk') + '-' + dateStr.replace(/-/g, '');

    sessions.push({
      id:           uid,
      source:       'halaxy',
      status:       status,
      dateMs:       dateD.getTime(),
      startMs:      startMs,
      dateStr:      dateStr,
      dateLabel:    dateLabel,
      timeStr:      timeStr,
      name:         label,
      patientId:    effectivePatientId ? String(effectivePatientId) : null,
      halaxyApptId: appt.id || '',
      startIso:     startStr,
      appt:         appt,
    });
  });

  /* ── 1b. Deduplicate same-time Halaxy entries ──
   * Halaxy can return multiple records for the same slot (practitioner + room resource).
   * Keep the named entry; if all unnamed, keep one. */
  var apptByStartIso = {};
  sessions.forEach(function(s) {
    var key = s.startIso;
    var existing = apptByStartIso[key];
    if (!existing) {
      apptByStartIso[key] = s;
    } else {
      var existingNamed = existing.name && existing.name !== 'Halaxy appointment';
      var thisNamed = s.name && s.name !== 'Halaxy appointment';
      if (thisNamed && !existingNamed) apptByStartIso[key] = s;
    }
  });
  sessions = sessions.filter(function(s) { return apptByStartIso[s.startIso] === s; });

  /* ── 2. Google Calendar events ── */
  Object.keys(_calEventMap).forEach(function(eid) {
    if (_calDismissed.has(eid)) return;
    var ev = _calEventMap[eid];
    if (!ev || !ev.start) return;

    var startMs = new Date(ev.start).getTime();
    var dateStr = ev.start.slice(0, 10);
    var dateD   = new Date(dateStr + 'T00:00:00');
    if (dateD < past30 || dateD > future14) return;

    // Determine status
    var status;
    if (startMs > now.getTime()) {
      status = 'upcoming';
    } else if (_recordedSessions.some(function(s) { return s.date === dateStr && s.calOnly; })) {
      status = 'pending-invoice';
    } else {
      status = 'needs-recording';
    }

    var timeStr = ev.allDay ? 'All day' : new Date(ev.start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    var dateLabel = new Date(ev.start).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    var uid = 'cal-log-' + String(eid);

    sessions.push({
      id:        uid,
      source:    'cal',
      status:    status,
      dateMs:    dateD.getTime(),
      startMs:   startMs,
      dateStr:   dateStr,
      dateLabel: dateLabel,
      timeStr:   timeStr,
      name:      ev.title || ev.summary || 'Calendar event',
      patientId: null,
      eventId:   String(eid),
      ev:        ev,
    });
  });

  /* ── 3. _recordedSessions with no matching Halaxy/Cal entry ── */
  _recordedSessions.forEach(function(s) {
    if (!s.date) return;
    var dateD = new Date(s.date + 'T00:00:00');
    if (dateD < past30 || dateD > future14) return;
    // Already represented by a Halaxy appt?
    var key = s.patientId ? (String(s.patientId) + '|' + s.date) : null;
    if (key && halaxyKeySet.has(key)) return;
    // Already represented by a cal event on this date (calOnly)?
    var dateLabel = new Date(s.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    var name = (s.patientId && _halaxyData && _halaxyData.patientMap && _halaxyData.patientMap[s.patientId])
      || (s.patientId ? ('Client #' + s.patientId) : 'Unknown client');
    var uid = 'rec-' + (s.patientId || 'unk') + '-' + s.date.replace(/-/g, '');

    sessions.push({
      id:             uid,
      source:         s.calOnly ? 'cal' : 'halaxy',
      status:         'pending-invoice',
      dateMs:         dateD.getTime(),
      startMs:        dateD.getTime(),
      dateStr:        s.date,
      dateLabel:      dateLabel,
      timeStr:        '',
      name:           name,
      patientId:      s.patientId ? String(s.patientId) : null,
      halaxyApptId:   s.halaxyApptId || '',
      recordedEntry:  s,
    });
  });

  /* ── Sort: upcoming ascending (soonest first), past descending (most recent first) ── */
  var upcoming = sessions.filter(function(s) { return s.startMs > now.getTime(); });
  var past     = sessions.filter(function(s) { return s.startMs <= now.getTime(); });

  upcoming.sort(function(a, b) { return a.startMs - b.startMs; });
  past.sort(function(a, b)     { return b.startMs - a.startMs; });

  return { upcoming: upcoming, past: past };
}

/* ── Set session view mode and re-render ── */
function _setSessionView(mode) {
  _sessionViewMode = mode;
  localStorage.setItem('session_view_mode', mode);
  renderAppointmentsPanel();
}

/* ── Set session filter and re-render ── */
function _setSessionFilter(filter) {
  _sessionFilter = filter;
  renderAppointmentsPanel();
}

function renderAppointmentsPanel() {
  var body = document.getElementById('appointments-panel-body');
  if (!body) return;
  if (!_currentWeekStart) _currentWeekStart = _weekMonday(new Date());

  var now   = new Date();
  var today = new Date(now); today.setHours(0, 0, 0, 0);

  var halaxyAppts = (_halaxyData && _halaxyData.appointments) || [];

  /* ── Build unified session list ── */
  var unified = _buildUnifiedSessions();
  var upcomingSessions = unified.upcoming;
  var pastSessions     = unified.past;

  /* ── Status badge HTML helper ── */
  function _statusBadge(status) {
    var map = {
      'upcoming':         '<span class="dp-badge dp-badge--upcoming">Upcoming</span>',
      'needs-recording':  '<span class="dp-badge dp-badge--needs-recording">Needs recording</span>',
      'pending-invoice':  '<span class="dp-badge dp-badge--pending-inv">Pending invoice</span>',
      'invoiced':         '<span class="dp-badge dp-badge--status-invoiced">Invoiced</span>',
      'paid':             '<span class="dp-badge dp-badge--status-paid">Paid ✓</span>',
      'cancelled':        '<span class="dp-badge dp-badge--source">Cancelled</span>',
    };
    return map[status] || '';
  }

  /* ── Source badge HTML helper ── */
  function _sourceBadge(source) {
    if (source === 'halaxy') return '<span class="dp-badge dp-badge--halaxy">Halaxy</span>';
    if (source === 'cal')    return '<span class="dp-badge dp-badge--cal">Calendar</span>';
    return '';
  }

  /* ── Action button for list-view row ── */
  function _actionBtn(sess) {
    var status = sess.status;
    var uid    = sess.id;
    if (status === 'needs-recording') {
      if (sess.source === 'halaxy' && sess.patientId) {
        var hxName = (_halaxyData && _halaxyData.patientMap && _halaxyData.patientMap[sess.patientId]) || sess.name;
        var apptStartIso = sess.startIso || (sess.dateStr + 'T09:00:00');
        return '<button class="dp-btn dp-btn--primary" style="font-size:10px;padding:4px 9px" onclick="openHalaxyApptLogPanel(\'' + uid + '\',\'' + escHtml(sess.patientId) + '\',\'' + escHtml(hxName) + '\',\'' + sess.dateStr + '\',\'' + escHtml(apptStartIso) + '\',\'' + escHtml(sess.halaxyApptId || '') + '\')">Record →</button>';
      }
      if (sess.source === 'cal' && sess.eventId) {
        return '<button class="dp-btn dp-btn--primary" style="font-size:10px;padding:4px 9px" onclick="openCalSessionPanel(\'' + uid + '\',\'' + escHtml(sess.eventId) + '\')">Link &amp; Record →</button>';
      }
    }
    if (status === 'pending-invoice') {
      var calUrl = _halaxyWebUrl ? (_halaxyWebUrl + '/calendar?date=' + sess.dateStr) : 'https://www.halaxy.com/practitioner';
      return '<a class="dp-btn dp-btn--ghost" style="font-size:10px;padding:4px 9px" href="' + escHtml(calUrl) + '" target="_blank" rel="noopener">Open in Halaxy →</a>';
    }
    if (status === 'invoiced') {
      var invUrl = _halaxyWebUrl ? (_halaxyWebUrl + '/calendar?date=' + sess.dateStr) : 'https://www.halaxy.com/practitioner';
      return '<a class="dp-btn dp-btn--ghost" style="font-size:10px;padding:4px 9px" href="' + escHtml(invUrl) + '" target="_blank" rel="noopener">View in Halaxy →</a>';
    }
    return '';
  }

  /* ── Render a single list-view row ── */
  function _sessionRow(sess) {
    var filterMatch = (_sessionFilter === 'all' || _sessionFilter === sess.status);
    var hiddenClass = filterMatch ? '' : ' session-row--hidden';
    var timeDisplay = sess.timeStr ? (sess.dateLabel + ' · ' + sess.timeStr) : sess.dateLabel;
    var actionHtml  = _actionBtn(sess);
    var linkPanelId = 'pl-link-' + sess.id;

    return '<div class="session-row session-row--' + sess.status + hiddenClass + '">'
      + '<div class="session-row-date">' + escHtml(timeDisplay) + '</div>'
      + '<div class="session-row-name">' + escHtml(sess.name) + '</div>'
      + '<div class="session-row-badges">'
      + _sourceBadge(sess.source)
      + _statusBadge(sess.status)
      + '</div>'
      + (actionHtml ? '<div class="session-row-action">' + actionHtml + '</div>' : '')
      + '</div>'
      + '<div id="' + linkPanelId + '"></div>';
  }

  /* ── Render a single card (card-view mode, reuses existing card styles) ── */
  function _sessionCard(sess) {
    var filterMatch = (_sessionFilter === 'all' || _sessionFilter === sess.status);
    if (!filterMatch) return '';
    var status = sess.status;

    if (status === 'needs-recording') {
      if (sess.source === 'cal' && sess.eventId) {
        var uid = sess.id;
        var eid = sess.eventId;
        return '<div class="log-card">'
          + '<div class="log-card-info">'
          + '<div class="log-card-title">' + escHtml(sess.name) + '</div>'
          + '<div class="log-card-date">' + escHtml(sess.dateLabel) + ' · Calendar</div>'
          + '</div>'
          + '<button class="dp-btn dp-btn--primary" onclick="openCalSessionPanel(\'' + uid + '\',\'' + eid + '\')">Link &amp; Record →</button>'
          + '<div id="pl-link-' + uid + '"></div>'
          + '</div>';
      }
      if (sess.source === 'halaxy' && sess.patientId) {
        var uid2 = sess.id;
        var hxName2 = (_halaxyData && _halaxyData.patientMap && _halaxyData.patientMap[sess.patientId]) || sess.name;
        var apptStartIso2 = sess.startIso || (sess.dateStr + 'T09:00:00');
        return '<div class="log-card">'
          + '<div class="log-card-info">'
          + '<div class="log-card-title">' + escHtml(sess.name) + '</div>'
          + '<div class="log-card-date">' + escHtml(sess.dateLabel) + ' · Halaxy</div>'
          + '</div>'
          + '<button class="dp-btn dp-btn--primary" onclick="openHalaxyApptLogPanel(\'' + uid2 + '\',\'' + escHtml(sess.patientId) + '\',\'' + escHtml(hxName2) + '\',\'' + sess.dateStr + '\',\'' + escHtml(apptStartIso2) + '\',\'' + escHtml(sess.halaxyApptId || '') + '\')">Record →</button>'
          + '<div id="pl-link-' + uid2 + '"></div>'
          + '</div>';
      }
    }

    // Generic card for upcoming / invoiced / paid / pending-invoice
    var timeDisplay2 = sess.timeStr ? (sess.dateLabel + ' · ' + sess.timeStr) : sess.dateLabel;
    var actionHtml2 = _actionBtn(sess);
    var borderColor = {
      'upcoming':        '#4a90d9',
      'needs-recording': '#e07b39',
      'pending-invoice': '#6c5ce7',
      'invoiced':        '#27ae60',
      'paid':            '#aaa',
      'cancelled':       '#ccc',
    }[status] || '#ccc';

    return '<div class="appt-7day-card" style="border-left-color:' + borderColor + (status === 'cancelled' ? ';opacity:0.45' : '') + '">'
      + '<div class="appt-7day-left">'
      + '<div class="appt-7day-when">' + escHtml(timeDisplay2) + '</div>'
      + '<div class="appt-7day-title">' + escHtml(sess.name) + '</div>'
      + '</div>'
      + '<div class="appt-7day-right">'
      + _sourceBadge(sess.source)
      + _statusBadge(status)
      + (actionHtml2 ? '<div style="margin-top:4px">' + actionHtml2 + '</div>' : '')
      + '</div>'
      + '</div>';
  }

  /* ── Filter pills ── */
  var filterCounts = { all: upcomingSessions.length + pastSessions.length };
  upcomingSessions.concat(pastSessions).forEach(function(s) {
    filterCounts[s.status] = (filterCounts[s.status] || 0) + 1;
  });
  var filters = [
    { key: 'all',             label: 'All' },
    { key: 'upcoming',        label: 'Upcoming' },
    { key: 'needs-recording', label: 'Needs recording' },
    { key: 'pending-invoice', label: 'Pending invoice' },
    { key: 'invoiced',        label: 'Invoiced' },
    { key: 'paid',            label: 'Paid' },
  ];
  var filterBarHtml = '<div class="session-filter-bar">';
  filters.forEach(function(f) {
    var cnt = filterCounts[f.key] || 0;
    if (f.key !== 'all' && !cnt) return; // hide empty filters except All
    var isActive = _sessionFilter === f.key;
    filterBarHtml += '<button class="session-filter-pill' + (isActive ? ' active' : '') + '" onclick="_setSessionFilter(\'' + f.key + '\')">'
      + escHtml(f.label) + (cnt && f.key !== 'all' ? ' (' + cnt + ')' : '')
      + '</button>';
  });
  filterBarHtml += '</div>';

  /* ── View toggle ── */
  var viewToggleHtml = '<div class="session-view-toggle">'
    + '<button class="session-view-btn' + (_sessionViewMode === 'list' ? ' active' : '') + '" title="List view" onclick="_setSessionView(\'list\')">☰</button>'
    + '<button class="session-view-btn' + (_sessionViewMode === 'card' ? ' active' : '') + '" title="Card view" onclick="_setSessionView(\'card\')">⊞</button>'
    + '</div>';

  var html = '';

  /* ── Header row: + New Session + view toggle ── */
  html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:2px">'
    + '<button class="dp-btn dp-btn--soft" style="font-size:12px;padding:4px 10px" onclick="openNewSessionModal()">+ New Appointment</button>'
    + viewToggleHtml
    + '</div>';

  html += filterBarHtml;

  /* ── Session list/cards ── */
  if (!upcomingSessions.length && !pastSessions.length) {
    html += '<div class="dp-empty">No sessions in the past 30 or next 14 days</div>';
  } else if (_sessionViewMode === 'list') {
    html += '<div class="session-list">';

    if (upcomingSessions.length) {
      upcomingSessions.forEach(function(sess) { html += _sessionRow(sess); });
    }

    if (pastSessions.length) {
      if (upcomingSessions.length) {
        html += '<div class="session-divider">Past sessions</div>';
      }
      pastSessions.forEach(function(sess) { html += _sessionRow(sess); });
    }

    html += '</div>';
  } else {
    // Card view
    if (upcomingSessions.length) {
      html += '<div class="appt-section-label" style="margin-top:4px">Upcoming</div>';
      upcomingSessions.forEach(function(sess) { html += _sessionCard(sess); });
    }
    if (pastSessions.length) {
      html += '<div class="appt-section-label" style="margin-top:12px">Past sessions</div>';
      pastSessions.forEach(function(sess) { html += _sessionCard(sess); });
    }
  }

  /* ══════════════════════════════════════════════════
     WEEK CALENDAR (collapsible, collapsed by default)
     ══════════════════════════════════════════════════ */
  html += '<button class="appt-section-toggle" onclick="toggleDpCollapsible(\'week-cal-body\')" style="margin-top:16px">'
    + '<span id="week-cal-body-arrow">▸</span> Week calendar'
    + '</button>';
  html += '<div class="dp-collapsible-body" id="week-cal-body">';

  var days = [];
  for (var di = 0; di < 5; di++) {
    var d = new Date(_currentWeekStart);
    d.setDate(d.getDate() + di);
    days.push(d);
  }

  var eventsByDay = [[], [], [], [], []];
  Object.keys(_calEventMap).forEach(function(eid) {
    if (_calDismissed.has(eid)) return;
    var ev = _calEventMap[eid];
    if (!ev || !ev.start) return;
    var evDate = new Date(ev.start); evDate.setHours(0, 0, 0, 0);
    for (var di2 = 0; di2 < 5; di2++) {
      if (evDate.getTime() === days[di2].getTime()) { eventsByDay[di2].push({ type: 'cal', ev: ev }); break; }
    }
  });
  halaxyAppts.forEach(function(a) {
    var startStr = a.start || (a.period && a.period.start);
    if (!startStr) return;
    var apptDate = new Date(startStr); apptDate.setHours(0, 0, 0, 0);
    for (var di3 = 0; di3 < 5; di3++) {
      if (apptDate.getTime() === days[di3].getTime()) { eventsByDay[di3].push({ type: 'halaxy', ev: a, start: startStr }); break; }
    }
  });

  html += '<div class="week-nav">'
    + '<button class="week-nav-btn" onclick="prevWeek()">←</button>'
    + '<span class="week-nav-label">' + _fmtWeekLabel(_currentWeekStart) + '</span>'
    + '<button class="week-nav-btn" onclick="nextWeek()">→</button>'
    + '</div>';

  html += '<div class="week-cols">';
  days.forEach(function(day, di) {
    var isToday = day.getTime() === today.getTime();
    var dayEvents = eventsByDay[di] || [];
    html += '<div class="week-day' + (isToday ? ' week-day--today' : '') + '">';
    html += '<div class="week-day-hd"><span class="week-day-name">' + DAY_NAMES[day.getDay()] + '</span><span class="week-day-num">' + day.getDate() + '</span></div>';

    if (!dayEvents.length) {
      html += '<div style="font-size:9px;color:rgba(122,148,143,0.3);text-align:center;padding:8px 0">—</div>';
    } else {
      dayEvents.sort(function(a, b) {
        var ta = a.type === 'cal' ? new Date(a.ev.start) : new Date(a.start);
        var tb = b.type === 'cal' ? new Date(b.ev.start) : new Date(b.start);
        return ta - tb;
      });
      dayEvents.forEach(function(item) {
        if (item.type === 'cal') {
          var ev = item.ev;
          var eid = String(ev.id);
          var uid = 'cal-wk-' + eid;
          var time = ev.allDay ? 'All day' : new Date(ev.start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
          var title = ev.title || ev.summary || 'Event';
          html += '<div class="week-event" onclick="toggleWeekEvent(this)">'
            + '<div class="week-event-time">' + escHtml(time) + '</div>'
            + '<span class="week-event-source">Calendar</span>'
            + '<div class="week-event-title">' + escHtml(title) + '</div>'
            + '<div class="week-event-actions">'
            + '<button class="week-event-btn" onclick="event.stopPropagation();openCalSessionPanel(\'' + uid + '\',\'' + eid + '\')">Create Invoice →</button>'
            + '<button class="week-event-dismiss" onclick="event.stopPropagation();dismissCalEvent(\'' + eid + '\')">Dismiss</button>'
            + '</div>'
            + '<div id="pl-link-' + uid + '"></div>'
            + '</div>';
        } else {
          var appt = item.ev;
          var time2 = new Date(item.start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
          var label = _halaxyApptLabel(appt);
          var apptStatus = appt.status || '';
          var isClinical = _isClinicalAppt(appt);
          var apptClass = 'week-event week-event--halaxy' + (isClinical ? '' : ' week-event--personal');
          html += '<div class="' + apptClass + '" onclick="toggleWeekEvent(this)">'
            + '<div class="week-event-time">' + escHtml(time2) + '</div>'
            + '<span class="week-event-source">' + (isClinical ? 'Halaxy' : 'Personal') + '</span>'
            + '<div class="week-event-title">' + escHtml(label) + '</div>'
            + (apptStatus ? '<div class="week-event-sub">' + escHtml(apptStatus) + '</div>' : '')
            + '</div>';
        }
      });
    }
    html += '</div>';
  });
  html += '</div>'; // .week-cols
  html += '</div>'; // #week-cal-body

  body.innerHTML = html;
}

/* ═══════════════════════════════════════════════════
   BILLING PANEL
   ═══════════════════════════════════════════════════ */

/**
 * Determine if a Halaxy invoice is fully paid.
 * Halaxy keeps status="active" on all invoices — the real indicator is
 * totalBalance: 0 = paid, >0 = still owing. Falls back to status field.
 */
function _invIsPaid(inv) {
  if (inv.totalBalance !== null && inv.totalBalance !== undefined) return inv.totalBalance === 0;
  return inv.status === 'balanced' || inv.status === 'paid';
}

/**
 * Returns the number of days after an appointment before an unpaid invoice
 * is considered overdue, based on the client's funder type.
 *
 * - Medicare / private / NDIS self: 1 day  (payment should be immediate)
 * - NDIS plan / DVA:               7 days  (plan manager / DVA processing)
 * - QFES EAP:                     21 days  (2-week batch cycle + 7 days for payment)
 */
function _overdueThresholdDays(patientId) {
  var clients = (_pipelineData && _pipelineData.clients) || [];
  var client  = patientId
    ? clients.find(function(c) { return String(c.halaxy_id) === String(patientId); })
    : null;
  var funder  = client ? (client.funder || 'private') : 'private';
  if (funder === 'ndis_plan' || funder === 'dva') return 7;
  if (funder === 'qfes')                          return 21;
  return 1; // medicare, private, workcover
}

function _billingActionBtn(client, session) {
  var funder = client.funder;
  if (funder === 'ndis_plan') {
    var pm = escHtml(client.plan_manager || 'Plan manager');
    return '<button class="dp-btn dp-btn--primary" onclick="advanceSessionPl(\'' + session.id + '\',\'invoiced\',\'' + client.id + '\')">Lodge with ' + pm + ' →</button>';
  }
  if (funder === 'qfes') {
    return '<button class="dp-btn dp-btn--primary" onclick="advanceSessionPl(\'' + session.id + '\',\'invoiced\',\'' + client.id + '\')">Lodge QFES claim →</button>';
  }
  if (funder === 'dva') {
    return '<button class="dp-btn dp-btn--primary" onclick="advanceSessionPl(\'' + session.id + '\',\'invoiced\',\'' + client.id + '\')">Lodge DVA claim →</button>';
  }
  // medicare, private, workcover → Halaxy
  var halaxyCalUrl = _halaxyWebUrl ? (_halaxyWebUrl + '/calendar?date=' + session.session_date) : 'https://www.halaxy.com/practitioner';
  return '<a class="dp-btn dp-btn--primary" href="' + escHtml(halaxyCalUrl) + '" target="_blank" rel="noopener" onclick="advanceSessionPl(\'' + session.id + '\',\'invoiced\',\'' + client.id + '\')">Process in Halaxy →</a>';
}

function dismissPendingSession(idx) {
  var s = _recordedSessions[idx];
  if (s) {
    // Also restore the appointment to "Needs Recording" by clearing the actioned flag
    var key = String(s.patientId) + '|' + String(s.date);
    _halaxyActioned.delete(key);
    localStorage.setItem('halaxy_actioned', JSON.stringify([..._halaxyActioned]));
  }
  _recordedSessions.splice(idx, 1);
  localStorage.setItem('halaxy_recorded_sessions', JSON.stringify(_recordedSessions));
  renderBillingPanel();
  refreshPipeline();
}

function renderBillingPanel() {
  var body = document.getElementById('billing-panel-body');
  if (!body) return;

  var halaxyInvoices = (_halaxyData && _halaxyData.invoices) || [];
  var patientMapBP   = (_halaxyData && _halaxyData.patientMap) || {};
  var patientsBP     = (_halaxyData && _halaxyData.patients)   || [];
  var clients        = (_pipelineData && _pipelineData.clients) || [];

  /* Resolve a display name for a Halaxy patient ID */
  function resolveName(patientId) {
    if (!patientId) return 'Unknown';
    if (patientMapBP[patientId]) return patientMapBP[patientId];
    var p = patientsBP.find(function(pt) { return String(pt.id) === String(patientId); });
    if (p) return p.name;
    var c = clients.find(function(cl) { return String(cl.halaxy_id) === String(patientId); });
    if (c) return c.display_name;
    return 'Client #' + patientId;
  }

  var html = '';

  /* ══════════════════════════════════════════════════════════════════════
     PRIMARY VIEW — Halaxy invoices (source of truth for all billing).
     Halaxy holds PII and clinical records; the dashboard reads from it.
     ══════════════════════════════════════════════════════════════════════ */
  if (_halaxyData && _halaxyData.connected) {
    var outstanding = halaxyInvoices.filter(function(inv) {
      return !_invIsPaid(inv) && inv.status !== 'cancelled' && inv.status !== 'draft';
    });
    var balanced = halaxyInvoices.filter(function(inv) { return _invIsPaid(inv); });

    // Oldest outstanding first (most overdue at top), newest paid first
    outstanding.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    balanced.sort(function(a, b)    { return (b.date || '').localeCompare(a.date || ''); });

    // Clean up recorded sessions: remove ones older than 90 days or that now have a Halaxy invoice
    var ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    var prevCount = _recordedSessions.length;
    _recordedSessions = _recordedSessions.filter(function(s) {
      if (s.recordedAt < ninetyDaysAgo) return false;
      // Halaxy now has an invoice for this patient+date — no longer pending
      if (halaxyInvoices.some(function(inv) { return String(inv.patientId) === String(s.patientId) && inv.date === s.date; })) return false;
      return true;
    });
    if (_recordedSessions.length !== prevCount) {
      localStorage.setItem('halaxy_recorded_sessions', JSON.stringify(_recordedSessions));
    }

    var totalOwing = outstanding.reduce(function(sum, inv) { return sum + (parseFloat(inv.totalBalance != null ? inv.totalBalance : inv.amount) || 0); }, 0);

    var countEl = document.getElementById('billing-count');
    if (countEl) countEl.textContent = outstanding.length || '';

    html += '<div class="billing-open-header">'
      + '<span class="billing-open-label">Outstanding</span>'
      + (outstanding.length ? '<span class="billing-open-count">' + outstanding.length + ' invoice' + (outstanding.length !== 1 ? 's' : '') + '</span>' : '')
      + (totalOwing ? '<span class="billing-open-total">$' + totalOwing.toFixed(2) + '</span>' : '')
      + '</div>';

    if (!outstanding.length) {
      html += '<div class="dp-empty">No outstanding invoices ✓</div>';
    } else {
      outstanding.forEach(function(inv) {
        var name = resolveName(inv.patientId);
        var dt   = inv.date ? new Date(inv.date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
        var _invAmt = inv.totalBalance != null ? inv.totalBalance : inv.amount;
        var amt  = _invAmt ? '$' + Number(_invAmt).toFixed(2) : '';
        // Payor label — show org name for org-funded invoices (QFES, WorkCover, etc.)
        var payorLabel = _resolvePayorLabel(inv.payorOrg);
        var sub  = _getSubStatus(inv.id);
        var subBadge = '', subAction = '';
        if (sub) {
          var badgeClass = sub.chase ? 'chase' : 'submitted';
          var badgeLabel = sub.chase ? '⚠ Chase up — submitted ' + sub.daysAgo + 'd ago' : '✓ Submitted ' + sub.date;
          subBadge = '<span class="bill-sub-badge ' + badgeClass + '">' + escHtml(badgeLabel) + '</span>';
          subAction = '<button style="font-size:10px;padding:2px 8px;border:1px solid rgba(0,0,0,0.12);border-radius:5px;background:transparent;color:var(--soft);cursor:pointer;margin-left:6px" onclick="event.stopPropagation();_clearBillingSubmission(\'' + escHtml(inv.id) + '\')">Clear</button>';
        } else {
          subAction = '<button style="font-size:10px;padding:2px 8px;border:1px solid rgba(42,88,80,0.25);border-radius:5px;background:transparent;color:var(--teal);cursor:pointer;margin-left:6px" onclick="event.stopPropagation();_markBillingSubmitted(\'' + escHtml(inv.id) + '\')">Mark submitted</button>';
        }
        html += '<div class="bill-card bill-card--open">'
          + '<div class="bill-card-top">'
          + '<span class="bill-card-name">' + escHtml(name) + '</span>'
          + (amt ? '<span class="bill-card-amount">' + escHtml(amt) + '</span>' : '')
          + '</div>'
          + '<div class="bill-card-meta">'
          + '<span class="bill-card-date">' + escHtml(dt) + '</span>'
          + (payorLabel
              ? '<span class="dp-badge dp-badge--status-invoiced" style="background:rgba(154,110,180,0.1);color:#7A50A0">' + escHtml(payorLabel) + '</span>'
              : '<span class="dp-badge dp-badge--status-invoiced">Awaiting payment</span>')
          + subBadge
          + '</div>'
          + '<div class="dp-card-actions" style="display:flex;align-items:center;gap:6px">'
          + '<a class="dp-btn dp-btn--ghost" href="' + escHtml(_halaxyWebUrl ? (_halaxyWebUrl + '/calendar?date=' + inv.date) : 'https://www.halaxy.com/practitioner') + '" target="_blank" rel="noopener">View in Halaxy →</a>'
          + subAction
          + '</div>'
          + '</div>';
      });
    }

    html += '<div class="dp-collapsible">'
      + '<button class="dp-collapsible-toggle" onclick="toggleDpCollapsible(\'paid-sessions\')">'
      + '<span id="paid-sessions-arrow">▸</span> Paid (' + balanced.length + ')'
      + '</button>'
      + '<div class="dp-collapsible-body" id="paid-sessions">';

    if (!balanced.length) {
      html += '<div class="dp-empty">No paid invoices yet</div>';
    } else {
      balanced.forEach(function(inv) {
        var name = resolveName(inv.patientId);
        var dt   = inv.date ? new Date(inv.date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—';
        var amt  = inv.amount ? '$' + Number(inv.amount).toFixed(2) : '';
        html += '<div class="bill-card" style="opacity:0.7">'
          + '<div class="bill-card-top">'
          + '<span class="bill-card-name">' + escHtml(name) + '</span>'
          + (amt ? '<span class="bill-card-amount">' + escHtml(amt) + '</span>' : '')
          + '</div>'
          + '<div class="bill-card-meta">'
          + '<span class="bill-card-date">' + escHtml(dt) + '</span>'
          + '<span class="dp-badge dp-badge--status-paid">Paid ✓</span>'
          + '</div>'
          + '</div>';
      });
    }

    html += '</div></div>';
    body.innerHTML = html;
    return;
  }

  /* ── Halaxy configured but temporarily unavailable ── */
  if (_halaxyData && _halaxyData.configured) {
    var countElOff = document.getElementById('billing-count');
    if (countElOff) countElOff.textContent = '';
    body.innerHTML = '<div class="dp-offline-state">'
      + '<div class="dp-offline-icon">⚡</div>'
      + '<div class="dp-offline-title">Halaxy unavailable</div>'
      + '<div class="dp-offline-msg">Billing data is managed in Halaxy. Check your connection or API credentials, then refresh.</div>'
      + ((_halaxyData.error) ? '<div class="dp-offline-error">' + escHtml(_halaxyData.error) + '</div>' : '')
      + '<button class="dp-btn dp-btn--ghost" onclick="refreshPipeline()" style="margin-top:12px">↺ Try again</button>'
      + '</div>';
    return;
  }

  // Halaxy is always required for billing — no fallback to local data.
  body.innerHTML = '<div class="dp-offline-state">'
    + '<div class="dp-offline-icon">⚡</div>'
    + '<div class="dp-offline-title">Halaxy not configured</div>'
    + '<div class="dp-offline-msg">Add HALAXY_CLIENT_ID and HALAXY_CLIENT_SECRET in Vercel environment variables to enable billing.</div>'
    + '</div>';
}

/* ── Helpers ── */
function plFmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/* ── Enquiry pipeline card ── */
function renderEnquiryCardPl(e) {
  var status  = e.status || 'new';
  var isNew   = status === 'new';
  var name    = [e.first_name, e.last_name].filter(Boolean).join(' ') || '—';
  var detail  = [e.service, e.reason].filter(Boolean).join(' · ') || e.source || '';
  var advance = ENQ_ADVANCE[status];
  var uid     = 'eq-' + e.id;

  var badgesArr = [];
  if (isNew)    badgesArr.push('<span class="pl-badge pl-badge--new">New</span>');
  if (e.source) badgesArr.push('<span class="pl-badge pl-badge--source">' + escHtml(e.source) + '</span>');
  var badges = badgesArr.length ? '<div class="pl-card-badges">' + badgesArr.join('') + '</div>' : '';

  // Contact + message
  var contactHtml = '';
  if (e.email) {
    contactHtml += '<div class="pl-detail-row">'
      + '<a href="mailto:' + escHtml(e.email) + '" onclick="event.stopPropagation()" style="color:var(--teal);text-decoration:none">' + escHtml(e.email) + '</a>'
      + (e.phone ? ' &middot; <span style="color:var(--soft)">' + escHtml(e.phone) + '</span>' : '')
      + '</div>';
  }
  if (e.message) {
    contactHtml += '<div class="pl-detail-row" style="margin-top:6px;padding:6px 10px;background:rgba(42,88,80,0.04);border-left:2px solid rgba(42,88,80,0.15);border-radius:0 5px 5px 0;font-style:italic;color:var(--mid)">'
      + escHtml(e.message) + '</div>';
  }

  var notesHtml = '<textarea class="eq-notes" style="width:100%;margin-top:8px;font-size:11px;min-height:48px" placeholder="Notes…" onclick="event.stopPropagation()" onblur="saveEnquiryNotesPl(\'' + e.id + '\', this.value)">' + escHtml(e.notes || '') + '</textarea>';

  var actionsHtml = '';
  if (advance) {
    actionsHtml += '<button class="pl-action-btn pl-action-btn--primary" onclick="event.stopPropagation();advanceEnquiryStatus(\'' + e.id + '\',\'' + advance.next + '\')">' + advance.label + '</button>';
  }
  if (status === 'in_halaxy') {
    actionsHtml += '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();togglePipelineIntake(\'' + e.id + '\')">Send intake</button>';
  }
  // Convert to client — available on any non-closed enquiry
  if (status !== 'closed') {
    actionsHtml += '<button class="pl-action-btn pl-action-btn--convert" onclick="event.stopPropagation();convertEnquiryPl(\'' + e.id + '\')">Convert to client →</button>';
  }
  if (actionsHtml) actionsHtml = '<div class="pl-card-actions" style="margin-top:8px">' + actionsHtml + '</div>';

  var intakeHtml = '';
  if (status === 'in_halaxy') {
    intakeHtml = '<div class="pl-intake-panel" id="pl-intake-' + e.id + '">'
      + '<div class="pl-intake-row">'
      + _intakeTypeSelectorHtml(e.id)
      + '<input class="pl-intake-url" id="pl-iurl-' + e.id + '" type="url" placeholder="Paste Halaxy intake URL…" onclick="event.stopPropagation()">'
      + '<button class="pl-intake-send" onclick="event.stopPropagation();sendIntakePl(\'' + e.id + '\')">Send →</button>'
      + '</div>'
      + '<div id="pl-imsg-' + e.id + '" style="font-size:10px;margin-top:4px"></div>'
      + '</div>';
  }

  var menuItems = [];
  if (status !== 'closed') menuItems.push({ label: '🔗 Link to existing client', fn: 'openLinkPanel("' + uid + '","enq","' + e.id + '")' });
  menuItems.push({ label: '✕ Close without converting', fn: '_openCloseEnquiryModal("' + e.id + '")', warn: true });

  return '<div class="pl-card' + (isNew ? ' pl-card--new' : '') + '" id="pl-' + uid + '" onclick="togglePipelineCard(\'' + uid + '\')">'
    + _menuHtml(uid, menuItems)
    + '<div class="pl-card-name">' + escHtml(name) + '</div>'
    + (detail ? '<div class="pl-card-meta">' + escHtml(detail) + '</div>' : '')
    + '<div style="font-size:10px;color:var(--soft);margin-top:2px">' + plFmtDate(e.created_at) + '</div>'
    + badges
    + '<div class="pl-card-detail" id="pl-detail-' + uid + '">'
    + contactHtml
    + notesHtml
    + actionsHtml
    + intakeHtml
    + '<div id="pl-link-' + uid + '"></div>'
    + '</div>'
    + '</div>';
}

/* ── Client pipeline card ── */
function renderClientCardPl(c) {
  var sessions     = c.sessions || [];
  var funderLabel  = FUNDER_LABELS[c.funder] || c.funder || '—';
  var pendingCount = sessions.filter(function(s) {
    return s.status === 'upcoming' || s.status === 'completed' || s.status === 'invoiced' || s.status === 'submitted';
  }).length;
  var uid        = 'cl-' + c.id;
  var hasHalaxy  = !!(c.halaxy_id && c.halaxy_id.trim());

  // Halaxy next appointment
  var apptBadge = '';
  if (_halaxyData.connected && hasHalaxy) {
    var today = new Date().toISOString().slice(0, 10);
    var nextAppt = (_halaxyData.appointments || []).find(function(a) {
      if (!a.start || a.start.slice(0, 10) < today) return false;
      return (a.participant || []).some(function(p) {
        return p.actor && p.actor.reference && String(p.actor.reference).indexOf(c.halaxy_id) !== -1;
      });
    });
    if (nextAppt && nextAppt.start) {
      var apptDate = new Date(nextAppt.start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
      apptBadge = '<span class="pl-badge pl-badge--appt">Next ' + apptDate + '</span>';
    }
  }

  var badges = '<span class="pl-badge pl-badge--funder funder-' + escHtml(c.funder || '') + '">' + escHtml(funderLabel) + '</span>';
  if (pendingCount) badges += '<span class="pl-badge pl-badge--pending">' + pendingCount + ' pending</span>';
  if (apptBadge)    badges += apptBadge;
  if (!hasHalaxy)   badges += '<span class="pl-badge pl-badge--nohalaxy">Not in Halaxy</span>';

  var sortedSess = (sessions || []).slice().sort(function(a, b) { return b.session_date.localeCompare(a.session_date); });
  var sessHtml = sortedSess.length
    ? '<div class="pl-detail-sessions">' + sortedSess.map(function(s) { return renderSessionMiniPl(s, c.id); }).join('') + '</div>'
    : '<div class="pl-empty" style="font-size:10px;margin:4px 0">No sessions yet</div>';

  // Halaxy link section
  var halaxySection = '<div class="pl-halaxy-section" id="pl-halaxy-sect-' + c.id + '">';
  if (hasHalaxy) {
    halaxySection += '<div class="pl-halaxy-linked">'
      + '<span class="pl-halaxy-linked-label">✓ Halaxy linked</span>'
      + '<span class="pl-halaxy-id-val">' + escHtml(c.halaxy_id) + '</span>'
      + '<a href="' + escHtml(_halaxyWebUrl || 'https://www.halaxy.com/practitioner') + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="pl-halaxy-open">Open ↗</a>'
      + '<button class="pl-halaxy-clear-btn" onclick="event.stopPropagation();clearHalaxyIdPl(\'' + c.id + '\')">Unlink</button>'
      + '</div>';
  } else {
    halaxySection += '<div class="pl-halaxy-unlinked">'
      + '<div class="pl-halaxy-steps">To link: <strong>1)</strong> Create a Patient in Halaxy &amp; set up a professional appointment &nbsp;·&nbsp; <strong>2)</strong> Paste their Halaxy Patient ID below</div>'
      + '<div class="pl-halaxy-input-row">'
      + '<input class="pl-halaxy-input" id="pl-halaxy-inp-' + c.id + '" type="text" placeholder="Halaxy Patient ID…" onclick="event.stopPropagation()">'
      + '<a href="' + escHtml(_halaxyWebUrl || 'https://www.halaxy.com/practitioner') + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="pl-action-btn pl-action-btn--soft" style="text-decoration:none;font-size:10px">Open Halaxy ↗</a>'
      + '<button class="pl-action-btn pl-action-btn--primary" onclick="event.stopPropagation();saveHalaxyIdPl(\'' + c.id + '\')">Link</button>'
      + '</div>'
      + '</div>';
  }
  halaxySection += '</div>';

  var archiveBtn = c.active
    ? '<button class="pl-action-btn pl-action-btn--danger" onclick="event.stopPropagation();setClientActivePl(\'' + c.id + '\',false)">Archive</button>'
    : '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();setClientActivePl(\'' + c.id + '\',true)">Reactivate</button>';

  var detailHtml = sessHtml
    + renderAddSessionFormPl(c.id)
    + halaxySection
    + '<div style="display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(42,88,80,0.07)">'
    + '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();toggleAddSessionFormPl(\'' + c.id + '\')">+ Appointment</button>'
    + '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();editClientPl(\'' + c.id + '\')">Edit</button>'
    + archiveBtn
    + '</div>';

  var clientMenu = [
    { label: '✏ Edit name',   fn: 'editClientPl("' + c.id + '")' },
    c.active
      ? { label: '📦 Archive client', fn: 'setClientActivePl("' + c.id + '",false)', warn: true }
      : { label: '↩ Reactivate',     fn: 'setClientActivePl("' + c.id + '",true)' },
  ];

  return '<div class="pl-card pl-card--active" id="pl-' + uid + '" onclick="togglePipelineCard(\'' + uid + '\')">'
    + _menuHtml(uid, clientMenu)
    + '<div class="pl-card-name">' + escHtml(c.display_name) + '</div>'
    + (c.plan_manager ? '<div class="pl-card-meta">' + escHtml(c.plan_manager) + '</div>' : '')
    + '<div class="pl-card-badges">' + badges + '</div>'
    + '<div class="pl-card-detail" id="pl-detail-' + uid + '">'
    + detailHtml
    + '</div>'
    + '</div>';
}

/* ── Session mini row (pipeline) ── */
function renderSessionMiniPl(s, clientId) {
  var d = new Date(s.session_date + 'T12:00:00');
  var dateStr = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' });
  var next = STATUS_NEXT[s.status];
  return '<div class="pl-session-mini">'
    + '<span style="color:var(--mid);font-weight:500;font-size:11px">' + dateStr + '</span>'
    + '<span style="color:var(--soft);font-size:10px">' + escHtml(s.invoice_ref || '') + '</span>'
    + (next
        ? '<button class="pl-action-btn pl-action-btn--soft" style="font-size:9px;padding:2px 7px" onclick="event.stopPropagation();advanceSessionPl(\'' + s.id + '\',\'' + next.next + '\',\'' + clientId + '\')">' + next.label + '</button>'
        : '<span class="cl-status-btn status-' + s.status + '" style="font-size:9px;padding:2px 7px;cursor:default">' + STATUS_DISPLAY[s.status] + '</span>'
      )
    + '</div>';
}

/* ── Add session form (pipeline) ── */
function renderAddSessionFormPl(clientId) {
  return '<div class="cl-add-session-form" id="pl-add-sess-' + clientId + '">'
    + '<div class="cl-form-row">'
    + '<div class="cl-form-field"><label for="pl-sess-date-' + clientId + '">Date</label>'
    + '<input class="cl-form-input" id="pl-sess-date-' + clientId + '" type="date"></div>'
    + '<div class="cl-form-field"><label for="pl-sess-status-' + clientId + '">Status</label>'
    + '<select class="cl-form-input" id="pl-sess-status-' + clientId + '">'
    + '<option value="upcoming">Upcoming</option>'
    + '<option value="completed">Completed</option>'
    + '<option value="invoiced">Invoiced</option>'
    + '</select></div>'
    + '</div>'
    + '<div class="cl-form-row">'
    + '<div class="cl-form-field"><label for="pl-sess-inv-' + clientId + '">Invoice ref</label>'
    + '<input class="cl-form-input" id="pl-sess-inv-' + clientId + '" type="text" placeholder="e.g. INV-001"></div>'
    + '<div class="cl-form-field"><label for="pl-sess-notes-' + clientId + '">Notes</label>'
    + '<input class="cl-form-input" id="pl-sess-notes-' + clientId + '" type="text" placeholder="Optional…"></div>'
    + '</div>'
    + '<div class="cl-form-actions">'
    + '<button class="cl-form-save" onclick="event.stopPropagation();saveSessionPl(\'' + clientId + '\')">Save session</button>'
    + '<button class="cl-form-cancel" onclick="event.stopPropagation();toggleAddSessionFormPl(\'' + clientId + '\')">Cancel</button>'
    + '</div>'
    + '</div>';
}

/* ── Dashboard tab switcher (legacy compat stub) ── */
function switchDashTab(tab, btn) {
  // No-op in new layout — navigation handled by navigateTo()
}

/* ═══════════════════════════════════════════════════
   QUEUE VIEW
   ═══════════════════════════════════════════════════ */

/* ── Client → Queue filter ── */
function filterQueueForClient(name, halaxyId) {
  window._queueClientFilter = { name: name, halaxyId: halaxyId };
  navigateTo('queue');
}
function clearQueueFilter() {
  window._queueClientFilter = null;
  renderQueueView();
}

/* ── Delete (hard-remove) a dashboard client record ── */
async function deleteClient(id, name) {
  if (!confirm('Remove "' + name + '" from the dashboard?\n\nThis only removes the record here — Halaxy is not affected.')) return;
  try {
    await apiFetch('/api/clients?id=' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Record removed');
    closeDetailPanel();
    refreshPipeline();
  } catch (e) {
    toast('Could not remove: ' + e.message, 'err');
  }
}

/* ── Home dashboard view ── */
/* ── Home dashboard view ── */
function renderHomeView() {
  var content = document.getElementById('view-content');
  if (!content || !_pipelineData) return;

  var enquiries  = (_pipelineData.enquiries  || []);
  var tasks      = (_pipelineData.tasks      || []);
  var appts      = (_halaxyData && _halaxyData.appointments) || [];
  var invoices   = (_halaxyData && _halaxyData.invoices) || [];
  var clients    = (_pipelineData.clients    || []);

  // ── Helpers ───────────────────────────────────────
  function avColor(name) {
    var colors = ['av-blue','av-teal','av-purple','av-amber','av-green','av-red'];
    var idx = (name || '').charCodeAt(0) % colors.length;
    return colors[idx];
  }
  function initials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  function funderBadge(funder) {
    var map = {
      ndis_plan: ['db-badge-teal',   'NDIS'],
      ndis_self: ['db-badge-teal',   'NDIS'],
      medicare:  ['db-badge-blue',   'Medicare'],
      private:   ['db-badge-grey',   'Private'],
      qfes:      ['db-badge-purple', 'QFES'],
      workcover: ['db-badge-amber',  'WorkCover'],
      dva:       ['db-badge-purple', 'DVA'],
    };
    var m = map[funder] || ['db-badge-grey', funder || 'TBC'];
    return '<span class="db-badge ' + m[0] + '">' + escHtml(m[1]) + '</span>';
  }
  function timeAgo(iso) {
    if (!iso) return '';
    var mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60)    return mins + ' min' + (mins === 1 ? '' : 's') + ' ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24)     return hrs + ' hour' + (hrs === 1 ? '' : 's') + ' ago';
    var days = Math.round(hrs / 24);
    return days + ' day' + (days === 1 ? '' : 's') + ' ago';
  }
  function fmtApptDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' })
      + ' · ' + d.toLocaleTimeString('en-AU', { hour:'numeric', minute:'2-digit', timeZone:'Australia/Brisbane' });
  }

  // ── Stats ─────────────────────────────────────────
  var activeEnqCount = enquiries.filter(function(e) {
    return e.status !== 'closed' && e.status !== 'converted';
  }).length;

  var outstandingAmt = invoices.reduce(function(sum, inv) {
    if (inv.status === 'active' || inv.status === 'overdue') sum += parseFloat(inv.totalPrice || 0);
    return sum;
  }, 0);

  var now        = new Date();
  var todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  var weekEnd    = new Date(todayStart); weekEnd.setDate(weekEnd.getDate() + 7);

  var weekAppts = appts.filter(function(a) {
    if (!a.start || a.status === 'cancelled') return false;
    var t = new Date(a.start).getTime();
    return t >= todayStart.getTime() && t < weekEnd.getTime();
  }).sort(function(a,b) { return new Date(a.start) - new Date(b.start); });

  var activeClientCount = clients.filter(function(c) {
    return c.status !== 'archived' && c.status !== 'inactive';
  }).length;

  // ── Needs Action ─────────────────────────────────
  // 1. New enquiries (status === 'new')
  var newEnquiries = enquiries.filter(function(e) { return (e.status || 'new') === 'new'; });

  // 2. Overdue invoices (Halaxy invoices with status overdue, or outstanding beyond threshold)
  var FUNDER_DAYS = { ndis_plan: 12, ndis_self: 12, qfes: 25, workcover: 40, eap: 25 };
  var overdueInvoices = invoices.filter(function(inv) {
    if (inv.status === 'cancelled' || inv.status === 'draft') return false;
    if (_invIsPaid(inv)) return false;            // totalBalance=0 → already paid
    if (!inv.date) return false;                  // no date → skip (avoids epoch bug)
    var daysOld = (Date.now() - new Date(inv.date).getTime()) / 86400000;
    var threshold = FUNDER_DAYS[inv.funder] || 3; // private/medicare flag quickly
    return daysOld > threshold;
  }).slice(0, 3);

  // 3. Clients needing Halaxy setup (in onboarding, have upcoming appt, not linked)
  var needsSetup = (clients || []).filter(function(c) {
    return !c.halaxy_client_id && !c.halaxy_client_url && (c.status === 'onboarding' || c.status === 'active');
  }).slice(0, 2);

  var needsActionTotal = newEnquiries.length + overdueInvoices.length + needsSetup.length;

  // ── In Progress ───────────────────────────────────
  // Submitted invoices within window (not yet overdue, not yet paid)
  var inProgress = invoices.filter(function(inv) {
    if (inv.status === 'cancelled' || inv.status === 'draft') return false;
    if (_invIsPaid(inv)) return false;
    if (!inv.date) return false;
    var daysOld = (Date.now() - new Date(inv.date).getTime()) / 86400000;
    var threshold = FUNDER_DAYS[inv.funder] || 3;
    return daysOld <= threshold;
  }).slice(0, 5);

  // ── Build HTML ────────────────────────────────────
  var html = '';

  // Stats row
  html += '<div class="db-stats-row">';
  html += '<div class="glass db-stat-card"><div class="db-stat-label">Active Clients</div><div class="db-stat-val">' + activeClientCount + '</div><div class="db-stat-sub">' + weekAppts.length + ' sessions this week</div></div>';
  html += '<div class="glass db-stat-card"><div class="db-stat-label">Needs Action</div><div class="db-stat-val" style="color:var(--db-amber)">' + needsActionTotal + '</div><div class="db-stat-sub">Awaiting attention</div></div>';
  var outStr = outstandingAmt > 0 ? ('$' + Math.round(outstandingAmt).toLocaleString('en-AU')) : '$0';
  html += '<div class="glass db-stat-card"><div class="db-stat-label">Outstanding</div><div class="db-stat-val" style="color:var(--db-blue)">' + outStr + '</div><div class="db-stat-sub">' + overdueInvoices.length + ' overdue</div></div>';
  html += '<div class="glass db-stat-card"><div class="db-stat-label">This Week</div><div class="db-stat-val" style="color:var(--db-teal)">' + weekAppts.length + '</div><div class="db-stat-sub">Sessions scheduled</div></div>';
  html += '</div>';

  // ── NEEDS ACTION section ──────────────────────────
  if (needsActionTotal > 0) {
    html += '<div class="db-sec-hdr"><div class="db-sec-title">Needs Action</div><div class="db-sec-count urgent">' + needsActionTotal + '</div><div class="db-sec-divider"></div></div>';
    html += '<div class="action-folder">';

    // New enquiry cards
    newEnquiries.forEach(function(e) {
      var name = [e.first_name, e.last_name].filter(Boolean).join(' ') || 'Unknown';
      var av   = avColor(name);
      var ini  = initials(name);
      var age  = timeAgo(e.created_at);
      var src  = e.source ? '<span class="db-badge db-badge-grey" style="font-size:10px">' + escHtml(e.source) + '</span>' : '';
      html += '<div class="ac" onclick="openDetailPanel(\'enquiry\',\'' + escHtml(e.id) + '\')">'
        + '<div class="ac-head is-red"><div class="ac-pip red"></div><div class="ac-type red">New Enquiry</div><div class="ac-age">' + age + '</div></div>'
        + '<div class="ac-body">'
        + '<div class="ac-av ' + av + '">' + ini + '</div>'
        + '<div class="ac-content">'
        + '<div class="ac-name">' + escHtml(name) + ' ' + src + '</div>'
        + '<div class="ac-detail">' + escHtml(e.email || '') + (e.reason ? '<br>Reason: ' + escHtml(e.reason) : '') + ' · No reply sent yet</div>'
        + '</div>'
        + '</div>'
        + '<div class="ac-foot">'
        + '<button class="btn-ac primary red" onclick="event.stopPropagation();window.location=\'mailto:' + encodeURIComponent(e.email || '') + '\'">Reply by email</button>'
        + '<button class="btn-ac soft" onclick="event.stopPropagation()">Log note</button>'
        + '<button class="btn-ac-link" onclick="event.stopPropagation();openDetailPanel(\'enquiry\',\'' + escHtml(e.id) + '\')">View profile →</button>'
        + '</div>'
        + '</div>';
    });

    // Overdue invoice cards
    overdueInvoices.forEach(function(inv) {
      var patientId = inv.patientId || '';
      var patName   = (_halaxyData && _halaxyData.patientMap && _halaxyData.patientMap[patientId])
                    || (patientId ? 'Client #' + patientId : 'Client');
      var av        = avColor(patName);
      var ini       = initials(patName);
      var _invAmt   = inv.totalBalance != null ? inv.totalBalance : inv.amount;
      var amt       = _invAmt != null ? '$' + parseFloat(_invAmt).toFixed(0) : '$0';
      var daysOld   = inv.date ? Math.round((Date.now() - new Date(inv.date).getTime()) / 86400000) : 0;
      var funder    = inv.payorOrg || inv.funder || 'Invoice';
      html += '<div class="ac" onclick="navigateTo(\'billing\')">'
        + '<div class="ac-head is-amber"><div class="ac-pip amber"></div><div class="ac-type amber">' + escHtml(funder) + ' — Invoice Outstanding</div><div class="ac-age">' + daysOld + ' days old</div></div>'
        + '<div class="ac-body">'
        + '<div class="ac-av ' + av + '">' + ini + '</div>'
        + '<div class="ac-content">'
        + '<div class="ac-name">' + escHtml(patName) + ' ' + funderBadge(inv.funder || funder) + '</div>'
        + '<div class="ac-detail">Invoice #' + escHtml(inv.ref || inv.id || '') + ' · Expected payment window exceeded</div>'
        + '</div>'
        + '<div class="ac-amount">' + amt + '</div>'
        + '</div>'
        + '<div class="ac-foot">'
        + '<button class="btn-ac primary amber" onclick="event.stopPropagation();navigateTo(\'billing\')">Chase funder</button>'
        + '<button class="btn-ac soft" onclick="event.stopPropagation()">Mark as paid</button>'
        + '<button class="btn-ac-link" onclick="event.stopPropagation();navigateTo(\'billing\')">View billing →</button>'
        + '</div>'
        + '</div>';
    });

    // Needs Halaxy setup cards
    needsSetup.forEach(function(c) {
      var name   = c.display_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Client';
      var av     = avColor(name);
      var ini    = initials(name);
      var funder = c.funder_type || 'TBC';
      html += '<div class="ac" onclick="renderClientDetailView(\'' + escHtml(c.id || '') + '\')">'
        + '<div class="ac-head is-amber"><div class="ac-pip amber"></div><div class="ac-type amber">Intake — Halaxy Setup Required</div><div class="ac-age">Not yet linked</div></div>'
        + '<div class="ac-body">'
        + '<div class="ac-av ' + av + '">' + ini + '</div>'
        + '<div class="ac-content">'
        + '<div class="ac-name">' + escHtml(name) + ' <span class="db-badge db-badge-grey" style="font-size:10px">' + escHtml(funder) + '</span></div>'
        + '<div class="ac-detail">Not yet created in Halaxy · Funder unknown — confirm at intake</div>'
        + '</div>'
        + '</div>'
        + '<div class="ac-foot">'
        + '<button class="btn-ac primary" onclick="event.stopPropagation();renderClientDetailView(\'' + escHtml(c.id || '') + '\')">Link to Halaxy</button>'
        + '<button class="btn-ac soft" onclick="event.stopPropagation()">Create patient</button>'
        + '<button class="btn-ac-link" onclick="event.stopPropagation();renderClientDetailView(\'' + escHtml(c.id || '') + '\')">View profile →</button>'
        + '</div>'
        + '</div>';
    });

    html += '</div>'; // action-folder

    if (needsActionTotal === 0) {
      html = html.replace('<div class="action-folder"></div>', '');
    }
  }

  // ── IN PROGRESS section ───────────────────────────
  if (inProgress.length > 0) {
    html += '<div class="db-sec-hdr"><div class="db-sec-title">In Progress — Waiting on Others</div><div class="db-sec-count info">' + inProgress.length + '</div><div class="db-sec-divider"></div></div>';
    html += '<div class="glass db-queue-card">';

    inProgress.forEach(function(inv) {
      var patientId = inv.patientId || '';
      var patName   = (_halaxyData && _halaxyData.patientMap && _halaxyData.patientMap[patientId])
                    || (patientId ? 'Client #' + patientId : 'Client');
      var av        = avColor(patName);
      var ini       = initials(patName);
      var funder    = inv.payorOrg || inv.funder || 'Invoice';
      var _invAmt   = inv.totalBalance != null ? inv.totalBalance : inv.amount;
      var amt       = _invAmt != null ? '$' + parseFloat(_invAmt).toFixed(0) : '$0';
      var daysOld   = inv.date ? Math.round((Date.now() - new Date(inv.date).getTime()) / 86400000) : 0;
      var threshold = FUNDER_DAYS[funder] || 3;
      var remaining = threshold - daysOld;
      var isOk      = remaining > 2;
      html += '<div class="db-q-item" onclick="navigateTo(\'billing\')">'
        + '<div class="db-q-pip ' + (isOk ? 'pip-teal' : 'pip-amber') + '"></div>'
        + '<div class="ac-av ' + av + '" style="width:32px;height:32px;border-radius:50%;font-size:10px;font-weight:700;flex-shrink:0;display:flex;align-items:center;justify-content:center">' + ini + '</div>'
        + '<div class="db-q-body">'
        + '<div class="db-q-name">' + escHtml(patName) + '</div>'
        + '<div class="db-q-meta">' + escHtml(funder) + ' invoice ' + amt + ' <span class="db-q-dot">·</span> ' + daysOld + ' days submitted</div>'
        + '</div>'
        + '<div class="db-q-right">'
        + '<span class="db-badge ' + (isOk ? 'db-badge-teal' : 'db-badge-amber') + '">' + (isOk ? 'Within window ✓' : remaining + 'd remaining') + '</span>'
        + '<svg width="13" height="13" viewBox="0 0 16 16" fill="var(--db-t3)"><path d="M4.646 1.646a.5.5 0 01.708 0l6 6a.5.5 0 010 .708l-6 6a.5.5 0 01-.708-.708L10.293 8 4.646 2.354a.5.5 0 010-.708z"/></svg>'
        + '</div>'
        + '</div>';
    });

    html += '</div>';
  }

  // ── THIS WEEK section ─────────────────────────────
  if (weekAppts.length > 0) {
    html += '<div class="db-sec-hdr"><div class="db-sec-title">This Week</div><div class="db-sec-count">' + weekAppts.length + ' session' + (weekAppts.length > 1 ? 's' : '') + '</div><div class="db-sec-divider"></div></div>';
    html += '<div class="db-sched-grid">';

    weekAppts.forEach(function(a) {
      var d       = new Date(a.start);
      var dayName = d.toLocaleDateString('en-AU', { weekday: 'short' });
      var dayNum  = d.getDate();
      var timeStr = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Brisbane' });
      var patientId = '';
      (a.participant || []).forEach(function(p) {
        var ref = (p.actor && p.actor.reference) || '';
        if (ref.startsWith('Patient/')) patientId = ref.replace('Patient/', '');
      });
      var patName = (_halaxyData && _halaxyData.patientMap && _halaxyData.patientMap[patientId]) || 'Client';
      var funder  = a.funder || '';
      var isIntake = (a.appointmentType && a.appointmentType.toLowerCase().includes('intake')) || false;

      html += '<div class="glass-sm db-sched-item">'
        + '<div class="db-sched-day"><div class="db-sched-day-name">' + dayName + '</div><div class="db-sched-day-num">' + dayNum + '</div></div>'
        + '<div class="db-sched-sep"></div>'
        + '<div class="db-sched-time">' + timeStr + '</div>'
        + '<div class="db-sched-name">' + escHtml(patName) + (isIntake ? '<span class="db-sched-star">★ Intake</span>' : '') + '</div>'
        + (funder ? funderBadge(funder) : '')
        + '</div>';
    });

    html += '</div>';
  }

  // Empty state if nothing actionable
  if (needsActionTotal === 0 && inProgress.length === 0 && weekAppts.length === 0) {
    html += '<div class="db-dp-empty" style="margin-top:40px">'
      + '<div style="font-size:32px;margin-bottom:14px;opacity:0.3">✓</div>'
      + '<div style="font-size:15px;font-weight:700;color:var(--db-t2);margin-bottom:6px">All clear</div>'
      + '<div style="font-size:13px">No pending actions, in-progress items, or sessions this week.</div>'
      + '</div>';
  }

  content.innerHTML = html;
}

async function _homeAddTask() {
  var input = document.getElementById('home-task-input');
  if (!input || !input.value.trim()) return;
  var title = input.value.trim();
  input.value = '';
  try {
    var task = await apiFetch('/api/admin-tasks', { method: 'POST', body: { title: title } });
    if (!_pipelineData.tasks) _pipelineData.tasks = [];
    _pipelineData.tasks.unshift(task);
    renderHomeView();
  } catch (err) {
    toast('Could not add task: ' + err.message, 'err');
  }
}

function renderQueueView() {
  var content = document.getElementById('view-content');
  if (!content || !_pipelineData) return;

  // ── Filtered client view ──────────────────────────────────
  if (window._queueClientFilter) {
    var filter  = window._queueClientFilter;
    var unified = _buildUnifiedSessions();
    var all     = unified.upcoming.concat(unified.past);
    var matched = all.filter(function(s) {
      if (filter.halaxyId && s.patientId && String(s.patientId) === String(filter.halaxyId)) return true;
      if (filter.name && s.name && s.name.trim().toLowerCase() === filter.name.trim().toLowerCase()) return true;
      return false;
    });
    var cfUpcoming = matched.filter(function(s) { return s.startMs > Date.now(); }).sort(function(a,b){ return a.startMs - b.startMs; });
    var cfPast     = matched.filter(function(s) { return s.startMs <= Date.now(); }).sort(function(a,b){ return b.startMs - a.startMs; });
    var html = '<div class="queue-view">';
    html += '<div class="q-client-filter-hd">'
      + '<button class="q-client-filter-back" onclick="clearQueueFilter()">← All sessions</button>'
      + '<span class="q-client-filter-name">' + escHtml(filter.name || 'Client') + '</span>'
      + '</div>';
    if (!matched.length) {
      html += '<div class="q-items"><div class="q-empty">No sessions found for this client</div></div>';
    } else {
      if (cfUpcoming.length) {
        html += _qFolder('cf-upcoming', 'Upcoming', 'var(--s-upcoming)', cfUpcoming, _qSessionItem, 'upcoming', { defaultOpen: 'always' });
      }
      if (cfPast.length) {
        html += _qFolder('cf-past', 'Past Appointments', 'var(--teal)', cfPast, _qSessionItem, 'today', { defaultOpen: 'always', maxVisible: 20 });
      }
    }
    html += '</div>';
    content.innerHTML = html;
    return;
  }
  var now = new Date();
  var todayStr = now.toISOString().slice(0, 10);
  var enquiries = (_pipelineData && _pipelineData.enquiries) || [];
  var unified = _buildUnifiedSessions();
  var allClients = (_pipelineData.clients || []);

  // ── Section buckets ──────────────────────────────────────
  // TODAY — any session (past or upcoming) starting today
  var todaySessions = unified.upcoming.filter(function(s) { return s.dateStr === todayStr; })
    .concat(unified.past.filter(function(s) { return s.dateStr === todayStr; }));

  // URGENT — needs-recording (any past) + overdue invoices (per-funder threshold)
  var urgentRecord = unified.past.filter(function(s) {
    return s.dateStr !== todayStr && s.status === 'needs-recording'
      && s.name && s.name !== 'Halaxy appointment';
  });
  var urgentOverdue = unified.past.filter(function(s) {
    if (s.dateStr === todayStr) return false;
    if (s.status !== 'invoiced') return false;
    if (!s.name || s.name === 'Halaxy appointment') return false;
    var threshMs = _overdueThresholdDays(s.patientId) * 24 * 60 * 60 * 1000;
    return new Date(s.dateStr).getTime() < now.getTime() - threshMs;
  });

  // POST SESSION — appointments needing invoice (no invoice yet)
  var postSession = unified.past.filter(function(s) {
    return s.dateStr !== todayStr && s.status === 'pending-invoice'
      && s.name && s.name !== 'Halaxy appointment';
  });

  // NEW LEADS — enquiries needing first contact
  var newLeads = enquiries.filter(function(e) {
    return !e.client_id && (e.status === 'new' || !e.status);
  });

  // CLIENT CONTACTS — enquiries in progress (contacted / in_halaxy)
  var triageContacted = enquiries.filter(function(e) {
    return !e.client_id && e.status === 'contacted';
  });
  var triageInHalaxy = enquiries.filter(function(e) {
    return !e.client_id && e.status === 'in_halaxy';
  });
  var triage = triageContacted.concat(triageInHalaxy);

  // CLOSED — enquiries that were closed (not converted)
  var closedEnqs = enquiries.filter(function(e) {
    return e.status === 'closed';
  });

  // UPCOMING — future sessions (next 14 days, not today)
  var upcomingSessions = unified.upcoming.filter(function(s) { return s.dateStr !== todayStr; });

  // FINANCE — invoiced appointments not yet overdue (within funder-specific threshold)
  var finance = unified.past.filter(function(s) {
    if (s.dateStr === todayStr) return false;
    if (s.status !== 'invoiced') return false;
    if (!s.name || s.name === 'Halaxy appointment') return false;
    var threshMs = _overdueThresholdDays(s.patientId) * 24 * 60 * 60 * 1000;
    return new Date(s.dateStr).getTime() >= now.getTime() - threshMs;
  });

  // PERSONAL / UNLINKED — no resolved client
  var unlinked = unified.past.filter(function(s) {
    return s.dateStr !== todayStr
      && (s.status === 'pending-invoice' || s.status === 'needs-recording' || s.status === 'invoiced')
      && (!s.name || s.name === 'Halaxy appointment');
  });

  // COMPLETED — paid sessions (collapsed by default)
  var completed = unified.past.filter(function(s) {
    return s.status === 'paid';
  });

  // Total urgent count for topbar/badge
  var urgentAll   = urgentRecord.concat(urgentOverdue);
  var urgentTotal = todaySessions.length + urgentRecord.length + urgentOverdue.length;
  var actionTotal = urgentTotal + postSession.length + newLeads.length;

  // ── Update topbar metrics ──
  _updateTopbarMetrics(actionTotal, urgentTotal, postSession.length, newLeads.length);

  // ── Update sidebar badge ──
  var badge = document.getElementById('sib-queue');
  if (badge) {
    var badgeCount = urgentAll.length + postSession.length;
    if (badgeCount > 0) { badge.textContent = badgeCount; badge.classList.add('visible'); }
    else { badge.classList.remove('visible'); }
  }

  // ── Build folders array ──────────────────────────────────
  var folders = [
    { key: 'today',    label: 'Today',            color: 'var(--teal)',       items: todaySessions,  fn: _qSessionItem,  isUrgent: false, subGroups: null },
    { key: 'urgent',   label: 'Urgent',           color: 'var(--s-urgent)',   items: urgentAll,      fn: _qSessionItem,  isUrgent: true,
      subGroups: [
        { key: 'record',  label: 'Needs recording (' + urgentRecord.length + ')',   items: urgentRecord,  fn: _qSessionItem },
        { key: 'overdue', label: 'Overdue invoices (' + urgentOverdue.length + ')', items: urgentOverdue, fn: _qSessionItem }
      ].filter(function(sg) { return sg.items.length > 0; })
    },
    { key: 'post',      label: 'Post Appointment', color: 'var(--s-post)',     items: postSession,    fn: _qSessionItem,  isUrgent: false, subGroups: null },
    { key: 'leads',     label: 'New Leads',        color: 'var(--s-lead)',     items: newLeads,       fn: _qEnquiryItem,  isUrgent: true,  subGroups: null },
    { key: 'contacts',  label: 'Client Contacts',  color: 'var(--s-triage)',   items: triage,         fn: _qEnquiryItem,  isUrgent: false, subGroups: null },
    { key: 'upcoming',  label: 'Upcoming',         color: 'var(--s-upcoming)', items: upcomingSessions, fn: _qSessionItem, isUrgent: false, subGroups: null },
    { key: 'finance',   label: 'Awaiting Payment', color: 'var(--s-finance)',  items: finance,        fn: _qSessionItem,  isUrgent: false, subGroups: null },
    { key: 'unlinked',  label: 'Personal / Unlinked', color: 'var(--s-triage)', items: unlinked,     fn: _qSessionItem,  isUrgent: false, subGroups: null },
    { key: 'closed',    label: 'Closed',           color: 'var(--soft)',       items: closedEnqs,     fn: _qEnquiryItem,  isUrgent: false, subGroups: null },
  ].concat(completed.length ? [{ key: 'complete', label: 'Completed', color: 'var(--s-complete)', items: completed, fn: _qSessionItem, isUrgent: false, subGroups: null }] : [])
   .filter(function(f) { return f.items.length > 0 || f.key === 'today' || f.key === 'upcoming'; });

  // ── Auto-select active folder ──────────────────────────────
  var priorityKeys = ['urgent', 'today', 'post', 'leads', 'contacts', 'upcoming'];
  if (!window._inboxFolder) {
    var autoKey = null;
    for (var pi = 0; pi < priorityKeys.length; pi++) {
      var pf = folders.find(function(f) { return f.key === priorityKeys[pi]; });
      if (pf && pf.items.length > 0) { autoKey = pf.key; break; }
    }
    window._inboxFolder = autoKey || (folders.length ? folders[0].key : 'today');
  }
  // Make sure the selected folder actually exists in the filtered list
  var selFolder = folders.find(function(f) { return f.key === window._inboxFolder; });
  if (!selFolder) {
    window._inboxFolder = folders.length ? folders[0].key : 'today';
    selFolder = folders[0] || null;
  }

  // ── Render inbox layout ───────────────────────────────────
  var html = '<div class="inbox-layout">';

  // Sidebar
  html += '<div class="inbox-sidebar">';
  html += '<div class="inbox-sidebar-label">Inbox</div>';
  folders.forEach(function(f) {
    var isActive = f.key === window._inboxFolder;
    var countCls = f.isUrgent && f.items.length > 0 ? 'urgent' : 'normal';
    html += '<button class="inbox-folder-btn' + (isActive ? ' active' : '') + '"'
      + ' onclick="window._inboxFolder=\'' + f.key + '\';renderQueueView()">'
      + '<span class="inbox-folder-dot" style="background:' + f.color + '"></span>'
      + '<span class="inbox-folder-label">' + escHtml(f.label) + '</span>'
      + (f.items.length > 0
          ? '<span class="inbox-folder-count ' + countCls + '">' + f.items.length + '</span>'
          : '')
      + '</button>';
  });
  html += '</div>'; // inbox-sidebar

  // Main pane
  html += '<div class="inbox-main">';
  if (selFolder) {
    html += '<div class="inbox-pane-title">' + escHtml(selFolder.label) + '</div>';
    if (!selFolder.items.length) {
      html += '<div class="q-empty">'
        + (selFolder.key === 'today' ? 'No sessions today — clear schedule ✓' : 'Nothing here')
        + '</div>';
    } else if (selFolder.subGroups && selFolder.subGroups.length > 1) {
      // Render sub-groups with labels
      selFolder.subGroups.forEach(function(sg) {
        if (!sg.items.length) return;
        html += '<div class="q-sub-group">';
        html += '<span class="q-sub-title">' + escHtml(sg.label) + '</span>';
        html += '<div class="q-items">' + sg.items.map(function(item) { return sg.fn(item); }).join('') + '</div>';
        html += '</div>';
      });
    } else {
      html += '<div class="q-items">' + selFolder.items.map(function(item) { return selFolder.fn(item); }).join('') + '</div>';
    }
  } else {
    html += '<div class="q-empty">Nothing to show</div>';
  }
  html += '</div>'; // inbox-main

  html += '</div>'; // inbox-layout
  content.innerHTML = html;
}

/* ── Folder open/close state (undefined = use default) ── */
if (!window._folderOpen) window._folderOpen = {};

/**
 * Render a collapsible folder section for the queue.
 * @param {string} key         - unique key for state tracking
 * @param {string} title       - folder label
 * @param {string} color       - CSS color for the dot
 * @param {Array}  items       - items array (used for count badge)
 * @param {Function} renderFn  - item renderer
 * @param {string} barClass    - legacy bar class (ignored visually, kept for API compat)
 * @param {Object} opts        - { urgent, defaultOpen, maxVisible, subGroups, emptyMsg }
 *   defaultOpen: 'always' | true | false
 *     'always' = open even with no items (Today)
 *     true     = open only if items.length > 0
 *     false    = collapsed by default
 */
function _qFolder(key, title, color, items, renderFn, barClass, opts) {
  opts = opts || {};
  var hasUserState = window._folderOpen.hasOwnProperty(key);
  var isOpen;
  if (hasUserState) {
    isOpen = window._folderOpen[key];
  } else {
    var def = opts.defaultOpen;
    if (def === 'always') isOpen = true;
    else if (def === true) isOpen = items.length > 0;
    else isOpen = false;
  }

  var count = items.length;
  var html = '<div class="q-folder">';

  // Clickable tab header
  html += '<div class="q-folder-tab' + (isOpen ? ' is-open' : '') + '"'
    + ' onclick="window._folderOpen[\'' + key + '\']=' + (!isOpen) + ';renderQueueView()">';
  html += '<span class="q-folder-chevron">›</span>';
  html += '<span class="q-folder-dot" style="background:' + color + '"></span>';
  html += '<span class="q-folder-label">' + escHtml(title) + '</span>';
  html += '<span class="q-folder-count' + (opts.urgent ? ' urgent' : '') + '">' + count + '</span>';
  html += '</div>';

  // Expandable body
  if (isOpen) {
    html += '<div class="q-folder-body">';
    var subs = opts.subGroups;
    if (subs && subs.length) {
      subs.forEach(function(sg) {
        if (!sg.items.length) return;
        html += '<div class="q-sub-title">' + escHtml(sg.label) + '</div>';
        html += _qItemList(sg.items, sg.fn || renderFn, sg.bar || barClass, key + '-' + sg.key, opts.maxVisible || 5);
      });
      if (!items.length) html += '<div class="q-empty">' + (opts.emptyMsg || 'Nothing here') + '</div>';
    } else {
      if (items.length) {
        html += _qItemList(items, renderFn, barClass, key, opts.maxVisible || 5);
      } else {
        html += '<div class="q-empty">' + (opts.emptyMsg || 'Nothing here right now') + '</div>';
      }
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

/* Render a q-items list capped at maxVisible with a show-more button.
 * sectionKey is used to track expand state across re-renders. */
window._qSectionExpanded = window._qSectionExpanded || {};
function _qItemList(items, renderFn, barClass, sectionKey, maxVisible) {
  maxVisible = maxVisible || 4;
  var expanded = window._qSectionExpanded[sectionKey];
  var visible = expanded ? items : items.slice(0, maxVisible);
  var hidden = items.length - maxVisible;
  var html = '<div class="q-items">' + visible.map(function(item) { return renderFn(item, barClass); }).join('');
  if (!expanded && hidden > 0) {
    html += '<button class="q-show-more" onclick="window._qSectionExpanded[\'' + sectionKey + '\']=true;renderQueueView()">Show ' + hidden + ' more</button>';
  }
  html += '</div>';
  return html;
}

function _qMetric(val, label, color, highlight) {
  return '<div class="q-metric">'
    + '<span class="q-metric-dot" style="background:' + color + ';opacity:' + (highlight ? '1' : '0.3') + '"></span>'
    + '<div>'
    + '<div class="q-metric-val' + (highlight ? ' urgent' : '') + '">' + val + '</div>'
    + '<div class="q-metric-label">' + label + '</div>'
    + '</div>'
    + '</div>';
}

function _updateTopbarMetrics(total, urgent, postSess, leads) {
  var el = document.getElementById('topbar-metrics');
  if (!el) return;
  if (!total) { el.innerHTML = '<span style="color:#9AABA8">All clear</span>'; return; }
  var parts = [];
  if (urgent) parts.push('<span class="topbar-metric-urgent">' + urgent + ' urgent</span>');
  if (postSess) parts.push('<span class="topbar-metric-val">' + postSess + ' to invoice</span>');
  if (leads) parts.push('<span class="topbar-metric-val">' + leads + ' new lead' + (leads !== 1 ? 's' : '') + '</span>');
  el.innerHTML = parts.join('<span class="topbar-sep">·</span>');
}

function _qSessionItem(sess, barClass) {
  var metaParts = [];
  if (sess.dateLabel) metaParts.push(sess.dateLabel);
  if (sess.timeStr) metaParts.push(sess.timeStr);
  var isUnlinked = !sess.patientId && (!sess.name || sess.name === 'Halaxy appointment');
  var typeLabel = isUnlinked ? 'Personal / Unlinked'
    : (sess.source === 'halaxy' ? 'Client Session' : 'Calendar Appointment');
  var hintMap = {
    'pending-invoice': 'No invoice yet — needs to be created in Halaxy',
    'needs-recording': 'Session not yet recorded — add notes and confirm',
    'invoiced':        'Invoice in Halaxy — awaiting payment',
    'upcoming':        '',
    'paid':            '',
    'cancelled':       '',
  };
  var hintText = isUnlinked ? 'No client linked — personal or admin appointment' : (hintMap[sess.status] || '');
  var pillLabel = { 'pending-invoice': 'No invoice yet', 'needs-recording': 'Needs recording', 'upcoming': 'Upcoming', 'invoiced': 'Invoice unpaid', 'paid': 'Paid', 'cancelled': 'Cancelled' }[sess.status] || sess.status;
  var pillClass = {
    'pending-invoice': 'pending',
    'needs-recording': 'record',
    'upcoming':        'upcoming',
    'invoiced':        'finance',
    'paid':            'paid',
    'cancelled':       'awaiting',
  }[sess.status] || 'awaiting';
  return '<div class="q-item" data-type="session" data-id="' + escHtml(sess.id) + '" onclick="openDetailPanel(\'session\',\'' + escHtml(sess.id) + '\')">'
    + '<div class="q-item-main">'
    + '<div class="q-item-type' + (isUnlinked ? ' is-unlinked' : '') + '">' + typeLabel + '</div>'
    + '<div class="q-item-name">' + escHtml(sess.name || 'Unnamed appointment') + '</div>'
    + '<div class="q-item-meta">' + escHtml(metaParts.join(' · ')) + '</div>'
    + (hintText ? '<div class="q-item-hint">' + escHtml(hintText) + '</div>' : '')
    + '</div>'
    + '<div class="q-item-right">'
    + '<span class="q-pill ' + pillClass + '">' + pillLabel + '</span>'
    + '<span class="q-arrow">›</span>'
    + '</div>'
    + '</div>';
}

function _qEnquiryItem(enq, barClass) {
  var name = [enq.first_name, enq.last_name].filter(Boolean).join(' ') || '—';
  var meta = [];
  if (enq.source) meta.push(enq.source);
  if (enq.service) meta.push(enq.service);
  if (enq.created_at) meta.push(_relativeDate(enq.created_at));
  var CLOSED_REASON_LABELS = { not_interested: 'Not interested', wrong_service: 'Wrong service', no_response: 'No response', converted_elsewhere: 'Converted elsewhere', duplicate: 'Duplicate', other: 'Other' };
  var statusLabels = { new: 'New', contacted: 'Contacted', in_halaxy: 'Awaiting booking', closed: 'Closed' };
  var pillLabel = statusLabels[enq.status] || enq.status || 'New';
  var pillClass = { new: 'lead', contacted: 'triage', in_halaxy: 'finance', closed: 'awaiting' }[enq.status] || 'triage';
  var hintMap = { new: 'Review intake form and make contact', contacted: 'Awaiting response from client', in_halaxy: 'Intake sent — awaiting first appointment', closed: enq.closed_reason ? CLOSED_REASON_LABELS[enq.closed_reason] || enq.closed_reason : 'Closed without converting' };
  var hintText = hintMap[enq.status] || (barClass === 'lead' ? 'Review intake form and make contact' : '');
  return '<div class="q-item" data-type="enquiry" data-id="' + escHtml(enq.id) + '" onclick="openDetailPanel(\'enquiry\',\'' + escHtml(enq.id) + '\')">'
    + '<div class="q-item-main">'
    + '<div class="q-item-type">New Enquiry</div>'
    + '<div class="q-item-name">' + escHtml(name) + '</div>'
    + '<div class="q-item-meta">' + escHtml(meta.join(' · ')) + '</div>'
    + (hintText ? '<div class="q-item-hint">' + escHtml(hintText) + '</div>' : '')
    + '</div>'
    + '<div class="q-item-right">'
    + '<span class="q-pill ' + pillClass + '">' + pillLabel + '</span>'
    + '<span class="q-arrow">›</span>'
    + '</div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════════
   CLIENTS VIEW
   ═══════════════════════════════════════════════════ */

function renderClientsView() {
  var content = document.getElementById('view-content');
  if (!content || !_pipelineData) return;

  // Reset search if not set
  if (window._clientListSearch === undefined) window._clientListSearch = '';

  var supabaseClients = (_pipelineData.clients || []);
  var allEnquiries    = (_pipelineData.enquiries || []);
  var now = new Date();
  var halaxyInvoices = (_halaxyData && _halaxyData.invoices) || [];
  var pm = (_halaxyData && _halaxyData.patientMap) || {};

  // Build invoice index for enrichment
  var byPatient = {};
  halaxyInvoices.forEach(function(inv) {
    var pid = String(inv.patientId || '');
    if (!pid || pid === 'null' || pid === 'undefined') return;
    if (!byPatient[pid]) byPatient[pid] = { invoices: [], lastDate: '' };
    byPatient[pid].invoices.push(inv);
    if ((inv.date || '') > byPatient[pid].lastDate) byPatient[pid].lastDate = inv.date || '';
  });

  // Avatar helpers
  var _avatarGradients = [
    'linear-gradient(145deg,#2A5850,#4A7A70)',
    'linear-gradient(145deg,#3D6FA8,#5888C0)',
    'linear-gradient(145deg,#7A7090,#9A90B0)',
    'linear-gradient(145deg,#BE6E44,#D08A5C)',
    'linear-gradient(145deg,#4A8060,#6AA070)',
    'linear-gradient(145deg,#8A5058,#AA7078)',
  ];
  function _avatarGrad(name) {
    var code = (name || '?').toUpperCase().charCodeAt(0) || 65;
    return _avatarGradients[code % _avatarGradients.length];
  }

  // Current FY start — same window used for invoices and appointments.
  // Anyone seen since 1 Jul is an "active" client; before that = inactive.
  // This matches the practice billing cycle and avoids cutting off clients
  // who come every 6–8 weeks (which would exceed a 90-day window).
  var _fyYear    = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  var _fyStart   = _fyYear + '-07-01';

  // Halaxy is the client database. Supabase holds onboarding records only.
  //
  // Groups:
  //   activeHx   — Halaxy patients with activity this FY (the primary client list)
  //   inactiveHx — Halaxy patients with no FY activity
  //   onboarding — Supabase records with no halaxy_id yet (working toward Halaxy entry)
  //   archived   — Supabase records explicitly archived

  // Fast lookup: halaxy_id → supabase record (for enriching Halaxy clients with notes/type)
  var hxToSupabase = {};
  supabaseClients.forEach(function(c) {
    if (c.halaxy_id) hxToSupabase[String(c.halaxy_id)] = c;
  });

  var onboarding = supabaseClients.filter(function(c) { return !c.halaxy_id && c.active !== false; });
  var archived   = supabaseClients.filter(function(c) { return c.active === false; });

  var halaxyPatients = (_halaxyData && _halaxyData.patients) || [];
  var activeHx   = halaxyPatients.filter(function(p) { var ls = lastSeenHx(p.id); return ls && ls >= _fyStart; })
                     .sort(function(a, b) { return (lastSeenHx(b.id) || '').localeCompare(lastSeenHx(a.id) || ''); });
  var inactiveHx = halaxyPatients.filter(function(p) { var ls = lastSeenHx(p.id); return !ls || ls < _fyStart; });

  // Legacy — keep lastSeen for archived Supabase records
  var allActive = supabaseClients.filter(function(c) { return c.active !== false; });

  // Sort helpers
  function lastSeen(c) {
    var dates = [];
    (c.sessions || []).forEach(function(s) { if (s.session_date) dates.push(s.session_date); });
    if (c.halaxy_id) {
      halaxyInvoices.forEach(function(inv) {
        if (inv.patientId && String(inv.patientId) === String(c.halaxy_id) && inv.date) dates.push(inv.date);
      });
    }
    return dates.length ? dates.reduce(function(max, d) { return d > max ? d : max; }, '') : null;
  }
  function lastSeenHx(hxId) {
    var dates = [];
    halaxyInvoices.forEach(function(inv) {
      if (inv.patientId && String(inv.patientId) === String(hxId) && inv.date) dates.push(inv.date);
    });
    // Also check appointments (catches active patients with no recent invoices yet)
    // Use endsWith() because Halaxy sometimes returns absolute URLs like
    // https://api.halaxy.com/Patient/123 rather than the relative form Patient/123
    var hxAppts = (_halaxyData && _halaxyData.appointments) || [];
    var _patSuffix = 'Patient/' + String(hxId);
    hxAppts.forEach(function(a) {
      var isPatient = (a.participant || []).some(function(pp) {
        var ref = (pp.actor && pp.actor.reference) || '';
        return ref === _patSuffix || ref.endsWith('/' + _patSuffix);
      });
      if (isPatient && a.start) dates.push(a.start.slice(0, 10));
    });
    return dates.length ? dates.reduce(function(max, d) { return d > max ? d : max; }, '') : null;
  }
  // Apply search
  var searchQ = (window._clientListSearch || '').trim().toLowerCase();
  var visibleActiveHx = searchQ
    ? activeHx.filter(function(p) {
        var linked = hxToSupabase[String(p.id)];
        return (p.name || '').toLowerCase().indexOf(searchQ) !== -1
          || (linked && (linked.display_name || '').toLowerCase().indexOf(searchQ) !== -1);
      })
    : activeHx;
  var visibleOnboarding = searchQ
    ? onboarding.filter(function(c) { return (c.display_name || '').toLowerCase().indexOf(searchQ) !== -1; })
    : onboarding;

  var _thisYear = String(new Date().getFullYear());
  function _fmtLastSeen(iso) {
    if (!iso) return 'No activity';
    var opts = { day: 'numeric', month: 'short' };
    if (iso.slice(0, 4) !== _thisYear) opts.year = 'numeric';
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-AU', opts);
  }

  // ── Unified Halaxy client list item ──────────────────────────────────────────
  // Used for ALL Halaxy patients — whether or not they have a linked Supabase record.
  // Name comes from Halaxy. Funder comes from Coverage. Notes/type from Supabase if linked.
  function renderHalaxyClientItem(p) {
    var hid    = String(p.id || '');
    var name   = p.name || 'Unknown';
    var linked = hxToSupabase[hid]; // Supabase enrichment (optional)
    var initials = name.split(' ').map(function(w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase();
    var ls = lastSeenHx(hid);
    var lastDateStr = _fmtLastSeen(ls);

    var funderKey  = _funderFromHalaxy(hid);
    var totalOwing = halaxyInvoices.filter(function(i) { return String(i.patientId) === hid; })
                       .reduce(function(s, i) { return s + (parseFloat(i.totalBalance) || 0); }, 0);

    var tags = '';
    if (linked && linked.client_type) {
      var _tl = linked.client_type === 'couples' ? 'Couples' : linked.client_type === 'child' ? 'Child' : 'Individual';
      tags += '<span class="cl-list-tag type">' + escHtml(_tl) + '</span>';
    }
    if (funderKey) tags += '<span class="cl-list-tag funder">' + escHtml(FUNDER_LABELS[funderKey] || funderKey) + '</span>';
    if (linked && linked.notes) tags += '<span class="cl-list-tag" style="background:#F0EDE8;color:#7A6A54;font-size:10px">Notes</span>';
    if (totalOwing > 0.005) tags += '<span class="cl-list-tag owing">$' + Math.round(totalOwing) + ' owing</span>';

    // Click opens the Supabase-enriched detail if linked, otherwise Halaxy-only detail
    var onclick = linked
      ? 'renderClientDetailView(\'' + escHtml(linked.id) + '\')'
      : 'renderClientDetailView(\'hx:' + escHtml(hid) + '\')';

    return '<div class="cl-list-item" onclick="' + onclick + '">'
      + '<div class="cl-list-av" style="background:' + _avatarGrad(name) + '">' + escHtml(initials) + '</div>'
      + '<div class="cl-list-info"><div class="cl-list-name">' + escHtml(name) + '</div>'
      + '<div class="cl-list-tags">' + tags + '</div></div>'
      + '<div class="cl-list-meta">' + escHtml(lastDateStr) + '</div>'
      + '</div>';
  }

  // ── Onboarding client list item ───────────────────────────────────────────────
  // Supabase-only records not yet mapped to a Halaxy patient.
  function renderOnboardingItem(c) {
    var name     = c.display_name || '—';
    var initials = name.split(' ').map(function(w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase();
    var tags = '';
    var typeLabel = c.is_contact ? 'Contact' : (c.client_type === 'couples' ? 'Couples' : (c.client_type === 'child' ? 'Child' : 'Individual'));
    tags += '<span class="cl-list-tag type">' + escHtml(typeLabel) + '</span>';
    tags += '<span class="cl-list-tag onboarding">Onboarding</span>';
    if (c.funder) tags += '<span class="cl-list-tag funder">' + escHtml(FUNDER_LABELS[c.funder] || c.funder) + '</span>';
    return '<div class="cl-list-item" onclick="renderClientDetailView(\'' + escHtml(c.id || '') + '\')">'
      + '<div class="cl-list-av" style="background:' + _avatarGrad(name) + '">' + escHtml(initials) + '</div>'
      + '<div class="cl-list-info"><div class="cl-list-name">' + escHtml(name) + '</div>'
      + '<div class="cl-list-tags">' + tags + '</div></div>'
      + '<div class="cl-list-meta">Onboarding</div>'
      + '</div>';
  }

  // Return the funder key for a Halaxy patient.
  // Source priority:
  //   1. Halaxy Coverage (bulk-fetched on load) — authoritative
  //   2. Invoice fee name — fallback if no Coverage resource exists
  // Supabase funder is never consulted for Halaxy-linked clients.
  function _funderFromHalaxy(hxId) {
    var id = String(hxId);
    // 1. Coverage map (patientId → raw payor name from Halaxy)
    var pfm = _halaxyData && _halaxyData.patientFunderMap;
    if (pfm && pfm[id]) {
      var key = _mapCoverageToFunderKey(pfm[id]);
      if (key) return key;
    }
    // 2. Fee name from most recent FY invoice
    var patInvs = halaxyInvoices.filter(function(i) { return i.patientId && String(i.patientId) === id; });
    if (patInvs.length) {
      patInvs = patInvs.slice().sort(function(a, b) { return (b.date || '') > (a.date || '') ? 1 : -1; });
      var key2 = _guessFunderKey(patInvs[0].feeName || '');
      if (key2) return key2;
    }
    return null;
  }

  // Build list item HTML — dashboard client
  function renderListItem(c) {
    var initials = (c.display_name || '?').split(' ').map(function(w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase();
    var ls = lastSeen(c);
    var lastDateStr = _fmtLastSeen(ls);
    var invs = c.halaxy_id ? halaxyInvoices.filter(function(i) { return String(i.patientId) === String(c.halaxy_id); }) : [];
    var totalOwing = invs.reduce(function(s, i) { return s + (parseFloat(i.totalBalance) || 0); }, 0);
    var tags = '';
    var typeLabel = c.is_contact ? 'Contact' : (c.client_type === 'couples' ? 'Couples' : (c.client_type === 'child' ? 'Child' : 'Individual'));
    tags += '<span class="cl-list-tag type">' + escHtml(typeLabel) + '</span>';
    // For Halaxy-linked clients use live invoice fee name; fall back to Supabase funder
    var funderKey = c.halaxy_id ? (_funderFromHalaxy(c.halaxy_id) || c.funder) : c.funder;
    if (funderKey) { var fl = FUNDER_LABELS[funderKey] || funderKey; tags += '<span class="cl-list-tag funder">' + escHtml(fl) + '</span>'; }
    if (c.halaxy_id) {
      tags += '<span class="cl-list-tag halaxy-linked">✓ Halaxy</span>';
    } else {
      tags += '<span class="cl-list-tag" style="background:#F5F0EB;color:#8A7060">Dashboard only</span>';
    }
    if (totalOwing > 0.005) tags += '<span class="cl-list-tag owing">$' + Math.round(totalOwing) + ' owing</span>';
    var cid = escHtml(c.id || '');
    return '<div class="cl-list-item" onclick="renderClientDetailView(\'' + cid + '\')">'
      + '<div class="cl-list-av" style="background:' + _avatarGrad(c.display_name) + '">' + escHtml(initials) + '</div>'
      + '<div class="cl-list-info"><div class="cl-list-name">' + escHtml(c.display_name || '—') + '</div>'
      + '<div class="cl-list-tags">' + tags + '</div></div>'
      + '<div class="cl-list-meta">' + escHtml(lastDateStr) + '</div>'
      + '</div>';
  }

  // Build list item HTML — Halaxy-only patient (Group C)
  function renderHalaxyListItem(p) {
    var name = p.name || 'Unknown';
    var initials = name.split(' ').map(function(w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase();
    var ls = lastSeenHx(p.id);
    var lastDateStr = _fmtLastSeen(ls);
    var hid = escHtml(String(p.id || ''));
    var funderKey = _funderFromHalaxy(p.id);
    var tags = '<span class="cl-list-tag" style="background:#EBF1EF;color:#4A7A70">Halaxy</span>';
    if (funderKey) tags += '<span class="cl-list-tag funder">' + escHtml(FUNDER_LABELS[funderKey] || funderKey) + '</span>';
    return '<div class="cl-list-item" style="opacity:0.82" onclick="renderClientDetailView(\'hx:' + hid + '\')">'
      + '<div class="cl-list-av" style="background:' + _avatarGrad(name) + '">' + escHtml(initials) + '</div>'
      + '<div class="cl-list-info"><div class="cl-list-name">' + escHtml(name) + '</div>'
      + '<div class="cl-list-tags">' + tags + '</div></div>'
      + '<div class="cl-list-meta">' + escHtml(lastDateStr) + '</div>'
      + '</div>';
  }

  // ── Upcoming This Week strip ────────────────────────────────
  var appts       = (_halaxyData && _halaxyData.appointments) || [];
  var patientMap  = (_halaxyData && _halaxyData.patientMap) || {};
  var nowUc       = new Date();
  var ucStart     = new Date(nowUc); ucStart.setHours(0,0,0,0);
  var ucEnd       = new Date(ucStart); ucEnd.setDate(ucEnd.getDate() + 7);

  var weekAppts = appts
    .filter(function(a) {
      if (!a.start || a.status === 'cancelled') return false;
      var t = new Date(a.start).getTime();
      return t >= ucStart.getTime() && t < ucEnd.getTime();
    })
    .sort(function(a, b) { return new Date(a.start) - new Date(b.start); })
    .slice(0, 4);

  function _ucAvColor(name) {
    var colors = ['av-blue','av-teal','av-purple','av-amber','av-green','av-red'];
    return colors[(name || '').charCodeAt(0) % colors.length];
  }
  function _ucInitials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  var FUNDER_BADGE_MAP = {
    ndis_plan: ['db-badge-teal','NDIS'],  ndis_self: ['db-badge-teal','NDIS'],
    medicare:  ['db-badge-blue','Medicare'], private: ['db-badge-grey','Private'],
    qfes:      ['db-badge-purple','QFES'], workcover: ['db-badge-amber','WorkCover'],
    dva:       ['db-badge-purple','DVA'],
  };

  var html = '<div class="cl-list-view" style="padding:0">';

  // Upcoming strip
  if (weekAppts.length) {
    html += '<div style="padding:8px 16px 0"><div class="db-sec-hdr"><div class="db-sec-title">Upcoming This Week</div><div class="db-sec-count info">' + weekAppts.length + '</div><div class="db-sec-divider"></div></div></div>';
    html += '<div style="padding:0 16px"><div class="db-upcoming-strip">';
    weekAppts.forEach(function(a) {
      var d        = new Date(a.start);
      var dayName  = d.toLocaleDateString('en-AU', { weekday: 'long' });
      var dayNum   = d.getDate();
      var timeStr  = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Brisbane' });
      var patientId = '';
      (a.participant || []).forEach(function(p) {
        var ref = (p.actor && p.actor.reference) || '';
        if (ref.startsWith('Patient/')) patientId = ref.replace('Patient/', '');
      });
      var name     = patientMap[patientId] || 'Client';
      var av       = _ucAvColor(name);
      var ini      = _ucInitials(name);
      var funder   = a.funder || '';
      var bMap     = FUNDER_BADGE_MAP[funder];
      var fBadge   = bMap ? '<span class="db-badge ' + bMap[0] + '" style="font-size:10px">' + bMap[1] + '</span>' : '';
      html += '<div class="glass db-uc-card" onclick="_openClientFromAppt(\'' + escHtml(patientId) + '\')">'
        + '<div class="db-uc-day">' + dayName + '</div>'
        + '<div class="db-uc-date">' + dayNum + '</div>'
        + '<div class="db-uc-sep"></div>'
        + '<div class="db-uc-av-row"><div class="db-uc-av ' + av + '">' + ini + '</div>'
        + '<div><div class="db-uc-name">' + escHtml(name) + '</div><div class="db-uc-time">' + timeStr + '</div></div></div>'
        + '<div class="db-uc-foot">' + fBadge + '</div>'
        + '</div>';
    });
    html += '</div></div>';
  }

  // All clients section header
  html += '<div style="padding:4px 16px 0"><div class="db-sec-hdr"><div class="db-sec-title">All Clients</div><div class="db-sec-count">' + (visibleActiveHx.length + visibleOnboarding.length) + '</div><div class="db-sec-divider"></div>'
    + '<input type="search" placeholder="Search…" value="' + escHtml(window._clientListSearch || '') + '"'
    + ' oninput="window._clientListSearch=this.value;renderClientsView()"'
    + ' style="padding:6px 11px;background:var(--n-bg);border:none;border-radius:8px;font-family:inherit;font-size:12px;outline:none;box-shadow:inset 2px 2px 5px var(--n-sd),inset -2px -2px 5px var(--n-sl);color:var(--db-text);width:180px">'
    + '</div></div>';

  // List
  html += '<div class="cl-list" style="padding:4px 16px 80px;gap:4px;display:flex;flex-direction:column">';
  if (!visibleActiveHx.length && !visibleOnboarding.length) {
    html += '<div class="cl-list-empty">' + (searchQ ? 'No clients match your search' : 'No clients yet') + '</div>';
  } else {
    // Primary: all active Halaxy clients (no section label — this IS the client list)
    if (visibleActiveHx.length) {
      html += visibleActiveHx.map(renderHalaxyClientItem).join('');
    }
    // Onboarding: Supabase-only records not yet in Halaxy
    if (visibleOnboarding.length) {
      html += '<div style="font-size:10.5px;color:#9AABA8;padding:14px 14px 4px;letter-spacing:.04em;text-transform:uppercase">Onboarding</div>';
      html += visibleOnboarding.map(renderOnboardingItem).join('');
    }
  }

  // Inactive — Halaxy patients with no activity this FY (collapsed)
  if (inactiveHx.length) {
    var inactOpen = window._clientsInactiveOpen;
    html += '<div style="margin-top:16px">';
    html += '<button class="q-section-toggle" style="font-size:11px;color:#9AABA8;background:none;border:none;cursor:pointer;padding:4px 2px"'
      + ' onclick="window._clientsInactiveOpen=!window._clientsInactiveOpen;renderClientsView()">'
      + (inactOpen ? '▾' : '▸') + ' Inactive — no activity this FY (' + inactiveHx.length + ')'
      + '</button>';
    if (inactOpen) {
      html += '<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">';
      html += inactiveHx.map(renderHalaxyClientItem).join('');
      html += '</div>';
    }
    html += '</div>';
  }

  // Archived section
  if (archived.length) {
    var archOpen = window._clientsArchiveOpen;
    html += '<div style="margin-top:8px">';
    html += '<button class="q-section-toggle" style="font-size:11px;color:#9AABA8;background:none;border:none;cursor:pointer;padding:4px 2px"'
      + ' onclick="window._clientsArchiveOpen=!window._clientsArchiveOpen;renderClientsView()">'
      + (archOpen ? '▾' : '▸') + ' Archived (' + archived.length + ')'
      + '</button>';
    if (archOpen) {
      html += '<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">' + archived.map(renderListItem).join('') + '</div>';
    }
    html += '</div>';
  }

  html += '</div>'; // cl-list
  html += '</div>'; // cl-list-view
  content.innerHTML = html;
}

function _renderHalaxyOnlyDetail(content, hxId) {
  var patients = (_halaxyData && _halaxyData.patients) || [];
  var p = patients.find(function(x) { return String(x.id) === String(hxId); });
  var name = (p && p.name) || ('Patient #' + hxId);
  var halaxyInvoices = (_halaxyData && _halaxyData.invoices) || [];
  var halaxyAppts    = (_halaxyData && _halaxyData.appointments) || [];

  var initials = name.split(' ').map(function(w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase();
  var gradients = ['linear-gradient(145deg,#2A5850,#4A7A70)','linear-gradient(145deg,#3D6FA8,#5888C0)','linear-gradient(145deg,#7A7090,#9A90B0)','linear-gradient(145deg,#BE6E44,#D08A5C)','linear-gradient(145deg,#4A8060,#6AA070)','linear-gradient(145deg,#8A5058,#AA7078)'];
  var grad = gradients[(name.toUpperCase().charCodeAt(0) || 65) % gradients.length];

  var _tod2 = new Date();
  var _fyStart2 = (_tod2.getMonth() >= 6 ? _tod2.getFullYear() : _tod2.getFullYear() - 1) + '-07-01';

  var allHxInvoices = halaxyInvoices.filter(function(i) { return String(i.patientId) === String(hxId); })
    .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  var clientInvoices = allHxInvoices.filter(function(i) { return (i.date || '') >= _fyStart2; });

  var _hxPatientRef = 'Patient/' + hxId;
  var clientAppts = halaxyAppts.filter(function(a) {
    return (a.participant || []).some(function(pp) {
      var ref = (pp.actor && pp.actor.reference) || '';
      return ref === _hxPatientRef || ref.endsWith('/' + _hxPatientRef);
    });
  }).sort(function(a, b) { return (b.start || '').localeCompare(a.start || ''); });

  var totalPaid  = allHxInvoices.reduce(function(s, i) { return s + (parseFloat(i.totalPaid)    || 0); }, 0);
  var totalOwing = allHxInvoices.reduce(function(s, i) { return s + (parseFloat(i.totalBalance) || 0); }, 0);
  var fyPaid2    = clientInvoices.reduce(function(s, i)  { return s + (parseFloat(i.totalPaid)    || 0); }, 0);

  var html = '<div class="cl-detail-view">';
  html += '<button class="cl-detail-back" onclick="renderClientsView()">← Clients</button>';
  html += '<div class="cl-detail-hd">'
    + '<div class="cl-detail-av" style="background:' + grad + '">' + escHtml(initials) + '</div>'
    + '<div class="cl-detail-hd-info">'
    + '<div class="cl-detail-hd-name">' + escHtml(name) + '</div>'
    + '<div class="cl-detail-hd-tags"><span class="cl-list-tag" style="background:#EBF1EF;color:#4A7A70">Halaxy</span>'
    + '<a href="https://au.halaxy.com/app/clients/' + escHtml(String(hxId)) + '" target="_blank" rel="noopener"'
    + ' style="font-size:10px;color:var(--teal);text-decoration:none;font-weight:600;padding:2px 7px;border-radius:99px;background:rgba(42,88,80,0.10)">Open in Halaxy ↗</a>'
    + '</div></div></div>';

  html += '<div class="cl-detail-body">';

  // Summary row
  html += '<div class="cl-detail-section"><div class="cl-detail-sec-title">Overview</div>'
    + '<div class="cl-detail-row"><span class="cl-detail-row-label">Halaxy ID</span><span class="cl-detail-row-val">' + escHtml(String(hxId)) + '</span></div>';
  html += '<div id="cl-hx-totals-' + escHtml(String(hxId)) + '">'
    + (totalPaid > 0 ? '<div class="cl-detail-row"><span class="cl-detail-row-label">Total paid</span><span class="cl-detail-row-val">$' + totalPaid.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div>' : '')
    + (totalOwing > 0.005 ? '<div class="cl-detail-row"><span class="cl-detail-row-label">Outstanding</span><span class="cl-detail-row-val" style="color:var(--amber)">$' + totalOwing.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div>' : '')
    + '</div>';
  html += '</div>';

  // Appointments — independent from invoices; always show section
  html += '<div class="cl-detail-section"><div class="cl-detail-sec-title">Appointments this FY'
    + (clientAppts.length ? ' (' + clientAppts.length + ')' : '') + '</div>';
  if (clientAppts.length) {
    var _sm = { fulfilled: 'attended', cancelled: 'cancelled', noshow: 'no show', arrived: 'arrived', 'checked-in': 'checked in', proposed: 'pending', pending: 'pending', booked: 'booked', waitlist: 'waitlist' };
    clientAppts.forEach(function(a) {
      var dateStr = a.start ? new Date(a.start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Brisbane' }) : '—';
      var timeStr = a.start ? new Date(a.start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Brisbane' }) : '';
      var apptType = (a.appointmentType && a.appointmentType.text) || '';
      var raw = a.status || 'booked';
      var statusLbl = _sm[raw] || raw;
      var statusCls = (raw === 'fulfilled') ? 'attended' : (raw === 'cancelled' || raw === 'noshow') ? 'cancelled' : '';
      html += '<div class="cl-detail-appt-row"><span class="cl-detail-appt-date">' + escHtml(dateStr) + '</span>'
        + '<span class="cl-detail-appt-time">' + escHtml(timeStr) + (apptType ? ' · ' + escHtml(apptType) : '') + '</span>'
        + '<span class="cl-detail-appt-badge ' + statusCls + '">' + escHtml(statusLbl) + '</span></div>';
    });
  } else {
    html += '<div style="padding:12px 0;font-size:12.5px;color:#9AABA8">No appointments in Halaxy this FY</div>';
  }
  html += '</div>';

  // Invoices — lazy-loaded per-patient so org-billed invoices (QFES, WorkCover) are included
  html += '<div id="cl-hx-invoices-' + escHtml(String(hxId)) + '" class="cl-detail-section">'
    + '<div class="cl-detail-sec-title">Invoices this FY</div>'
    + '<div style="padding:12px 0;font-size:12.5px;color:#9AABA8">Loading…</div>'
    + '</div>';

  html += '</div></div>';
  content.innerHTML = html;
  _fetchHalaxyInvoices(String(hxId));
}

async function _fetchHalaxyCoverage(hxId) {
  var el = document.getElementById('cl-hx-funder-' + hxId);
  if (!el) return;
  try {
    var data = await apiFetch('/api/admin-enquiries?halaxy_coverage=' + encodeURIComponent(hxId));
    var coverage = (data && data.coverage) || [];
    if (coverage.length) {
      // Map payor display name to our known funder keys
      var payor = coverage[0].payor || coverage[0].typeText || '';
      var funderKey = _guessFunderKey(payor);
      var label = (funderKey && FUNDER_LABELS[funderKey]) ? FUNDER_LABELS[funderKey] : (payor || '—');
      el.innerHTML = escHtml(label)
        + ' <span style="font-size:10px;color:#9AABA8;margin-left:4px">Halaxy</span>'
        + ' <button onclick="_editHalaxyCoverage(' + hxId + ')" style="font-size:10px;background:none;border:none;color:var(--teal);cursor:pointer;padding:0 4px">Edit</button>';
    } else {
      el.innerHTML = '<span style="color:#9AABA8">Not set in Halaxy</span>'
        + ' <button onclick="_editHalaxyCoverage(' + hxId + ')" style="font-size:10px;background:none;border:none;color:var(--teal);cursor:pointer;padding:0 4px;font-weight:600">+ Set funder</button>';
    }
  } catch (e) {
    el.innerHTML = '<span style="color:#9AABA8">Could not load</span>';
  }
}

/* Resolve a payorOrg string (which may be a raw Halaxy ID like "OG-2358831")
   to a human-readable label. Returns null if the invoice is patient-direct. */
function _resolvePayorLabel(payorOrg) {
  if (!payorOrg) return null;
  // Try text-based funder key first (works when payorOrg = "QFES", "Medicare", etc.)
  var fk = _guessFunderKey(payorOrg);
  if (fk) return FUNDER_LABELS[fk] || payorOrg;
  // Try direct ID lookup in _halaxyFunders (handles FD-xxxxx / OG-xxxxx stored with real IDs)
  var funders = _halaxyFunders || [];
  var byId = funders.find(function(f) { return f.id === payorOrg || f.halaxyId === payorOrg; });
  if (byId) return FUNDER_LABELS[byId.billingKey] || byId.name || payorOrg;
  // Looks like a raw org ID but couldn't resolve — show "Org invoice" rather than the ID
  if (/^[A-Za-z]{2,4}-\d{3,}$/.test(payorOrg.trim())) return 'Org invoice';
  return payorOrg; // some other string, show as-is
}

async function _fetchHalaxyInvoices(hxId) {
  var invEl    = document.getElementById('cl-hx-invoices-' + hxId);
  var totalsEl = document.getElementById('cl-hx-totals-' + hxId);
  if (!invEl && !totalsEl) return;

  try {
    var data     = await apiFetch('/api/admin-enquiries?halaxy_patient_invoices=' + encodeURIComponent(hxId));
    var invoices = (data && data.invoices) || [];

    // FY boundary
    var _tod = new Date();
    var _fyStart = (_tod.getMonth() >= 6 ? _tod.getFullYear() : _tod.getFullYear() - 1) + '-07-01';

    var allInvs  = invoices.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var fyInvs   = allInvs.filter(function(i) { return (i.date || '') >= _fyStart; });

    // If Halaxy's patient-filter didn't return org-billed invoices, fall back to the
    // bulk invoice data (which uses appointment-date matching to link org invoices).
    if (!fyInvs.length && _halaxyData && _halaxyData.invoices) {
      var bulkForPatient = _halaxyData.invoices.filter(function(i) {
        return String(i.patientId) === String(hxId) && (i.date || '') >= _fyStart;
      });
      if (bulkForPatient.length) {
        fyInvs  = bulkForPatient;
        allInvs = _halaxyData.invoices.filter(function(i) { return String(i.patientId) === String(hxId); });
      }
    }
    var totalPaid  = allInvs.reduce(function(s, i) { return s + (parseFloat(i.totalPaid)    || 0); }, 0);
    var totalOwing = allInvs.reduce(function(s, i) { return s + (parseFloat(i.totalBalance) || 0); }, 0);
    var fyPaid     = fyInvs.reduce(function(s, i)  { return s + (parseFloat(i.totalPaid)    || 0); }, 0);

    // Update totals block
    if (totalsEl) {
      var totHtml = '';
      if (totalPaid > 0)     totHtml += '<div class="cl-detail-row"><span class="cl-detail-row-label">Total paid</span><span class="cl-detail-row-val">$' + totalPaid.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div>';
      if (totalOwing > 0.005) totHtml += '<div class="cl-detail-row"><span class="cl-detail-row-label">Outstanding</span><span class="cl-detail-row-val" style="color:var(--amber)">$' + totalOwing.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div>';
      totalsEl.innerHTML = totHtml;
    }

    // Update invoice list
    if (invEl) {
      var title = '<div class="cl-detail-sec-title">Invoices this FY'
        + (fyInvs.length ? ' (' + fyInvs.length + ')' : '')
        + (fyPaid > 0 ? ' <span style="font-size:11px;color:#7A948F;font-weight:400;margin-left:8px">$' + fyPaid.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' paid</span>' : '')
        + '</div>';
      if (!fyInvs.length) {
        invEl.innerHTML = title + '<div style="padding:12px 0;font-size:12.5px;color:#9AABA8">No invoices in the current financial year</div>';
      } else {
        var rows = fyInvs.map(function(inv) {
          var dateStr  = inv.date ? fmtDate(inv.date) : '—';
          var amount   = parseFloat(inv.amount || 0);
          var owing    = parseFloat(inv.totalBalance || 0);
          var isPaid   = owing === 0 && parseFloat(inv.totalPaid || 0) > 0;
          // Fold owing amount into badge — avoids "$1000.00  $1000.00 owing  owing"
          var statusLbl = isPaid ? 'paid' : (owing > 0.005 ? '$' + owing.toFixed(2) + ' owing' : (inv.status || 'active'));
          var statusCls = isPaid ? 'paid' : (owing > 0.005 ? 'owing' : 'active');
          // Show org payor label if not patient-direct
          var payorBadge = '';
          var payorLabel2 = _resolvePayorLabel(inv.payorOrg);
          if (payorLabel2) {
            payorBadge = '<span style="font-size:10px;color:#7A50A0;margin-left:4px">' + escHtml(payorLabel2) + '</span>';
          }
          return '<div class="cl-detail-inv-row">'
            + '<span style="flex:1;font-size:12px;color:#7A948F">' + escHtml(dateStr) + '</span>'
            + '<span style="font-weight:600;color:#1A2F2B">' + (amount > 0 ? '$' + amount.toFixed(2) : '—') + '</span>'
            + payorBadge
            + '<span class="cl-detail-inv-badge ' + statusCls + '">' + escHtml(statusLbl) + '</span></div>';
        }).join('');
        invEl.innerHTML = title + rows;
      }
    }
  } catch (e) {
    if (invEl) invEl.innerHTML = '<div class="cl-detail-sec-title">Invoices this FY</div>'
      + '<div style="padding:12px 0;font-size:12.5px;color:#9AABA8">Could not load</div>';
  }
}

function _guessFunderKey(payorStr) {
  var s = (payorStr || '').toLowerCase();

  // If the string is a URL (Halaxy reference) or a bare org ID like "FD-765771" / "OG-2358831",
  // try to resolve it via the loaded funders list before text-matching.
  if (s.includes('halaxy.com/') || /^[A-Za-z]{2,4}-\d{3,}$/i.test((payorStr || '').trim())) {
    var orgId = (payorStr || '').split('/').pop().trim();
    var funders = _halaxyFunders || [];
    var match = funders.find(function(f) { return f.id === orgId; });
    if (match && match.billingKey) return match.billingKey;
    // Couldn't resolve — extract just the ID and fall through to text matching
    s = orgId.toLowerCase();
  }

  if (s.includes('medicare'))                                                                             return 'medicare';
  // Bupa in Halaxy = DVA/ADFHSC for this practice
  if (s.includes('dva') || s.includes('defence') || s.includes('veteran') || s.includes('adfhcs') || s.includes('bupa')) return 'dva';
  // All NDIS orgs this practice bills are plan managers
  if (s.includes('ndis') || s.includes('plan manag') || s.includes('plan-manag') || s.includes('in choice') || s.includes('future by design') || s.includes('alliance plan') || s.includes('purple leopard') || s.includes('freedom plan') || s.includes('individualised community') || s.includes('ndsp')) return 'ndis_plan';
  if (s.includes('qfes') || s.includes('queensland fire') || s.includes('fire and emergency') || (s.includes('eap') && !s.includes('ndis'))) return 'qfes';
  if (s.includes('workcover') || s.includes('work cover') || s.includes('worksafe') || s.includes('returntowork') || s.includes('return to work') || s.includes('compensation')) return 'workcover';
  if (s.includes('private') || s.includes('self pay') || s.includes('self-pay'))                        return 'private';
  return null;
}

async function _editHalaxyCoverage(hxId) {
  // Build funder options from loaded Halaxy funders + known list
  var funders = (_halaxyFunders && _halaxyFunders.length) ? _halaxyFunders : [];
  var options = Object.keys(FUNDER_LABELS).map(function(k) {
    // Try to match to a Halaxy org
    var hxFunder = funders.find(function(f) { return (f.billingKey === k) || (f.name && f.name.toLowerCase().includes(k)); });
    return { key: k, label: FUNDER_LABELS[k], payorId: hxFunder ? hxFunder.id : null, payorName: hxFunder ? hxFunder.name : FUNDER_LABELS[k] };
  });
  var chosen = prompt('Set funder for this client:\n' + options.map(function(o, i) { return (i+1) + '. ' + o.label; }).join('\n') + '\n\nEnter number:');
  if (!chosen) return;
  var idx = parseInt(chosen, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= options.length) return toast('Invalid selection', 'err');
  var opt = options[idx];
  try {
    await apiFetch('/api/admin-enquiries?halaxy_coverage=1', { method: 'POST', body: { patientId: String(hxId), payorId: opt.payorId, payorName: opt.payorName } });
    toast('Funder set to ' + opt.label + ' in Halaxy');
    _fetchHalaxyCoverage(hxId); // refresh the display
  } catch (e) {
    toast('Could not set funder: ' + e.message, 'err');
  }
}

function renderClientDetailView(clientId) {
  var content = document.getElementById('view-content');
  if (!content || !_pipelineData) return;

  // Halaxy-only patient (Group C) — prefixed with "hx:"
  if (String(clientId).indexOf('hx:') === 0) {
    var hxId = String(clientId).slice(3);
    return _renderHalaxyOnlyDetail(content, hxId);
  }

  var c = (_pipelineData.clients || []).find(function(x) { return String(x.id) === String(clientId); });
  if (!c) {
    content.innerHTML = '<div style="padding:20px;color:#9AABA8">Client not found</div>';
    return;
  }

  var halaxyInvoices = (_halaxyData && _halaxyData.invoices) || [];
  var halaxyAppts    = (_halaxyData && _halaxyData.appointments) || [];
  var allEnquiries   = (_pipelineData.enquiries || []);

  // Avatar helpers (local)
  var _avatarGradients = [
    'linear-gradient(145deg,#2A5850,#4A7A70)',
    'linear-gradient(145deg,#3D6FA8,#5888C0)',
    'linear-gradient(145deg,#7A7090,#9A90B0)',
    'linear-gradient(145deg,#BE6E44,#D08A5C)',
    'linear-gradient(145deg,#4A8060,#6AA070)',
    'linear-gradient(145deg,#8A5058,#AA7078)',
  ];
  function _avatarGrad(name) {
    var code = (name || '?').toUpperCase().charCodeAt(0) || 65;
    return _avatarGradients[code % _avatarGradients.length];
  }

  var initials = (c.display_name || '?').split(' ').map(function(w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase();

  // Filter Halaxy data for this client
  // Current FY start: 1 Jul of the FY that contains today
  var _today = new Date();
  var _fyStart = (_today.getMonth() >= 6 ? _today.getFullYear() : _today.getFullYear() - 1) + '-07-01';

  var allClientInvoices = c.halaxy_id
    ? halaxyInvoices.filter(function(i) { return String(i.patientId) === String(c.halaxy_id); })
      .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); })
    : [];
  // Show only current-FY invoices in the detail view
  var clientInvoices = allClientInvoices.filter(function(i) { return (i.date || '') >= _fyStart; });

  var _patientRefSuffix = 'Patient/' + c.halaxy_id;
  var clientAppts = c.halaxy_id
    ? halaxyAppts.filter(function(a) {
        return (a.participant || []).some(function(p) {
          var ref = (p.actor && p.actor.reference) || '';
          return ref === _patientRefSuffix || ref.endsWith('/' + _patientRefSuffix);
        });
      }).sort(function(a, b) { return (b.start || '').localeCompare(a.start || ''); })
    : [];

  // Linked enquiry
  var linkedEnq = c.enquiry_id
    ? allEnquiries.find(function(e) { return String(e.id) === String(c.enquiry_id); })
    : null;

  // Financials — use all invoices for lifetime totals but FY slice for detail list
  var totalPaid    = allClientInvoices.reduce(function(s, i) { return s + (parseFloat(i.totalPaid)    || 0); }, 0);
  var totalOwing   = allClientInvoices.reduce(function(s, i) { return s + (parseFloat(i.totalBalance) || 0); }, 0);
  var fyPaid       = clientInvoices.reduce(function(s, i) { return s + (parseFloat(i.totalPaid)       || 0); }, 0);
  var funderLabel  = FUNDER_LABELS[c.funder] || c.funder || '—';

  // Header tags
  var headerTags = '';
  var typeLabel = c.is_contact ? 'Contact' : (c.client_type === 'couples' ? 'Couples' : (c.client_type === 'child' ? 'Child' : 'Individual'));
  headerTags += '<span class="cl-list-tag type">' + escHtml(typeLabel) + '</span>';
  if (c.funder) headerTags += '<span class="cl-list-tag funder">' + escHtml(funderLabel) + '</span>';
  if (c.is_contact) headerTags += '<span class="cl-list-tag contact">Contact</span>';
  // Halaxy-linked vs dashboard-only indicator
  if (c.halaxy_id) {
    headerTags += '<span class="cl-list-tag halaxy-linked">✓ Halaxy</span>';
    headerTags += '<a href="https://au.halaxy.com/app/clients/' + escHtml(String(c.halaxy_id)) + '" target="_blank" rel="noopener"'
      + ' style="font-size:10px;color:var(--teal);text-decoration:none;font-weight:600;padding:2px 7px;border-radius:99px;background:rgba(42,88,80,0.10)">'
      + 'Open in Halaxy ↗</a>';
  } else {
    headerTags += '<span class="cl-list-tag" style="background:#F5F0EB;color:#8A7060">Dashboard only</span>';
  }

  var html = '<div class="cl-detail-view">';

  // Back button
  html += '<button class="cl-detail-back" onclick="renderClientsView()">← Clients</button>';

  // Header
  html += '<div class="cl-detail-hd">'
    + '<div class="cl-detail-av" style="background:' + _avatarGrad(c.display_name) + '">' + escHtml(initials) + '</div>'
    + '<div class="cl-detail-hd-info">'
    + '<div class="cl-detail-hd-name">' + escHtml(c.display_name || '—') + '</div>'
    + '<div class="cl-detail-hd-tags">' + headerTags + '</div>'
    + '</div>'
    + '</div>';

  html += '<div class="cl-detail-body">';

  // Overview section
  html += '<div class="cl-detail-section">'
    + '<div class="cl-detail-sec-title">Overview</div>'
    + '<div class="cl-detail-row"><span class="cl-detail-row-label">Halaxy ID</span><span class="cl-detail-row-val">' + escHtml(c.halaxy_id ? String(c.halaxy_id) : 'None') + '</span></div>';
  if (c.halaxy_id) {
    // Funder comes from Halaxy Coverage — fetched async below
    html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Funder</span>'
      + '<span class="cl-detail-row-val" id="cl-hx-funder-' + escHtml(String(c.halaxy_id)) + '">'
      + '<span style="color:#9AABA8">Loading…</span></span></div>';
  } else {
    html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Funder</span>'
      + '<span class="cl-detail-row-val">' + escHtml(funderLabel) + '</span></div>';
  }
  if (c.plan_manager) {
    html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Plan manager</span><span class="cl-detail-row-val">' + escHtml(c.plan_manager) + '</span></div>';
  }
  if (c.created_at) {
    html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Client since</span><span class="cl-detail-row-val">' + fmtDate(c.created_at) + '</span></div>';
  }
  if (c.halaxy_id) {
    // Totals are lazy-loaded — placeholder shows bulk-data estimate (updated by _fetchHalaxyInvoices)
    html += '<div id="cl-hx-totals-' + escHtml(String(c.halaxy_id)) + '">'
      + (totalPaid > 0 ? '<div class="cl-detail-row"><span class="cl-detail-row-label">Total paid</span><span class="cl-detail-row-val">$' + totalPaid.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div>' : '')
      + (totalOwing > 0.005 ? '<div class="cl-detail-row"><span class="cl-detail-row-label">Outstanding</span><span class="cl-detail-row-val" style="color:var(--amber)">$' + totalOwing.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div>' : '')
      + '</div>';
  } else {
    if (totalPaid > 0) html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Total paid</span><span class="cl-detail-row-val">$' + totalPaid.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div>';
    if (totalOwing > 0.005) html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Outstanding</span><span class="cl-detail-row-val" style="color:var(--amber)">$' + totalOwing.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div>';
  }
  if (c.notes) {
    html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Notes</span><span class="cl-detail-row-val" style="text-align:left;max-width:70%">' + escHtml(c.notes) + '</span></div>';
  }
  html += '</div>';

  // Onboarding section (only if linked enquiry)
  if (linkedEnq) {
    html += '<div class="cl-detail-section">'
      + '<div class="cl-detail-sec-title">Onboarding</div>';
    if (linkedEnq.source) {
      html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Source</span><span class="cl-detail-row-val">' + escHtml(linkedEnq.source) + '</span></div>';
    }
    if (linkedEnq.service) {
      html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Service</span><span class="cl-detail-row-val">' + escHtml(linkedEnq.service) + '</span></div>';
    }
    if (linkedEnq.created_at) {
      html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Enquiry date</span><span class="cl-detail-row-val">' + fmtDate(linkedEnq.created_at) + '</span></div>';
    }
    if (linkedEnq.intake_funder) {
      html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Intake funder</span><span class="cl-detail-row-val">' + escHtml(FUNDER_LABELS[linkedEnq.intake_funder] || linkedEnq.intake_funder) + '</span></div>';
    }
    if (linkedEnq.notes) {
      html += '<div class="cl-detail-row"><span class="cl-detail-row-label">Notes</span><span class="cl-detail-row-val" style="text-align:left;max-width:70%">' + escHtml(linkedEnq.notes) + '</span></div>';
    }
    html += '</div>';
  }

  // Appointments section — always show (appointments and invoices are independent;
  // a session may be free/cancelled with no invoice, or an invoice may exist without
  // a formal Halaxy appointment)
  if (c.halaxy_id) {
    html += '<div class="cl-detail-section"><div class="cl-detail-sec-title">Appointments this FY'
      + (clientAppts.length ? ' (' + clientAppts.length + ')' : '') + '</div>';
    if (clientAppts.length) {
      clientAppts.forEach(function(a) {
        var dateStr = a.start ? new Date(a.start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Brisbane' }) : '—';
        var timeStr = a.start ? new Date(a.start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Brisbane' }) : '';
        var apptType = (a.appointmentType && a.appointmentType.text) || '';
        var raw = a.status || 'booked';
        var _apptStatusMap = { fulfilled: 'attended', cancelled: 'cancelled', noshow: 'no show', arrived: 'arrived', 'checked-in': 'checked in', proposed: 'pending', pending: 'pending', booked: 'booked', waitlist: 'waitlist' };
        var statusLbl = _apptStatusMap[raw] || raw;
        var statusCls = (raw === 'fulfilled') ? 'attended' : (raw === 'cancelled' || raw === 'noshow') ? 'cancelled' : '';
        html += '<div class="cl-detail-appt-row">'
          + '<span class="cl-detail-appt-date">' + escHtml(dateStr) + '</span>'
          + '<span class="cl-detail-appt-time">' + escHtml(timeStr) + (apptType ? ' · ' + escHtml(apptType) : '') + '</span>'
          + '<span class="cl-detail-appt-badge ' + statusCls + '">' + escHtml(statusLbl) + '</span>'
          + '</div>';
      });
    } else {
      html += '<div style="padding:12px 0;font-size:12.5px;color:#9AABA8">No appointments in Halaxy this FY</div>';
    }
    html += '</div>';
  }

  // Invoices section — lazy-loaded per patient so org-billed invoices are included
  if (c.halaxy_id) {
    html += '<div id="cl-hx-invoices-' + escHtml(String(c.halaxy_id)) + '" class="cl-detail-section">'
      + '<div class="cl-detail-sec-title">Invoices this FY</div>'
      + '<div style="padding:12px 0;font-size:12.5px;color:#9AABA8">Loading…</div>'
      + '</div>';
  }

  // Actions
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:4px">';
  if (c.id) {
    html += '<button class="rdp-ghost-btn" style="width:auto;padding:9px 18px" onclick="openClientEditPanel(\'' + escHtml(c.id) + '\')">Edit</button>';
  }
  if (!c.halaxy_id && c.id) {
    // Onboarding client — not yet in Halaxy
    html += '<button class="rdp-ghost-btn" style="width:auto;padding:9px 18px;border-color:var(--teal);color:var(--teal)" onclick="openMapToHalaxy(\'' + escHtml(c.id) + '\')">Map to Halaxy →</button>';
  }
  if (c.halaxy_id) {
    html += '<button class="rdp-ghost-btn" style="width:auto;padding:9px 18px" onclick="navigateTo(\'billing\')">View in Billing</button>';
  }
  html += '</div>';

  html += '</div>'; // cl-detail-body
  html += '</div>'; // cl-detail-view
  content.innerHTML = html;

  // Fetch Halaxy Coverage + accurate invoices for linked clients
  if (c.halaxy_id) {
    _fetchHalaxyCoverage(c.halaxy_id);
    _fetchHalaxyInvoices(String(c.halaxy_id));
  }
}

// ── Legacy renderClientsView data setup (kept for backward compatibility with the old card-based view) ──
function _renderClientsViewLegacy() {
  var content = document.getElementById('view-content');
  if (!content || !_pipelineData) return;

  var supabaseClients = (_pipelineData.clients || []);
  var allEnquiries    = (_pipelineData.enquiries || []);
  var now = new Date();
  var cutoff90    = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  var cutoff90Str = cutoff90.toISOString().slice(0, 10);
  var halaxyInvoices = (_halaxyData && _halaxyData.invoices) || [];
  var pm = (_halaxyData && _halaxyData.patientMap) || {};

  // ── Build Halaxy-only patients (those NOT linked to any Supabase client) ──
  // Source: full patient list from Halaxy (all active patients, not just those with invoices/appts).
  // This makes the dashboard Halaxy-first: every Halaxy patient is visible here.
  var linkedHalaxyIds = new Set(
    supabaseClients.map(function(c) { return String(c.halaxy_id || ''); }).filter(Boolean)
  );

  // Build invoice/activity index for enrichment
  var byPatient = {};
  halaxyInvoices.forEach(function(inv) {
    var pid = String(inv.patientId || '');
    if (!pid || pid === 'null' || pid === 'undefined') return;
    if (!byPatient[pid]) byPatient[pid] = { invoices: [], lastDate: '' };
    byPatient[pid].invoices.push(inv);
    if ((inv.date || '') > byPatient[pid].lastDate) byPatient[pid].lastDate = inv.date || '';
  });
  // Pull appointment dates into lastDate too
  Object.keys(pm).forEach(function(pid) {
    if (!byPatient[pid]) byPatient[pid] = { invoices: [], lastDate: '' };
  });

  // Full patient list is the primary source — include every unlinked patient
  var allHalaxyPatients = (_halaxyData && _halaxyData.patients) || [];
  var halaxyOnlyClients = allHalaxyPatients
    .filter(function(p) { return p.id && !linkedHalaxyIds.has(String(p.id)); })
    .map(function(p) {
      var pid  = String(p.id);
      var rec  = byPatient[pid] || { invoices: [], lastDate: '' };
      var invs = rec.invoices;
      var hasActivity = invs.length > 0 || !!pm[pid];
      return {
        id: null, halaxy_id: pid,
        display_name: p.name || pm[pid] || ('Patient #' + pid),
        sessions: [], funder: null, active: true,
        _isHalaxyOnly: true,
        _hasActivity:  hasActivity,
        _invoiceCount: invs.length,
        _lastDate:     rec.lastDate,
        _totalOwing:   invs.reduce(function(s, i) { return s + (parseFloat(i.totalBalance) || 0); }, 0),
        _totalPaid:    invs.reduce(function(s, i) { return s + (parseFloat(i.totalPaid)    || 0); }, 0),
      };
    });

  // ── All clients = Supabase clients + Halaxy-only ──
  // ── Verified Halaxy patient IDs (from full patient list + patientMap) ──
  var _halaxyPatientIds = new Set();
  ((_halaxyData && _halaxyData.patients) || []).forEach(function(p) { if (p.id) _halaxyPatientIds.add(String(p.id)); });
  if (_halaxyData && _halaxyData.patientMap) {
    Object.keys(_halaxyData.patientMap).forEach(function(k) { _halaxyPatientIds.add(k); });
  }

  // ── Detect duplicate halaxy_id across Supabase records ──
  var _halaxyIdCounts = {};
  supabaseClients.forEach(function(c) {
    if (c.halaxy_id) _halaxyIdCounts[String(c.halaxy_id)] = (_halaxyIdCounts[String(c.halaxy_id)] || 0) + 1;
  });

  // ── Helper: last active date ──
  function lastSeen(c) {
    if (c._lastDate) return c._lastDate; // Halaxy-only
    var dates = [];
    (c.sessions || []).forEach(function(s) { if (s.session_date) dates.push(s.session_date); });
    if (c.halaxy_id) {
      halaxyInvoices.forEach(function(inv) {
        if (inv.patientId && String(inv.patientId) === String(c.halaxy_id) && inv.date) dates.push(inv.date);
      });
    }
    if (!dates.length) return null;
    return dates.reduce(function(max, d) { return d > max ? d : max; }, '');
  }

  // ── Source badge ──
  function _clientSource(c) {
    if (c._isHalaxyOnly) return { label: 'Halaxy', cls: 'halaxy-only' };
    if (c.halaxy_id) {
      var verified = _halaxyPatientIds.has(String(c.halaxy_id));
      return verified ? { label: 'Halaxy ✓', cls: 'linked' } : { label: 'Halaxy ?', cls: 'halaxy-unverified' };
    }
    if (c.enquiry_id) {
      var enq = allEnquiries.find(function(e) { return String(e.id) === String(c.enquiry_id); });
      if (enq && enq.source === 'website') return { label: 'Web contact', cls: 'web' };
      return { label: 'Enquiry', cls: 'web' };
    }
    return { label: 'Dashboard only', cls: 'unlinked' };
  }

  // ── Split into three display groups ──
  // Group A: Supabase clients with a halaxy_id (verified OR unverified link)
  // Group B: Supabase clients with NO halaxy_id (dashboard-only)
  // Group C: Halaxy-only patients (no Supabase record)
  function _byDate(a, b) { return (lastSeen(b) || '').localeCompare(lastSeen(a) || ''); }
  var archived     = supabaseClients.filter(function(c) { return c.active === false; });
  var groupA       = supabaseClients.filter(function(c) { return c.active !== false && c.halaxy_id; }).sort(_byDate);
  var groupB       = supabaseClients.filter(function(c) { return c.active !== false && !c.halaxy_id; }).sort(_byDate);
  var groupC       = halaxyOnlyClients.sort(_byDate);

  // ── Helpers ──
  var _avatarGradients = [
    'linear-gradient(145deg,#2A5850,#4A7A70)',
    'linear-gradient(145deg,#3D6FA8,#5888C0)',
    'linear-gradient(145deg,#7A7090,#9A90B0)',
    'linear-gradient(145deg,#BE6E44,#D08A5C)',
    'linear-gradient(145deg,#4A8060,#6AA070)',
    'linear-gradient(145deg,#8A5058,#AA7078)',
  ];
  function _avatarGrad(name) {
    var code = (name || '?').toUpperCase().charCodeAt(0) || 65;
    return _avatarGradients[code % _avatarGradients.length];
  }

  // ── Player card ──
  function renderClientCard(c) {
    var ls = lastSeen(c);
    var initials = (c.display_name || '?').split(' ').map(function(w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase();
    var funderLabel = FUNDER_LABELS[c.funder] || c.funder || '';
    var funderClass = { medicare: 'medicare', ndis: 'ndis', 'WorkCover': 'workcover', private: 'private' }[c.funder] || 'default';
    var lastDate    = ls ? new Date(ls + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'No activity';
    var src = _clientSource(c);
    var isDupe = c.halaxy_id && (_halaxyIdCounts[String(c.halaxy_id)] || 0) > 1;

    // Stats — Halaxy invoices as primary, Supabase sessions as fallback
    var invs = c.halaxy_id
      ? halaxyInvoices.filter(function(i) { return String(i.patientId) === String(c.halaxy_id); })
      : [];
    var invCount   = c._invoiceCount != null ? c._invoiceCount : invs.length;
    var totalOwing = c._totalOwing   != null ? c._totalOwing   : invs.reduce(function(s, i) { return s + (parseFloat(i.totalBalance) || 0); }, 0);
    var totalPaid  = c._totalPaid    != null ? c._totalPaid    : invs.reduce(function(s, i) { return s + (parseFloat(i.totalPaid)    || 0); }, 0);
    var dbSessions    = (c.sessions || []);
    var upcomingCount = dbSessions.filter(function(s) { return s.status === 'upcoming'; }).length;

    var statsHtml = '';
    if (invCount > 0 || c._isHalaxyOnly) {
      // Primary: Halaxy billing stats (invoices, paid status, owing)
      statsHtml += '<div class="cl-card-stat"><span class="cl-card-stat-val">' + invCount + '</span>'
        + (invCount !== 1 ? 'invoices' : 'invoice') + '<span style="font-size:9px;color:#C0CCCB;display:block">from Halaxy</span></div>';
      if (totalOwing > 0.005) {
        statsHtml += '<div class="cl-card-stat"><span class="cl-card-stat-val owing">$' + Math.round(totalOwing) + '</span>owing</div>';
      } else if (totalPaid > 0) {
        statsHtml += '<div class="cl-card-stat"><span class="cl-card-stat-val paid">✓</span>all paid</div>';
      }
    } else {
      // Fallback: dashboard sessions
      statsHtml += '<div class="cl-card-stat"><span class="cl-card-stat-val">' + dbSessions.length + '</span>'
        + (dbSessions.length !== 1 ? 'appointments' : 'appointment') + '<span style="font-size:9px;color:#C0CCCB;display:block">logged here</span></div>';
    }
    // Upcoming from Supabase sessions (always show if present)
    if (upcomingCount) {
      statsHtml += '<div class="cl-card-stat"><span class="cl-card-stat-val upcoming">' + upcomingCount + '</span>upcoming</div>';
    }

    // Footer action buttons
    var queueBtn = '<button class="cl-card-action queue"'
      + ' data-cn="' + escHtml(c.display_name || '') + '"'
      + ' data-hid="' + escHtml(String(c.halaxy_id || '')) + '"'
      + ' onclick="event.stopPropagation();filterQueueForClient(this.dataset.cn,this.dataset.hid)">'
      + '↗ Queue</button>';
    var actionBtn = '';
    if (!c.halaxy_id && c.id) {
      actionBtn = '<button class="cl-card-action link"'
        + ' onclick="event.stopPropagation();openHalaxyLinkPicker(\'' + escHtml(c.id) + '\')">'
        + '🔗 Link</button>';
    } else if (c._isHalaxyOnly) {
      actionBtn = '<button class="cl-card-action create"'
        + ' data-hid="' + escHtml(String(c.halaxy_id || '')) + '"'
        + ' onclick="event.stopPropagation();openAddClient(this.dataset.hid)">'
        + '+ Add record</button>';
    }

    // Delete × button (absolute top-left, Supabase-owned records only)
    var deleteBtn = c.id
      ? '<button class="cl-card-delete" title="Remove dashboard record"'
        + ' data-cid="' + escHtml(c.id) + '"'
        + ' data-cn="'  + escHtml(c.display_name || '') + '"'
        + ' onclick="event.stopPropagation();deleteClient(this.dataset.cid,this.dataset.cn)">×</button>'
      : '';

    // Type badge (couples, child, contact)
    var typeTag = '';
    if (c.is_contact)             typeTag = '<span class="cl-card-type-tag contact">Contact</span>';
    else if (c.client_type === 'couples') typeTag = '<span class="cl-card-type-tag couples">Couples</span>';
    else if (c.client_type === 'child')   typeTag = '<span class="cl-card-type-tag child">Child</span>';

    // Parent link indicator
    var parentTag = '';
    if (c.parent_client_id) {
      var parentRec = (_pipelineData && _pipelineData.clients || []).find(function(x) { return x.id === c.parent_client_id; });
      if (parentRec) parentTag = '<span class="cl-card-type-tag parent">↑ ' + escHtml(parentRec.display_name.split(' ')[0]) + '</span>';
    }

    // Topbar: funder pill (right) + dupe/type badges (left)
    var topbarRight = (funderLabel ? '<span class="cl-funder-pill ' + funderClass + '">' + escHtml(funderLabel) + '</span>' : '');
    var topbarLeft  = (isDupe ? '<span class="cl-card-dupe-tag">⚠ Duplicate</span>' : '') + typeTag + parentTag;
    var topbar = '<div class="cl-card-topbar"><div class="cl-card-topbar-left">' + topbarLeft + '</div>'
      + '<div class="cl-card-topbar-right">' + topbarRight + '</div></div>';

    var clickAttr = c.id ? ' onclick="openDetailPanel(\'client\',\'' + escHtml(c.id) + '\')"' : '';
    return '<div class="cl-card' + (isDupe ? ' cl-card--dupe' : '') + (src.cls === 'halaxy-unverified' ? ' cl-card--unverified' : '') + '"' + clickAttr + '>'
      + deleteBtn
      + topbar
      + '<div class="cl-card-body">'
      + '<div class="cl-card-avatar" style="background:' + _avatarGrad(c.display_name) + '">' + escHtml(initials) + '</div>'
      + '<div class="cl-card-name" title="' + escHtml(c.display_name || '—') + '">' + escHtml(c.display_name || '—') + '</div>'
      + '<div class="cl-card-since">Last seen ' + escHtml(lastDate) + '</div>'
      + '<div class="cl-card-divider"></div>'
      + '<div class="cl-card-stats">' + statsHtml + '</div>'
      + '</div>'
      + '<div class="cl-card-footer" style="padding:0 16px;width:100%;box-sizing:border-box">'
      + '<span class="cl-card-source ' + src.cls + '">' + escHtml(src.label) + '</span>'
      + '<div class="cl-card-actions">' + actionBtn + queueBtn + '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Compact row (archived) ──
  function renderClientRow(c) {
    var ls       = lastSeen(c);
    var initials = (c.display_name || '?').split(' ').map(function(w) { return w[0]; }).filter(Boolean).slice(0, 2).join('').toUpperCase();
    var lastDate = ls ? new Date(ls + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No activity';
    var src      = _clientSource(c);
    return '<div class="cl-list-item">'
      + '<div class="cl-list-avatar" style="background:' + _avatarGrad(c.display_name) + '">' + escHtml(initials) + '</div>'
      + '<div class="cl-list-main">'
      + '<div class="cl-list-name">' + escHtml(c.display_name || '—') + '</div>'
      + '<div class="cl-list-meta"><span class="cl-card-source ' + src.cls + '" style="font-size:9px">' + escHtml(src.label) + '</span></div>'
      + '</div>'
      + '<span class="cl-list-last">' + escHtml(lastDate) + '</span>'
      + '</div>';
  }

  // ── Build HTML ──
  function _sectionLabel(text, count, hint, desc) {
    return '<div class="cl-section-hd">'
      + '<div class="cl-section-hd-top">'
      + '<span class="cl-section-label">' + text + (count != null ? ' <span class="cl-section-count">(' + count + ')</span>' : '') + '</span>'
      + (hint ? '<span class="cl-section-hint">' + hint + '</span>' : '')
      + '</div>'
      + (desc ? '<div class="cl-section-desc">' + desc + '</div>' : '')
      + '</div>';
  }
  function _cardGrid(arr) {
    return '<div class="cl-card-grid">' + arr.map(renderClientCard).join('') + '</div>';
  }

  var html = '<div class="clients-view">';
  html += '<div class="clients-view-hd"><span class="view-title">Clients</span>';
  html += '<button onclick="openAddClient()" class="dp-btn dp-btn--primary" style="font-size:12px;padding:6px 14px">+ Add Client</button>';
  html += '</div>';

  // ── Group A: Halaxy-linked clients ──────────────────────────────────
  if (groupA.length) {
    var unverifiedCount = groupA.filter(function(c) { return !_halaxyPatientIds.has(String(c.halaxy_id)); }).length;
    var hintA = unverifiedCount > 0 ? '⚠ ' + unverifiedCount + ' unverified — hover & × to remove' : '';
    var descA = '<strong>Halaxy ✓ clients</strong> are linked to a real Halaxy patient record. '
      + 'Invoice counts and billing history come directly from Halaxy (last 90 days). '
      + (unverifiedCount > 0 ? 'Cards marked <strong>⚠ Duplicate</strong> or with a dashed border could not be verified in Halaxy — remove them to clean up.' : '');
    html += _sectionLabel('Halaxy clients', groupA.length, hintA, descA);
    html += _cardGrid(groupA);
  }

  // ── Group B: Dashboard-only clients (no Halaxy link) ──────────────
  if (groupB.length) {
    var descB = '<strong>Dashboard-only clients</strong> exist here but have no Halaxy record yet. '
      + 'Session counts show what\'s been manually logged in this dashboard. '
      + 'Use <strong>🔗 Link</strong> to connect them to an existing Halaxy patient.';
    html += _sectionLabel('Dashboard only', groupB.length, '', descB);
    html += _cardGrid(groupB);
  }

  // ── Group C: Halaxy patients with no dashboard record ──────────────
  if (groupC.length) {
    // Split into active (has invoices/appointments) vs new/unknown (zero activity).
    // New patients with no history get a prompt so Cheree can decide if they're
    // a client (billable) or a contact (referrer, parent, etc.).
    var groupCActive = groupC.filter(function(c) { return c._hasActivity; });
    var groupCNew    = groupC.filter(function(c) { return !c._hasActivity; });

    if (groupCActive.length) {
      var gcOpen = window._groupCOpen !== false; // default open
      html += '<div class="cl-section-toggle-wrap">';
      html += _sectionLabel('In Halaxy — no dashboard record', groupCActive.length, '',
        gcOpen ? '<strong>Halaxy patients</strong> with appointment or invoice history but no dashboard entry yet. '
          + 'Use <strong>+ Add record</strong> to track them here.' : '');
      html += '<button class="cl-section-collapse-btn" onclick="window._groupCOpen=!' + gcOpen + ';renderClientsView()">'
        + (gcOpen ? '▾ Hide' : '▸ Show') + '</button>';
      html += '</div>';
      if (gcOpen) html += _cardGrid(groupCActive);
    }

    if (groupCNew.length) {
      var gnOpen = window._groupCNewOpen !== false; // default open
      html += '<div class="cl-section-toggle-wrap" style="margin-top:' + (groupCActive.length ? '16px' : '0') + '">';
      html += _sectionLabel('New in Halaxy — contact or client?', groupCNew.length, '🟡 Review',
        gnOpen ? 'These Halaxy patients have no appointment or billing history yet. '
          + 'Use <strong>+ Add record</strong> to track them as a client, or ignore them if they\'re contacts (referrers, parents, etc.).' : '');
      html += '<button class="cl-section-collapse-btn" onclick="window._groupCNewOpen=!' + gnOpen + ';renderClientsView()">'
        + (gnOpen ? '▾ Hide' : '▸ Show') + '</button>';
      html += '</div>';
      if (gnOpen) html += _cardGrid(groupCNew);
    }
  }

  if (!groupA.length && !groupB.length && !groupC.length) {
    html += '<div class="q-empty">No clients yet — click + Add Client to get started</div>';
  }

  // ── Archived ─────────────────────────────────────────────────────────
  if (archived.length) {
    var archOpen = window._clientsArchiveOpen;
    html += '<div style="margin-top:24px">';
    html += '<button class="q-section-toggle" style="font-size:11px;color:#9AABA8;background:none;border:none;cursor:pointer;padding:4px 2px" onclick="window._clientsArchiveOpen=!window._clientsArchiveOpen;renderClientsView()">'
      + (archOpen ? '▾' : '▸') + ' Archived (' + archived.length + ')'
      + '</button>';
    if (archOpen) {
      html += '<div class="cl-list" style="margin-top:8px">' + archived.map(renderClientRow).join('') + '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  content.innerHTML = html;
}

/* ═══════════════════════════════════════════════════
   BILLING VIEW
   ═══════════════════════════════════════════════════ */

function renderBillingView() {
  var content = document.getElementById('view-content');
  if (!content) return;

  var now = new Date();
  var monthStr = now.toISOString().slice(0, 7); // 'YYYY-MM'
  var invoices = (_halaxyData && _halaxyData.invoices) || [];

  // Australian tax financial year: 1 July → 30 June
  // If we're in Jan–Jun, FY started last July; if Jul–Dec, FY started this July
  var fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  var fyStart = fyStartYear + '-07-01';
  var fyLabel = 'FY' + fyStartYear + '–' + String(fyStartYear + 1).slice(2);

  // YTD: sum of totalPaid for invoices in the current Australian financial year
  var ytd = invoices.reduce(function(sum, inv) {
    if (!inv.date || inv.date < fyStart) return sum;
    return sum + (parseFloat(inv.totalPaid) || 0);
  }, 0);

  // MTD: sum of totalPaid for invoices in the current month
  var mtd = invoices.reduce(function(sum, inv) {
    if (!inv.date || !inv.date.startsWith(monthStr)) return sum;
    return sum + (parseFloat(inv.totalPaid) || 0);
  }, 0);

  // Owing: sum of totalBalance for all unpaid/partial invoices
  var owing = invoices.reduce(function(sum, inv) {
    if (inv.status === 'cancelled' || inv.status === 'draft') return sum;
    var bal = parseFloat(inv.totalBalance);
    return sum + (bal > 0 ? bal : 0);
  }, 0);

  function fmt(n) { return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  var html = '<div class="billing-view">';
  html += '<div class="billing-view-hd"><span class="view-title">Billing</span></div>';

  // Summary cards
  html += '<div class="bill-summary">';
  html += '<div class="bill-stat">'
    + '<div class="bill-stat-label">Month to Date</div>'
    + '<div class="bill-stat-val' + (mtd === 0 ? ' zero' : '') + '">' + fmt(mtd) + '</div>'
    + '<div class="bill-stat-sub">' + now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) + '</div>'
    + '</div>';
  html += '<div class="bill-stat">'
    + '<div class="bill-stat-label">Financial Year to Date</div>'
    + '<div class="bill-stat-val' + (ytd === 0 ? ' zero' : '') + '">' + fmt(ytd) + '</div>'
    + '<div class="bill-stat-sub">' + fyLabel + ' total earned</div>'
    + '</div>';
  html += '<div class="bill-stat">'
    + '<div class="bill-stat-label">Owing</div>'
    + '<div class="bill-stat-val' + (owing > 0 ? ' owing' : ' zero') + '">' + fmt(owing) + '</div>'
    + '<div class="bill-stat-sub">across ' + invoices.filter(function(i) { return parseFloat(i.totalBalance) > 0 && i.status !== 'cancelled'; }).length + ' invoice' + (invoices.filter(function(i) { return parseFloat(i.totalBalance) > 0 && i.status !== 'cancelled'; }).length !== 1 ? 's' : '') + '</div>'
    + '</div>';
  html += '</div>';

  html += '<div id="billing-panel-body"><div class="pl-loading"><div class="pl-skeleton" style="height:52px"></div><div class="pl-skeleton" style="height:52px;margin-top:7px"></div></div></div>';
  html += '</div>';
  content.innerHTML = html;
  renderBillingPanel();
}

/* ═══════════════════════════════════════════════════
   SETTINGS VIEW
   ═══════════════════════════════════════════════════ */

function renderSettingsView() {
  var content = document.getElementById('view-content');
  if (!content) return;
  var halaxyOk = _halaxyData && _halaxyData.connected;
  var calOk = _calEventsLoaded;
  var html = '<div class="settings-view"><span class="view-title" style="display:block;margin-bottom:22px">Settings</span>';
  // Connections
  html += '<div class="settings-section"><div class="settings-section-title">Connections</div>';
  html += '<div class="settings-row"><span class="settings-row-label">Halaxy</span><span class="settings-row-val">' + (halaxyOk ? '✓ Connected' : '✗ Not connected') + '</span>'
    + '<div class="settings-row-action"><button id="halaxy-sync-btn" onclick="syncHalaxyConfigData()">⟳ Sync funders & fees</button></div></div>';
  html += '<div class="settings-row"><span class="settings-row-label">Google Calendar</span><span class="settings-row-val">' + (calOk ? '✓ Connected' : 'Not connected') + '</span>'
    + '<div class="settings-row-action"><a href="/api/google-auth">Reconnect</a></div></div>';
  html += '</div>';
  // Account
  html += '<div class="settings-section"><div class="settings-section-title">Account</div>';
  html += '<div class="settings-row"><span class="settings-row-label">Signed in as</span><span class="settings-row-val">' + escHtml(window.ADMIN_USER || 'Julian') + '</span></div>';
  html += '<div class="settings-row"><span class="settings-row-label">Session</span><span class="settings-row-val"></span><div class="settings-row-action"><a href="/admin?logout=1">Sign out</a></div></div>';
  html += '</div>';
  // Website links
  html += '<div class="settings-section"><div class="settings-section-title">Website</div>';
  html += '<div class="settings-row"><span class="settings-row-label">View site</span><span class="settings-row-val">chereemcgarry.com</span><div class="settings-row-action"><a href="/" target="_blank">Open ↗</a></div></div>';
  html += '<div class="settings-row"><span class="settings-row-label">Email history</span><span class="settings-row-val">Resend</span><div class="settings-row-action"><a href="https://resend.com/emails" target="_blank">Open ↗</a></div></div>';
  html += '<div class="settings-row"><span class="settings-row-label">Practice management</span><span class="settings-row-val">Halaxy</span><div class="settings-row-action"><a href="https://www.halaxy.com/practitioner" target="_blank">Open ↗</a></div></div>';
  html += '</div>';
  html += '</div>';
  content.innerHTML = html;
}

/* ═══════════════════════════════════════════════════
   DETAIL PANEL RENDERERS
   ═══════════════════════════════════════════════════ */

function _renderSessionDetailPanel(sess) {
  var html = '';
  html += '<div class="rdp-client">' + escHtml(sess.name || 'Appointment') + '</div>';
  html += '<div class="rdp-date">' + escHtml(sess.dateLabel || '') + (sess.timeStr ? ' · ' + sess.timeStr : '') + ' · Halaxy</div>';
  // Action zone
  var _hUrl = _halaxyWebUrl ? (_halaxyWebUrl + '/calendar?date=' + sess.dateStr) : 'https://www.halaxy.com/practitioner';
  html += '<div class="rdp-action-zone">';
  if (sess.status === 'pending-invoice') {
    html += '<a class="rdp-primary-btn" href="' + escHtml(_hUrl) + '" target="_blank" rel="noopener">Open in Halaxy to invoice →</a>';
    html += '<p class="rdp-action-hint">No invoice found yet — create one in Halaxy for this session</p>';
  } else if (sess.status === 'needs-recording') {
    // Always offer Record — patientId is used if available; modal handles null gracefully
    var _pid = sess.patientId || '';
    html += '<button class="rdp-primary-btn" onclick="openHalaxyApptLogPanel(\'' + escHtml(sess.id) + '\',\'' + escHtml(_pid) + '\',\'' + escHtml(sess.name || '') + '\',\'' + escHtml(sess.dateStr) + '\',\'' + escHtml(sess.startIso || (sess.dateStr + 'T09:00:00')) + '\',\'' + escHtml(sess.halaxyApptId || '') + '\')">Record this appointment →</button>';
    html += '<p class="rdp-action-hint">Session not yet recorded — add notes and confirm in Halaxy</p>';
  } else if (sess.status === 'upcoming') {
    html += '<a class="rdp-ghost-btn" href="' + escHtml(_hUrl) + '" target="_blank" rel="noopener">View in Halaxy →</a>';
    html += '<p class="rdp-action-hint" style="margin-top:6px">Upcoming session — no action needed yet</p>';
  } else if (sess.status === 'invoiced') {
    html += '<span class="rdp-status-chip invoiced">Invoice raised ✓</span>';
    html += '<p class="rdp-action-hint" style="margin-top:8px">Invoice is in Halaxy — awaiting payment</p>';
    html += '<a class="rdp-ghost-btn" style="margin-top:8px" href="' + escHtml(_hUrl) + '" target="_blank" rel="noopener">View in Halaxy →</a>';
  } else if (sess.status === 'paid') {
    html += '<span class="rdp-status-chip paid">Paid ✓</span>';
  } else {
    html += '<a class="rdp-ghost-btn" href="' + escHtml(_hUrl) + '" target="_blank" rel="noopener">View in Halaxy →</a>';
  }
  html += '</div>';
  // Meta
  html += '<div class="rdp-section">';
  html += '<div class="rdp-section-label">Session Details</div>';
  html += '<div class="rdp-row"><span class="rdp-row-label">Status</span><span class="rdp-row-val">' + escHtml(sess.status || '—') + '</span></div>';
  html += '<div class="rdp-row"><span class="rdp-row-label">Source</span><span class="rdp-row-val">' + escHtml(sess.source || '—') + '</span></div>';
  if (sess.halaxyApptId) html += '<div class="rdp-row"><span class="rdp-row-label">Halaxy ID</span><span class="rdp-row-val" style="font-size:11px;color:#7A948F">' + escHtml(sess.halaxyApptId) + '</span></div>';
  html += '</div>';

  // How-to instructions (collapsed)
  var howtoSteps = {
    'pending-invoice': [
      'Open Halaxy using the button above',
      'Navigate to this date in the Halaxy calendar',
      'Click the appointment and select Add Invoice / Add Fee',
      'Set the item, amount and funder (Medicare, private, etc.)',
      'Save — the dashboard updates automatically on next refresh'
    ],
    'needs-recording': [
      'Click "Record this appointment" above',
      'Fill in presenting issues, what was covered, and the outcome',
      'Once saved, open Halaxy to add the fee / invoice for this appointment',
      'The dashboard status will update after the invoice is saved in Halaxy'
    ],
    'upcoming': [
      'No action needed before the appointment',
      'After the appointment, return here — it will appear in Needs Attention for billing',
      'If the client cancels, update the status in Halaxy so it reflects here'
    ],
    'invoiced': [
      'Invoice has been raised in Halaxy — no further action needed right now',
      'If paying via Medicare/NDIS, processing can take a few business days',
      'If the client is self-paying and it is overdue, follow up directly',
      'Once payment clears in Halaxy, status updates to Paid automatically'
    ],
  }[sess.status];

  if (howtoSteps) {
    html += '<div class="rdp-howto"><details><summary>How to action this</summary>';
    html += '<div class="rdp-howto-steps">';
    howtoSteps.forEach(function(step, i) {
      html += '<div class="rdp-howto-step"><span class="rdp-howto-step-n">' + (i + 1) + '</span><span>' + escHtml(step) + '</span></div>';
    });
    html += '</div></details></div>';
  }

  return html;
}

function _renderEnquiryDetailPanel(enq) {
  var name = [enq.first_name, enq.last_name].filter(Boolean).join(' ') || '—';
  var CLOSED_REASON_LABELS_RDP = { not_interested: 'Not interested', wrong_service: 'Wrong service', no_response: 'No response', converted_elsewhere: 'Converted elsewhere', duplicate: 'Duplicate enquiry', other: 'Other' };
  var STATUS_LABELS_RDP = { new: 'New', contacted: 'Contacted', in_halaxy: 'Awaiting first booking', closed: 'Closed', converted: 'Converted' };
  var html = '';
  html += '<div class="rdp-client">' + escHtml(name) + '</div>';
  html += '<div class="rdp-date">' + escHtml(_relativeDate(enq.created_at)) + (enq.source ? ' · ' + escHtml(enq.source) : '')
    + (enq.status === 'closed' && enq.closed_reason ? ' · <span class="enq-closed-reason">' + escHtml(CLOSED_REASON_LABELS_RDP[enq.closed_reason] || enq.closed_reason) + '</span>' : '')
    + '</div>';

  // ── ACTION ZONE ────────────────────────────────────────────────────────
  html += '<div class="rdp-action-zone">';

  var isClosed    = enq.status === 'closed' || enq.status === 'converted';
  var isNew       = enq.status === 'new' || !enq.status;
  var isContacted = enq.status === 'contacted';
  var isInHalaxy  = enq.status === 'in_halaxy';

  if (!isClosed) {
    // ── Complete Onboarding (formerly "Send intake form") ──
    html += '<div style="margin-bottom:12px">';
    html += '<div style="font-size:11px;font-weight:600;color:#7A948F;margin-bottom:7px;text-transform:uppercase;letter-spacing:0.07em">Complete Onboarding</div>';

    // Client person type
    html += '<select id="rdp-ctype-' + enq.id + '" class="cl-modal-select" style="width:100%;margin-bottom:6px">';
    html += '<option value="">Client type…</option>';
    html += '<option value="individual">Individual</option>';
    html += '<option value="couples">Couples / relationship</option>';
    html += '<option value="child">Child / family</option>';
    html += '</select>';

    // Funder type
    var funderOpts = Object.entries(FUNDER_LABELS).map(function(kv) {
      return '<option value="' + kv[0] + '">' + kv[1] + '</option>';
    }).join('');
    html += '<select id="rdp-intake-funder-' + enq.id + '" class="cl-modal-select" style="width:100%;margin-bottom:6px"'
      + ' onchange="_rdpUpdateIntakeUrl(\'' + enq.id + '\')">';
    html += '<option value="">Funding type…</option>' + funderOpts;
    html += '</select>';

    html += '<input id="rdp-intake-url-' + enq.id + '" type="url" class="cl-modal-input"'
      + ' placeholder="Intake form URL (auto-fills for known funders)…"'
      + ' style="width:100%;margin-bottom:6px;font-size:11px" />';
    html += '<button class="rdp-primary-btn" style="margin-bottom:0" onclick="_rdpSendIntake(\'' + enq.id + '\')">Send onboarding email →</button>';
    html += '</div>';

    // ── Stage-specific actions ──
    if (isNew) {
      html += '<button class="rdp-ghost-btn" onclick="advanceEnquiryStatus(\'' + enq.id + '\',\'contacted\');closeDetailPanel()">Mark as contacted →</button>';
    }
    if (isContacted) {
      html += '<button class="rdp-ghost-btn" style="margin-bottom:6px" onclick="_openAddToHalaxyPanel(\'' + enq.id + '\')">Add to Halaxy →</button>';
    }
    if (isInHalaxy) {
      html += '<button class="rdp-ghost-btn" style="margin-bottom:6px" onclick="convertEnquiryPl(\'' + enq.id + '\')">Convert to client →</button>';
    }
    html += '<button class="rdp-ghost-btn" style="font-size:10px;color:var(--soft)" onclick="_openCloseEnquiryModal(\'' + enq.id + '\')">Close enquiry…</button>';
  }

  html += '</div>';

  // ── Add-to-Halaxy panel placeholder (rendered dynamically) ──
  html += '<div id="rdp-halaxy-link-' + enq.id + '"></div>';

  // ── Contact details ──
  html += '<div class="rdp-section">';
  html += '<div class="rdp-section-label">Contact</div>';
  if (enq.phone) html += '<div class="rdp-row"><span class="rdp-row-label">Phone</span><span class="rdp-row-val"><a href="tel:' + escHtml(enq.phone) + '" style="color:inherit">' + escHtml(enq.phone) + '</a></span></div>';
  if (enq.email) html += '<div class="rdp-row"><span class="rdp-row-label">Email</span><span class="rdp-row-val" style="font-size:11px"><a href="mailto:' + escHtml(enq.email) + '" style="color:inherit">' + escHtml(enq.email) + '</a></span></div>';
  if (enq.service) html += '<div class="rdp-row"><span class="rdp-row-label">Service</span><span class="rdp-row-val">' + escHtml(enq.service) + '</span></div>';
  if (enq.reason)  html += '<div class="rdp-row"><span class="rdp-row-label">Reason</span><span class="rdp-row-val">' + escHtml(enq.reason) + '</span></div>';
  html += '<div class="rdp-row"><span class="rdp-row-label">Status</span><span class="rdp-row-val">' + escHtml(STATUS_LABELS_RDP[enq.status] || enq.status || 'New') + '</span></div>';
  if (enq.intake_funder) html += '<div class="rdp-row"><span class="rdp-row-label">Funder</span><span class="rdp-row-val">' + escHtml(FUNDER_LABELS[enq.intake_funder] || enq.intake_funder) + '</span></div>';
  html += '</div>';

  if (enq.message) {
    html += '<div class="rdp-section">';
    html += '<div class="rdp-section-label">Message</div>';
    html += '<div style="font-size:13px;color:#192E2A;line-height:1.5">' + escHtml(enq.message) + '</div>';
    html += '</div>';
  }

  // ── Notes ──
  html += '<div class="rdp-section">';
  html += '<div class="rdp-section-label">Notes</div>';
  html += '<textarea id="rdp-notes-' + enq.id + '" style="width:100%;min-height:70px;font-family:var(--sans);font-size:12.5px;padding:8px 10px;border:1px solid rgba(0,0,0,0.12);border-radius:7px;resize:vertical;outline:none" onblur="saveNotes(\'' + enq.id + '\',this.value)" placeholder="Add notes…">' + escHtml(enq.notes || '') + '</textarea>';
  html += '</div>';

  // ── Activity / interaction timeline ──
  var activity = enq.activity || [];
  html += '<div class="rdp-section">';
  html += '<div class="rdp-section-label" style="display:flex;align-items:center;justify-content:space-between">'
    + 'Activity'
    + (isClosed ? '' : '<button style="font-size:10px;padding:2px 8px;border:1px solid rgba(42,88,80,0.25);border-radius:5px;background:transparent;color:var(--teal);cursor:pointer" onclick="_toggleLogInteractionForm(\'' + enq.id + '\')">+ Log</button>')
    + '</div>';

  // Log form (hidden by default, toggled)
  if (!isClosed) {
    html += '<div id="rdp-log-form-' + enq.id + '" class="enq-log-form" style="display:none">';
    html += '<select id="rdp-log-type-' + enq.id + '">'
      + '<option value="call">📞 Phone call</option>'
      + '<option value="email">✉ Email</option>'
      + '<option value="note">📝 Note</option>'
      + '</select>';
    html += '<textarea id="rdp-log-text-' + enq.id + '" placeholder="What happened? e.g. Left voicemail, client confirmed Thursday…"></textarea>';
    html += '<div style="display:flex;justify-content:flex-end;gap:6px">'
      + '<button style="font-size:11px;padding:4px 10px;border:1px solid rgba(0,0,0,0.12);border-radius:5px;background:transparent;color:var(--soft);cursor:pointer" onclick="_toggleLogInteractionForm(\'' + enq.id + '\')">Cancel</button>'
      + '<button style="font-size:11px;padding:4px 12px;border:none;border-radius:5px;background:var(--teal);color:#fff;cursor:pointer" onclick="_submitLogInteraction(\'' + enq.id + '\')">Save</button>'
      + '</div>';
    html += '</div>';
  }

  if (activity.length) {
    var TL_DOT = { status: 'tl-status', notes: '', halaxy: 'tl-status', converted: 'tl-status', intake: 'tl-intake', call: 'tl-call', email: 'tl-email', note: '' };
    var TL_LABEL = {
      status:    function(a) { var s = (a.detail || '').split(':')[0]; var reason = (a.detail || '').split(':')[1]; var sl = { new: 'Enquiry received', contacted: 'Marked as contacted', in_halaxy: 'Added to Halaxy', closed: 'Enquiry closed' + (reason ? ' — ' + (CLOSED_REASON_LABELS_RDP[reason] || reason) : ''), converted: 'Converted to client' }; return sl[s] || ('Status → ' + escHtml(s)); },
      notes:     function() { return 'Notes updated'; },
      halaxy:    function(a) { return a.detail === 'linked' ? 'Halaxy patient linked' : 'Halaxy link cleared'; },
      converted: function(a) { return 'Converted to client'; },
      intake:    function(a) { return 'Onboarding sent' + (a.detail ? ' — ' + escHtml(FUNDER_LABELS[a.detail] || a.detail) : ''); },
      call:      function(a) { return '📞 ' + escHtml(a.detail || 'Phone call'); },
      email:     function(a) { return '✉ ' + escHtml(a.detail || 'Email'); },
      note:      function(a) { return '📝 ' + escHtml(a.detail || 'Note'); },
    };
    html += '<div class="enq-timeline">';
    activity.slice(0, 8).forEach(function(a) {
      var dotClass = TL_DOT[a.action] || '';
      var labelFn  = TL_LABEL[a.action] || function(x) { return escHtml(x.action + (x.detail ? ': ' + x.detail : '')); };
      html += '<div class="enq-tl-item">'
        + '<div class="enq-tl-dot ' + dotClass + '"></div>'
        + '<div class="enq-tl-body">'
        + '<div class="enq-tl-label">' + labelFn(a) + '</div>'
        + '<div class="enq-tl-meta">' + escHtml(_relativeDate(a.created_at)) + (a.actor ? ' · ' + escHtml(a.actor) : '') + '</div>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--soft);margin-top:6px">No activity yet</div>';
  }
  html += '</div>';

  return html;
}

function _toggleLogInteractionForm(enqId) {
  var f = document.getElementById('rdp-log-form-' + enqId);
  if (f) f.style.display = f.style.display === 'none' ? '' : 'none';
}

async function _submitLogInteraction(enqId) {
  var typeEl = document.getElementById('rdp-log-type-' + enqId);
  var textEl = document.getElementById('rdp-log-text-' + enqId);
  var type = typeEl ? typeEl.value : 'note';
  var text = textEl ? textEl.value.trim() : '';
  if (!text) { toast('Add a note before saving', 'err'); return; }
  try {
    await apiFetch('/api/admin-enquiries?id=' + enqId, {
      method: 'PATCH',
      body: { log_action: type, log_detail: text },
    });
    toast('Interaction logged ✓');
    refreshPipeline();
    closeDetailPanel();
  } catch (e) {
    toast('Could not save: ' + e.message, 'err');
  }
}

function _openAddToHalaxyPanel(enqId) {
  var panel = document.getElementById('rdp-halaxy-link-' + enqId);
  if (!panel) return;
  var enq = (_pipelineData && _pipelineData.enquiries || []).find(function(e) { return e.id === enqId; }) || {};
  panel.innerHTML = '<div class="enq-halaxy-link-panel">'
    + '<div class="enq-halaxy-link-title">Add to Halaxy</div>'
    + '<div style="font-size:11.5px;color:var(--mid);margin-bottom:10px">Search for an existing Halaxy patient, or create a new one pre-filled from this enquiry.</div>'
    + '<div class="enq-halaxy-search-row">'
    + '<input id="rdp-hx-search-' + enqId + '" type="text" placeholder="Search by name…" value="' + escHtml([enq.first_name, enq.last_name].filter(Boolean).join(' ')) + '"'
    + ' oninput="_debounceHxEnqSearch(\'' + enqId + '\')">'
    + '<button style="font-size:11px;padding:6px 12px;border:none;border-radius:6px;background:var(--teal);color:#fff;cursor:pointer;white-space:nowrap" onclick="_searchHxEnqPatients(\'' + enqId + '\')">Search</button>'
    + '</div>'
    + '<div id="rdp-hx-results-' + enqId + '" class="enq-halaxy-results"></div>'
    + '<div style="display:flex;gap:8px;margin-top:10px;border-top:1px solid rgba(0,0,0,0.08);padding-top:10px">'
    + '<button style="flex:1;font-size:11px;padding:7px 10px;border:1px solid rgba(42,88,80,0.25);border-radius:6px;background:transparent;color:var(--teal);cursor:pointer" onclick="_createHalaxyFromEnquiry(\'' + enqId + '\')">+ Create new patient →</button>'
    + '<button style="font-size:11px;padding:7px 12px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;background:transparent;color:var(--soft);cursor:pointer" onclick="_markInHalaxyDirectly(\'' + enqId + '\')">Already added ✓</button>'
    + '</div>'
    + '</div>';
}

var _hxEnqSearchTimer = null;
function _debounceHxEnqSearch(enqId) {
  clearTimeout(_hxEnqSearchTimer);
  _hxEnqSearchTimer = setTimeout(function() { _searchHxEnqPatients(enqId); }, 350);
}

async function _searchHxEnqPatients(enqId) {
  var q = (document.getElementById('rdp-hx-search-' + enqId) || {}).value || '';
  q = q.trim();
  var resEl = document.getElementById('rdp-hx-results-' + enqId);
  if (!resEl || !q) return;
  resEl.innerHTML = '<div style="font-size:11px;color:var(--soft);padding:4px 0">Searching…</div>';
  try {
    var data = await apiFetch('/api/admin-enquiries?halaxy_patient_name=' + encodeURIComponent(q));
    var pts = (data && data.patients) || [];
    if (!pts.length) { resEl.innerHTML = '<div style="font-size:11px;color:var(--soft);padding:4px 0">No matches found</div>'; return; }
    resEl.innerHTML = pts.map(function(p) {
      return '<div class="enq-halaxy-result-item" onclick="_selectHxEnqPatient(\'' + enqId + '\',\'' + escHtml(p.id) + '\',\'' + escHtml(p.name) + '\')">'
        + escHtml(p.name) + ' <span style="color:var(--soft);font-size:10px">#' + escHtml(p.id) + '</span>'
        + '</div>';
    }).join('');
  } catch (e) {
    resEl.innerHTML = '<div style="font-size:11px;color:var(--terra)">Search failed</div>';
  }
}

async function _selectHxEnqPatient(enqId, patientId, patientName) {
  try {
    // Two separate calls: log_action early-returns in the PATCH handler, so status must be its own request
    await apiFetch('/api/admin-enquiries?id=' + enqId, { method: 'PATCH', body: { status: 'in_halaxy' } });
    await apiFetch('/api/admin-enquiries?id=' + enqId, { method: 'PATCH', body: { log_action: 'halaxy', log_detail: 'Linked Halaxy patient: ' + patientName + ' (' + patientId + ')' } });
    toast('Linked to Halaxy patient ' + patientName + ' ✓');
    refreshPipeline();
    closeDetailPanel();
  } catch (e) {
    toast('Could not link: ' + e.message, 'err');
  }
}

function _createHalaxyFromEnquiry(enqId) {
  var enq = (_pipelineData && _pipelineData.enquiries || []).find(function(e) { return e.id === enqId; }) || {};
  closeDetailPanel();
  // Pre-fill add-client modal with enquiry data
  openAddClient();
  setTimeout(function() {
    var fn = document.getElementById('ac-first-name');
    var ln = document.getElementById('ac-last-name');
    var em = document.getElementById('ac-email');
    var ph = document.getElementById('ac-phone');
    if (fn && enq.first_name) fn.value = enq.first_name;
    if (ln && enq.last_name)  ln.value = enq.last_name;
    if (em && enq.email)      em.value = enq.email;
    if (ph && enq.phone)      ph.value = enq.phone;
    // Store enquiry id to advance status after creation
    window._pendingEnqId = enqId;
  }, 80);
}

async function _markInHalaxyDirectly(enqId) {
  try {
    await apiFetch('/api/admin-enquiries?id=' + enqId, { method: 'PATCH', body: { status: 'in_halaxy' } });
    toast('Marked as in Halaxy ✓');
    refreshPipeline();
    closeDetailPanel();
  } catch (e) {
    toast('Could not update: ' + e.message, 'err');
  }
}

function _renderClientDetailPanel(cl) {
  var dbSessions  = (cl.sessions || []).slice().sort(function(a, b) { return b.session_date.localeCompare(a.session_date); });
  var funderLabel = FUNDER_LABELS[cl.funder] || cl.funder || '—';

  // ── Pull Halaxy data for this client ──
  var hid = cl.halaxy_id ? String(cl.halaxy_id) : null;
  var halaxyVerified = false;
  var halaxyInvs     = [];

  if (hid && _halaxyData) {
    // Verify: patient appears in full patient list or appointment patientMap
    var allPts = _halaxyData.patients || [];
    halaxyVerified = allPts.some(function(p) { return String(p.id) === hid; });
    if (!halaxyVerified && _halaxyData.patientMap && _halaxyData.patientMap[hid]) halaxyVerified = true;

    halaxyInvs = (_halaxyData.invoices || [])
      .filter(function(i) { return String(i.patientId) === hid; })
      .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }

  var html = '';
  html += '<div class="rdp-client">' + escHtml(cl.display_name || '—') + '</div>';
  html += '<div class="rdp-date">' + escHtml(funderLabel)
    + (hid ? (' · Halaxy' + (halaxyVerified ? ' ✓' : ' ⚠')) : '')
    + '</div>';

  // Unverified link warning
  if (hid && !halaxyVerified) {
    html += '<div class="rdp-warn-box">'
      + '⚠ Halaxy ID <strong>' + escHtml(hid) + '</strong> was not found in the current patient list. '
      + 'This may be a stale test record — remove it below.'
      + '</div>';
  }

  // Actions
  html += '<div class="rdp-action-zone">';
  if (hid && _halaxyWebUrl) {
    html += '<a class="rdp-primary-btn" href="' + escHtml(_halaxyWebUrl + '/clients') + '" target="_blank" rel="noopener">Open in Halaxy →</a>';
  }
  html += '<button class="rdp-ghost-btn" onclick="openNewSessionModal()" style="margin-top:6px">+ Log appointment</button>';
  html += '</div>';

  // Client details
  var TYPE_LABELS = { individual: 'Individual', couples: 'Couples', child: 'Child' };
  html += '<div class="rdp-section">';
  html += '<div class="rdp-section-label">Details</div>';
  html += '<div class="rdp-row"><span class="rdp-row-label">Type</span><span class="rdp-row-val">'
    + (cl.is_contact ? '<span class="cl-card-type-tag contact" style="font-size:10px">Contact (non-billable)</span>' : (TYPE_LABELS[cl.client_type] || 'Individual'))
    + '</span></div>';
  if (cl.parent_client_id) {
    var parentName = '';
    var parentRec2 = (_pipelineData && _pipelineData.clients || []).find(function(x) { return x.id === cl.parent_client_id; });
    if (parentRec2) parentName = parentRec2.display_name;
    html += '<div class="rdp-row"><span class="rdp-row-label">Parent/Guardian</span><span class="rdp-row-val">' + escHtml(parentName || cl.parent_client_id) + '</span></div>';
  }
  if (cl.plan_manager) html += '<div class="rdp-row"><span class="rdp-row-label">Plan manager</span><span class="rdp-row-val">' + escHtml(cl.plan_manager) + '</span></div>';
  if (cl.notes)        html += '<div class="rdp-row"><span class="rdp-row-label">Notes</span><span class="rdp-row-val">' + escHtml(cl.notes) + '</span></div>';
  if (hid)             html += '<div class="rdp-row"><span class="rdp-row-label">Halaxy ID</span><span class="rdp-row-val" style="font-size:11px;color:#7A948F">' + escHtml(hid) + '</span></div>';
  html += '<div style="margin-top:8px">'
    + '<button class="rdp-ghost-btn" style="font-size:11px;padding:4px 10px" onclick="openEditClientTypePanel(\'' + escHtml(cl.id) + '\')">Edit type / parent…</button>'
    + '</div>';
  html += '</div>';

  // ── Halaxy billing history ──────────────────────────────────────────
  if (halaxyInvs.length) {
    var totalPaid  = halaxyInvs.reduce(function(s, i) { return s + (parseFloat(i.totalPaid)    || 0); }, 0);
    var totalOwing = halaxyInvs.reduce(function(s, i) { return s + (parseFloat(i.totalBalance) || 0); }, 0);
    html += '<div class="rdp-section">';
    html += '<div class="rdp-section-label">Halaxy billing — ' + halaxyInvs.length + ' invoice' + (halaxyInvs.length !== 1 ? 's' : '');
    if (totalPaid > 0)   html += ' · <span style="color:var(--s-complete)">$' + totalPaid.toFixed(0) + ' paid</span>';
    if (totalOwing > 0.005) html += ' · <span style="color:#BE6E44">$' + totalOwing.toFixed(0) + ' owing</span>';
    html += '</div>';
    halaxyInvs.slice(0, 15).forEach(function(inv) {
      var owing = parseFloat(inv.totalBalance) || 0;
      var paid  = owing < 0.01;
      html += '<div class="rdp-row">'
        + '<span class="rdp-row-label">' + escHtml(inv.date || '—') + '</span>'
        + '<span class="rdp-row-val">'
        + (inv.amount != null ? '$' + parseFloat(inv.amount).toFixed(0) : '—')
        + (paid
            ? ' <span style="color:var(--s-complete);font-size:10px">✓</span>'
            : (owing > 0 ? ' <span style="color:#BE6E44;font-size:10px">$' + owing.toFixed(0) + ' owing</span>' : ''))
        + '</span></div>';
    });
    html += '</div>';
  } else if (hid && halaxyVerified) {
    // Client IS in Halaxy but no invoices in the 90-day window
    html += '<div class="rdp-section"><div class="rdp-section-label">Halaxy billing</div>';
    html += '<div style="color:#9AABA8;font-size:12px;padding:4px 0">No invoices in the last 90 days</div>';
    html += '</div>';
  }

  // ── Dashboard sessions (manually logged) ────────────────────────────
  if (dbSessions.length) {
    html += '<div class="rdp-section">';
    html += '<div class="rdp-section-label">Logged sessions (' + dbSessions.length + ')</div>';
    dbSessions.slice(0, 10).forEach(function(s) {
      html += '<div class="rdp-row"><span class="rdp-row-label">' + escHtml(s.session_date || '') + '</span>'
        + '<span class="rdp-row-val">' + escHtml(s.status || '') + (s.amount ? ' · $' + s.amount : '') + '</span></div>';
    });
    html += '</div>';
  }

  // If truly nothing
  if (!halaxyInvs.length && !dbSessions.length && !(hid && halaxyVerified)) {
    html += '<div class="rdp-section"><div style="color:#9AABA8;font-size:12px;padding:4px 0">No billing history or logged sessions yet.</div></div>';
  }

  // Danger zone
  html += '<div class="rdp-danger-zone">';
  html += '<button class="rdp-danger-btn"'
    + ' data-cid="' + escHtml(cl.id) + '"'
    + ' data-cn="'  + escHtml(cl.display_name || '') + '"'
    + ' onclick="deleteClient(this.dataset.cid,this.dataset.cn)">🗑 Remove dashboard record</button>';
  html += '<div style="font-size:10px;color:#9AABA8;margin-top:4px">Does not affect Halaxy</div>';
  html += '</div>';
  return html;
}

/** Inline panel inside the detail panel to edit client_type, is_contact, parent_client_id */
function openEditClientTypePanel(clientId) {
  var clients = (_pipelineData && _pipelineData.clients) || [];
  var cl = clients.find(function(c) { return String(c.id) === String(clientId); });
  if (!cl) return;

  var TYPE_LABELS = { individual: 'Individual', couples: 'Couples', child: 'Child' };
  var parentName = '';
  if (cl.parent_client_id) {
    var pr = clients.find(function(x) { return x.id === cl.parent_client_id; });
    if (pr) parentName = pr.display_name;
  }

  var overlay = document.getElementById('edit-client-type-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'edit-client-type-modal';
    overlay.className = 'cl-modal-ov';
    overlay.onclick = function(ev) { if (ev.target === overlay) overlay.classList.remove('open'); };
    document.body.appendChild(overlay);
  }

  var clientOpts = clients.filter(function(c) { return c.id !== clientId; }).map(function(c) {
    return '<option value="' + escHtml(c.id) + '"' + (c.id === cl.parent_client_id ? ' selected' : '') + '>' + escHtml(c.display_name) + '</option>';
  }).join('');

  overlay.innerHTML = '<div class="cl-modal" style="max-width:360px">'
    + '<h2 class="cl-modal-title">Edit client type</h2>'
    + '<div class="cl-modal-field"><label>Client type</label>'
    + '<select class="cl-modal-select" id="ect-type" onchange="document.getElementById(\'ect-parent-row\').style.display=this.value===\'child\'?\'\':\'none\'">'
    + '<option value="individual"' + (cl.client_type === 'individual' || !cl.client_type ? ' selected' : '') + '>Individual</option>'
    + '<option value="couples"'  + (cl.client_type === 'couples'  ? ' selected' : '') + '>Couples</option>'
    + '<option value="child"'    + (cl.client_type === 'child'    ? ' selected' : '') + '>Child</option>'
    + '</select></div>'
    + '<div class="cl-modal-field"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">'
    + '<input type="checkbox" id="ect-contact"' + (cl.is_contact ? ' checked' : '') + '> Contact only (non-billable)</label></div>'
    + '<div class="cl-modal-field" id="ect-parent-row" style="display:' + (cl.client_type === 'child' ? '' : 'none') + '">'
    + '<label>Parent/Guardian client</label>'
    + '<select class="cl-modal-select" id="ect-parent-id"><option value="">— none —</option>' + clientOpts + '</select>'
    + '</div>'
    + '<div class="cl-modal-actions">'
    + '<button class="cl-modal-cancel" onclick="document.getElementById(\'edit-client-type-modal\').classList.remove(\'open\')">Cancel</button>'
    + '<button class="cl-modal-save" onclick="_saveClientType(\'' + escHtml(clientId) + '\')">Save</button>'
    + '</div></div>';
  overlay.classList.add('open');
}

async function _saveClientType(clientId) {
  var typeEl   = document.getElementById('ect-type');
  var contEl   = document.getElementById('ect-contact');
  var parentEl = document.getElementById('ect-parent-id');
  try {
    await apiFetch('/api/clients', {
      method: 'PATCH',
      body: {
        id:               clientId,
        client_type:      (typeEl   && typeEl.value)   || 'individual',
        is_contact:       !!(contEl && contEl.checked),
        parent_client_id: (parentEl && parentEl.value) || null,
      },
    });
    document.getElementById('edit-client-type-modal').classList.remove('open');
    toast('Client type updated ✓');
    refreshPipeline();
  } catch (err) {
    toast('Save failed: ' + err.message, 'err');
  }
}

// Helper: auto-fill intake URL when funder is selected in detail panel
function _rdpUpdateIntakeUrl(enquiryId) {
  var sel   = document.getElementById('rdp-intake-funder-' + enquiryId);
  var urlEl = document.getElementById('rdp-intake-url-'   + enquiryId);
  if (!sel || !urlEl) return;
  var known = HALAXY_URLS[sel.value] || '';
  urlEl.value         = known;
  urlEl.style.opacity = known ? '0.7' : '1';
  urlEl.placeholder   = known ? '' : 'Paste Halaxy form URL for this funder…';
  if (!known) urlEl.focus();
}

// Helper: send onboarding (intake) email from detail panel
async function _rdpSendIntake(enquiryId) {
  var funderSel = document.getElementById('rdp-intake-funder-' + enquiryId);
  var ctypeSel  = document.getElementById('rdp-ctype-'         + enquiryId);
  var clientType = funderSel ? funderSel.value : '';
  if (!clientType) { toast('Select a funding type first', 'err'); return; }

  var urlEl = document.getElementById('rdp-intake-url-' + enquiryId);
  var intakeUrl = (urlEl ? urlEl.value : '') || HALAXY_URLS[clientType] || '';
  intakeUrl = intakeUrl.trim();

  if (!intakeUrl || !intakeUrl.startsWith('http')) {
    toast('No intake URL available for that funding type — paste one in the URL field', 'err');
    return;
  }

  var personType = ctypeSel ? ctypeSel.value : '';

  try {
    await apiFetch('/api/admin-intake', { method: 'POST', body: { enquiryId: enquiryId, clientType: clientType, personType: personType, intakeUrl: intakeUrl } });
    // Also record the funder selection on the enquiry
    await apiFetch('/api/admin-enquiries?id=' + enquiryId, { method: 'PATCH', body: { intake_funder: clientType } }).catch(function() {});
    toast('Onboarding email sent ✓');
    closeDetailPanel();
    refreshPipeline();
  } catch (e) {
    toast('Could not send onboarding email: ' + e.message, 'err');
  }
}

/* ── Hello / greeting section (stubbed — replaced by sidebar badge) ── */
function renderHelloSection() {
  updateSidebarBadge(); // update queue badge instead
}

/* ── Add appointment (opens Google Calendar pre-filled) ── */
function openAddAppointmentModal() {
  var now   = new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
  var end   = new Date(start.getTime() + 60 * 60 * 1000);
  function pad(n) { return String(n).padStart(2, '0'); }
  function gcalDate(d) {
    return d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate())
      + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  var url = 'https://calendar.google.com/calendar/r/eventedit'
    + '?dates=' + gcalDate(start) + '/' + gcalDate(end)
    + '&cid=c_af1c120054ecb4479786f98965dc27dbf1b52ab7ae3a58db89a11f1f9da16ede%40group.calendar.google.com';
  window.open(url, '_blank');
}

/* ── Toggle pipeline card ── */
function togglePipelineCard(uid) {
  var card = document.getElementById('pl-' + uid);
  if (card) card.classList.toggle('expanded');
}

/* ── Toggle add-session form (pipeline) ── */
function toggleAddSessionFormPl(clientId) {
  var form = document.getElementById('pl-add-sess-' + clientId);
  if (!form) return;
  form.classList.toggle('open');
  if (form.classList.contains('open')) {
    var dateInput = document.getElementById('pl-sess-date-' + clientId);
    if (dateInput) dateInput.valueAsDate = new Date();
  }
}

/* ── Save session (pipeline) ── */
async function saveSessionPl(clientId) {
  var date   = (document.getElementById('pl-sess-date-' + clientId) || {}).value;
  var status = (document.getElementById('pl-sess-status-' + clientId) || {}).value || 'upcoming';
  var inv    = (document.getElementById('pl-sess-inv-' + clientId) || {}).value.trim();
  var notes  = (document.getElementById('pl-sess-notes-' + clientId) || {}).value.trim();
  if (!date) { toast('Enter a session date.', 'err'); return; }
  try {
    await apiFetch('/api/sessions', {
      method: 'POST',
      body: { client_id: clientId, session_date: date, status: status, invoice_ref: inv || null, notes: notes || null },
    });
    toast('Session added');
    refreshPipeline();
  } catch (err) {
    toast('Could not save session: ' + err.message, 'err');
  }
}

/* ── Advance session status (pipeline) ── */
async function advanceSessionPl(sessionId, newStatus, clientId) {
  try {
    await apiFetch('/api/sessions', { method: 'PATCH', body: { id: sessionId, status: newStatus } });
    toast('Updated to ' + STATUS_DISPLAY[newStatus]);
    refreshPipeline();
  } catch (err) {
    toast('Could not update: ' + err.message, 'err');
  }
}

/* ── Advance enquiry status ── */
async function advanceEnquiryStatus(id, newStatus) {
  try {
    await apiFetch('/api/admin-enquiries?id=' + id, { method: 'PATCH', body: { status: newStatus } });
    toast('Moved to ' + newStatus.replace('_', ' '));
    refreshPipeline();
  } catch (err) {
    toast('Could not update: ' + err.message, 'err');
  }
}

/* ── Save enquiry notes (pipeline) ── */
async function saveEnquiryNotesPl(id, notes) {
  try {
    await apiFetch('/api/admin-enquiries?id=' + id, { method: 'PATCH', body: { notes: notes } });
  } catch (e) {
    toast('Notes not saved: ' + e.message, 'err');
  }
}

/* ── Intake panel (pipeline) ── */
function togglePipelineIntake(id) {
  var panel = document.getElementById('pl-intake-' + id);
  if (!panel) return;
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) updatePipelineIntakeUrl(id);
}

function updatePipelineIntakeUrl(id) {
  var typeEl = document.getElementById('pl-itype-' + id);
  var urlEl  = document.getElementById('pl-iurl-' + id);
  if (!typeEl || !urlEl) return;
  var known = HALAXY_URLS[typeEl.value] || '';
  urlEl.value         = known;
  urlEl.style.opacity = known ? '0.7' : '1';
  urlEl.placeholder   = known ? '' : 'Paste Halaxy form URL…';
  if (!known) urlEl.focus();
}

async function sendIntakePl(id) {
  var typeEl  = document.getElementById('pl-itype-' + id);
  var urlEl   = document.getElementById('pl-iurl-' + id);
  var msgEl   = document.getElementById('pl-imsg-' + id);
  var sendBtn = document.querySelector('#pl-intake-' + id + ' .pl-intake-send');

  var intakeUrl  = (urlEl ? urlEl.value : '').trim();
  var clientType = typeEl ? typeEl.value : 'new';

  if (msgEl) { msgEl.textContent = ''; msgEl.style.color = 'var(--teal)'; }
  if (!intakeUrl || !intakeUrl.startsWith('http')) {
    if (msgEl) { msgEl.textContent = 'Paste a valid Halaxy URL first.'; msgEl.style.color = 'var(--terra)'; }
    return;
  }
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }
  try {
    await apiFetch('/api/admin-intake', { method: 'POST', body: { enquiryId: id, clientType: clientType, intakeUrl: intakeUrl } });
    if (msgEl) msgEl.textContent = 'Intake sent ✓';
    toast('Intake email sent');
    setTimeout(function() { refreshPipeline(); }, 1200);
  } catch (err) {
    if (msgEl) { msgEl.textContent = 'Error: ' + err.message; msgEl.style.color = 'var(--terra)'; }
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send →'; }
  }
}

/* ═══════════════════════════════════════════════════
   CREATE SESSION MODAL (from Website Contact)
   ═══════════════════════════════════════════════════ */

var _csEnquiryId    = null;  // currently open enquiry
var _csSearchTimer  = null;  // debounce timer
var _csPatientId    = null;  // selected Halaxy patient ID
var _csPatientName  = null;  // selected Halaxy patient name

function openCreateSessionModal(enquiryId) {
  if (!_pipelineData) return;
  var enq = (_pipelineData.enquiries || []).find(function(e) { return String(e.id) === String(enquiryId); });
  if (!enq) return;
  _csEnquiryId   = enquiryId;
  _csPatientId   = null;
  _csPatientName = null;

  // Fill contact card
  var contactCard = document.getElementById('cs-contact-card');
  if (contactCard) {
    var name  = [enq.first_name, enq.last_name].filter(Boolean).join(' ') || enq.display_name || '—';
    var lines = ['<strong>' + escHtml(name) + '</strong>'];
    if (enq.email)   lines.push('<a href="mailto:' + escHtml(enq.email) + '" style="color:var(--teal)">' + escHtml(enq.email) + '</a>');
    if (enq.phone)   lines.push(escHtml(enq.phone));
    if (enq.message) lines.push('<span style="color:var(--mid);font-size:12px">"' + escHtml(enq.message.slice(0,120)) + (enq.message.length>120?'…':'') + '"</span>');
    contactCard.innerHTML = lines.join('<br>');
  }

  // Reset fields
  document.getElementById('cs-halaxy-search').style.display = 'none';
  document.getElementById('cs-halaxy-search').value = '';
  document.getElementById('cs-halaxy-results').innerHTML = '';
  document.getElementById('cs-halaxy-id').value = '';
  document.getElementById('cs-halaxy-name').value = '';
  document.getElementById('cs-plan-manager').value = '';
  document.getElementById('cs-session-date').value = '';
  document.getElementById('cs-fee-amt').value = '';
  document.getElementById('cs-notes').value = '';
  document.getElementById('cs-pm-field').style.display = 'none';
  document.getElementById('cs-fee-row').style.display = 'none';

  // Populate funder dropdown
  var funderSel = document.getElementById('cs-funder');
  if (funderSel) {
    if (_halaxyFunders && _halaxyFunders.length) {
      funderSel.innerHTML = '<option value="">Select funder…</option>' + _buildFunderDropdownHtml(_halaxyFunders).replace('<option value="">Select…</option>','');
    } else {
      funderSel.innerHTML = '<option value="">No funders loaded — go to Settings → Sync funders & fees</option>';
    }
  }

  // Show modal
  document.getElementById('create-session-modal').classList.add('open');

  // Auto-search Halaxy by email
  var statusEl = document.getElementById('cs-halaxy-status');
  if (enq.email && _halaxyData && _halaxyData.connected) {
    if (statusEl) statusEl.innerHTML = '<span style="font-size:12px;color:var(--soft)">🔍 Searching Halaxy for ' + escHtml(enq.email) + '…</span>';
    fetch('/api/admin-enquiries?halaxy_search=' + encodeURIComponent(enq.email))
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var patients = d.patients || [];
        if (patients.length > 0) {
          var p = patients[0];
          _setCsPatient(p.id, p.name, true);
        } else {
          if (statusEl) statusEl.innerHTML = '<span style="font-size:12px;color:var(--soft)">No Halaxy match for this email — search by name:</span>';
          var searchEl = document.getElementById('cs-halaxy-search');
          if (searchEl) { searchEl.style.display = ''; searchEl.focus(); }
        }
      })
      .catch(function() {
        if (statusEl) statusEl.innerHTML = '<span style="font-size:12px;color:var(--soft)">Search failed — enter name below:</span>';
        var searchEl = document.getElementById('cs-halaxy-search');
        if (searchEl) searchEl.style.display = '';
      });
  } else {
    if (statusEl) statusEl.innerHTML = '<span style="font-size:12px;color:var(--soft)">Search Halaxy by name:</span>';
    var searchEl = document.getElementById('cs-halaxy-search');
    if (searchEl) { searchEl.style.display = ''; searchEl.focus(); }
  }
}

function _setCsPatient(id, name, isSuggested) {
  _csPatientId   = String(id);
  _csPatientName = name;
  document.getElementById('cs-halaxy-id').value   = String(id);
  document.getElementById('cs-halaxy-name').value = name;

  var statusEl = document.getElementById('cs-halaxy-status');
  if (statusEl) {
    var badge = isSuggested
      ? '<span style="font-size:10px;background:rgba(42,88,80,0.12);color:var(--teal);border-radius:4px;padding:1px 6px;margin-left:5px">Suggested</span>'
      : '';
    statusEl.innerHTML = '<div style="display:flex;align-items:center;gap:6px;font-size:13px">'
      + '✓ <strong>' + escHtml(name) + '</strong>' + badge
      + '<button onclick="_clearCsPatient()" style="margin-left:auto;font-size:10px;color:var(--soft);background:none;border:none;cursor:pointer;padding:2px 5px">✕ change</button>'
      + '</div>';
  }
  // Hide search input when patient selected
  var searchEl = document.getElementById('cs-halaxy-search');
  if (searchEl) searchEl.style.display = 'none';
  document.getElementById('cs-halaxy-results').innerHTML = '';

  // Fetch coverage to pre-fill funder
  fetch('/api/admin-enquiries?halaxy_coverage=' + encodeURIComponent(id))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.coverage && d.coverage.length) {
        var cov = d.coverage[0];
        var funderDisplay = [cov.payor, cov.typeText].filter(Boolean).join(' ');
        var fk = _mapCoverageToFunderKey(funderDisplay);
        if (fk) {
          var funderSel = document.getElementById('cs-funder');
          if (funderSel) {
            // Find matching option by billingKey
            for (var i = 0; i < funderSel.options.length; i++) {
              if (funderSel.options[i].dataset.billing === fk) {
                funderSel.selectedIndex = i;
                onCsFunderChange(funderSel);
                break;
              }
            }
          }
          // Pre-fill plan manager for NDIS
          if (fk === 'ndis_plan' && cov.payor && cov.payor.toLowerCase().indexOf('ndis') === -1) {
            var pmEl = document.getElementById('cs-plan-manager');
            if (pmEl) pmEl.value = cov.payor;
          }
        }
      }
    })
    .catch(function() {});
}

function _clearCsPatient() {
  _csPatientId   = null;
  _csPatientName = null;
  document.getElementById('cs-halaxy-id').value   = '';
  document.getElementById('cs-halaxy-name').value = '';
  var statusEl = document.getElementById('cs-halaxy-status');
  if (statusEl) statusEl.innerHTML = '<span style="font-size:12px;color:var(--soft)">Search by name:</span>';
  var searchEl = document.getElementById('cs-halaxy-search');
  if (searchEl) { searchEl.style.display = ''; searchEl.value = ''; searchEl.focus(); }
}

function _debounceCsSearch(query) {
  clearTimeout(_csSearchTimer);
  _csSearchTimer = setTimeout(function() { _runCsSearch(query); }, 350);
}

async function _runCsSearch(query) {
  var res = document.getElementById('cs-halaxy-results');
  if (!res) return;
  if (!query || query.trim().length < 2) { res.innerHTML = ''; return; }
  res.innerHTML = '<div style="font-size:12px;color:var(--soft)">Searching…</div>';
  try {
    var r = await fetch('/api/admin-enquiries?halaxy_patient_name=' + encodeURIComponent(query.trim()));
    var d = await r.json();
    var patients = d.patients || [];
    if (!patients.length) { res.innerHTML = '<div style="font-size:12px;color:var(--soft)">No results for "' + escHtml(query) + '"</div>'; return; }
    res.innerHTML = patients.map(function(p) {
      return '<div class="pl-link-result" onclick="_setCsPatient(\'' + escHtml(String(p.id)) + '\',\'' + escHtml(p.name) + '\',false)">'
        + '<span class="pl-link-result-name">' + escHtml(p.name) + '</span>'
        + '</div>';
    }).join('');
  } catch (_) { res.innerHTML = '<div style="font-size:12px;color:var(--soft)">Search error</div>'; }
}

function onCsFunderChange(sel) {
  var opt = sel.options[sel.selectedIndex];
  var billingKey = (opt && opt.dataset && opt.dataset.billing) || '';
  var funderId   = sel.value;
  document.getElementById('cs-pm-field').style.display = billingKey === 'ndis_plan' ? '' : 'none';
  var feeRow = document.getElementById('cs-fee-row');
  var feeSel = document.getElementById('cs-fee');
  if (!billingKey) { if (feeRow) feeRow.style.display = 'none'; return; }
  var fees     = _halaxyFees || [];
  var filtered = _filterFeesForFunder(fees, billingKey, funderId);
  if (filtered.length) {
    var dr = FUNDER_RATES[billingKey] || '';
    feeSel.innerHTML = '<option value="">— select fee —</option>'
      + filtered.map(function(f) {
          var s = dr && Math.abs(f.amount - parseFloat(dr)) < 1 ? ' selected' : '';
          return '<option value="' + f.amount + '"' + s + '>' + escHtml(f.name) + ' — $' + Number(f.amount).toFixed(2) + '</option>';
        }).join('');
    if (feeRow) feeRow.style.display = '';
    _syncCsFeeAmt();
  } else {
    feeSel.innerHTML = '<option value="">No fees found</option>';
    if (feeRow) feeRow.style.display = '';
  }
}

function _syncCsFeeAmt() {
  var sel = document.getElementById('cs-fee');
  var amt = document.getElementById('cs-fee-amt');
  if (sel && amt && sel.value) amt.value = sel.value;
}

function closeCreateSessionModal() {
  document.getElementById('create-session-modal').classList.remove('open');
  _csEnquiryId = _csPatientId = _csPatientName = null;
}

async function saveCreateSession() {
  var btn = document.getElementById('cs-save-btn');
  var halaxyId  = (document.getElementById('cs-halaxy-id').value   || '').trim();
  var halaxyName= (document.getElementById('cs-halaxy-name').value || '').trim();
  var funderSel = document.getElementById('cs-funder');
  var funderOpt = funderSel && funderSel.options[funderSel.selectedIndex];
  var funder    = (funderOpt && funderOpt.dataset && funderOpt.dataset.billing) || funderSel.value;
  var pm        = (document.getElementById('cs-plan-manager').value || '').trim();
  var sessionDate = document.getElementById('cs-session-date').value;
  var amount    = parseFloat(document.getElementById('cs-fee-amt').value) || null;
  var notes     = (document.getElementById('cs-notes').value || '').trim();

  if (!funder) { toast('Please select a funder.', 'err'); return; }

  // Derive display name: use Halaxy name if available, otherwise enquiry name
  var enq = (_pipelineData.enquiries || []).find(function(e) { return String(e.id) === String(_csEnquiryId); });
  var displayName = halaxyName || (enq ? [enq.first_name, enq.last_name].filter(Boolean).join(' ') || enq.display_name : '') || 'New client';

  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    // 1. Check if client already exists (by halaxy_id or enquiry_id)
    var existing = (_pipelineData.clients || []).find(function(c) {
      return (halaxyId && String(c.halaxy_id) === halaxyId) || (enq && String(c.enquiry_id) === String(enq.id));
    });

    var clientId = existing ? existing.id : null;

    if (!clientId) {
      var nc = await apiFetch('/api/clients', {
        method: 'POST',
        body: { display_name: displayName, funder: funder, plan_manager: pm || null, halaxy_id: halaxyId || null, notes: notes || null, enquiry_id: (enq ? enq.id : null) || null },
      });
      clientId = nc.id;
    }

    // 2. Create session if date provided
    if (sessionDate && amount) {
      await apiFetch('/api/sessions', {
        method: 'POST',
        body: { client_id: clientId, session_date: sessionDate, amount: amount, status: 'completed', notes: notes || null },
      });
    }

    // 3. Mark enquiry as converted
    if (_csEnquiryId) {
      await apiFetch('/api/admin-enquiries?id=' + _csEnquiryId, {
        method: 'PATCH',
        body: { status: 'converted' },
      });
    }

    toast('Appointment created ✓', 'ok');
    closeCreateSessionModal();
    refreshPipeline();
  } catch (err) {
    toast('Error: ' + err.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Create appointment →'; }
  }
}

/* ── Add client modal ── */
/* Open the add-client modal pre-filled to link an existing Halaxy patient */
function openHalaxyLinkPicker(clientId) {
  // Open the detail panel for this client — it has Halaxy link functionality
  openDetailPanel('client', clientId);
}

function _prefillImportPatient(hxId, name) {
  openAddClient(hxId);
}

// ── Map onboarding client to Halaxy ──────────────────────────────────────────
// Called from an onboarding client's detail view.
// Two paths:
//   1. Search for an existing Halaxy patient (already created in Halaxy by Cheree)
//   2. Create a new Halaxy patient now and link immediately
function openMapToHalaxy(clientId) {
  var clients = (_pipelineData && _pipelineData.clients) || [];
  var c = clients.find(function(x) { return x.id === clientId; });
  if (!c) return;

  var modal = document.getElementById('add-client-modal');
  if (!modal) return;

  modal.style.display = 'flex';
  _renderMapToHalaxySearch(modal, clientId, c);
}

function _renderMapToHalaxySearch(modal, clientId, c) {
  var inner = modal.querySelector('.cl-modal-inner') || modal;
  var displayName = escHtml(c.display_name || '');

  inner.innerHTML = '<div style="padding:28px 24px;max-width:480px;width:100%">'
    + '<div style="font-size:22px;font-weight:600;color:#1A2F2B;margin-bottom:6px">Map to Halaxy</div>'
    + '<div style="font-size:13px;color:#7A948F;margin-bottom:24px">Link <strong>' + displayName + '</strong> to their Halaxy patient record.</div>'

    // Option 1 — Search existing
    + '<div style="margin-bottom:20px">'
    + '<div style="font-size:11px;font-weight:600;color:#9AABA8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Already in Halaxy?</div>'
    + '<div style="font-size:12.5px;color:#4A5A58;margin-bottom:10px">Search for their existing patient record and link it.</div>'
    + '<input type="text" id="map-hx-search" class="cl-modal-input" placeholder="Search Halaxy by name…" oninput="_mapHxSearch(this.value,\'' + escHtml(clientId) + '\')" autocomplete="off">'
    + '<div id="map-hx-results" style="margin-top:6px"></div>'
    + '</div>'

    // Divider
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">'
    + '<div style="flex:1;height:1px;background:#E8E4DF"></div>'
    + '<div style="font-size:11px;color:#9AABA8">or</div>'
    + '<div style="flex:1;height:1px;background:#E8E4DF"></div>'
    + '</div>'

    // Option 2 — Create new (button shows the form)
    + '<div style="margin-bottom:24px">'
    + '<div style="font-size:11px;font-weight:600;color:#9AABA8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Not yet in Halaxy?</div>'
    + '<div style="font-size:12.5px;color:#4A5A58;margin-bottom:12px">Enter their details to create a new patient in Halaxy and link them automatically.</div>'
    + '<button class="cl-modal-save-btn" onclick="_showCreateHalaxyForm(\'' + escHtml(clientId) + '\')" style="width:100%;background:transparent;color:var(--teal);border:1.5px solid var(--teal)">Create new in Halaxy →</button>'
    + '</div>'

    + '<button onclick="closeAddClient()" style="background:none;border:none;color:#9AABA8;font-size:12px;cursor:pointer;padding:0">Cancel</button>'
    + '</div>';
}

function _showCreateHalaxyForm(clientId) {
  var clients = (_pipelineData && _pipelineData.clients) || [];
  var c = clients.find(function(x) { return x.id === clientId; });
  if (!c) return;
  var modal = document.getElementById('add-client-modal');
  if (!modal) return;

  // Try to pre-split display_name into first/last
  var parts = (c.display_name || '').trim().split(/\s+/);
  var prefillFirst = parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] || '');
  var prefillLast  = parts.length > 1 ? parts[parts.length - 1] : '';
  // If last name looks like an initial (single char), clear it so user fills properly
  if (prefillLast.length === 1) prefillLast = '';

  var inner = modal.querySelector('.cl-modal-inner') || modal;
  inner.innerHTML = '<div style="padding:28px 24px;max-width:480px;width:100%">'
    + '<div style="font-size:22px;font-weight:600;color:#1A2F2B;margin-bottom:6px">Create in Halaxy</div>'
    + '<div style="font-size:13px;color:#7A948F;margin-bottom:24px">A new patient record will be created in Halaxy and linked to this onboarding record.</div>'

    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">'
    + '<div><label style="font-size:11px;font-weight:600;color:#9AABA8;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">First name <span style="color:#BE6E44">*</span></label>'
    + '<input type="text" id="hx-create-first" class="cl-modal-input" value="' + escHtml(prefillFirst) + '" placeholder="First name" autocomplete="off"></div>'
    + '<div><label style="font-size:11px;font-weight:600;color:#9AABA8;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Last name <span style="color:#BE6E44">*</span></label>'
    + '<input type="text" id="hx-create-last" class="cl-modal-input" value="' + escHtml(prefillLast) + '" placeholder="Last name" autocomplete="off"></div>'
    + '</div>'

    + '<div style="margin-bottom:12px">'
    + '<label style="font-size:11px;font-weight:600;color:#9AABA8;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Date of birth</label>'
    + '<input type="date" id="hx-create-dob" class="cl-modal-input">'
    + '</div>'

    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">'
    + '<div><label style="font-size:11px;font-weight:600;color:#9AABA8;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Phone</label>'
    + '<input type="tel" id="hx-create-phone" class="cl-modal-input" placeholder="04xx xxx xxx"></div>'
    + '<div><label style="font-size:11px;font-weight:600;color:#9AABA8;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">Email</label>'
    + '<input type="email" id="hx-create-email" class="cl-modal-input" placeholder=""></div>'
    + '</div>'

    + '<div id="hx-create-error" style="display:none;color:#BE6E44;font-size:12px;margin-bottom:10px"></div>'

    + '<button id="hx-create-submit" class="cl-modal-save-btn" onclick="_submitCreateAndMap(\'' + escHtml(clientId) + '\')" style="width:100%;margin-bottom:10px">Create in Halaxy + Link →</button>'
    + '<button onclick="openMapToHalaxy(\'' + escHtml(clientId) + '\')" style="background:none;border:none;color:#9AABA8;font-size:12px;cursor:pointer;padding:0">← Back</button>'
    + '</div>';
}

async function _submitCreateAndMap(clientId) {
  var firstEl  = document.getElementById('hx-create-first');
  var lastEl   = document.getElementById('hx-create-last');
  var dobEl    = document.getElementById('hx-create-dob');
  var phoneEl  = document.getElementById('hx-create-phone');
  var emailEl  = document.getElementById('hx-create-email');
  var errEl    = document.getElementById('hx-create-error');
  var btn      = document.getElementById('hx-create-submit');

  var firstName = (firstEl && firstEl.value.trim()) || '';
  var lastName  = (lastEl  && lastEl.value.trim())  || '';
  if (!firstName || !lastName) {
    if (errEl) { errEl.textContent = 'First name and last name are required.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  try {
    var body = { clientId: clientId, firstName: firstName, lastName: lastName };
    if (dobEl   && dobEl.value)   body.dob   = dobEl.value;
    if (phoneEl && phoneEl.value.trim()) body.phone = phoneEl.value.trim();
    if (emailEl && emailEl.value.trim()) body.email = emailEl.value.trim();

    await apiFetch('/api/admin-enquiries?halaxy_create_and_map=1', { method: 'POST', body: body });
    closeAddClient();
    toast(firstName + ' ' + lastName + ' created in Halaxy and linked');
    refreshPipeline();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Create in Halaxy + Link →'; }
    if (errEl) { errEl.textContent = e.message || 'Something went wrong — please try again.'; errEl.style.display = 'block'; }
  }
}

async function _createAndMapHalaxyPatient(clientId) {
  // Kept for backwards-compat — now delegates to the form flow
  _showCreateHalaxyForm(clientId);
}

async function _mapHxSearch(q, clientId) {
  var el = document.getElementById('map-hx-results');
  if (!el) return;
  if (!q || q.trim().length < 2) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="font-size:12px;color:#9AABA8">Searching…</div>';
  try {
    var data = await apiFetch('/api/admin-enquiries?halaxy_search=' + encodeURIComponent(q.trim()));
    var patients = (data && data.patients) || [];
    // Filter out already-linked patients
    var linked = ((_pipelineData && _pipelineData.clients) || []).map(function(c) { return String(c.halaxy_id || ''); }).filter(Boolean);
    patients = patients.filter(function(p) { return !linked.includes(String(p.id)); });
    if (!patients.length) { el.innerHTML = '<div style="font-size:12px;color:#9AABA8">No patients found</div>'; return; }
    el.innerHTML = patients.slice(0, 8).map(function(p) {
      return '<div class="cl-halaxy-lookup-found" style="cursor:pointer;padding:6px 10px;border-radius:6px;margin-bottom:3px;background:#F5F2EF"'
        + ' onclick="_confirmMapHalaxy(\'' + escHtml(clientId) + '\',\'' + escHtml(String(p.id)) + '\',\'' + escHtml(p.name || '') + '\')">'
        + '<strong>' + escHtml(p.name || 'Unknown') + '</strong>'
        + ' <span style="font-size:11px;color:#9AABA8">ID: ' + escHtml(String(p.id)) + '</span>'
        + '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div style="font-size:12px;color:var(--amber)">Search failed</div>';
  }
}

async function _confirmMapHalaxy(clientId, hxId, hxName) {
  if (!confirm('Link this onboarding record to Halaxy patient "' + hxName + '"?\n\nThe Halaxy record will become the source of truth for name, funder, appointments and invoices.')) return;
  try {
    await apiFetch('/api/clients', { method: 'PATCH', body: { id: clientId, halaxy_id: hxId } });
    closeAddClient();
    toast('Mapped to Halaxy — client is now active');
    refreshPipeline();
  } catch (e) {
    toast('Could not map: ' + e.message, 'err');
  }
}


function openAddClient(prefillHalaxyId) {
  // Reset fields
  var ids = ['cl-display-name','cl-plan-manager','cl-halaxy-search','cl-halaxy-id','cl-notes',
             'cl-first-name','cl-last-name','cl-new-phone','cl-new-email','cl-new-dob','cl-new-notes','cl-new-plan-manager',
             'cl-parent-search','cl-parent-id','cl-new-parent-search','cl-new-parent-id',
             'cl-dash-name','cl-dash-plan-manager','cl-dash-notes'];
  ids.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  var newGender = document.getElementById('cl-new-gender'); if (newGender) newGender.value = '';
  var ctFind = document.getElementById('cl-client-type');      if (ctFind) ctFind.value   = 'individual';
  var ctNew  = document.getElementById('cl-new-client-type'); if (ctNew)  ctNew.value    = 'individual';
  var ctDash = document.getElementById('cl-dash-client-type');if (ctDash) ctDash.value   = 'individual';
  var icFind = document.getElementById('cl-is-contact');      if (icFind) icFind.checked = false;
  var icNew  = document.getElementById('cl-new-is-contact');  if (icNew)  icNew.checked  = false;
  var icDash = document.getElementById('cl-dash-is-contact'); if (icDash) icDash.checked = false;
  var pfFind = document.getElementById('cl-parent-field');    if (pfFind) pfFind.style.display = 'none';
  var pfNew  = document.getElementById('cl-new-parent-field');if (pfNew)  pfNew.style.display  = 'none';
  var prFind = document.getElementById('cl-parent-results');  if (prFind) prFind.innerHTML = '';
  var prNew  = document.getElementById('cl-new-parent-results'); if (prNew) prNew.innerHTML = '';
  _hideHalaxyLookup();
  var errEl = document.getElementById('cl-modal-error'); if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  // Show find-selected section hidden initially
  var findSel = document.getElementById('cl-find-selected'); if (findSel) findSel.style.display = 'none';
  delete document.getElementById('add-client-modal').dataset.enquiryId;
  setClientModalMode('search'); // always start in search mode
  _populateFunderDropdown();
  document.getElementById('add-client-modal').classList.add('open');

  // If coming from a Halaxy-only card, pre-fill and auto-select the patient
  if (prefillHalaxyId) {
    // Look up the patient name from the loaded Halaxy data
    var patient = (_halaxyData && _halaxyData.patients || []).find(function(p) {
      return String(p.id) === String(prefillHalaxyId);
    });
    var fullName = '';
    if (patient && patient.name && patient.name[0]) {
      var n = patient.name[0];
      fullName = [(n.given || []).join(' '), n.family].filter(Boolean).join(' ');
    }
    // Fall back to patientMap name (built from appointments)
    if (!fullName && _halaxyData && _halaxyData.patientMap && _halaxyData.patientMap[prefillHalaxyId]) {
      fullName = _halaxyData.patientMap[prefillHalaxyId];
    }
    var displayName = fullName || ('Patient #' + prefillHalaxyId);
    // Use the standard selection function — sets lookup chip, alias, reveals form fields
    setTimeout(function() { _selectModalHalaxyPatient(prefillHalaxyId, displayName); }, 20);
    setTimeout(function() { var s = document.getElementById('cl-display-name'); if (s) s.focus(); }, 80);
  } else {
    setTimeout(function() { var s = document.getElementById('cl-halaxy-search'); if (s) s.focus(); }, 80);
  }
}

function setClientModalMode(mode) {
  var findEl    = document.getElementById('cl-find-mode');
  var newEl     = document.getElementById('cl-new-mode');
  var dashEl    = document.getElementById('cl-dash-mode');
  var searchBtn = document.getElementById('cl-mode-search-btn');
  var newBtn    = document.getElementById('cl-mode-new-btn');
  var dashBtn   = document.getElementById('cl-mode-dash-btn');
  var saveBtn   = document.getElementById('cl-modal-save-btn');

  // Hide all panels, deactivate all buttons
  [findEl, newEl, dashEl].forEach(function(el) { if (el) el.style.display = 'none'; });
  [searchBtn, newBtn, dashBtn].forEach(function(btn) { if (btn) btn.classList.remove('cl-mode-btn--active'); });

  if (mode === 'new') {
    if (newEl)  newEl.style.display = '';
    if (newBtn) newBtn.classList.add('cl-mode-btn--active');
    if (saveBtn) saveBtn.textContent = 'Create in Halaxy →';
    setTimeout(function() { var f = document.getElementById('cl-first-name'); if (f) f.focus(); }, 80);
  } else if (mode === 'dashboard') {
    if (dashEl)   dashEl.style.display = '';
    if (dashBtn)  dashBtn.classList.add('cl-mode-btn--active');
    if (saveBtn)  saveBtn.textContent  = 'Add to dashboard';
    // Populate dashboard funder dropdown
    var dashFunderSel = document.getElementById('cl-dash-funder');
    if (dashFunderSel && _halaxyFunders && _halaxyFunders.length) {
      dashFunderSel.innerHTML = '<option value="">Select…</option>' + _buildFunderDropdownHtml(_halaxyFunders).replace('<option value="">Select…</option>', '');
    }
    setTimeout(function() { var n = document.getElementById('cl-dash-name'); if (n) n.focus(); }, 80);
  } else {
    // Default: 'search' / find mode
    if (findEl)    findEl.style.display = '';
    if (searchBtn) searchBtn.classList.add('cl-mode-btn--active');
    if (saveBtn)   saveBtn.textContent  = 'Add client';
    setTimeout(function() { var s = document.getElementById('cl-halaxy-search'); if (s) s.focus(); }, 80);
  }
  document.getElementById('add-client-modal').dataset.mode = mode;
}
function closeAddClient() {
  var modal = document.getElementById('add-client-modal');
  if (modal) modal.classList.remove('open');
}

/**
 * Build the intake-type <select> used on intake cards (in_halaxy stage).
 * Options are deduplicated billingKey groups derived from _halaxyFunders so
 * no hardcoded list ever appears.  Value is the billingKey so HALAXY_URLS
 * lookup in updatePipelineIntakeUrl() still works.
 */
function _intakeTypeSelectorHtml(id) {
  // Private and Medicare are always available (no Halaxy org); other funders
  // are shown if they have at least one Halaxy Organisation record.
  var alwaysOn   = ['private', 'medicare'];
  var orgBacked  = ['dva', 'ndis_plan', 'qfes', 'workcover'];
  var seen       = {};
  var funders    = _halaxyFunders || [];
  funders.forEach(function(f) { if (f.billingKey) seen[f.billingKey] = true; });

  var opts = alwaysOn.map(function(k) {
    return '<option value="' + k + '">' + escHtml(FUNDER_LABELS[k] || k) + '</option>';
  }).join('');

  orgBacked.forEach(function(k) {
    // Show if Halaxy has an org for it, OR if funders haven't loaded yet (show all as fallback)
    if (seen[k] || !funders.length) {
      opts += '<option value="' + k + '">' + escHtml(FUNDER_LABELS[k] || k) + '</option>';
    }
  });

  return '<select class="pl-intake-sel" id="pl-itype-' + id + '" onclick="event.stopPropagation()" onchange="updatePipelineIntakeUrl(\'' + id + '\')">'
    + opts + '</select>';
}

function _buildFunderDropdownHtml(funders) {
  // Private and Medicare have no Halaxy Organisation record — always add them as
  // static options so they never go missing from the dropdown.
  var html = '<option value="">Select…</option>'
    + '<option value="private"   data-billing="private">Private</option>'
    + '<option value="medicare"  data-billing="medicare">Medicare</option>';

  // Group remaining Halaxy org funders by billingKey
  var groups     = {};
  var groupOrder = ['dva', 'ndis_plan', 'qfes', 'workcover'];
  funders.forEach(function(f) {
    var k = f.billingKey;
    if (!k || k === 'private' || k === 'medicare') return; // already handled above
    if (!groups[k]) groups[k] = [];
    groups[k].push(f);
  });
  groupOrder.forEach(function(key) {
    var grp = groups[key];
    if (!grp || !grp.length) return;
    html += '<optgroup label="' + escHtml(FUNDER_LABELS[key] || key) + '">';
    grp.forEach(function(f) {
      html += '<option value="' + escHtml(f.id) + '" data-billing="' + escHtml(f.billingKey) + '" data-name="' + escHtml(f.name) + '">'
            + escHtml(f.name) + '</option>';
    });
    html += '</optgroup>';
  });
  return html;
}

function _populateFunderDropdown() {
  var noFundersMsg = '<option value="">No funders loaded — click \'⟳ Sync funders & fees\' in Settings</option>';
  var loadingMsg   = '<option value="">Loading funders…</option>';

  function _setDropdowns(html) {
    ['cl-funder', 'cl-new-funder', 'cl-dash-funder'].forEach(function(id) {
      var sel = document.getElementById(id);
      if (sel) sel.innerHTML = html;
    });
  }

  if (_halaxyFunders === null) {
    _setDropdowns(loadingMsg);
    var attempts = 0;
    var poll = setInterval(function() {
      attempts++;
      if (_halaxyFunders !== null) {
        clearInterval(poll);
        _setDropdowns(_halaxyFunders.length ? _buildFunderDropdownHtml(_halaxyFunders) : noFundersMsg);
      } else if (attempts > 30) {
        clearInterval(poll);
        _setDropdowns(noFundersMsg);
      }
    }, 300);
  } else {
    _setDropdowns(_halaxyFunders.length ? _buildFunderDropdownHtml(_halaxyFunders) : noFundersMsg);
  }
}

/** Called when the funder dropdown changes (data-billing drives plan manager + fee load) */
function onModalFunderChange(sel, mode) {
  var opt        = sel.options[sel.selectedIndex];
  var billingKey = (opt && opt.dataset.billing) || '';
  var pmFieldId  = (mode === 'new') ? 'plan-manager-field-new'
                 : (mode === 'dash') ? 'plan-manager-field-dash'
                 : 'plan-manager-field';
  var pmField    = document.getElementById(pmFieldId);
  if (pmField) pmField.style.display = billingKey === 'ndis_plan' ? '' : 'none';
  var funderId = sel.value;
  _loadModalFees(billingKey, funderId);
}

/** Legacy alias used in a few places */
function togglePlanManager(billingKey) {
  var field = document.getElementById('plan-manager-field');
  if (field) field.style.display = billingKey === 'ndis_plan' ? '' : 'none';
}

async function _loadModalFees(funderKey, funderId) {
  var feeRow = document.getElementById('cl-session-fee-row');
  var feeSel = document.getElementById('cl-session-fee');
  if (!feeRow || !feeSel) return;
  if (!funderKey) { feeRow.style.display = 'none'; return; }

  // Ensure fees are loaded
  if (!_halaxyFees) {
    try {
      var r2 = await fetch('/api/admin-enquiries?halaxy_fees=1');
      var d2 = await r2.json();
      _halaxyFees = d2.fees || [];
    } catch (_) { _halaxyFees = []; }
  }
  var fees = _halaxyFees;

  var filtered = _filterFeesForFunder(fees, funderKey, funderId);

  var defaultRate = FUNDER_RATES[funderKey] || '';
  feeSel.innerHTML = '<option value="">— select fee —</option>'
    + filtered.map(function(f) {
        var sel = defaultRate && Math.abs(f.amount - parseFloat(defaultRate)) < 1 ? ' selected' : '';
        return '<option value="' + f.amount + '"' + sel + '>' + escHtml(f.name) + ' — $' + Number(f.amount).toFixed(2) + '</option>';
      }).join('');
  feeRow.style.display = '';
  _syncModalFeeAmt();
}

function _syncModalFeeAmt() {
  var sel = document.getElementById('cl-session-fee');
  var amt = document.getElementById('cl-session-fee-amt');
  if (sel && amt && sel.value) amt.value = sel.value;
}

function _debounceModalHalaxySearch(query) {
  clearTimeout(_modalSearchTimer);
  var el = document.getElementById('cl-halaxy-lookup');
  if (!query || query.length < 2) {
    if (el) el.innerHTML = '';
    return;
  }
  if (el) el.innerHTML = '<div class="cl-halaxy-lookup-searching">🔍 Searching Halaxy…</div>';
  _modalSearchTimer = setTimeout(function() { _searchHalaxyPatientsModal(query); }, 350);
}

async function _searchHalaxyPatientsModal(query) {
  var el = document.getElementById('cl-halaxy-lookup');
  if (!el) return;
  try {
    var r = await fetch('/api/admin-enquiries?halaxy_patient_name=' + encodeURIComponent(query));
    var d = await r.json();
    var pts = d.patients || [];
    if (!pts.length) {
      el.innerHTML = '<div class="cl-halaxy-lookup-notfound">No Halaxy patients found for "' + escHtml(query) + '"</div>';
      return;
    }
    el.innerHTML = pts.map(function(p) {
      var local = (_pipelineData && _pipelineData.clients || []).find(function(c) { return String(c.halaxy_id) === String(p.id); });
      var meta  = local ? ' <span style="color:var(--accent);font-size:10px">· in dashboard ✓</span>' : '';
      return '<div class="cl-halaxy-lookup-found" style="cursor:pointer;padding:5px 8px;border-radius:5px;margin-bottom:3px" '
        + 'onclick="_selectModalHalaxyPatient(\'' + escHtml(String(p.id)) + '\',\'' + escHtml(p.name) + '\')">'
        + escHtml(p.name) + meta + '</div>';
    }).join('');
  } catch (_) {
    if (el) el.innerHTML = '';
  }
}

function _selectModalHalaxyPatient(patientId, patientName) {
  document.getElementById('cl-halaxy-id').value     = patientId;
  document.getElementById('cl-halaxy-search').value = patientName;
  var el = document.getElementById('cl-halaxy-lookup');
  if (el) el.innerHTML = '<div class="cl-halaxy-lookup-found">✓ Selected: <strong>' + escHtml(patientName) + '</strong>'
    + ' <span style="color:var(--soft);font-size:10px">(ID: ' + escHtml(patientId) + ')</span>'
    + ' <button class="pl-action-btn pl-action-btn--soft" style="padding:2px 8px;font-size:10px;margin-left:6px"'
    + ' onclick="_clearModalHalaxySelection()">✕ Change</button></div>';
  // Pre-fill alias field and reveal the rest of the find-mode form
  var nameEl = document.getElementById('cl-display-name');
  if (nameEl && !nameEl.value) {
    // Generate a privacy alias: first word + last initial if multi-word name
    var parts = patientName.trim().split(/\s+/);
    nameEl.value = parts.length > 1 ? (parts[0] + ' ' + parts[parts.length - 1][0] + '.') : patientName;
  }
  var findSel = document.getElementById('cl-find-selected');
  if (findSel) findSel.style.display = '';

  // Pre-fill funder from Halaxy Coverage
  _prefillFunderFromCoverage(patientId);
}

async function _prefillFunderFromCoverage(hxId) {
  try {
    var data = await apiFetch('/api/admin-enquiries?halaxy_coverage=' + encodeURIComponent(hxId));
    var coverage = (data && data.coverage) || [];

    var funderKey = null;

    // Primary: Coverage resource payor name
    if (coverage.length) {
      funderKey = _guessFunderKey(coverage[0].payor || coverage[0].typeText || '');
    }

    // Fallback: infer from this patient's most recent invoice fee name
    // (Some funders like QFES may not have a Coverage resource in Halaxy
    //  but the fee name in their invoice will contain "QFES".)
    if (!funderKey) {
      var invoices = (_halaxyData && _halaxyData.invoices) || [];
      var patInvoices = invoices.filter(function(inv) {
        return inv.patientId && String(inv.patientId) === String(hxId);
      });
      if (patInvoices.length) {
        // Sort most recent first
        patInvoices.sort(function(a, b) { return (b.date || '') > (a.date || '') ? 1 : -1; });
        funderKey = _guessFunderKey(patInvoices[0].feeName || patInvoices[0].description || '');
      }
    }

    if (!funderKey) return;

    // Set funder dropdown — options are keyed by Halaxy org ID with data-billing = funderKey,
    // so match on data-billing rather than value.
    var selEl = document.getElementById('cl-funder');
    var mode  = undefined;
    if (!selEl) { selEl = document.getElementById('cl-new-funder'); mode = 'new'; }
    if (selEl) {
      var matchOpt = Array.prototype.find.call(selEl.options, function(o) {
        return o.dataset.billing === funderKey || o.value === funderKey;
      });
      if (matchOpt) {
        selEl.value = matchOpt.value;
        onModalFunderChange(selEl, mode);
      }
    }
  } catch (_) {}
}

function _clearModalHalaxySelection() {
  document.getElementById('cl-halaxy-id').value     = '';
  document.getElementById('cl-halaxy-search').value = '';
  document.getElementById('cl-display-name').value  = '';
  var el = document.getElementById('cl-halaxy-lookup');
  if (el) el.innerHTML = '';
  var findSel = document.getElementById('cl-find-selected');
  if (findSel) findSel.style.display = 'none';
}

/** Show/hide parent-client field when client type is 'child' */
function onClientTypeChange(sel, mode) {
  var parentField = document.getElementById(mode === 'find' ? 'cl-parent-field' : 'cl-new-parent-field');
  if (parentField) parentField.style.display = sel.value === 'child' ? '' : 'none';
}

var _parentSearchTimer = null;
function _debounceParentSearch(query, mode) {
  clearTimeout(_parentSearchTimer);
  var resEl = document.getElementById(mode === 'find' ? 'cl-parent-results' : 'cl-new-parent-results');
  if (!query || query.length < 2) { if (resEl) resEl.innerHTML = ''; return; }
  _parentSearchTimer = setTimeout(function() { _searchParentClients(query, mode); }, 300);
}

function _searchParentClients(query, mode) {
  var resEl = document.getElementById(mode === 'find' ? 'cl-parent-results' : 'cl-new-parent-results');
  var idEl  = document.getElementById(mode === 'find' ? 'cl-parent-id'      : 'cl-new-parent-id');
  if (!resEl) return;
  var clients = (_pipelineData && _pipelineData.clients) || [];
  var q = query.toLowerCase();
  var matches = clients.filter(function(c) { return (c.display_name || '').toLowerCase().includes(q); }).slice(0, 6);
  if (!matches.length) { resEl.innerHTML = '<div style="font-size:11px;color:#9AABA8;padding:4px 0">No clients found</div>'; return; }
  resEl.innerHTML = matches.map(function(c) {
    return '<div class="cl-halaxy-lookup-found" style="cursor:pointer;padding:4px 8px;border-radius:5px;margin-bottom:2px"'
      + ' onclick="_selectParentClient(\'' + escHtml(c.id) + '\',\'' + escHtml(c.display_name) + '\',\'' + mode + '\')">'
      + escHtml(c.display_name) + '</div>';
  }).join('');
}

function _selectParentClient(clientId, clientName, mode) {
  var idEl  = document.getElementById(mode === 'find' ? 'cl-parent-id'      : 'cl-new-parent-id');
  var srEl  = document.getElementById(mode === 'find' ? 'cl-parent-search'  : 'cl-new-parent-search');
  var resEl = document.getElementById(mode === 'find' ? 'cl-parent-results' : 'cl-new-parent-results');
  if (idEl)  idEl.value  = clientId;
  if (srEl)  srEl.value  = clientName;
  if (resEl) resEl.innerHTML = '<div style="font-size:11px;color:var(--teal)">✓ ' + escHtml(clientName) + '</div>';
}

async function saveNewClient() {
  var modal   = document.getElementById('add-client-modal');
  var mode    = (modal && modal.dataset.mode) || 'search';
  var errEl   = document.getElementById('cl-modal-error');
  var saveBtn = document.getElementById('cl-modal-save-btn');
  function showErr(msg) { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } else toast(msg, 'err'); }

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  try {
    if (mode === 'new') {
      // ── NEW PATIENT IN HALAXY ──────────────────────────────────────
      var firstName = (document.getElementById('cl-first-name') || {}).value.trim();
      var lastName  = (document.getElementById('cl-last-name')  || {}).value.trim();
      var phone     = (document.getElementById('cl-new-phone')  || {}).value.trim();
      var email     = (document.getElementById('cl-new-email')  || {}).value.trim();
      var dob       = (document.getElementById('cl-new-dob')    || {}).value.trim();
      var gender    = (document.getElementById('cl-new-gender') || {}).value;
      var funderSel = document.getElementById('cl-new-funder');
      var funderOpt = funderSel && funderSel.options[funderSel.selectedIndex];
      var funder    = (funderOpt && (funderOpt.dataset.billing || funderSel.value)) || '';
      var pm        = (document.getElementById('cl-new-plan-manager') || {}).value.trim();
      var notes     = (document.getElementById('cl-new-notes') || {}).value.trim();

      if (!firstName) { showErr('First name is required'); return; }
      if (!lastName)  { showErr('Last name is required');  return; }

      var clientTypeN = (document.getElementById('cl-new-client-type') || {}).value || 'individual';
      var isContactN  = !!(document.getElementById('cl-new-is-contact') || {}).checked;
      var parentIdN   = (document.getElementById('cl-new-parent-id')   || {}).value.trim() || null;

      var resp = await apiFetch('/api/admin-enquiries?halaxy_create_patient=1', {
        method: 'POST',
        body: { firstName, lastName, phone: phone || undefined, email: email || undefined,
                dob: dob || undefined, gender: gender || undefined,
                funder: funder || undefined, planManager: pm || undefined, notes: notes || undefined,
                client_type: clientTypeN || undefined, is_contact: isContactN || undefined,
                parent_client_id: parentIdN || undefined },
      });
      toast('Patient created in Halaxy ✓ — ' + resp.client.display_name);

      // Write Coverage (funder) to Halaxy for non-private funders
      if (funder && funder !== 'private' && resp.halaxyId) {
        var hxF = (_halaxyFunders || []).find(function(f) { return f.billingKey === funder || f.key === funder; });
        apiFetch('/api/admin-enquiries?halaxy_coverage=1', {
          method: 'POST',
          body: { patientId: String(resp.halaxyId), payorId: hxF ? hxF.id : null, payorName: hxF ? hxF.name : (FUNDER_LABELS[funder] || funder) }
        }).catch(function() {}); // non-blocking, best-effort
      }

      // If this creation was triggered from an enquiry's "Add to Halaxy" flow, advance that enquiry
      if (window._pendingEnqId) {
        var pendingId = window._pendingEnqId;
        window._pendingEnqId = null;
        await apiFetch('/api/admin-enquiries?id=' + pendingId, { method: 'PATCH', body: { status: 'in_halaxy' } }).catch(function() {});
      }

    } else if (mode === 'dashboard') {
      // ── DASHBOARD ONLY: Supabase record, no Halaxy ID ──────────────
      var dashName    = (document.getElementById('cl-dash-name')        || {}).value.trim();
      var dashFundSel = document.getElementById('cl-dash-funder');
      var dashFundOpt = dashFundSel && dashFundSel.options[dashFundSel.selectedIndex];
      var dashFunder  = (dashFundOpt && (dashFundOpt.dataset.billing || dashFundSel.value)) || '';
      var dashPm      = (document.getElementById('cl-dash-plan-manager') || {}).value.trim();
      var dashNotes   = (document.getElementById('cl-dash-notes')        || {}).value.trim();
      var dashCtType  = (document.getElementById('cl-dash-client-type')  || {}).value || 'individual';
      var dashContact = !!(document.getElementById('cl-dash-is-contact') || {}).checked;

      if (!dashName) { showErr('Display name is required'); return; }

      await apiFetch('/api/clients', {
        method: 'POST',
        body: { display_name: dashName, funder: dashFunder || null, plan_manager: dashPm || null,
                halaxy_id: null, notes: dashNotes || null,
                client_type: dashCtType || null, is_contact: dashContact || false },
      });
      toast('Client added to dashboard ✓ — ' + dashName);

    } else {
      // ── LINK EXISTING HALAXY PATIENT ───────────────────────────────
      var halaxyId    = (document.getElementById('cl-halaxy-id')      || {}).value.trim();
      var name        = (document.getElementById('cl-display-name')   || {}).value.trim();
      var funderSel   = document.getElementById('cl-funder');
      var funderOpt   = funderSel && funderSel.options[funderSel.selectedIndex];
      var funder      = (funderOpt && (funderOpt.dataset.billing || funderSel.value)) || '';
      var pm          = (document.getElementById('cl-plan-manager')   || {}).value.trim()
                     || (funderOpt && funderOpt.dataset.billing === 'ndis_plan' ? funderOpt.dataset.name || '' : '');
      var notes       = (document.getElementById('cl-notes')          || {}).value.trim();
      var clientTypeF = (document.getElementById('cl-client-type')    || {}).value || 'individual';
      var isContactF  = !!(document.getElementById('cl-is-contact')   || {}).checked;
      var parentIdF   = (document.getElementById('cl-parent-id')      || {}).value.trim() || null;

      if (!halaxyId) { showErr('Please search for and select a Halaxy patient first'); return; }
      if (!name)     { showErr('Please enter a dashboard alias (e.g. Sarah J.)'); return; }

      await apiFetch('/api/clients', {
        method: 'POST',
        body: { display_name: name, funder: funder || null, plan_manager: pm || null,
                halaxy_id: halaxyId, notes: notes || null,
                client_type: clientTypeF || null, is_contact: isContactF || false,
                parent_client_id: parentIdF || null },
      });
      toast('Client linked ✓ — ' + name);
    }

    closeAddClient();
    refreshPipeline();
  } catch (err) {
    showErr(err.message || 'Could not save client');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = mode === 'new' ? 'Create in Halaxy →' : mode === 'dashboard' ? 'Add to dashboard' : 'Add client'; }
  }
}

/* ── Link enquiry to existing client (merge/convert flow) ── */
var _linkEnquiryId   = null;
var _linkEnquiryName = '';

function openLinkEnquiryModal(enquiryId, enquiryName) {
  _linkEnquiryId   = enquiryId;
  _linkEnquiryName = enquiryName;
  var clients = (_pipelineData && _pipelineData.clients) || [];
  // Build a searchable client list
  var listHtml = clients.length
    ? clients.map(function(c) {
        return '<div class="cl-halaxy-lookup-found" style="cursor:pointer;padding:6px 10px;border-radius:6px;margin-bottom:4px"'
          + ' onclick="confirmLinkEnquiry(\'' + c.id + '\',\'' + escHtml(c.display_name) + '\')">'
          + '<strong>' + escHtml(c.display_name) + '</strong>'
          + (c.halaxy_id ? ' <span style="font-size:10px;color:var(--soft)">· Halaxy linked</span>' : '')
          + (c.funder ? ' <span style="font-size:10px;color:var(--soft)">· ' + escHtml(c.funder) + '</span>' : '')
          + '</div>';
      }).join('')
    : '<div style="color:var(--soft);font-size:12px;padding:8px 0">No clients in dashboard yet</div>';

  var overlay = document.getElementById('link-enquiry-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'link-enquiry-modal';
    overlay.className = 'cl-modal-ov';
    overlay.onclick = function(ev) { if (ev.target === overlay) closeLinkEnquiryModal(); };
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = '<div class="cl-modal" style="max-width:420px">'
    + '<h2 class="cl-modal-title">Link <em>' + escHtml(_linkEnquiryName) + '</em> to a client</h2>'
    + '<p style="font-size:12px;color:var(--soft);margin:0 0 14px">The enquiry will be marked converted and removed from intake.</p>'
    + '<div style="max-height:260px;overflow-y:auto">' + listHtml + '</div>'
    + '<div class="cl-modal-actions" style="margin-top:14px">'
    + '<button class="cl-modal-cancel" onclick="closeLinkEnquiryModal()">Cancel</button>'
    + '</div>'
    + '</div>';
  overlay.classList.add('open');
}

function closeLinkEnquiryModal() {
  var overlay = document.getElementById('link-enquiry-modal');
  if (overlay) overlay.classList.remove('open');
}

async function confirmLinkEnquiry(clientId, clientName) {
  closeLinkEnquiryModal();
  if (!_linkEnquiryId) return;
  try {
    await apiFetch('/api/admin-enquiries?id=' + _linkEnquiryId, {
      method: 'PATCH',
      body: { client_id: clientId, status: 'converted' },
    });
    toast('Enquiry linked to ' + clientName + ' ✓ — removed from intake');
    refreshPipeline();
  } catch (err) {
    toast('Could not link: ' + err.message, 'err');
  }
}

/* ── Archive / reactivate client ── */
async function setClientActivePl(clientId, active) {
  var label = active ? 'reactivated' : 'archived';
  if (!active && !confirm('Archive this client?')) return;
  try {
    await apiFetch('/api/clients', { method: 'PATCH', body: { id: clientId, active: active } });
    toast('Client ' + label);
    refreshPipeline();
  } catch (err) {
    toast('Could not update client: ' + err.message, 'err');
  }
}

/* ── Edit client ── */
async function editClientPl(clientId) {
  if (!_pipelineData) return;
  var client = (_pipelineData.clients || []).find(function(c) { return c.id === clientId; });
  if (!client) return;
  var newName = prompt('Edit display name:', client.display_name);
  if (newName === null || newName.trim() === client.display_name) return;
  try {
    await apiFetch('/api/clients', { method: 'PATCH', body: { id: clientId, display_name: newName.trim() } });
    toast('Client updated');
    refreshPipeline();
  } catch (err) {
    toast('Could not update: ' + err.message, 'err');
  }
}

/* ── Halaxy Patient ID link / unlink ── */
async function saveHalaxyIdPl(clientId) {
  var inp = document.getElementById('pl-halaxy-inp-' + clientId);
  var val = (inp ? inp.value : '').trim();
  if (!val) { toast('Paste a Halaxy Patient ID first.', 'err'); return; }
  try {
    await apiFetch('/api/clients', { method: 'PATCH', body: { id: clientId, halaxy_id: val } });
    toast('Halaxy linked ✓');
    refreshPipeline();
  } catch (err) {
    toast('Could not link: ' + err.message, 'err');
  }
}

async function clearHalaxyIdPl(clientId) {
  if (!confirm('Unlink this client from Halaxy? Appointment data won\'t show until you re-link.')) return;
  try {
    await apiFetch('/api/clients', { method: 'PATCH', body: { id: clientId, halaxy_id: null } });
    toast('Halaxy unlinked');
    refreshPipeline();
  } catch (err) {
    toast('Could not unlink: ' + err.message, 'err');
  }
}

/* ── Google Calendar pending events ── */
/* Confirm before redirecting to reconnect Google Calendar */
function confirmGcalReconnect(e) {
  var chip = document.getElementById('gcal-chip');
  var dot  = document.getElementById('gcal-status-dot');
  // Only redirect if disconnected/errored — when connected, just a gentle confirm
  var isConnected = dot && dot.classList.contains('halaxy-dot--ok');
  if (isConnected) {
    return window.confirm('Reconnect Google Calendar? You\'ll be redirected briefly.');
  }
  return true; // always allow if not connected
}

async function loadCalendarPending() {
  var chip    = document.getElementById('gcal-chip');
  var dot     = document.getElementById('gcal-status-dot');
  var label   = document.getElementById('gcal-chip-label');
  var tooltip = document.getElementById('gcal-tooltip');

  function _setChip(state, text, tip) {
    if (dot) {
      dot.className = 'halaxy-dot '
        + (state === 'ok'      ? 'halaxy-dot--ok'
         : state === 'loading' ? 'halaxy-dot--loading'
         :                       'halaxy-dot--err');
    }
    if (label)   label.textContent   = text;
    if (tooltip) tooltip.innerHTML   = tip + '<br><span style="opacity:0.65;font-size:10px">Click to reconnect</span>';
  }

  try {
    var r = await fetch('/api/calendar-pending');
    var d = await r.json();

    if (!d.connected) {
      _setChip('err', 'Calendar', 'Not connected');
      _calEventsLoaded = true;
      renderAppointmentsPanel();
      return;
    }

    var count = (d.events || []).length;
    _setChip('ok', 'Calendar', '✓ Connected · ' + count + ' event' + (count !== 1 ? 's' : ''));

    // Store all events in lookup map
    (d.events || []).forEach(function(e) {
      _calEventMap[String(e.id)] = e;
    });

    _calEventsLoaded = true;
    renderAppointmentsPanel();

  } catch (err) {
    _setChip('err', 'Calendar', 'Error: ' + err.message);
    _calEventsLoaded = true;
    renderAppointmentsPanel();
  }
}

/* ── Convert calendar event to client ── */
function convertPendingPl(event) {
  document.getElementById('cl-display-name').value = event.title || '';
  document.getElementById('cl-funder').value        = '';
  document.getElementById('cl-plan-manager').value  = '';
  document.getElementById('cl-halaxy-id').value     = '';
  document.getElementById('cl-notes').value         = event.description || '';
  togglePlanManager('');
  _hideHalaxyLookup();
  document.getElementById('add-client-modal').classList.add('open');
  document.getElementById('cl-funder').focus();
}

/* ── Convert enquiry → client (with Halaxy email match) ── */
async function convertEnquiryPl(enquiryId) {
  if (!_pipelineData) return;
  var enq = (_pipelineData.enquiries || []).find(function(e) { return String(e.id) === String(enquiryId); });
  if (!enq) return;

  // Pre-fill modal with enquiry data
  var name = [enq.first_name, enq.last_name].filter(Boolean).join(' ') || enq.display_name || '';
  document.getElementById('cl-display-name').value    = name;
  document.getElementById('cl-funder').value           = '';
  document.getElementById('cl-plan-manager').value     = '';
  document.getElementById('cl-halaxy-search').value   = '';
  document.getElementById('cl-halaxy-id').value        = '';
  document.getElementById('cl-notes').value            = enq.message || enq.notes || '';
  document.getElementById('cl-session-date').value    = '';
  document.getElementById('cl-session-fee-amt').value = '';
  var feeRow = document.getElementById('cl-session-fee-row');
  if (feeRow) feeRow.style.display = 'none';
  togglePlanManager('');

  // Store source enquiry id on the modal for reference
  document.getElementById('add-client-modal').dataset.enquiryId = enquiryId;

  // Open modal — populate funder dropdown from cached funders
  _populateFunderDropdown();
  document.getElementById('add-client-modal').classList.add('open');
  document.getElementById('cl-display-name').focus();

  // Halaxy email lookup
  if (!enq.email) {
    _showHalaxyLookup('no_email', null);
    return;
  }
  if (!_halaxyData.connected) {
    _hideHalaxyLookup();
    return;
  }

  var el = document.getElementById('cl-halaxy-lookup');
  if (el) el.innerHTML = '<div class="cl-halaxy-lookup-searching">🔍 Searching Halaxy by email…</div>';
  try {
    var r = await fetch('/api/admin-enquiries?halaxy_search=' + encodeURIComponent(enq.email));
    var d = await r.json();
    var patients = d.patients || [];
    if (patients.length > 0) {
      var p     = patients[0];
      var pname = p.name || ('Patient #' + p.id);
      _selectModalHalaxyPatient(String(p.id), pname);
    } else {
      if (el) el.innerHTML = '<div class="cl-halaxy-lookup-notfound">⚠ No Halaxy patient found with this email yet. Search by name above, or link manually once they complete intake.</div>';
    }
  } catch (_) {
    _hideHalaxyLookup();
  }
}

/* _showHalaxyLookup removed — replaced by _selectModalHalaxyPatient / _debounceModalHalaxySearch */

function _hideHalaxyLookup() {
  var el = document.getElementById('cl-halaxy-lookup');
  if (el) { el.innerHTML = ''; }
}

function _useHalaxyPatient(patientId, patientName) {
  _selectModalHalaxyPatient(patientId, patientName);
}

/* ═══════════════════════════════════════
   CARD HOVER MENU
   ═══════════════════════════════════════ */

/**
 * Build the ⋯ hover-menu HTML for a card.
 * items: [{ label, fn, warn }]
 */
function _menuHtml(uid, items) {
  var ddItems = items.map(function(item) {
    return '<button class="pl-dd-item' + (item.warn ? ' pl-dd-item--warn' : '') + '"'
      + ' onclick="event.stopPropagation();closeCardMenus();' + item.fn + '">'
      + item.label + '</button>';
  }).join('');
  return '<div class="pl-card-menu" onclick="event.stopPropagation()">'
    + '<button class="pl-card-menu-btn" id="ddbtn-' + uid + '"'
    + ' onclick="toggleCardMenu(\'' + uid + '\')" title="More actions">···</button>'
    + '<div class="pl-card-dropdown" id="dd-' + uid + '">' + ddItems + '</div>'
    + '</div>';
}

function closeCardMenus() {
  document.querySelectorAll('.pl-card-dropdown.is-open').forEach(function(d) { d.classList.remove('is-open'); });
  document.querySelectorAll('.pl-card-menu-btn.is-open').forEach(function(b) { b.classList.remove('is-open'); });
}

function toggleCardMenu(uid) {
  var dd  = document.getElementById('dd-' + uid);
  var btn = document.getElementById('ddbtn-' + uid);
  if (!dd) return;
  var wasOpen = dd.classList.contains('is-open');
  closeCardMenus();
  if (!wasOpen) {
    dd.classList.add('is-open');
    if (btn) btn.classList.add('is-open');
  }
}

/* ═══════════════════════════════════════
   LOG CALENDAR EVENT AS SESSION
   Searches Halaxy patients directly — no local list.
   ═══════════════════════════════════════ */

/** Map funder display name from Halaxy Coverage → our funder key */
function _mapCoverageToFunderKey(str) {
  if (!str) return null;
  var s = str.toLowerCase();
  if (s.indexOf('medicare') !== -1 || s.indexOf('mbs') !== -1 || s.indexOf('mhcp') !== -1) return 'medicare';
  // Bupa in Halaxy = DVA/ADFHSC for this practice
  if (s.indexOf('dva') !== -1 || s.indexOf('veteran') !== -1 || s.indexOf('defence') !== -1 || s.indexOf('adfhcs') !== -1 || s.indexOf('bupa') !== -1) return 'dva';
  // All NDIS orgs this practice bills are plan managers
  if (s.indexOf('ndis') !== -1 || s.indexOf('plan manag') !== -1 || s.indexOf('in choice') !== -1 || s.indexOf('future by design') !== -1 || s.indexOf('alliance plan') !== -1 || s.indexOf('purple leopard') !== -1 || s.indexOf('freedom plan') !== -1 || s.indexOf('individualised community') !== -1 || s.indexOf('ndsp') !== -1) return 'ndis_plan';
  if (s.indexOf('qfes') !== -1 || s.indexOf('queensland fire') !== -1 || s.indexOf('fire and emergency') !== -1 || (s.indexOf('eap') !== -1 && s.indexOf('ndis') === -1)) return 'qfes';
  if (s.indexOf('workcover') !== -1 || s.indexOf('work cover') !== -1 || s.indexOf('worksafe') !== -1 || s.indexOf('returntowork') !== -1 || s.indexOf('return to work') !== -1 || s.indexOf('compensation') !== -1) return 'workcover';
  if (s.indexOf('private') !== -1 || s.indexOf('self pay') !== -1) return 'private';
  return null;
}

// Keyword sets matched against fee names to filter by funder.
// Derived from actual Halaxy fee naming conventions (Halaxy does not provide
// funder references inside ChargeItemDefinition — keyword matching is the only option).
var FUNDER_KEYWORDS = {
  // NDIS fees are consistently named with NDIS line items / SW credentials
  // All NDIS clients at this practice are plan-managed
  ndis_plan: [
    'ndis', 'social worker', 'amhsw', 'aasw',
    'therapeutic supports', 'improved daily living',
    'early childhood intervention', 'provider travel',
    'client non-attendance', 'training for carers',
    'case conference', 'communication - ',
  ],
  // Medicare fees — Better Access / MBS item numbers
  medicare: [
    'medicare', 'mbs', 'mhcp', 'other than client',
    'better access', 'rebate',
  ],
  // QFES fees — explicitly named in Halaxy
  qfes: ['qfes', 'queensland fire', 'fire and emergency', 'eap consultation'],
  // DVA / ADFHSC — Bupa is how DVA shows in Halaxy for this practice
  dva: [
    'dva', 'defence', 'veteran', 'adfhcs', 'bupa',
    'us04', 'initial consultation', 'subsequent consultation',
    'consultation 50',
  ],
  // WorkCover — Queensland and SA (ReturnToWork)
  workcover: [
    'workcover', "worker's comp", 'workers comp',
    'return to work', 'returntowork', 'worksafe', 'compensation',
  ],
  // Private — generic session types with no funder-specific naming
  private: [
    'in person consultation', 'video telehealth', 'phone telehealth',
    'face to face', 'online', 'ongoing session',
    'couple session', 'parent intake',
  ],
};

/**
 * Filter a fees array for a given funder key and optional funder ID.
 * Priority:
 *   1. Explicit fee map (_halaxyFeeMap[funderId]) when Halaxy provides org refs in fees
 *   2. funderName field on fee (if Halaxy stores it as text)
 *   3. Combined keyword set: predefined FUNDER_KEYWORDS + significant words from
 *      the funder's own display name (so "In Choice Plan Management" → searches
 *      fees for "choice", "plan", etc.)
 *   4. Full list when nothing matches (better than showing nothing)
 */
function _filterFeesForFunder(fees, funderKey, funderId) {
  if (!fees || !fees.length) return fees || [];

  // 1. Explicit fee map: funderOrgId → array of fee IDs (when Halaxy embeds org refs)
  if (funderId && _halaxyFeeMap && _halaxyFeeMap[funderId] && _halaxyFeeMap[funderId].length) {
    var mappedIds = _halaxyFeeMap[funderId];
    var mapped = fees.filter(function(f) { return mappedIds.indexOf(f.id) !== -1; });
    if (mapped.length) return mapped;
  }

  if (!funderKey) return fees;

  // Build keyword set: predefined + significant words from the funder's display name
  var kw = (FUNDER_KEYWORDS[funderKey] || []).slice();
  var funderObj = funderId
    ? (_halaxyFunders || []).find(function(f) { return f.id === funderId; })
    : (_halaxyFunders || []).find(function(f) { return f.billingKey === funderKey; });
  if (funderObj && funderObj.name) {
    // Add words of 4+ chars from the funder name (skip common filler words)
    var skipWords = ['plan', 'the', 'and', 'for', 'with', 'services', 'health', 'care'];
    funderObj.name.toLowerCase().split(/\s+/).forEach(function(w) {
      if (w.length >= 4 && skipWords.indexOf(w) === -1 && kw.indexOf(w) === -1) kw.push(w);
    });
    // Also add the full normalised funder name as a single keyword
    var fullName = funderObj.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (kw.indexOf(fullName) === -1) kw.push(fullName);
  }

  // 2. Match on fee's funderName field (when Halaxy stores it as text not a ref)
  var hasFunderName = fees.some(function(f) { return f.funderName; });
  if (hasFunderName) {
    var byFunderName = fees.filter(function(f) {
      if (!f.funderName) return false;
      var fn = f.funderName.toLowerCase();
      return kw.some(function(k) { return fn.indexOf(k) !== -1; });
    });
    if (byFunderName.length) return byFunderName;
  }

  // 3. Special case for 'private': use EXCLUSION rather than inclusion.
  //    Private fees have no distinctive naming — they're identified by the absence
  //    of other funders' specific keywords. A fee named "Face to Face" is private,
  //    but "Face to face | Social Worker AMHSW (AASW)" is NDIS because it contains
  //    NDIS-specific keywords even though "face to face" matches private keywords too.
  if (funderKey === 'private') {
    var excludeKws = [];
    ['medicare', 'ndis_plan', 'qfes', 'dva', 'workcover'].forEach(function(k) {
      (FUNDER_KEYWORDS[k] || []).forEach(function(kw2) {
        if (excludeKws.indexOf(kw2) === -1) excludeKws.push(kw2);
      });
    });
    var privateFees = fees.filter(function(f) {
      var n = (f.name || '').toLowerCase();
      return !excludeKws.some(function(kw2) { return n.indexOf(kw2) !== -1; });
    });
    return privateFees.length ? privateFees : fees;
  }

  // 3b. Keyword match on fee name itself (for all other funder types)
  if (kw.length) {
    var byName = fees.filter(function(f) {
      var n = (f.name || '').toLowerCase();
      return kw.some(function(k) { return n.indexOf(k) !== -1; });
    });
    if (byName.length) return byName;
  }

  return fees; // no match — return full list
}

/**
 * Directly open the session-log panel for a known Halaxy patient (no search step).
 * Used by Halaxy "needs logging" cards where the patient ID is already known.
 * Stores the appointment metadata on the panel element so _saveHalaxySession uses it.
 *
 * @param {string} cardUid       - Unique card identifier for DOM lookup
 * @param {string} patientId     - Halaxy Patient FHIR resource ID
 * @param {string} patientName   - Display name (from patientMap)
 * @param {string} dateStr       - YYYY-MM-DD appointment date
 * @param {string} apptStart     - Full ISO datetime string (e.g. "2026-05-12T10:00:00+10:00")
 * @param {string} halaxyApptId  - Halaxy Appointment FHIR resource ID (for PATCH write-back)
 */
function openHalaxyApptLogPanel(cardUid, patientId, patientName, dateStr, apptStart, halaxyApptId) {
  var panel = document.getElementById('pl-link-' + cardUid);
  if (!panel) return;
  panel.dataset.apptDate     = dateStr    || '';
  panel.dataset.apptStart    = apptStart  || (dateStr ? dateStr + 'T09:00:00' : '');
  panel.dataset.halaxyApptId = halaxyApptId || '';
  _selectHalaxyPatient(cardUid, null, patientId, patientName);
}

async function openCalSessionPanel(cardUid, eventId) {
  var panel = document.getElementById('pl-link-' + cardUid);
  if (!panel) return;

  // Ensure fees are available — if not yet loaded, initialise to [] immediately so
  // we never block the UI, then fetch in the background to populate for next time.
  if (_halaxyFees === null) {
    _halaxyFees = [];
    if (_halaxyData && _halaxyData.connected) {
      fetch('/api/admin-enquiries?halaxy_fees=1')
        .then(function(fr) { return fr.json(); })
        .then(function(d)  { _halaxyFees = d.fees || []; })
        .catch(function()  {});
    }
  }

  panel.innerHTML = '<div class="pl-link-panel">'
    + '<div class="pl-link-panel-title">Search Halaxy patient</div>'
    + '<input class="pl-link-input" id="pl-cs-inp-' + cardUid + '"'
    + ' placeholder="Type patient name…" autocomplete="off" onclick="event.stopPropagation()"'
    + ' oninput="_debounceCalSearch(\'' + cardUid + '\',\'' + eventId + '\',this.value)">'
    + '<div id="pl-cs-res-' + cardUid + '" class="pl-link-results">'
    + '<div style="font-size:11px;color:var(--soft);padding:5px 2px">Type at least 2 characters…</div>'
    + '</div>'
    + '<button class="pl-dd-item" style="margin-top:4px;font-size:10px;padding:5px 8px;color:var(--soft)"'
    + ' onclick="event.stopPropagation();closeLinkPanel(\'' + cardUid + '\')">✕ Cancel</button>'
    + '</div>';
  setTimeout(function() {
    var inp = document.getElementById('pl-cs-inp-' + cardUid);
    if (inp) inp.focus();
  }, 60);
}

function _debounceCalSearch(cardUid, eventId, query) {
  clearTimeout(_calSearchTimer);
  _calSearchTimer = setTimeout(function() { _searchHalaxyPatients(cardUid, eventId, query); }, 350);
}

async function _searchHalaxyPatients(cardUid, eventId, query) {
  var res = document.getElementById('pl-cs-res-' + cardUid);
  if (!res) return;
  if (!query || query.trim().length < 2) {
    res.innerHTML = '<div style="font-size:11px;color:var(--soft);padding:5px 2px">Type at least 2 characters…</div>';
    return;
  }
  res.innerHTML = '<div class="cl-halaxy-lookup-searching">Searching Halaxy…</div>';
  try {
    var r = await fetch('/api/admin-enquiries?halaxy_patient_name=' + encodeURIComponent(query.trim()));
    var d = await r.json();
    var patients = d.patients || [];
    if (!patients.length) {
      res.innerHTML = '<div style="font-size:11px;color:var(--soft);padding:5px 2px">No Halaxy patients found for "' + escHtml(query) + '"</div>';
      return;
    }
    res.innerHTML = patients.map(function(p) {
      var local = (_pipelineData && _pipelineData.clients || []).find(function(c) { return String(c.halaxy_id) === String(p.id); });
      var meta  = local ? (FUNDER_LABELS[local.funder] || '') + ' · in dashboard ✓' : 'Halaxy patient';
      return '<div class="pl-link-result" onclick="event.stopPropagation();_selectHalaxyPatient(\'' + cardUid + '\',\'' + eventId + '\',\'' + escHtml(String(p.id)) + '\',\'' + escHtml(p.name) + '\')">'
        + '<span class="pl-link-result-name">' + escHtml(p.name) + '</span>'
        + '<span class="pl-link-result-meta">' + escHtml(meta) + '</span>'
        + '</div>';
    }).join('');
  } catch (_) {
    res.innerHTML = '<div style="font-size:11px;color:var(--soft);padding:5px 2px">Search error — try again</div>';
  }
}

async function _selectHalaxyPatient(cardUid, eventId, patientId, patientName) {
  var panel = document.getElementById('pl-link-' + cardUid);
  if (!panel) return;
  panel.innerHTML = '<div class="pl-link-panel"><div class="cl-halaxy-lookup-searching">Loading patient details…</div></div>';

  // Fetch Coverage to determine funder + plan manager name
  var funderKey = null, funderDisplay = '', planManager = '';
  try {
    var cr = await fetch('/api/admin-enquiries?halaxy_coverage=' + encodeURIComponent(patientId));
    var cd = await cr.json();
    if (cd.coverage && cd.coverage.length) {
      var cov = cd.coverage[0];
      // Combine payor + typeText for matching
      funderDisplay = [cov.payor, cov.typeText].filter(Boolean).join(' ');
      funderKey = _mapCoverageToFunderKey(funderDisplay);
      // For NDIS plan-managed, the payor IS the plan manager company name
      if (funderKey === 'ndis_plan' && cov.payor && cov.payor.toLowerCase().indexOf('ndis') === -1) {
        planManager = cov.payor; // e.g. "My Plan Manager", "Plan Partners" etc.
      }
    }
  } catch (_) {}

  // Fall back to local client funder if known
  var local = (_pipelineData && _pipelineData.clients || []).find(function(c) { return String(c.halaxy_id) === patientId; });
  if (local && !funderKey) { funderKey = local.funder; planManager = planManager || local.plan_manager || ''; }

  var evt         = _calEventMap[eventId] || {};
  var funderLabel = FUNDER_LABELS[funderKey] || funderDisplay || '';
  var fees        = _halaxyFees || [];

  var filtered = _filterFeesForFunder(fees, funderKey);

  // Build fee selector
  var feeHtml;
  if (filtered.length) {
    var defaultRate = FUNDER_RATES[funderKey] || '';
    var opts = filtered.map(function(f) {
      var lbl = escHtml(f.name) + ' — $' + Number(f.amount).toFixed(2);
      var sel = defaultRate && Math.abs(f.amount - parseFloat(defaultRate)) < 1 ? ' selected' : '';
      return '<option value="' + f.amount + '" data-fee-id="' + escHtml(String(f.id || '')) + '" data-fee-name="' + escHtml(f.name) + '"' + sel + '>' + lbl + '</option>';
    }).join('');
    feeHtml = '<div class="pl-fee-row" style="flex-direction:column;align-items:stretch;gap:4px">'
      + '<label class="pl-fee-label">Fee item</label>'
      + '<select class="pl-link-input" id="pl-cs-fee-' + cardUid + '" onclick="event.stopPropagation()" onchange="_syncFeeInput(\'' + cardUid + '\')">'
      + '<option value="">— select a fee —</option>' + opts + '</select>'
      + '<div style="display:flex;align-items:center;gap:5px;margin-top:3px">'
      + '<span class="pl-fee-currency">$</span>'
      + '<input class="pl-fee-input" id="pl-cs-fee-amt-' + cardUid + '" type="number" step="0.01" min="0" placeholder="or enter amount" onclick="event.stopPropagation()"></div>'
      + '</div>';
  } else {
    var dr = FUNDER_RATES[funderKey] || '';
    feeHtml = '<div class="pl-fee-row"><label class="pl-fee-label">Fee</label><span class="pl-fee-currency">$</span>'
      + '<input class="pl-fee-input" id="pl-cs-fee-amt-' + cardUid + '" type="number" step="0.01" min="0" value="' + dr + '" placeholder="0.00" onclick="event.stopPropagation()">'
      + '</div>';
  }

  // If no funder resolved, show a manual picker built from loaded funders (never hardcoded)
  var funderPickerHtml = '';
  if (!funderKey) {
    var liveFunders = _halaxyFunders || [];
    var fopts = liveFunders.length
      ? _buildFunderDropdownHtml(liveFunders)
      : '<option value="">No funders loaded — go to Settings → Sync funders & fees</option>';
    funderPickerHtml = '<select class="pl-link-input" id="pl-cs-funder-' + cardUid + '" style="margin-bottom:6px"'
      + ' onclick="event.stopPropagation()" onchange="_rebuildFeesForFunder(\'' + cardUid + '\')">'
      + fopts + '</select>';
  }

  var pmHtml = '';
  if (funderKey === 'ndis_plan') {
    pmHtml = '<input class="pl-link-input" id="pl-cs-pm-' + cardUid + '" type="text"'
      + ' value="' + escHtml(planManager) + '" placeholder="Plan manager name…"'
      + ' onclick="event.stopPropagation()" style="margin-bottom:6px">';
  }

  // Read appointment metadata stored by openHalaxyApptLogPanel (or openCalSessionPanel)
  var halaxyApptId = (panel && panel.dataset.halaxyApptId) || '';

  // Show different back button depending on whether we came from search or direct-open
  var backBtn = eventId
    ? '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();openCalSessionPanel(\'' + cardUid + '\',\'' + eventId + '\')">← Back</button>'
    : '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();closeLinkPanel(\'' + cardUid + '\')">✕ Close</button>';

  // Halaxy manual-entry helper: shown after a fee is selected — lets Cheree
  // copy the fee details to paste directly into Halaxy if $book is unavailable.
  var manualHelper = funderLabel
    ? '<div id="pl-manual-helper-' + cardUid + '" style="'
      + 'background:rgba(42,88,80,0.06);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:11px;line-height:1.5">'
      + '<div style="font-weight:600;color:#2A5850;margin-bottom:3px">Halaxy manual entry</div>'
      + '<div>Funder: <strong>' + escHtml(funderLabel) + (planManager ? ' — ' + escHtml(planManager) : '') + '</strong></div>'
      + '<div id="pl-manual-fee-line-' + cardUid + '" style="color:#555">Fee: select a fee item above</div>'
      + '<button onclick="event.stopPropagation();_copyManualEntry(\'' + cardUid + '\')" style="'
      + 'margin-top:5px;background:var(--teal);color:#fff;border:none;border-radius:5px;'
      + 'padding:3px 10px;font-size:10px;cursor:pointer;font-weight:600">⎘ Copy to clipboard</button>'
      + '</div>'
    : '';

  panel.innerHTML = '<div class="pl-link-panel">'
    + '<div class="pl-link-preview">'
    + '<div class="pl-link-preview-name">' + escHtml(patientName) + '</div>'
    + '<div class="pl-link-preview-meta">Halaxy patient'
    + (funderLabel ? ' · ' + escHtml(funderLabel) : '')
    + (planManager ? ' · ' + escHtml(planManager) : '')
    + (local ? ' · in dashboard ✓' : '') + '</div>'
    + '</div>'
    + manualHelper
    + funderPickerHtml
    + pmHtml
    + feeHtml
    + '<select class="pl-link-input" id="pl-cs-location-' + cardUid + '" onclick="event.stopPropagation()" style="margin-top:6px">'
    + '<option value="clinic" selected>In-clinic</option>'
    + '<option value="telehealth">Telehealth (video)</option>'
    + '<option value="phone">Phone</option>'
    + '<option value="online">Online</option>'
    + '</select>'
    + '<input class="pl-link-input" id="pl-cs-notes-' + cardUid + '" type="text"'
    + ' value="' + escHtml(evt.title || '') + '" placeholder="Appointment notes…" onclick="event.stopPropagation()" style="margin-top:6px">'
    + '<div class="pl-card-actions" style="margin-top:8px">'
    + backBtn
    + '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();_sendManualReminder(\'' + escHtml(patientId) + '\',\'' + escHtml(panel ? (panel.dataset.apptDate || '') : '') + '\',\'' + escHtml(panel ? (panel.dataset.apptStart || '') : '') + '\')">🔔 Remind</button>'
    + '<button class="pl-action-btn pl-action-btn--danger" onclick="event.stopPropagation();_cancelHalaxySession(\'' + cardUid + '\',\'' + (eventId || '') + '\',\'' + escHtml(patientId) + '\',\'' + escHtml(halaxyApptId) + '\')">Cancel appointment</button>'
    + '<button class="pl-action-btn pl-action-btn--primary" onclick="event.stopPropagation();_saveHalaxySession(\'' + cardUid + '\',\'' + (eventId || '') + '\',\'' + escHtml(patientId) + '\',\'' + escHtml(patientName) + '\',\'' + (funderKey || '') + '\',\'' + escHtml(halaxyApptId) + '\')">Record Attended →</button>'
    + '</div></div>';
  _syncFeeInput(cardUid);
}

function _rebuildFeesForFunder(cardUid) {
  var sel = document.getElementById('pl-cs-funder-' + cardUid);
  if (!sel || !sel.value) return;
  // sel.value is the funder ID; data-billing is the billingKey (set by _buildFunderDropdownHtml)
  var funderId = sel.value;
  var opt = sel.options[sel.selectedIndex];
  var fk       = (opt && opt.dataset && opt.dataset.billing) || funderId;
  var fees     = _halaxyFees || [];
  var filtered = _filterFeesForFunder(fees, fk, funderId);
  var feeSel = document.getElementById('pl-cs-fee-' + cardUid);
  var feeAmt = document.getElementById('pl-cs-fee-amt-' + cardUid);
  if (feeSel) {
    var dr = FUNDER_RATES[fk] || '';
    feeSel.innerHTML = '<option value="">— select a fee —</option>'
      + filtered.map(function(f){
          var s = dr && Math.abs(f.amount-parseFloat(dr))<1?' selected':'';
          return '<option value="'+f.amount+'"'+s+'>'+escHtml(f.name)+' — $'+Number(f.amount).toFixed(2)+'</option>';
        }).join('');
    _syncFeeInput(cardUid);
  } else if (feeAmt) { feeAmt.value = FUNDER_RATES[fk] || ''; }
}

/** When fee dropdown changes, sync the editable amount field + manual-entry helper */
function _syncFeeInput(cardUid) {
  var sel = document.getElementById('pl-cs-fee-' + cardUid);
  var amt = document.getElementById('pl-cs-fee-amt-' + cardUid);
  if (sel && amt && sel.value) amt.value = sel.value;
  // Update the manual-entry fee line
  var feeLine = document.getElementById('pl-manual-fee-line-' + cardUid);
  if (feeLine && sel && sel.selectedIndex > 0) {
    var opt = sel.options[sel.selectedIndex];
    var feeName = (opt && opt.dataset && opt.dataset.feeName) ? opt.dataset.feeName : '';
    var feeVal  = sel.value ? '$' + Number(sel.value).toFixed(2) : '';
    if (feeName && feeVal) feeLine.innerHTML = 'Fee: <strong>' + escHtml(feeName) + ' — ' + escHtml(feeVal) + '</strong>';
  }
}

/** Copy the funder + fee details from the manual-entry helper to clipboard */
function _copyManualEntry(cardUid) {
  var helper = document.getElementById('pl-manual-helper-' + cardUid);
  if (!helper) return;
  // Extract the text from each label line
  var lines = helper.querySelectorAll('div');
  var text = [];
  lines.forEach(function(el) {
    var t = el.textContent.trim();
    if (t && t !== 'Halaxy manual entry') text.push(t);
  });
  var copyText = text.join('\n');
  if (!copyText) return;
  navigator.clipboard.writeText(copyText).then(function() {
    toast('Copied to clipboard ✓');
  }).catch(function() {
    // Fallback for browsers without clipboard API
    var ta = document.createElement('textarea');
    ta.value = copyText;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Copied to clipboard ✓'); } catch (_) {}
    document.body.removeChild(ta);
  });
}

async function _saveHalaxySession(cardUid, eventId, patientId, patientName, funderKey, halaxyApptId) {
  var feeSelectEl  = document.getElementById('pl-cs-fee-' + cardUid);
  var feeAmt       = document.getElementById('pl-cs-fee-amt-' + cardUid);
  var notesEl      = document.getElementById('pl-cs-notes-' + cardUid);
  var locationEl   = document.getElementById('pl-cs-location-' + cardUid);
  var funderEl     = document.getElementById('pl-cs-funder-' + cardUid);
  var pmEl        = document.getElementById('pl-cs-pm-' + cardUid);
  var panelEl     = document.getElementById('pl-link-' + cardUid);
  var evt         = _calEventMap[eventId] || {};

  // Resolve funder key
  var fk = funderKey;
  if (!fk && funderEl && funderEl.value) {
    var selOpt = funderEl.options[funderEl.selectedIndex];
    fk = (selOpt && selOpt.dataset && selOpt.dataset.billing) || funderEl.value;
  }

  // Resolve fee: prefer the dropdown selection, fall back to manual amount input
  var feeId   = null;
  var feeName = '';
  var amount  = null;
  if (feeSelectEl && feeSelectEl.value) {
    var selFeeOpt = feeSelectEl.options[feeSelectEl.selectedIndex];
    feeId   = (selFeeOpt && selFeeOpt.dataset.feeId) || null;
    feeName = (selFeeOpt && selFeeOpt.dataset.feeName) || '';
    amount  = parseFloat(feeSelectEl.value) || null;
  }
  if (feeAmt && feeAmt.value !== '') {
    var manualAmt = parseFloat(feeAmt.value);
    if (!isNaN(manualAmt) && manualAmt >= 0) amount = manualAmt; // 0 is valid (no-charge session)
  }

  // If no fee was selected from the dropdown but we have a non-zero amount,
  // look up the matching ChargeItemDefinition by amount so we can attach it to Halaxy
  if (!feeId && amount > 0 && _halaxyFees && _halaxyFees.length) {
    var matchByAmt = _halaxyFees.find(function(f) { return Math.abs(f.amount - amount) < 0.01; });
    if (matchByAmt) {
      feeId   = matchByAmt.id   || null;
      feeName = feeName || matchByAmt.name || '';
    }
  }

  if (amount === null || isNaN(amount)) {
    toast('Please select or enter a fee amount', 'err');
    return;
  }

  var pm       = pmEl    ? pmEl.value.trim()                                     : '';
  var notes    = notesEl ? (notesEl.value.trim() || evt.title || '')              : evt.title || '';
  var apptDate = (panelEl && panelEl.dataset.apptDate) || (evt.start ? evt.start.slice(0, 10) : new Date().toISOString().slice(0, 10));
  var apptStart = (panelEl && panelEl.dataset.apptStart) || evt.start || (apptDate + 'T09:00:00');
  var apptEnd   = evt.end || null;
  var hxApptId  = halaxyApptId || (panelEl && panelEl.dataset.halaxyApptId) || null;

  // Disable button while saving
  var btn = panelEl && panelEl.querySelector('.pl-action-btn--primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    // CRM sync — non-PII fields only on existing dashboard clients
    var local = (_pipelineData && _pipelineData.clients || []).find(function(c) { return String(c.halaxy_id) === patientId; });
    if (local) {
      var patch = {};
      if (fk && !local.funder)       patch.funder       = fk;
      if (pm && !local.plan_manager) patch.plan_manager = pm;
      if (Object.keys(patch).length) {
        patch.id = local.id;
        await apiFetch('/api/clients', { method: 'PATCH', body: patch });
      }
    }

    var locationType = locationEl ? locationEl.value : 'clinic';

    // Write session to Halaxy
    var halaxyResp = await apiFetch('/api/admin-enquiries?halaxy_appt_action=1', {
      method: 'POST',
      body: {
        action:       'record',
        patientId:    patientId,
        halaxyApptId: hxApptId      || undefined,
        apptStart:    apptStart     || undefined,
        apptEnd:      apptEnd       || undefined,
        feeId:        feeId         || undefined,
        feeName:      feeName       || undefined,
        feeAmount:    amount,
        notes:        notes         || undefined,
        locationType: locationType  || 'clinic',
      },
    });

    // booked = Cal event just got $book'd → Halaxy auto-created invoice+note+reminder
    // calOnly = no PractitionerRole cached yet, needs manual Halaxy entry
    // otherwise = existing appointment PATCHed, invoice still manual
    var booked  = halaxyResp && halaxyResp.booked;
    var calOnly = halaxyResp && halaxyResp.calOnly;

    // Mark actioned so it won't bounce back into "Needs Recording" after pipeline refresh
    _halaxyActioned.add(patientId + '|' + apptDate);
    localStorage.setItem('halaxy_actioned', JSON.stringify([..._halaxyActioned]));

    // For $book success Halaxy handles the invoice — no need to track as pending
    // For PATCH and calOnly we still track locally so the billing panel shows it
    if (!booked) {
      _recordedSessions = _recordedSessions.filter(function(s) {
        return !(String(s.patientId) === String(patientId) && s.date === apptDate);
      });
      _recordedSessions.push({
        halaxyApptId: hxApptId || (halaxyResp && halaxyResp.halaxyApptId) || null,
        patientId:    patientId,
        date:         apptDate,
        amount:       amount,
        feeName:      feeName || '',
        funderKey:    fk     || '',
        calOnly:      calOnly || false,
        recordedAt:   Date.now(),
      });
      localStorage.setItem('halaxy_recorded_sessions', JSON.stringify(_recordedSessions));
    }

    // Dismiss the card from the UI immediately
    if (eventId) {
      dismissCalEvent(eventId);
    } else {
      var cardEl = panelEl ? panelEl.closest('.log-card') : null;
      if (cardEl) cardEl.remove();
    }

    // Build calendar deep link for this date
    var calDate = apptDate || new Date().toISOString().slice(0, 10);
    var halaxyCalUrl = (_halaxyWebUrl ? _halaxyWebUrl + '/calendar?date=' + calDate : 'https://www.halaxy.com/practitioner');

    if (booked) {
      // $book created everything automatically — open calendar to verify
      window.open(halaxyCalUrl, '_blank', 'noopener');
      toast('Appointment + invoice created in Halaxy ✓', 'ok');
    } else if (calOnly) {
      window.open(halaxyCalUrl, '_blank', 'noopener');
      toast('Session noted — sync Halaxy first to enable auto-booking', 'warn');
    } else {
      // Existing appointment PATCHed — user still needs to create invoice in Halaxy
      window.open(halaxyCalUrl, '_blank', 'noopener');
      toast('Attendance recorded ✓ — open the appointment in Halaxy to create the invoice', 'ok');
    }

    // Re-fetch pipeline data so the billing panel updates
    setTimeout(function() { refreshPipeline(); }, 2500);

  } catch (err) {
    toast('Error recording session: ' + err.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Record Attended →'; }
  }
}

/**
 * Mark a session as cancelled in Halaxy.
 * For Google Cal events with no Halaxy appointment, calls $book first then immediately cancels.
 */
/**
 * Show a cancellation modal with fee disposition options before cancelling in Halaxy.
 * Options: keep fee, convert to private, waive, or exception.
 */
function _cancelHalaxySession(cardUid, eventId, patientId, halaxyApptId) {
  var panelEl = document.getElementById('pl-link-' + cardUid);
  var notesEl = document.getElementById('pl-cs-notes-' + cardUid);
  var evt     = _calEventMap[eventId] || {};
  var apptDate  = (panelEl && panelEl.dataset.apptDate) || (evt.start ? evt.start.slice(0, 10) : new Date().toISOString().slice(0, 10));
  var apptStart = (panelEl && panelEl.dataset.apptStart) || evt.start || (apptDate + 'T09:00:00');
  var apptEnd   = evt.end || null;
  var hxApptId  = halaxyApptId || (panelEl && panelEl.dataset.halaxyApptId) || null;
  var currentNote = notesEl ? notesEl.value.trim() : '';

  // Determine current funder for fee options
  var funderEl = document.getElementById('pl-cs-funder-' + cardUid);
  var funderKey = funderEl ? (funderEl.options[funderEl.selectedIndex] || {}).dataset?.billing || '' : '';
  if (!funderKey) {
    var localClient = (_pipelineData && _pipelineData.clients || []).find(function(c) { return String(c.halaxy_id) === String(patientId); });
    if (localClient) funderKey = localClient.funder || '';
  }
  var showConvertToPrivate = funderKey && funderKey !== 'private';

  var overlay = document.getElementById('cancel-appt-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cancel-appt-modal';
    overlay.className = 'cl-modal-ov';
    overlay.onclick = function(ev) { if (ev.target === overlay) overlay.classList.remove('open'); };
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = '<div class="cl-modal" style="max-width:380px">'
    + '<h2 class="cl-modal-title">Cancel appointment</h2>'
    + '<p style="font-size:12px;color:#7A9090;margin:0 0 12px">How should the fee be handled?</p>'
    + '<div style="display:flex;flex-direction:column;gap:8px">'
    // Keep fee (late cancellation charge)
    + '<label class="cancel-opt" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:8px;border:1.5px solid rgba(42,88,80,0.15)">'
    + '<input type="radio" name="cancel-fee" value="keep" checked style="margin-top:2px"> '
    + '<div><div style="font-weight:600;font-size:13px">Keep fee</div>'
    + '<div style="font-size:11px;color:#9AABA8">Late cancellation charge — invoice stays in Halaxy</div></div></label>'
    // Convert to private
    + (showConvertToPrivate
      ? '<label class="cancel-opt" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:8px;border:1.5px solid rgba(42,88,80,0.15)">'
        + '<input type="radio" name="cancel-fee" value="convert" style="margin-top:2px"> '
        + '<div><div style="font-weight:600;font-size:13px">Convert to private</div>'
        + '<div style="font-size:11px;color:#9AABA8">Funder won\'t accept — charge client directly instead</div></div></label>'
      : '')
    // Waive fee
    + '<label class="cancel-opt" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:8px;border:1.5px solid rgba(42,88,80,0.15)">'
    + '<input type="radio" name="cancel-fee" value="waive" style="margin-top:2px"> '
    + '<div><div style="font-weight:600;font-size:13px">Waive fee</div>'
    + '<div style="font-size:11px;color:#9AABA8">Client gave sufficient notice — no charge</div></div></label>'
    // Exception
    + '<label class="cancel-opt" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px;border-radius:8px;border:1.5px solid rgba(42,88,80,0.15)">'
    + '<input type="radio" name="cancel-fee" value="exception" style="margin-top:2px"> '
    + '<div><div style="font-weight:600;font-size:13px">Exception</div>'
    + '<div style="font-size:11px;color:#9AABA8">Cheree\'s discretion — document reason below</div></div></label>'
    + '</div>'
    + '<div style="margin-top:12px">'
    + '<label style="font-size:11px;color:#9AABA8;display:block;margin-bottom:4px">Cancellation note</label>'
    + '<input class="cl-modal-input" id="cancel-appt-notes" type="text"'
    + ' value="' + escHtml(currentNote || 'Client cancellation') + '"'
    + ' placeholder="Reason or notes…">'
    + '</div>'
    + '<div class="cl-modal-actions" style="margin-top:12px">'
    + '<button class="cl-modal-cancel" onclick="document.getElementById(\'cancel-appt-modal\').classList.remove(\'open\')">Back</button>'
    + '<button class="cl-modal-save" style="background:#dc2626" onclick="_confirmCancelAppt(\''
    + escHtml(cardUid) + '\',\'' + escHtml(eventId || '') + '\',\'' + escHtml(patientId) + '\',\''
    + escHtml(hxApptId || '') + '\',\'' + escHtml(apptDate) + '\',\'' + escHtml(apptStart) + '\',\'' + escHtml(apptEnd || '') + '\')">'
    + 'Confirm cancellation</button>'
    + '</div></div>';
  overlay.classList.add('open');
}

async function _confirmCancelAppt(cardUid, eventId, patientId, hxApptId, apptDate, apptStart, apptEnd) {
  var overlay  = document.getElementById('cancel-appt-modal');
  var feeDisp  = (document.querySelector('input[name="cancel-fee"]:checked') || {}).value || 'keep';
  var notes    = (document.getElementById('cancel-appt-notes') || {}).value || 'Client cancellation';
  var fullNote = notes + ' [fee: ' + feeDisp + ']';

  if (overlay) overlay.classList.remove('open');

  var panelEl = document.getElementById('pl-link-' + cardUid);
  var btn = panelEl && panelEl.querySelector('.pl-action-btn--danger');
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }

  try {
    await apiFetch('/api/admin-enquiries?halaxy_appt_action=1', {
      method: 'POST',
      body: {
        action:       'cancel',
        patientId:    patientId,
        halaxyApptId: hxApptId   || undefined,
        apptStart:    apptStart  || undefined,
        apptEnd:      apptEnd    || undefined,
        notes:        fullNote,
      },
    });

    _halaxyActioned.add(patientId + '|' + apptDate);
    localStorage.setItem('halaxy_actioned', JSON.stringify([..._halaxyActioned]));

    if (eventId) {
      dismissCalEvent(eventId);
    } else {
      var cardEl = panelEl ? panelEl.closest('.log-card') : null;
      if (cardEl) cardEl.remove();
    }

    var dispLabel = { keep: 'fee kept', convert: 'convert to private', waive: 'fee waived', exception: 'exception' }[feeDisp] || feeDisp;
    toast('Appointment cancelled — ' + dispLabel + ' ✓', 'ok');
    setTimeout(function() { refreshPipeline(); }, 2000);

  } catch (err) {
    toast('Error cancelling appointment: ' + err.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Cancel appointment'; }
  }
}

/**
 * Send a manual 48hr reminder email for an appointment.
 * Opens a modal that pre-fills the client's Halaxy email if found,
 * letting Cheree confirm or override before sending.
 */
function _sendManualReminder(patientId, apptDate, apptStart) {
  var overlay = document.getElementById('send-reminder-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'send-reminder-modal';
    overlay.className = 'cl-modal-ov';
    overlay.onclick = function(ev) { if (ev.target === overlay) overlay.classList.remove('open'); };
    document.body.appendChild(overlay);
  }

  // Try to find a known email from local dashboard clients
  var local = (_pipelineData && _pipelineData.clients || []).find(function(c) { return String(c.halaxy_id) === String(patientId); });
  var name  = (local && local.display_name) || '';

  // Parse time from ISO string
  var timeStr = '';
  if (apptStart) {
    try { timeStr = apptStart.slice(11, 16); } catch (_) {}
  }

  overlay.innerHTML = '<div class="cl-modal" style="max-width:360px">'
    + '<h2 class="cl-modal-title">Send appointment reminder</h2>'
    + '<div class="cl-modal-field"><label>Client name</label>'
    + '<input class="cl-modal-input" id="reminder-name" type="text" value="' + escHtml(name) + '" placeholder="Client name (for greeting)"></div>'
    + '<div class="cl-modal-field"><label>Client email <span style="color:var(--terra)">*</span></label>'
    + '<input class="cl-modal-input" id="reminder-email" type="email" placeholder="client@example.com"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
    + '<div class="cl-modal-field"><label>Date</label>'
    + '<input class="cl-modal-input" id="reminder-date" type="date" value="' + escHtml(apptDate || '') + '"></div>'
    + '<div class="cl-modal-field"><label>Time</label>'
    + '<input class="cl-modal-input" id="reminder-time" type="time" value="' + escHtml(timeStr) + '"></div>'
    + '</div>'
    + '<div class="cl-modal-field"><label>Format</label>'
    + '<select class="cl-modal-select" id="reminder-location">'
    + '<option value="clinic">In-clinic</option>'
    + '<option value="telehealth">Telehealth (video)</option>'
    + '<option value="phone">Phone</option>'
    + '</select></div>'
    + '<div id="reminder-err" style="display:none;color:var(--terra);font-size:12px;margin-top:6px"></div>'
    + '<div class="cl-modal-actions">'
    + '<button class="cl-modal-cancel" onclick="document.getElementById(\'send-reminder-modal\').classList.remove(\'open\')">Cancel</button>'
    + '<button class="cl-modal-save" id="reminder-send-btn" onclick="_submitManualReminder()">Send reminder</button>'
    + '</div></div>';
  overlay.classList.add('open');
}

async function _submitManualReminder() {
  var emailEl  = document.getElementById('reminder-email');
  var nameEl   = document.getElementById('reminder-name');
  var dateEl   = document.getElementById('reminder-date');
  var timeEl   = document.getElementById('reminder-time');
  var locEl    = document.getElementById('reminder-location');
  var errEl    = document.getElementById('reminder-err');
  var btn      = document.getElementById('reminder-send-btn');
  var email    = (emailEl && emailEl.value.trim()) || '';
  if (!email) {
    if (errEl) { errEl.textContent = 'Email address is required'; errEl.style.display = ''; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    await apiFetch('/api/admin-enquiries?reminder=1', {
      method: 'POST',
      body: {
        clientEmail:     email,
        clientName:      nameEl ? nameEl.value.trim() : '',
        appointmentDate: dateEl ? dateEl.value : '',
        appointmentTime: timeEl ? timeEl.value : '',
        locationType:    locEl  ? locEl.value  : 'clinic',
      },
    });
    document.getElementById('send-reminder-modal').classList.remove('open');
    toast('Reminder sent ✓');
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
    if (btn) { btn.disabled = false; btn.textContent = 'Send reminder'; }
  }
}

/* ═══════════════════════════════════════
   LINK-TO-EXISTING-CLIENT PANEL
   ═══════════════════════════════════════ */

/**
 * Open an inline client-search panel inside a card.
 * mode: 'enq' (enquiry) | 'cal' (calendar event)
 * sourceId: enquiry ID or calendar event ID
 */
function openLinkPanel(cardUid, mode, sourceId) {
  // Ensure detail is visible (expand enquiry cards)
  var detail = document.getElementById('pl-detail-' + cardUid);
  if (detail && detail.style.display === 'none') detail.style.display = 'block';

  var panel = document.getElementById('pl-link-' + cardUid);
  if (!panel) return;
  panel.innerHTML = '<div class="pl-link-panel">'
    + '<div class="pl-link-panel-title">Search existing clients</div>'
    + '<input class="pl-link-input" id="pl-link-inp-' + cardUid + '"'
    + ' placeholder="Type a name…" autocomplete="off" onclick="event.stopPropagation()"'
    + ' oninput="renderLinkResults(\'' + cardUid + '\',\'' + mode + '\',\'' + sourceId + '\',this.value)">'
    + '<div class="pl-link-results" id="pl-link-res-' + cardUid + '"></div>'
    + '<button class="pl-dd-item" style="margin-top:4px;font-size:10px;padding:5px 8px;color:var(--soft)" onclick="event.stopPropagation();closeLinkPanel(\'' + cardUid + '\')">✕ Cancel</button>'
    + '</div>';
  renderLinkResults(cardUid, mode, sourceId, '');
  setTimeout(function() {
    var inp = document.getElementById('pl-link-inp-' + cardUid);
    if (inp) inp.focus();
  }, 60);
}

function closeLinkPanel(cardUid) {
  var panel = document.getElementById('pl-link-' + cardUid);
  if (panel) panel.innerHTML = '';
}

function renderLinkResults(cardUid, mode, sourceId, query) {
  var res = document.getElementById('pl-link-res-' + cardUid);
  if (!res || !_pipelineData) return;
  var clients = (_pipelineData.clients || []).filter(function(c) { return c.active !== false; });
  if (query) {
    var q = query.toLowerCase();
    clients = clients.filter(function(c) { return (c.display_name || '').toLowerCase().indexOf(q) !== -1; });
  }
  if (!clients.length) {
    res.innerHTML = '<div style="font-size:11px;color:var(--soft);padding:5px 0">No clients found</div>';
    return;
  }
  res.innerHTML = clients.slice(0, 8).map(function(c) {
    var meta = FUNDER_LABELS[c.funder] || c.funder || '';
    if (c.halaxy_id) meta += ' · H✓';
    return '<div class="pl-link-result" onclick="event.stopPropagation();selectLinkedClient(\'' + cardUid + '\',\'' + mode + '\',\'' + sourceId + '\',\'' + c.id + '\')">'
      + '<span class="pl-link-result-name">' + escHtml(c.display_name) + '</span>'
      + '<span class="pl-link-result-meta">' + escHtml(meta) + '</span>'
      + '</div>';
  }).join('');
}

function selectLinkedClient(cardUid, mode, sourceId, clientId) {
  if (!_pipelineData) return;
  var client = (_pipelineData.clients || []).find(function(c) { return String(c.id) === String(clientId); });
  if (!client) return;
  var panel = document.getElementById('pl-link-' + cardUid);
  if (!panel) return;

  var funder   = escHtml(FUNDER_LABELS[client.funder] || client.funder || '');
  var halaxy   = client.halaxy_id ? ' · In Halaxy ✓' : ' · Not in Halaxy';
  var sessions = (client.sessions || []).length;
  var sessStr  = sessions ? ' · ' + sessions + ' session' + (sessions === 1 ? '' : 's') : '';

  var previewHtml = '<div class="pl-link-preview">'
    + '<div class="pl-link-preview-name">' + escHtml(client.display_name) + '</div>'
    + '<div class="pl-link-preview-meta">' + funder + halaxy + sessStr + '</div>'
    + '</div>';

  var confirmFn, confirmLabel;
  if (mode === 'enq') {
    confirmFn    = 'confirmEnqLink(\'' + sourceId + '\',\'' + clientId + '\')';
    confirmLabel = 'Close this enquiry →';
  } else {
    confirmFn    = 'confirmCalLink(\'' + sourceId + '\',\'' + cardUid + '\',\'' + clientId + '\')';
    confirmLabel = 'Link &amp; log appointment →';
  }

  panel.innerHTML = '<div class="pl-link-panel">'
    + previewHtml
    + '<div class="pl-card-actions" style="margin-top:6px">'
    + '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();openLinkPanel(\'' + cardUid + '\',\'' + mode + '\',\'' + sourceId + '\')">← Back</button>'
    + '<button class="pl-action-btn pl-action-btn--primary" onclick="event.stopPropagation();' + confirmFn + '">' + confirmLabel + '</button>'
    + '</div>'
    + '</div>';
}

async function confirmEnqLink(enquiryId, clientId) {
  try {
    await apiFetch('/api/admin-enquiries?id=' + enquiryId, { method: 'PATCH', body: { client_id: clientId, status: 'converted' } });
    toast('Enquiry converted — linked to existing client ✓');
    refreshPipeline();
  } catch (err) {
    toast('Error: ' + err.message, 'err');
  }
}

async function confirmCalLink(eventId, cardUid, clientId) {
  var evt = _calEventMap[eventId];
  if (!evt) { toast('Event data missing', 'err'); return; }
  var sessionDate = evt.start ? evt.start.slice(0, 10) : new Date().toISOString().slice(0, 10);
  try {
    await apiFetch('/api/sessions', {
      method: 'POST',
      body: { client_id: clientId, session_date: sessionDate, status: 'upcoming', notes: evt.title || '' },
    });
    dismissCalEvent(eventId);
    toast('Session logged and calendar card dismissed');
    refreshPipeline();
  } catch (err) {
    toast('Error: ' + err.message, 'err');
  }
}

/* Calendar event dismiss (localStorage) */
function dismissCalEvent(eventId) {
  _calDismissed.add(String(eventId));
  localStorage.setItem('cal_dismissed', JSON.stringify([..._calDismissed]));
  renderAppointmentsPanel();
}

/* ── New Session Modal ──────────────────────────────────────────────────────────────── */

function openNewSessionModal() {
  // Build client list: dashboard clients + Halaxy patients, deduplicated by name
  var clients  = (_pipelineData && _pipelineData.clients) || [];
  var patients = (_halaxyData   && _halaxyData.patients)  || [];
  var fees     = _halaxyFees || [];

  // Only include clients with a Halaxy ID — this is a Halaxy booking
  var allClients = [];
  clients.forEach(function(c) {
    if (c.halaxy_id) allClients.push({ label: c.display_name, halaxyId: c.halaxy_id, dashId: c.id });
  });
  // Add Halaxy patients not yet on the dashboard
  patients.forEach(function(p) {
    var already = allClients.some(function(c) { return String(c.halaxyId) === String(p.id); });
    if (!already) allClients.push({ label: p.name, halaxyId: p.id, dashId: null });
  });
  allClients.sort(function(a, b) { return a.label.localeCompare(b.label); });

  // Default date/time: next hour, rounded
  var now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  var defaultDate = now.toISOString().slice(0, 10);
  var defaultTime = now.toTimeString().slice(0, 5);

  // Fee options
  var feeOpts = fees.map(function(f) {
    return '<option value="' + escHtml(String(f.id)) + '" data-amount="' + f.amount + '" data-name="' + escHtml(f.name) + '">'
      + escHtml(f.name) + ' — $' + Number(f.amount).toFixed(2) + '</option>';
  }).join('');

  // Client options — all have a Halaxy ID
  var clientOpts = allClients.map(function(c) {
    return '<option value="' + escHtml(c.label) + '" data-halaxy-id="' + escHtml(String(c.halaxyId)) + '">'
      + escHtml(c.label) + '</option>';
  }).join('');

  var modal = document.createElement('div');
  modal.id  = 'new-session-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = '<div style="background:#fff;border-radius:14px;padding:24px;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.18)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
    + '<strong style="font-size:15px">New Appointment</strong>'
    + '<button onclick="closeNewSessionModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666">&times;</button>'
    + '</div>'
    + '<div style="font-size:11.5px;color:#9AABA8;margin-bottom:16px">Books directly into Halaxy — invoice auto-generated when a fee is selected</div>'

    + '<label style="font-size:12px;color:#666;display:block;margin-bottom:3px">Halaxy client</label>'
    + '<input list="ns-client-list" id="ns-client-input" class="pl-link-input" placeholder="Search Halaxy clients…" style="margin-bottom:10px" oninput="_nsClientChange()">'
    + '<datalist id="ns-client-list">' + clientOpts + '</datalist>'
    + '<input type="hidden" id="ns-halaxy-id">'

    + '<label style="font-size:12px;color:#666;display:block;margin-bottom:3px">Date</label>'
    + '<input type="date" id="ns-date" class="pl-link-input" value="' + defaultDate + '" style="margin-bottom:10px">'

    + '<div style="display:flex;gap:8px;margin-bottom:10px">'
    + '<div style="flex:1"><label style="font-size:12px;color:#666;display:block;margin-bottom:3px">Start time</label>'
    + '<input type="time" id="ns-start" class="pl-link-input" value="' + defaultTime + '"></div>'
    + '<div style="flex:1"><label style="font-size:12px;color:#666;display:block;margin-bottom:3px">Duration</label>'
    + '<select id="ns-duration" class="pl-link-input">'
    + '<option value="30">30 min</option><option value="45">45 min</option>'
    + '<option value="60" selected>60 min</option><option value="90">90 min</option>'
    + '<option value="120">2 hours</option></select></div>'
    + '</div>'

    + '<label style="font-size:12px;color:#666;display:block;margin-bottom:3px">Fee <span style="color:#9AABA8;font-weight:400">(optional — triggers auto-invoice in Halaxy)</span></label>'
    + '<select id="ns-fee" class="pl-link-input" style="margin-bottom:10px">'
    + '<option value="">— select a fee —</option>' + feeOpts + '</select>'

    + '<label style="font-size:12px;color:#666;display:block;margin-bottom:3px">Location</label>'
    + '<select id="ns-location" class="pl-link-input" style="margin-bottom:10px">'
    + '<option value="clinic" selected>In-clinic</option>'
    + '<option value="telehealth">Telehealth (video)</option>'
    + '<option value="phone">Phone</option>'
    + '<option value="online">Online</option>'
    + '</select>'

    + '<label style="font-size:12px;color:#666;display:block;margin-bottom:3px">Notes</label>'
    + '<input type="text" id="ns-notes" class="pl-link-input" placeholder="Appointment notes…" style="margin-bottom:16px">'

    + '<div id="ns-error" style="color:#c0392b;font-size:12px;margin-bottom:8px;display:none"></div>'

    + '<div style="display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="dp-btn" onclick="closeNewSessionModal()">Cancel</button>'
    + '<button class="dp-btn dp-btn--primary" id="ns-submit-btn" onclick="_submitNewSession()">Create Appointment</button>'
    + '</div>'
    + '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) closeNewSessionModal(); });
  setTimeout(function() { var el = document.getElementById('ns-client-input'); if (el) el.focus(); }, 50);
}

function _nsClientChange() {
  var input    = document.getElementById('ns-client-input');
  var hiddenId = document.getElementById('ns-halaxy-id');
  var list     = document.getElementById('ns-client-list');
  if (!input || !hiddenId || !list) return;

  var val  = input.value;
  var opts = list.querySelectorAll('option');
  var hId  = '';
  opts.forEach(function(o) { if (o.value === val) hId = o.dataset.halaxyId || ''; });
  hiddenId.value = hId;
}

function closeNewSessionModal() {
  var m = document.getElementById('new-session-modal');
  if (m) m.remove();
}

async function _submitNewSession() {
  var btn      = document.getElementById('ns-submit-btn');
  var errEl    = document.getElementById('ns-error');
  var client   = (document.getElementById('ns-client-input') || {}).value  || '';
  var halaxyId = (document.getElementById('ns-halaxy-id')    || {}).value  || '';
  var date     = (document.getElementById('ns-date')         || {}).value  || '';
  var startT   = (document.getElementById('ns-start')        || {}).value  || '';
  var duration = parseInt((document.getElementById('ns-duration') || {}).value || '60', 10);
  var feeSel   = document.getElementById('ns-fee');
  var location = (document.getElementById('ns-location')     || {}).value  || 'clinic';
  var notes    = (document.getElementById('ns-notes')        || {}).value  || '';

  errEl.style.display = 'none';

  if (!client)   { errEl.textContent = 'Please select a client';          errEl.style.display = ''; return; }
  if (!halaxyId) { errEl.textContent = 'Selected client has no Halaxy ID — add them to Halaxy first'; errEl.style.display = ''; return; }
  if (!date)     { errEl.textContent = 'Please pick a date';              errEl.style.display = ''; return; }
  if (!startT)   { errEl.textContent = 'Please set a start time';         errEl.style.display = ''; return; }

  // Build ISO datetimes — Halaxy requires offset (Brisbane = UTC+10, no DST)
  var TZ_OFFSET  = '+10:00';
  var pad        = function(n) { return ('0' + n).slice(-2); };
  var start      = date + 'T' + startT + ':00' + TZ_OFFSET;
  var endMs      = new Date(start).getTime() + duration * 60000;
  // Express end in Brisbane time: shift +10h then read UTC components
  var _endBris2  = new Date(endMs + 10 * 3600 * 1000);
  var end        = _endBris2.getUTCFullYear() + '-' + pad(_endBris2.getUTCMonth() + 1) + '-'
                 + pad(_endBris2.getUTCDate()) + 'T'
                 + pad(_endBris2.getUTCHours()) + ':' + pad(_endBris2.getUTCMinutes()) + ':00' + TZ_OFFSET;

  var feeId  = feeSel && feeSel.value ? feeSel.value : null;

  if (btn) { btn.disabled = true; btn.textContent = 'Booking…'; }

  try {
    // Book directly in Halaxy — Halaxy IS the calendar for client appointments
    var resp = await apiFetch('/api/admin-enquiries?new_appt=1', {
      method: 'POST',
      body: {
        patientId:   halaxyId,
        start,
        end,
        feeId:       feeId    || undefined,
        locationType: location,
      },
    });

    closeNewSessionModal();
    toast('Appointment booked in Halaxy ✓' + (feeId ? ' — invoice auto-generated' : ''), 'ok');
    setTimeout(function() { refreshPipeline(); }, 1500);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Appointment'; }
    errEl.textContent = err.message || 'Failed to book appointment';
    errEl.style.display = '';
  }
}

/* ── Close enquiry with reason modal ── */
function _openCloseEnquiryModal(enqId) {
  var ov = document.getElementById('mini-modal-ov');
  if (!ov) return;
  ov.innerHTML = '<div class="mm-card">'
    + '<div class="mm-title">Close enquiry</div>'
    + '<div class="mm-field"><label>Reason</label>'
    + '<select id="mm-close-reason">'
    + '<option value="">Select a reason…</option>'
    + '<option value="not_interested">Not interested</option>'
    + '<option value="wrong_service">Wrong service or fit</option>'
    + '<option value="no_response">No response after follow-up</option>'
    + '<option value="converted_elsewhere">Converted elsewhere</option>'
    + '<option value="duplicate">Duplicate enquiry</option>'
    + '<option value="other">Other</option>'
    + '</select></div>'
    + '<div class="mm-field"><label>Note (optional)</label>'
    + '<textarea id="mm-close-note" placeholder="Any additional context…"></textarea></div>'
    + '<div class="mm-actions">'
    + '<button class="mm-btn-cancel" onclick="document.getElementById(\'mini-modal-ov\').classList.remove(\'open\')">Cancel</button>'
    + '<button class="mm-btn-danger" onclick="_submitCloseEnquiry(\'' + enqId + '\')">Close enquiry</button>'
    + '</div>'
    + '</div>';
  ov.classList.add('open');
}

async function _submitCloseEnquiry(enqId) {
  var reason = (document.getElementById('mm-close-reason') || {}).value || '';
  var note   = ((document.getElementById('mm-close-note') || {}).value || '').trim();
  var ov = document.getElementById('mini-modal-ov');
  if (ov) ov.classList.remove('open');
  try {
    var body = { status: 'closed' };
    if (reason) body.closed_reason = reason;
    if (note)   body.notes = note;
    await apiFetch('/api/admin-enquiries?id=' + enqId, { method: 'PATCH', body: body });
    toast('Enquiry closed');
    refreshPipeline();
    closeDetailPanel();
  } catch (err) {
    toast('Could not close: ' + err.message, 'err');
  }
}

/* ── Funders view ── */
function renderFundersView() {
  var content = document.getElementById('view-content');
  if (!content) return;

  var funders  = (_halaxyData && _halaxyData.funders)   || [];
  var invoices = (_halaxyData && _halaxyData.invoices)  || [];
  var clients  = (_pipelineData && _pipelineData.clients) || [];

  // Group invoices by funder key — use Halaxy Coverage as source of truth
  var hxCoverageMap = (_halaxyData && _halaxyData.patientFunderMap) || {};
  var byFunder = {};
  invoices.forEach(function(inv) {
    if (!inv.patientId || inv.status === 'cancelled' || inv.status === 'draft') return;
    var pid = String(inv.patientId);
    // Priority: Halaxy Coverage → fee name → 'private'
    var fk = (hxCoverageMap[pid] && _mapCoverageToFunderKey(hxCoverageMap[pid]))
          || _guessFunderKey(inv.feeName || '')
          || 'private';
    if (!byFunder[fk]) byFunder[fk] = { owing: 0, paid: 0, count: 0 };
    var bal = parseFloat(inv.totalBalance);
    var pd  = parseFloat(inv.totalPaid);
    if (bal > 0) byFunder[fk].owing += bal;
    if (pd > 0)  byFunder[fk].paid  += pd;
    byFunder[fk].count++;
  });

  function fmt(n) { return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  var html = '<div class="funders-view">';
  html += '<div class="funders-view-hd"><span class="view-title">Funders</span></div>';

  if (!funders.length && !Object.keys(byFunder).length) {
    html += '<div class="dp-empty" style="margin-top:40px">No funder data available — run a Halaxy sync in Settings</div>';
    html += '</div>';
    content.innerHTML = html;
    return;
  }

  // Show all known funders, highlight ones with activity
  var funderKeys = Object.keys(FUNDER_LABELS);
  // Add any extra keys from invoice data not in FUNDER_LABELS
  Object.keys(byFunder).forEach(function(k) { if (!funderKeys.includes(k)) funderKeys.push(k); });

  funderKeys.forEach(function(fk) {
    var stats = byFunder[fk] || { owing: 0, paid: 0, count: 0 };
    if (!stats.count) return; // only show funders with actual invoices
    var label = FUNDER_LABELS[fk] || fk;
    html += '<div class="funder-card">'
      + '<div>'
      + '<div class="funder-card-name">' + escHtml(label) + '</div>'
      + '<div class="funder-card-sub">' + stats.count + ' invoice' + (stats.count !== 1 ? 's' : '') + (stats.paid > 0 ? ' · ' + fmt(stats.paid) + ' paid FY' : '') + '</div>'
      + '</div>'
      + '<div class="funder-stat">'
      + '<div class="funder-stat-val' + (stats.owing > 0 ? ' owing' : '') + '">' + (stats.owing > 0 ? fmt(stats.owing) : '—') + '</div>'
      + '<div class="funder-stat-label">' + (stats.owing > 0 ? 'outstanding' : 'all clear') + '</div>'
      + '</div>'
      + '</div>';
  });

  html += '</div>';
  content.innerHTML = html;
}

/* ── Escape HTML helper ── */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
