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

/* ── Invoice → task links (localStorage) ── */
var _invTaskLinks = JSON.parse(localStorage.getItem('inv_task_links') || '{}');
function _invGetTaskIds(invId) { return _invTaskLinks[String(invId)] || []; }
function _invLinkTask(invId, taskId) {
  var key = String(invId);
  if (!_invTaskLinks[key]) _invTaskLinks[key] = [];
  if (!_invTaskLinks[key].includes(String(taskId))) _invTaskLinks[key].push(String(taskId));
  localStorage.setItem('inv_task_links', JSON.stringify(_invTaskLinks));
}
function _invUnlinkTask(invId, taskId) {
  var key = String(invId);
  if (!_invTaskLinks[key]) return;
  _invTaskLinks[key] = _invTaskLinks[key].filter(function(id) { return id !== String(taskId); });
  if (!_invTaskLinks[key].length) delete _invTaskLinks[key];
  localStorage.setItem('inv_task_links', JSON.stringify(_invTaskLinks));
}
function _getSubStatus(invId) {
  var s = _billingSubmissions[invId];
  if (!s) return null;
  var daysAgo = (Date.now() - new Date(s.date).getTime()) / 86400000;
  return { date: s.date, daysAgo: Math.round(daysAgo), chase: daysAgo >= 7 };
}
function _markBillingSubmitted(invId) {
  _billingSubmissions[invId] = { date: new Date().toISOString().slice(0, 10) };
  localStorage.setItem('billing_submissions', JSON.stringify(_billingSubmissions));
  document.querySelectorAll('.inv-modal-overlay').forEach(function(el) { el.remove(); });
  if (window.innerWidth <= 768 && typeof _mobRenderBilling === 'function') _mobRenderBilling();
  else _dhRenderBillingBento();
}
function _clearBillingSubmission(invId) {
  delete _billingSubmissions[invId];
  localStorage.setItem('billing_submissions', JSON.stringify(_billingSubmissions));
  document.querySelectorAll('.inv-modal-overlay').forEach(function(el) { el.remove(); });
  if (window.innerWidth <= 768 && typeof _mobRenderBilling === 'function') _mobRenderBilling();
  else _dhRenderBillingBento();
}

/* ── Toast notifications — frosted glass, top-centre ── */
function toast(msg, type) {
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  var pill = document.createElement('div');
  pill.className = 'toast-pill';

  var dot = document.createElement('span');
  dot.className = 'toast-dot ' + (type === 'err' ? 'toast-dot--err' : type === 'ok' ? 'toast-dot--ok' : 'toast-dot--def');
  pill.appendChild(dot);

  var text = document.createElement('span');
  text.textContent = msg;
  pill.appendChild(text);

  container.appendChild(pill);

  var ttl = type === 'err' ? 5000 : 2600;
  setTimeout(function() {
    pill.classList.add('toast-out');
    setTimeout(function() { if (pill.parentNode) pill.parentNode.removeChild(pill); }, 280);
  }, ttl);
}

/* ── Success overlay (Apple Pay-style) ── */
function _showSuccess(type, label) {
  var C = {
    save:     { bg: '#2A5850', stroke: '#77CFBD' },
    mark:     { bg: '#27ae60', stroke: '#a8f0c4' },
    send:     { bg: '#2E5FA3', stroke: '#8ABDE8' },
    merge:    { bg: '#376B62', stroke: '#77CFBD' },
    delete:   { bg: '#BE6E44', stroke: '#FFBF99' },
    reminder: { bg: '#7C6FE0', stroke: '#C4BFFF' },
  };
  var c = C[type] || C.save;
  var el = document.createElement('div');
  el.className = 'suc-overlay';
  el.innerHTML = '<div class="suc-ring" style="background:' + c.bg + '">'
    + '<svg width="42" height="42" viewBox="0 0 42 42" fill="none">'
    + '<path d="M10 21.5 L18.5 30 L32 14" stroke="' + c.stroke + '" stroke-width="3.2"'
    + ' stroke-linecap="round" stroke-linejoin="round"'
    + ' style="stroke-dasharray:52;stroke-dashoffset:52;animation:suc-check 0.32s 0.12s ease forwards"/>'
    + '</svg></div>'
    + (label ? '<div class="suc-label">' + label + '</div>' : '');
  document.body.appendChild(el);
  _playSnd(type);
  setTimeout(function() {
    el.style.animation = 'suc-dismiss 0.28s ease forwards';
    setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 290);
  }, 1300);
}

/* ── Sound effects (Web Audio API — no external files) ── */
function _playSnd(type) {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    function tone(freq, startT, dur, wave, vol) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = wave || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, startT);
      g.gain.linearRampToValueAtTime(vol || 0.18, startT + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, startT + dur);
      o.start(startT); o.stop(startT + dur + 0.04);
    }
    var t = ctx.currentTime;
    if (type === 'save')     { tone(440, t, 0.15); tone(660, t + 0.09, 0.15); }
    else if (type === 'mark'){ tone(523, t, 0.10); tone(784, t + 0.07, 0.12); }
    else if (type === 'send'){ tone(660, t, 0.14, 'sine', 0.14); tone(440, t + 0.1, 0.16, 'sine', 0.12); }
    else if (type === 'merge'){ tone(440, t, 0.20); tone(554, t + 0.02, 0.20, 'sine', 0.10); tone(660, t + 0.04, 0.20, 'sine', 0.08); }
    else if (type === 'delete'){ tone(440, t, 0.10, 'triangle'); tone(330, t + 0.08, 0.12, 'triangle', 0.12); }
    else if (type === 'reminder'){ tone(528, t, 0.28, 'sine', 0.22); tone(528, t + 0.01, 0.35, 'triangle', 0.04); }
    setTimeout(function() { try { ctx.close(); } catch(e) {} }, 700);
  } catch(e) {}
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

/* ── Responsive breakpoint handler ──────────────────────────────────
   When the browser is resized across the 768px boundary, re-render
   the correct view. Without this, resizing desktop→mobile leaves the
   mob-splash stuck because _mobRunIntro() never ran on the desktop path.
──────────────────────────────────────────────────────────────────── */
var _lastBreakpoint = window.innerWidth <= 768 ? 'mobile' : 'desktop';
window.addEventListener('resize', (function() {
  var _bpTimer;
  return function() {
    clearTimeout(_bpTimer);
    _bpTimer = setTimeout(function() {
      var now = window.innerWidth <= 768 ? 'mobile' : 'desktop';
      if (now === _lastBreakpoint) return;
      _lastBreakpoint = now;

      if (now === 'mobile') {
        // Switching desktop → mobile.
        // Data is already loaded — skip the splash animation entirely.
        var splash = document.getElementById('mob-splash');
        if (splash) { splash.style.transition = 'none'; splash.style.opacity = '0'; splash.style.display = 'none'; }
        var logoBar = document.getElementById('mob-logo-bar');
        if (logoBar) { logoBar.style.transition = 'none'; logoBar.style.opacity = '1'; }
        var mobHd = document.getElementById('mob-hd');
        if (mobHd) mobHd.style.opacity = '1';
        // Mark intro as done so _mobRunIntro skips the animation path
        _mobIntroRan    = true;
        _mobAnimRunning = false;
        _ptrInited      = false; // allow pull-to-refresh to init fresh
        if (_pipelineData) {
          _mobInitPullToRefresh();
          _mobUpdateHeader();
          navigateTo(_currentView);
          updateSidebarBadge();
        }
      } else {
        // Switching mobile → desktop — just re-render the current view.
        if (_pipelineData) renderPipeline();
      }
    }, 180);
  };
})());

/* ═══════════════════════════════════════════════════════════════
   UNIFIED PIPELINE — enquiries + clients + Halaxy
   ═══════════════════════════════════════════════════════════════ */

var _pipelineData    = null;
var _halaxyData      = { connected: false, appointments: [], patients: [], patientMap: {}, funders: [] };
var _calEventMap     = {};    // eventId → event object
var _calDismissed    = new Set(JSON.parse(localStorage.getItem('cal_dismissed') || '[]'));
var _calReminders    = new Set(JSON.parse(localStorage.getItem('cal_reminders')  || '[]'));
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
  // Close date/time/client picker popups if clicking outside
  if (!e.target.closest('.cdp-wrap') && !e.target.closest('.cdp-popup')) {
    document.querySelectorAll('.cdp-popup').forEach(function(p) { p.style.display = 'none'; });
  }
  if (!e.target.closest('.ctp-wrap') && !e.target.closest('.ctp-popup')) {
    document.querySelectorAll('.ctp-popup').forEach(function(p) { p.style.display = 'none'; });
  }
  if (!e.target.closest('.ccl-wrap') && !e.target.closest('.ccl-popup')) {
    document.querySelectorAll('.ccl-popup').forEach(function(p) { p.style.display = 'none'; });
  }
});

var FUNDER_LABELS = {
  private:   'Private',
  medicare:  'Medicare',
  dva:       'DVA / Bupa / ADFHCS',   // "Bupa" = DVA here, NOT health insurance
  ndis_plan: 'NDIS Plan Managed',
  qfes:      'QFES EAP',
  workcover: 'WorkCover',
};

/* ── Bookable session menu (the "Set up in Halaxy" v1, shaped with Julian 2026-06) ──
 * The fixed STRUCTURE of what Cheree can book per funder. Each item is matched to a live
 * Halaxy fee (by name+amount) in Settings → "Booking fees"; that fee-id mapping is what gets
 * persisted (`session_fee_map`). Metadata (modality / mbsItem / durationMin) travels to the
 * booking flow. NDIS is plan-managed: one standard fee, plan-manager picked at booking (routes
 * via Coverage). Full rationale in docs/halaxy-onboarding-spec.md. */
var BOOKABLE_MENU = [
  { key: 'private', label: 'Private', billingKey: 'private', items: [
    { id: 'private_inperson', label: 'Individual · In person', modality: 'clinic',  match: { name: 'Face to Face', amount: 180 } },
    { id: 'private_online',   label: 'Individual · Online',    modality: 'online',  match: { name: 'Online', amount: 180 } },
    { id: 'private_child',    label: 'Child / Parent intake',  modality: 'clinic',  match: { name: 'Parent Intake / Child', amount: 180 } },
  ] },
  { key: 'medicare', label: 'Medicare', billingKey: 'medicare', note: 'Requires a valid GP referral / MHCP on file.', items: [
    { id: 'medicare_inperson', label: 'In person', modality: 'clinic', mbsItem: '80160', match: { name: 'In Person Consultation', amount: 180 } },
    { id: 'medicare_video',    label: 'Video',     modality: 'online', mbsItem: '91176', match: { name: 'Video Telehealth Consultation', amount: 180 } },
    { id: 'medicare_phone',    label: 'Phone',     modality: 'phone',  mbsItem: '91188', match: { name: 'Phone Telehealth Consultation', amount: 180 } },
  ] },
  { key: 'ndis', label: 'NDIS (plan-managed)', billingKey: 'ndis_plan', planManaged: true,
    note: 'All $193.99. Cheree picks the plan manager + modality at booking — the plan manager routes via the patient’s Coverage, not the fee.', items: [
    { id: 'ndis_standard', label: 'Standard therapy fee', match: { name: 'Assessment Recommendation Therapy or Training - Social Worker', amount: 193.99 } },
  ] },
  { key: 'qfes', label: 'QFES (EAP)', billingKey: 'qfes', note: 'The Halaxy appointment length MUST equal the chosen band (for invoicing).', items: [
    { id: 'qfes_60',  label: '60 min',  durationMin: 60,  match: { name: 'QFES Consultation', amount: 250 } },
    { id: 'qfes_90',  label: '90 min',  durationMin: 90,  match: { name: 'QFES Consultation', amount: 375 } },
    { id: 'qfes_120', label: '120 min', durationMin: 120, match: { name: 'QFES Consultation', amount: 500 } },
    { id: 'qfes_150', label: '150 min', durationMin: 150, match: { name: 'QFES Consultation', amount: 625 } },
  ] },
  { key: 'dva', label: 'DVA / Bupa / ADFHCS', billingKey: 'dva', note: '"Bupa" = DVA here, not health insurance.', items: [
    { id: 'dva_us24', label: 'US24', match: { name: 'Consultation 50+ mins', amount: 246.44 } },
  ] },
  { key: 'workcover', label: 'WorkCover QLD', billingKey: 'workcover', items: [
    { id: 'wc_initial',    label: 'Initial Consultation',    match: { name: 'Initial Consultation', amount: 243 } },
    { id: 'wc_subsequent', label: 'Subsequent Consultation', match: { name: 'Subsequent Consultation', amount: 243 } },
  ] },
];

// Resolve a menu item's Halaxy fee (saved config wins, else auto-match) → { feeId, name, amount } or null.
function _bookableResolveFee(item) {
  var saved = (_pipelineData && _pipelineData.session_fee_map) || {};
  var feeId = saved[item.id] || _bookableFeeMatch(item) || '';
  if (!feeId) return null;
  var fee = (_halaxyFees || []).find(function(f) { return String(f.id) === String(feeId); });
  return { feeId: feeId, name: fee ? fee.name : (item.match ? item.match.name : ''), amount: fee ? Number(fee.amount) : (item.match ? item.match.amount : 0) };
}
function _bookableFunder(key) { return BOOKABLE_MENU.find(function(f) { return f.key === key; }) || null; }

// Best-guess Halaxy fee id for a menu item — exact name+amount match, then case-insensitive name.
function _bookableFeeMatch(item) {
  var fees = _halaxyFees || [];
  if (!item || !item.match) return '';
  var m = fees.find(function(f) {
    return f.name === item.match.name && Math.abs(Number(f.amount) - item.match.amount) < 0.005;
  });
  if (m) return m.id;
  var byName = fees.find(function(f) { return (f.name || '').toLowerCase() === item.match.name.toLowerCase(); });
  return byName ? byName.id : '';
}

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
  // contacted → in_halaxy is no longer a manual step: the Halaxy Patient·Create
  // webhook auto-advances a card to in_halaxy when the client completes /register.
  // in_halaxy: no auto-advance — use Convert or Close (modal) from the card menu
};

var _modalSearchTimer = null; // debounce timer for Add Client modal Halaxy search
var _halaxyFunders   = null; // cached Halaxy funder org list (null = not yet loaded; [] = loaded but empty)
var _halaxyFeeMap    = {};   // funder ID → array of fee IDs (from halaxy_fee_funder_map setting)

/* ── View routing ── */
var _currentView = 'home';

var _SECONDARY_VIEWS = { settings: true, vendors: true, reports: true, reminders: true };

/* Toggle settings from the floating desktop cog — click to open, click again to dismiss */
function toggleDesktopSettings() {
  var btn = document.getElementById('dh-desk-settings-btn');
  if (_currentView === 'settings') {
    navigateTo('home');
    if (btn) btn.style.color = '';
  } else {
    navigateTo('settings');
    if (btn) btn.style.color = 'var(--teal)';
  }
}

/* ── Mobile app-switch primary views ──────────────────────────── */
var _MOB_APPS = { home: true, queue: true, reminders: true, billing: true };

function navigateTo(view) {
  _currentView = view;
  closeMoreSheet(); closeMobActionSheet();
  // Update desktop sidebar active states
  document.querySelectorAll('.sidebar-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.view === view);
  });
  // Keep floating settings cog highlighted when on settings
  var cogBtn = document.getElementById('dh-desk-settings-btn');
  if (cogBtn) cogBtn.style.color = view === 'settings' ? 'var(--teal)' : '';
  closeDetailPanel();
  _dbUpdateTopbar(view);

  // On mobile: primary apps go through mobSwitchApp for the fade transition
  if (window.innerWidth <= 768 && _MOB_APPS[view]) {
    mobSwitchApp(view);
    return;
  }

  if (!_pipelineData) return; // data not loaded yet — renders when loaded
  if (view === 'home')           renderHomeView();
  else if (view === 'reminders') renderRemindersView();
  else if (view === 'queue')     renderQueueView();
  else if (view === 'clients')   renderClientsView();
  else if (view === 'settings')  renderSettingsView();
  else if (view === 'vendors')   renderFundersView();
  else if (view === 'reports')   renderStubView('reports', 'Reports', 'Practice reports and insights coming soon.');
}

function toggleMoreSheet() {
  var sheet = document.getElementById('bn-more-sheet');
  if (!sheet) return;
  if (sheet.classList.contains('open')) closeMoreSheet();
  else sheet.classList.add('open');
}
function closeMoreSheet() {
  var sheet = document.getElementById('bn-more-sheet');
  if (sheet) sheet.classList.remove('open');
}

/* ── Mobile action sheet (^ button) ─────────────────────────── */
function toggleMobActionSheet() {
  var sheet = document.getElementById('mob-action-sheet');
  if (!sheet) return;
  var btn = document.getElementById('mob-dock-center-btn');
  if (sheet.classList.contains('open')) {
    closeMobActionSheet();
  } else {
    sheet.classList.add('open');
    if (btn) btn.classList.add('sheet-open');
  }
}
function closeMobActionSheet() {
  var sheet = document.getElementById('mob-action-sheet');
  if (sheet) sheet.classList.remove('open');
  var btn = document.getElementById('mob-dock-center-btn');
  if (btn) btn.classList.remove('sheet-open');
}

/* ── Mobile: switch app with fade, update dock ───────────────── */
var _mobCurrentApp = 'home';

function mobSwitchApp(app) {
  // Update dock active state
  document.querySelectorAll('.mob-dock-item[data-app]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.app === app);
  });

  var content = document.getElementById('view-content');
  if (!content || !_pipelineData) { _mobCurrentApp = app; return; }

  if (_mobCurrentApp === app) {
    // Already on this app — just re-render (e.g. after data refresh)
    _mobRenderApp(app);
    return;
  }

  // Fade out
  content.style.opacity = '0';
  content.style.transform = 'translateY(6px)';
  _mobCurrentApp = app;
  _currentView   = app;

  // Scroll app-content to top so new view starts at the top
  var appContent = document.querySelector('.app-content');
  if (appContent) appContent.scrollTop = 0;

  setTimeout(function() {
    _mobRenderApp(app);
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        content.style.opacity = '1';
        content.style.transform = 'translateY(0)';
      });
    });
  }, 140);
}

function _mobRenderApp(app) {
  if (app === 'home')           _mobRenderHome();
  else if (app === 'sched')     _mobRenderSchedule();
  else if (app === 'queue')     _mobRenderInbox();
  else if (app === 'reminders') _mobRenderInbox();
  else if (app === 'billing')   _mobRenderBilling();
}

/* ── Mobile billing — full dark-theme rebuild matching desktop bento/view ── */
function _mobRenderBilling() {
  var content = document.getElementById('view-content');
  if (!content) return;

  var now         = new Date();
  var monthStr    = now.toISOString().slice(0, 7);
  var invoices    = (_halaxyData && _halaxyData.invoices) || [];
  var fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  var fyStart     = fyStartYear + '-07-01';
  var fyLabel     = 'FY' + fyStartYear + '–' + String(fyStartYear + 1).slice(2);

  /* Paid amount — togglable MTD / FY */
  var paidAmt = invoices.reduce(function(sum, inv) {
    if (!_invIsPaid(inv) || !inv.date) return sum;
    if (_dhBillMode === 'mtd' && !inv.date.startsWith(monthStr)) return sum;
    if (_dhBillMode === 'fy'  && inv.date < fyStart) return sum;
    return sum + parseFloat(inv.totalPaid != null ? inv.totalPaid : (inv.amount || 0));
  }, 0);

  var periodLabel = _dhBillMode === 'mtd'
    ? now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
    : fyLabel;

  /* Outstanding — all unpaid, no date limit */
  var outstanding = invoices.filter(function(inv) {
    return !_invIsPaid(inv) && inv.status !== 'cancelled' && inv.status !== 'draft';
  }).sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });

  var totalOwing = outstanding.reduce(function(s, inv) {
    return s + (parseFloat(inv.totalBalance != null ? inv.totalBalance : 0) || 0);
  }, 0);

  var html = '<div class="mob-billing-view">';

  /* ── Two-stat bar ── */
  html += '<div class="mob-bill-stat-bar">'
    + '<div class="mob-bill-stat mob-bill-paid-toggle" onclick="dhBillToggleMode();_mobRenderBilling()">'
    + '<div class="mob-bill-stat-val teal">' + _fmtAUD(paidAmt) + '</div>'
    + '<div class="mob-bill-stat-lbl">Paid · ' + escHtml(periodLabel) + ' <span style="opacity:0.45;font-size:10px">↔</span></div>'
    + '</div>'
    + '<div class="mob-bill-stat">'
    + '<div class="mob-bill-stat-val ' + (totalOwing ? 'amber' : 'teal') + '">' + _fmtAUD(totalOwing) + '</div>'
    + '<div class="mob-bill-stat-lbl">Outstanding · ' + outstanding.length + ' inv.</div>'
    + '</div>'
    + '</div>';

  /* ── Invoice list ── */
  if (!_halaxyData || !_halaxyData.connected) {
    html += '<div class="mob-bill-empty">Connect Halaxy in Settings to see invoices.</div>';
  } else if (!outstanding.length) {
    html += '<div class="mob-bill-empty">No outstanding invoices ✓</div>';
  } else {
    html += '<div class="mob-bill-section-hd">Outstanding</div>'
      + '<div class="mob-bill-inv-list">';
    outstanding.forEach(function(inv) {
      var name = _resolvePatientName(inv.patientId);
      var dt   = inv.date ? new Date(inv.date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
      var _rawBal = parseFloat(inv.totalBalance != null ? inv.totalBalance : 0);
      var bal  = _rawBal > 0 ? _rawBal : parseFloat(inv.amount || 0);
      var sub  = _getSubStatus(inv.id);
      var _isAR = _invIsAwaitingRemittance(inv);
      var subBadge = _isAR
        ? '<span class="mob-bill-sub" style="color:#FBBF24">Submitted · awaiting remittance</span>'
        : sub
          ? '<span class="mob-bill-sub ' + (sub.chase ? 'chase' : 'ok') + '">' + (sub.chase ? '⚠ Chase up' : '✓ Submitted') + '</span>'
          : '<button class="mob-bill-mark" onclick="event.stopPropagation();_markBillingSubmitted(\'' + escHtml(String(inv.id)) + '\');_mobRenderBilling()">Mark submitted</button>';
      var refLabel = _fmtInvRef(inv);
      html += '<div class="mob-bill-row">'
        + '<div class="mob-bill-row-top">'
        + '<span class="mob-bill-name">' + escHtml(name) + (refLabel ? '<span class="mob-bill-ref"> · ' + escHtml(refLabel) + '</span>' : '') + '</span>'
        + '<span class="mob-bill-amt">' + (bal ? _fmtAUD(bal) : '—') + '</span>'
        + '</div>'
        + '<div class="mob-bill-row-bot">'
        + (inv.payorOrg ? '<span class="mob-bill-org">' + escHtml(inv.payorOrg) + '</span>' : '<span></span>')
        + subBadge
        + '<span class="mob-bill-date">' + escHtml(dt) + '</span>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  content.innerHTML = html;
  _updateMobileDock('billing');
}

/* ── Mobile reminders app ─────────────────────────────────────── */
function _mobRenderReminders() {
  var content = document.getElementById('view-content');
  if (!content) return;

  if (!_dhTasksLoaded) {
    content.innerHTML = '<div class="mob-remind-view">'
      + '<div class="mob-remind-hd"><span class="mob-remind-title">Reminders</span></div>'
      + '<div class="mob-empty-state" style="padding:40px 20px;text-align:center;color:var(--t3)">Loading…</div>'
      + '</div>';
    _dhLoadTasks().then(function() {
      if (_mobCurrentApp === 'reminders') _mobRenderReminders();
    }).catch(function() {});
    _updateMobileDock('reminders');
    return;
  }

  var tasks   = _dhTasks || [];
  var pending = tasks.filter(function(t) { return !t.completed; });
  var done    = tasks.filter(function(t) { return t.completed; }).slice(0, 8);

  function _fmtAdded(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  var sortLabel = _dhRemindSort === 'priority' ? 'Priority' : 'Date';

  var html = '<div class="mob-remind-view">';

  /* Header row — sort only, no "+ Add" (use ^ action sheet) */
  html += '<div class="mob-remind-hd">'
    + '<span class="mob-remind-title">Reminders</span>'
    + '<button class="mob-remind-sort-btn" onclick="dhRemindCycleSort()">'
    + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M7 12h10M11 18h2"/></svg>'
    + 'Sort: ' + sortLabel + '</button>'
    + '</div>';

  if (!tasks.length) {
    html += '<div class="mob-empty-state" style="padding:40px 20px;text-align:center;color:var(--t3)">No reminders yet — tap ^ to add one</div>';
  } else {
    /* Column header */
    html += '<div class="mob-rt-head">'
      + '<span></span>'
      + '<span class="mob-rt-h-task">Task</span>'
      + '<span class="mob-rt-h-client">Client</span>'
      + '<span class="mob-rt-h-prio">Prio</span>'
      + '<span class="mob-rt-h-date">Added</span>'
      + '</div>';

    /* Sort pending tasks */
    var sortedPending = pending.slice();
    if (_dhRemindSort === 'priority') {
      var _mobPrioOrder = { high: 0, normal: 1, low: 2 };
      sortedPending.sort(function(a, b) {
        var pa = _mobPrioOrder[_dhGetPrio(a.id)] !== undefined ? _mobPrioOrder[_dhGetPrio(a.id)] : 1;
        var pb = _mobPrioOrder[_dhGetPrio(b.id)] !== undefined ? _mobPrioOrder[_dhGetPrio(b.id)] : 1;
        if (pa !== pb) return pa - pb;
        return (b.created_at || '').localeCompare(a.created_at || '');
      });
    } else {
      sortedPending.sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    }

    if (!sortedPending.length) {
      html += '<div class="mob-remind-all-done">All tasks complete ✓</div>';
    }

    sortedPending.forEach(function(t) {
      var prio    = _dhGetPrio(t.id);
      var prioLabel = prio === 'high' ? '<span class="mob-prio-badge">High</span>'
                    : prio === 'low'  ? '<span class="mob-prio-badge low">Low</span>'
                    : '<span class="mob-prio-badge dim">—</span>';
      var client  = t.client_label ? escHtml(t.client_label) : '<span style="color:var(--t3)">—</span>';
      var descHtml = t.description ? '<div class="mob-rt-desc">' + escHtml(t.description) + '</div>' : '';
      html += '<div class="mob-rt-row" onclick="_mobOpenEditReminderModal(' + JSON.stringify(t.id) + ')">'
        + '<button class="dh-task-chk" onclick="event.stopPropagation();dhToggleTask(' + JSON.stringify(t.id) + ',true);_mobRenderReminders()" type="button"></button>'
        + '<div class="mob-rt-title-wrap"><div class="mob-rt-title-text">' + escHtml(t.title || t.text || '') + '</div>' + descHtml + '</div>'
        + '<div class="mob-rt-client">' + client + '</div>'
        + '<div class="mob-rt-prio">' + prioLabel + '</div>'
        + '<div class="mob-rt-date">' + _fmtAdded(t.created_at) + '</div>'
        + '</div>';
    });

    /* Completed section */
    if (done.length) {
      html += '<div class="mob-remind-section-sub">Completed</div>';
      done.forEach(function(t) {
        var client  = t.client_label ? escHtml(t.client_label) : '<span style="color:var(--t3)">—</span>';
        var prio    = _dhGetPrio(t.id);
        var prioLabel = prio === 'high' ? '<span class="mob-prio-badge" style="opacity:0.4">High</span>'
                      : prio === 'low'  ? '<span class="mob-prio-badge low" style="opacity:0.4">Low</span>'
                      : '<span class="mob-prio-badge dim" style="opacity:0.35">—</span>';
        html += '<div class="mob-rt-row mob-rt-row-done" onclick="_mobOpenEditReminderModal(' + JSON.stringify(t.id) + ')">'
          + '<button class="dh-task-chk" onclick="event.stopPropagation();dhToggleTask(' + JSON.stringify(t.id) + ',false);_mobRenderReminders()" type="button" style="opacity:0.45">✓</button>'
          + '<div class="mob-rt-title-wrap" style="opacity:0.35"><div class="mob-rt-title-text" style="text-decoration:line-through">' + escHtml(t.title || t.text || '') + '</div></div>'
          + '<div class="mob-rt-client" style="opacity:0.35">' + client + '</div>'
          + prioLabel
          + '<div class="mob-rt-date" style="opacity:0.35">' + _fmtAdded(t.created_at) + '</div>'
          + '</div>';
      });
    }
  }

  html += '</div>';
  content.innerHTML = html;
  _updateMobileDock('reminders');
}

/* ── Mobile: bottom-sheet modal to add a reminder ── */
function _mobOpenAddReminderModal() {
  var existing = document.getElementById('mob-add-remind-sheet');
  if (existing) { existing.remove(); return; }

  var sheet = document.createElement('div');
  sheet.id = 'mob-add-remind-sheet';
  sheet.className = 'mob-sheet-overlay';
  sheet.innerHTML = '<div class="mob-sheet">'
    + '<div class="mob-sheet-hd">'
    + '<span class="mob-sheet-title">New Reminder</span>'
    + '<button class="mob-sheet-close" onclick="document.getElementById(\'mob-add-remind-sheet\').remove()">✕</button>'
    + '</div>'
    + '<div class="mob-sheet-body">'
    + '<input class="mob-sheet-inp" id="mob-add-remind-inp" placeholder="What do you need to do?" autocomplete="off">'
    + '<button class="mob-sheet-submit" onclick="_mobSubmitAddReminder()">Add Reminder</button>'
    + '</div>'
    + '</div>';
  sheet.addEventListener('click', function(e) {
    if (e.target === sheet) sheet.remove();
  });
  document.body.appendChild(sheet);

  setTimeout(function() {
    var inp = document.getElementById('mob-add-remind-inp');
    if (!inp) return;
    inp.focus();
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && inp.value.trim()) _mobSubmitAddReminder();
      if (e.key === 'Escape') { var s = document.getElementById('mob-add-remind-sheet'); if (s) s.remove(); }
    });
  }, 80);
}

async function _mobSubmitAddReminder() {
  var inp   = document.getElementById('mob-add-remind-inp');
  var sheet = document.getElementById('mob-add-remind-sheet');
  if (!inp || !inp.value.trim()) return;
  var title = inp.value.trim();
  if (sheet) sheet.remove();
  try {
    var t = await apiFetch('/api/admin-tasks', { method: 'POST', body: { title: title } });
    if (t && t.id) {
      _dhTasks = _dhTasks || [];
      _dhTasks.push(t);
      toast('Reminder added');
    }
  } catch(e) {
    toast('Could not add reminder', 'err');
  }
  if (_mobCurrentApp === 'reminders') _mobRenderReminders();
}

/* ── Mobile: edit reminder bottom sheet ── */
function _mobOpenEditReminderModal(taskId) {
  var existing = document.getElementById('mob-edit-remind-sheet');
  if (existing) existing.remove();

  var t = _dhTasks.find(function(x) { return String(x.id) === String(taskId); });
  if (!t) return;

  var prio = _dhGetPrio(t.id);
  var tid  = String(t.id);

  var sheet = document.createElement('div');
  sheet.id = 'mob-edit-remind-sheet';
  sheet.className = 'mob-sheet-overlay';
  sheet.innerHTML = '<div class="mob-sheet">'
    + '<div class="mob-sheet-hd">'
    + '<span class="mob-sheet-title">Edit Reminder</span>'
    + '<button class="mob-sheet-close" onclick="document.getElementById(\'mob-edit-remind-sheet\').remove()">✕</button>'
    + '</div>'
    + '<div class="mob-sheet-body">'

    /* Complete toggle */
    + '<button class="mob-sheet-complete-btn' + (t.completed ? ' done' : '') + '" id="mob-edit-complete-btn" onclick="_mobToggleEditComplete(\'' + tid + '\')">'
    + (t.completed ? '✓ Mark as active' : 'Mark as done')
    + '</button>'

    /* Title */
    + '<div class="mob-sheet-field-label">Title</div>'
    + '<input class="mob-sheet-inp" id="mob-edit-title" type="text" value="' + escHtml(t.title || '') + '" placeholder="Reminder title…">'

    /* Description */
    + '<div class="mob-sheet-field-label">Description</div>'
    + '<textarea class="mob-sheet-inp mob-sheet-textarea" id="mob-edit-desc" placeholder="Add notes or context…" rows="3">' + escHtml(t.description || '') + '</textarea>'

    /* Client */
    + '<div class="mob-sheet-field-label">Client</div>'
    + '<input class="mob-sheet-inp" id="mob-edit-client" type="text" value="' + escHtml(t.client_label || '') + '" placeholder="Client name (optional)">'

    /* Priority */
    + '<div class="mob-sheet-field-label">Priority</div>'
    + '<div class="mob-sheet-prio-pills" id="mob-edit-prio" data-prio="' + prio + '" data-tid="' + escHtml(tid) + '">'
    + '<button class="mob-sheet-prio-pill low' + (prio === 'low' ? ' active' : '') + '" onclick="mobSheetSetPrio(\'low\')" type="button">Low</button>'
    + '<button class="mob-sheet-prio-pill' + (prio === 'normal' ? ' active' : '') + '" onclick="mobSheetSetPrio(\'normal\')" type="button">Normal</button>'
    + '<button class="mob-sheet-prio-pill high' + (prio === 'high' ? ' active' : '') + '" onclick="mobSheetSetPrio(\'high\')" type="button">High</button>'
    + '</div>'

    /* Actions */
    + '<button class="mob-sheet-submit" onclick="_mobSubmitEditReminder(\'' + tid + '\')">Save changes</button>'
    + '<button class="mob-sheet-delete" onclick="_mobDeleteReminder(\'' + tid + '\')">Delete reminder</button>'
    + '</div>'
    + '</div>';

  sheet.addEventListener('click', function(e) {
    if (e.target === sheet) sheet.remove();
  });
  document.body.appendChild(sheet);
}

function mobSheetSetPrio(prio) {
  var wrap = document.getElementById('mob-edit-prio');
  if (!wrap) return;
  wrap.dataset.prio = prio;
  wrap.querySelectorAll('.mob-sheet-prio-pill').forEach(function(btn) {
    btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === prio);
  });
}

function _mobToggleEditComplete(tid) {
  var t = _dhTasks.find(function(x) { return String(x.id) === tid; });
  if (!t) return;
  var newCompleted = !t.completed;
  t.completed = newCompleted;
  var btn = document.getElementById('mob-edit-complete-btn');
  if (btn) {
    btn.textContent = newCompleted ? '✓ Mark as active' : 'Mark as done';
    btn.classList.toggle('done', newCompleted);
  }
  apiFetch('/api/admin-tasks?id=' + encodeURIComponent(tid), { method: 'PATCH', body: { completed: newCompleted } })
    .catch(function() { t.completed = !newCompleted; });
}

async function _mobSubmitEditReminder(tid) {
  var titleInp  = document.getElementById('mob-edit-title');
  var descInp   = document.getElementById('mob-edit-desc');
  var clientInp = document.getElementById('mob-edit-client');
  var prioWrap  = document.getElementById('mob-edit-prio');

  var newTitle  = titleInp  ? titleInp.value.trim()   : '';
  var newDesc   = descInp   ? descInp.value.trim()    : '';
  var newClient = clientInp ? clientInp.value.trim()  : '';
  var newPrio   = prioWrap  ? (prioWrap.dataset.prio || 'normal') : 'normal';

  if (!newTitle) { toast('Title is required', 'err'); return; }

  var sheet = document.getElementById('mob-edit-remind-sheet');
  if (sheet) sheet.remove();

  try {
    await apiFetch('/api/admin-tasks?id=' + encodeURIComponent(tid), {
      method: 'PATCH',
      body: {
        title:        newTitle,
        description:  newDesc   || null,
        client_label: newClient || null,
      }
    });
    var t = _dhTasks.find(function(x) { return String(x.id) === tid; });
    if (t) { t.title = newTitle; t.description = newDesc || null; t.client_label = newClient || null; }
    dhSetTaskPrio(tid, newPrio);
    toast('Reminder saved');
  } catch(e) {
    toast('Could not save: ' + e.message, 'err');
  }
  if (_mobCurrentApp === 'reminders') _mobRenderReminders();
}

async function _mobDeleteReminder(tid) {
  var sheet = document.getElementById('mob-edit-remind-sheet');
  if (sheet) sheet.remove();
  try {
    await apiFetch('/api/admin-tasks?id=' + encodeURIComponent(tid), { method: 'DELETE' });
    _dhTasks = _dhTasks.filter(function(x) { return String(x.id) !== tid; });
    toast('Reminder deleted');
  } catch(e) {
    toast('Could not delete: ' + e.message, 'err');
  }
  if (_mobCurrentApp === 'reminders') _mobRenderReminders();
}

/* ── Mobile inbox app — mirrors the home bento inbox widget ── */
function _mobRenderInbox() {
  var content = document.getElementById('view-content');
  if (!content || !_pipelineData) return;

  var enquiries = _pipelineData.enquiries || [];
  var newEnqs   = enquiries.filter(function(e) { return (e.status || 'new') === 'new'; });
  var cntContacted = enquiries.filter(function(e) { return e.status === 'contacted'; }).length;
  var cntClosed    = enquiries.filter(function(e) { return e.status === 'closed'; }).length;
  var unlinkedCount = _dhNotInHalaxy().length;
  var cntUpcoming = enquiries.filter(function(e) {
    var c = _dhEnqClientMap[e.id];
    return c && c.halaxy_id && (_dhPatientApptMap[String(c.halaxy_id)] || []).length > 0;
  }).length;
  var mobCritCount    = _dhHalaxyNoInvoice  ? _dhHalaxyNoInvoice.length  : 0;

  // Default active: No-invoice issues first, else "Not in Halaxy", else New enquiries.
  var mobDefault = mobCritCount > 0 ? 'critical' : (unlinkedCount > 0 ? 'unlinked' : 'new');

  function _tab(status, label, cnt, extraCntStyle, extraBtnStyle) {
    var cntHtml = cnt
      ? '<span class="mob-inbox-tab-cnt"' + (extraCntStyle ? ' style="' + extraCntStyle + '"' : '') + '>' + cnt + '</span>'
      : '';
    return '<button class="dh-inbox-folder mob-inbox-tab' + (status === mobDefault ? ' active' : '')
      + (extraBtnStyle ? ' ' + extraBtnStyle : '')
      + '" data-status="' + status + '" onclick="dhInboxFilter(\'' + status + '\',this)">'
      + label + cntHtml + '</button>';
  }

  var html = '<div class="mob-inbox-view">'
    + '<div class="mob-inbox-tabs">';

  // Issue tabs first (only shown when there are problems)
  if (mobCritCount > 0) {
    html += _tab('critical', '⚠ No Invoice', mobCritCount, 'color:#ef4444', 'mob-inbox-tab-crit');
  }
  if (unlinkedCount > 0) {
    html += _tab('unlinked', '⚕ Not in Halaxy', unlinkedCount, 'color:#b85a1e', 'mob-inbox-tab-unlinked');
  }

  // Pipeline tabs
  html += _tab('new',          'New',       newEnqs.length)
    + _tab('contacted',    'Contacted', cntContacted)
    + _tab('upcoming_appt','Upcoming',  cntUpcoming)
    + _tab('closed',       'Closed',    cntClosed)
    + _tab('all',          'All',       enquiries.length)
    + '</div>'
    + '<div class="dh-attn-card" id="dh-inbox-list"></div>'
    + '</div>';

  content.innerHTML = html;
  var mobListEl = document.getElementById('dh-inbox-list');
  if (mobCritCount > 0) {
    _dhInboxFilter = 'critical';
    _dhRenderSessionItems(mobListEl, _dhHalaxyNoInvoice, 'critical');
  } else if (unlinkedCount > 0) {
    _dhInboxFilter = 'unlinked';
    _dhRenderUnlinkedCalItems(mobListEl, _dhNotInHalaxy());
  } else {
    _dhRenderInboxItems(mobListEl, newEnqs, 'new');
  }
  _updateMobileDock('queue');
}

/* ── Collect locally-added dashboard sessions from all clients ── */
function _getLocalSessions() {
  var result = [];
  var now = new Date();
  var past30  = new Date(now); past30.setDate(past30.getDate() - 30);
  var future14 = new Date(now); future14.setDate(future14.getDate() + 14);
  (_pipelineData && _pipelineData.clients || []).forEach(function(client) {
    (client.sessions || []).forEach(function(sess) {
      var dateStr = sess.session_date;
      if (!dateStr) return;
      var dateD = new Date(dateStr + 'T00:00:00');
      if (dateD < past30 || dateD > future14) return;
      var timeStr = sess.session_time || '';
      var startIso = dateStr + 'T' + (timeStr || '00:00');
      var startMs  = new Date(startIso).getTime();
      var dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      var fmt = timeStr ? (function() {
        var d = new Date(startIso), h = d.getHours(), m = d.getMinutes();
        return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h >= 12 ? ' pm' : ' am');
      })() : '';
      var name = client.display_name || [client.first_name, client.last_name].filter(Boolean).join(' ') || sess.client_name || 'Client';
      result.push({
        id:        'db-sess-' + (sess.id || client.id + '-' + dateStr),
        source:    'dashboard',
        status:    sess.status || (startMs > now.getTime() ? 'upcoming' : 'needs-recording'),
        dateMs:    dateD.getTime(),
        startMs:   startMs,
        dateStr:   dateStr,
        dateLabel: dateLabel,
        timeStr:   fmt,
        name:      name,
        patientId: null,
        startIso:  startIso,
      });
    });
  });
  return result;
}

/* ── Mobile: schedule app renderer ──────────────────────────── */
function _mobRenderSchedule() {
  var content = document.getElementById('view-content');
  if (!content) return;
  content.innerHTML = '<div class="mob-app-sched"><div class="dh-sched-card" id="dh-sched-inner"></div></div>';
  var uni = (_halaxyData && _halaxyData.connected)
    ? _buildUnifiedSessions()
    : { upcoming: [], past: [] };
  // Always merge in locally-added dashboard sessions
  var localSess = _getLocalSessions();
  var uniIsoSet = new Set(uni.upcoming.concat(uni.past).map(function(s) { return s.startIso; }));
  var extraLocal = localSess.filter(function(s) { return !uniIsoSet.has(s.startIso); });
  var allSess = uni.upcoming.concat(uni.past).concat(extraLocal);
  _dhAppts = allSess;
  _dhSchedWeekOff = 0;
  _dhSchedDateStr = '';
  _dhRenderSchedCard();
}

/* ── Mobile: populate persistent header ─────────────────────── */
function _mobUpdateHeader() {
  if (window.innerWidth > 768) return;
  var hd = document.getElementById('mob-hd');
  if (!hd) return;

  var now       = new Date();
  var h         = now.getHours();
  var greeting  = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  var firstName = ((window.ADMIN_USER || '').split(' ')[0]) || '';
  var dateLabel = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  hd.innerHTML = '<div class="mob-hd-greeting">' + escHtml(greeting) + (firstName ? ', ' + escHtml(firstName) : '') + '</div>'
    + '<div class="mob-hd-date">' + escHtml(dateLabel) + '</div>';
}

/* ── + Add popup menu — desktop sidebar ─────────────────────── */
function toggleAddMenu() {
  var menu = document.getElementById('dh-add-menu');
  if (!menu) return;
  var opening = menu.style.display === 'none';
  menu.style.display = opening ? 'block' : 'none';
  if (opening) {
    setTimeout(function() {
      document.addEventListener('click', _closeAddMenuOutside);
    }, 10);
  }
}
function closeAddMenu() {
  var menu = document.getElementById('dh-add-menu');
  if (menu) menu.style.display = 'none';
  document.removeEventListener('click', _closeAddMenuOutside);
}
function _closeAddMenuOutside(e) {
  var wrap = document.getElementById('sb-add-wrap');
  if (!wrap || !wrap.contains(e.target)) closeAddMenu();
}

/* ── + Add popup menu — mobile header ───────────────────────── */
function toggleMobAddMenu() {
  var menu = document.getElementById('dh-mob-add-menu');
  if (!menu) return;
  var opening = menu.style.display === 'none';
  menu.style.display = opening ? 'block' : 'none';
  if (opening) {
    setTimeout(function() {
      document.addEventListener('click', _closeMobAddMenuOutside);
    }, 10);
  }
}
function closeMobAddMenu() {
  var menu = document.getElementById('dh-mob-add-menu');
  if (menu) menu.style.display = 'none';
  document.removeEventListener('click', _closeMobAddMenuOutside);
}
function _closeMobAddMenuOutside(e) {
  var wrap = document.getElementById('dh-mob-add-btn');
  if (wrap) wrap = wrap.parentNode;
  if (!wrap || !wrap.contains(e.target)) closeMobAddMenu();
}
function focusReminderInp() {
  openAddReminderModal();
}

/* ═══════════════════════════════════════════════════════════════
   Custom date + time picker helpers
   ═══════════════════════════════════════════════════════════════ */

function _cdpFormatDisplay(iso) {
  if (!iso) return 'Select date';
  var d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function _cdpBuildCalHtml(inputId, selectedIso) {
  var today    = new Date();
  var todayStr = today.toISOString().slice(0,10);
  var sel      = selectedIso ? new Date(selectedIso + 'T12:00:00') : today;
  var year     = sel.getFullYear();
  var month    = sel.getMonth();
  var firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  var daysInMonth = new Date(year, month+1, 0).getDate();
  var startOff = (firstDow === 0 ? 6 : firstDow - 1); // Mon-first
  var monthLabel = sel.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  var escapedId = inputId.replace(/'/g, "\\'");
  var h = '<div class="cdp-cal" data-input="' + inputId + '" data-year="' + year + '" data-month="' + month + '">'
    + '<div class="cdp-nav">'
    + '<button class="cdp-nav-btn" onclick="event.stopPropagation();_cdpNav(\'' + escapedId + '\',-1)" type="button">‹</button>'
    + '<span class="cdp-month-lbl">' + monthLabel + '</span>'
    + '<button class="cdp-nav-btn" onclick="event.stopPropagation();_cdpNav(\'' + escapedId + '\',1)" type="button">›</button>'
    + '</div>'
    + '<div class="cdp-grid">';
  ['Mo','Tu','We','Th','Fr','Sa','Su'].forEach(function(d){ h += '<div class="cdp-dh">' + d + '</div>'; });
  for (var i = 0; i < startOff; i++) h += '<div class="cdp-day cdp-empty"></div>';
  for (var day = 1; day <= daysInMonth; day++) {
    var iso = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    var cls = 'cdp-day';
    if (iso === todayStr)    cls += ' cdp-today';
    if (iso === selectedIso) cls += ' cdp-sel';
    h += '<button class="' + cls + '" type="button" onclick="_cdpPick(\'' + escapedId + '\',\'' + iso + '\')">' + day + '</button>';
  }
  h += '</div></div>';
  return h;
}

function _cdpNav(inputId, dir) {
  /* Find the calendar grid — it may be inside a popup that was moved to body */
  var cal = document.querySelector('.cdp-cal[data-input="' + inputId + '"]');
  if (!cal) return;
  var y = parseInt(cal.dataset.year), m = parseInt(cal.dataset.month) + dir;
  if (m < 0)  { m = 11; y--; }
  if (m > 11) { m = 0;  y++; }
  var inp  = document.getElementById(inputId);
  var sel  = inp ? inp.value : '';
  var popup = document.getElementById(inputId + '-popup');
  if (!popup) return;

  /* Rebuild calendar at new month — do NOT touch popup display or position */
  var today = new Date(), todayStr = today.toISOString().slice(0, 10);
  var firstDow = new Date(y, m, 1).getDay();
  var days     = new Date(y, m + 1, 0).getDate();
  var off      = firstDow === 0 ? 6 : firstDow - 1;
  var ml       = new Date(y, m, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  var eid      = inputId.replace(/'/g, "\\'");
  var hh = '<div class="cdp-cal" data-input="' + inputId + '" data-year="' + y + '" data-month="' + m + '">'
    + '<div class="cdp-nav"><button class="cdp-nav-btn" onclick="event.stopPropagation();_cdpNav(\'' + eid + '\',-1)" type="button">‹</button>'
    + '<span class="cdp-month-lbl">' + ml + '</span>'
    + '<button class="cdp-nav-btn" onclick="event.stopPropagation();_cdpNav(\'' + eid + '\',1)" type="button">›</button></div>'
    + '<div class="cdp-grid">';
  ['Mo','Tu','We','Th','Fr','Sa','Su'].forEach(function(d) { hh += '<div class="cdp-dh">' + d + '</div>'; });
  for (var ii = 0; ii < off; ii++) hh += '<div class="cdp-day cdp-empty"></div>';
  for (var dd = 1; dd <= days; dd++) {
    var iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
    var cls = 'cdp-day';
    if (iso === todayStr) cls += ' cdp-today';
    if (iso === sel)      cls += ' cdp-sel';
    hh += '<button class="' + cls + '" type="button" onclick="_cdpPick(\'' + eid + '\',\'' + iso + '\')">' + dd + '</button>';
  }
  hh += '</div></div>';
  popup.innerHTML = hh;
  /* Ensure popup stays visible after innerHTML replacement */
  popup.style.display = 'block';
}

function _cdpPick(inputId, iso) {
  var inp = document.getElementById(inputId);
  if (inp) inp.value = iso;
  var disp = document.getElementById(inputId + '-display');
  if (disp) disp.textContent = _cdpFormatDisplay(iso);
  var popup = document.getElementById(inputId + '-popup');
  if (popup) { popup.style.display = 'none'; }
  // Re-render sel in calendar
  popup.querySelectorAll('.cdp-day').forEach(function(btn) {
    btn.classList.remove('cdp-sel');
    if (btn.textContent == parseInt(iso.slice(8))) btn.classList.add('cdp-sel');
  });
}

function _cdpToggle(inputId) {
  var popup = document.getElementById(inputId + '-popup');
  if (!popup) return;
  var isHidden = popup.style.display === 'none' || !popup.style.display;
  document.querySelectorAll('.cdp-popup, .ctp-popup').forEach(function(p) { p.style.display = 'none'; });
  if (isHidden) {
    /* Move popup to <body> so position:fixed escapes any CSS transform
       stacking context created by modal animation (e.g. translateY on .db-modal). */
    if (popup.parentNode !== document.body) {
      document.body.appendChild(popup);
    }
    /* Find the trigger button — it may still be in its original DOM position */
    var btn = document.querySelector('#' + inputId + '-cdp .cdp-btn');
    if (!btn) {
      /* Fallback: find by data attribute stored on popup */
      var wrap = document.querySelector('[id="' + inputId + '-cdp"]');
      if (wrap) btn = wrap.querySelector('.cdp-btn');
    }
    if (btn) {
      var r = btn.getBoundingClientRect();
      var pw = Math.max(242, Math.min(window.innerWidth - 16, 300));
      var ph = 300; // approx popup height
      popup.style.position = 'fixed';
      popup.style.width = pw + 'px';
      var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
      popup.style.left = left + 'px';
      popup.style.right = 'auto';
      if (window.innerHeight - r.bottom - 8 >= ph || r.top < ph) {
        popup.style.top = (r.bottom + 4) + 'px';
        popup.style.bottom = 'auto';
      } else {
        popup.style.top = 'auto';
        popup.style.bottom = (window.innerHeight - r.top + 4) + 'px';
      }
    }
    popup.style.display = 'block';
  }
}

function _ctpFormatDisplay(val) {
  if (!val) return 'Select time';
  var parts = val.split(':');
  var h = parseInt(parts[0]), m = parseInt(parts[1] || 0);
  return (h % 12 || 12) + ':' + String(m).padStart(2,'0') + (h >= 12 ? ' pm' : ' am');
}

function _ctpBuildListHtml(inputId, selected) {
  var h = '<div class="ctp-list">';
  for (var hr = 6; hr <= 21; hr++) {
    [0, 30].forEach(function(mn) {
      if (hr === 21 && mn === 30) return;
      var val = String(hr).padStart(2,'0') + ':' + String(mn).padStart(2,'0');
      var label = _ctpFormatDisplay(val);
      var eid = inputId.replace(/'/g,"\\'");
      h += '<button class="ctp-item' + (val === selected ? ' ctp-sel' : '') + '" type="button" onclick="_ctpPick(\'' + eid + '\',\'' + val + '\')">' + label + '</button>';
    });
  }
  h += '</div>';
  return h;
}

function _ctpPick(inputId, val) {
  var inp = document.getElementById(inputId);
  if (inp) inp.value = val;
  var disp = document.getElementById(inputId + '-display');
  if (disp) disp.textContent = _ctpFormatDisplay(val);
  var popup = document.getElementById(inputId + '-popup');
  if (popup) popup.style.display = 'none';
}

function _ctpToggle(inputId) {
  var popup = document.getElementById(inputId + '-popup');
  if (!popup) return;
  var isHidden = popup.style.display === 'none' || !popup.style.display;
  document.querySelectorAll('.cdp-popup, .ctp-popup').forEach(function(p) { p.style.display = 'none'; });
  if (isHidden) {
    /* Move to <body> to escape CSS transform stacking context from modal animations */
    if (popup.parentNode !== document.body) {
      document.body.appendChild(popup);
    }
    var btn = document.querySelector('#' + inputId + '-ctp .ctp-btn');
    if (!btn) {
      var wrap = document.querySelector('[id="' + inputId + '-ctp"]');
      if (wrap) btn = wrap.querySelector('.ctp-btn');
    }
    if (btn) {
      var r = btn.getBoundingClientRect();
      var pw = 170;
      var ph = 240; // approx popup height
      popup.style.position = 'fixed';
      popup.style.width = pw + 'px';
      var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
      popup.style.left = left + 'px';
      popup.style.right = 'auto';
      if (window.innerHeight - r.bottom - 8 >= ph || r.top < ph) {
        popup.style.top = (r.bottom + 4) + 'px';
        popup.style.bottom = 'auto';
      } else {
        popup.style.top = 'auto';
        popup.style.bottom = (window.innerHeight - r.top + 4) + 'px';
      }
    }
    popup.style.display = 'block';
    // Scroll to selected
    setTimeout(function() {
      var sel = popup.querySelector('.ctp-item.ctp-sel');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }, 10);
  }
}

/* ═══════════════════════════════════════════════════════════════
   Custom Client List (CCL) picker
   ═══════════════════════════════════════════════════════════════ */
function _cclToggle(inputId) {
  var popup = document.getElementById(inputId + '-popup');
  if (!popup) return;
  var isHidden = popup.style.display === 'none' || !popup.style.display;
  document.querySelectorAll('.ccl-popup, .cdp-popup, .ctp-popup').forEach(function(p) { p.style.display = 'none'; });
  if (isHidden) {
    /* Move to <body> to escape CSS transform stacking context from modal animations */
    if (popup.parentNode !== document.body) {
      document.body.appendChild(popup);
    }
    var btn = document.getElementById(inputId + '-btn');
    if (btn) {
      var r = btn.getBoundingClientRect();
      var pw = Math.max(r.width, 220);
      popup.style.position = 'fixed';
      var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
      popup.style.left = left + 'px';
      popup.style.width = pw + 'px';
      var ph = 280;
      if (window.innerHeight - r.bottom - 8 >= ph || r.top < ph) {
        popup.style.top = (r.bottom + 4) + 'px';
        popup.style.bottom = 'auto';
      } else {
        popup.style.top = 'auto';
        popup.style.bottom = (window.innerHeight - r.top + 4) + 'px';
      }
    }
    popup.style.display = 'block';
    var search = document.getElementById(inputId + '-search');
    if (search) { search.value = ''; _cclFilter(inputId); setTimeout(function() { search.focus(); }, 30); }
  }
}

function _cclFilter(inputId) {
  var search = document.getElementById(inputId + '-search');
  var list   = document.getElementById(inputId + '-list');
  if (!list) return;
  var q = search ? search.value.toLowerCase() : '';
  list.querySelectorAll('.ccl-item').forEach(function(item) {
    item.style.display = item.dataset.label.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
  });
}

function _cclPick(inputId, value, label) {
  var inp   = document.getElementById(inputId);
  var disp  = document.getElementById(inputId + '-display');
  var popup = document.getElementById(inputId + '-popup');
  if (inp)  inp.value = value;
  if (disp) { disp.textContent = label || 'Select client…'; disp.classList.toggle('has-val', !!label); }
  if (popup) popup.style.display = 'none';
  var list = document.getElementById(inputId + '-list');
  if (list) list.querySelectorAll('.ccl-item').forEach(function(item) {
    item.classList.toggle('ccl-active', item.dataset.value === String(value));
  });
}

function _cclPopulate(inputId, items) {
  var list = document.getElementById(inputId + '-list');
  if (!list) return;
  if (!items || !items.length) {
    list.innerHTML = '<div class="ccl-empty">No clients in queue</div>';
    return;
  }
  list.innerHTML = items.map(function(item) {
    var eid = inputId.replace(/'/g, "\\'");
    var lbl = (item.label || '').replace(/'/g, "\\'");
    var val = String(item.value || '').replace(/'/g, "\\'");
    return '<button class="ccl-item" type="button" data-value="' + escHtml(String(item.value)) + '" data-label="' + escHtml(item.label) + '" onclick="_cclPick(\'' + eid + '\',\'' + val + '\',\'' + lbl + '\')">' + escHtml(item.label) + '</button>';
  }).join('');
}

/* Render a full date picker widget (hidden input + styled button + popup calendar) */
function _buildDatePickerHtml(inputId, defaultIso) {
  return '<div class="cdp-wrap" id="' + inputId + '-cdp">'
    + '<input type="hidden" id="' + inputId + '" value="' + (defaultIso || '') + '">'
    + '<button class="cdp-btn" type="button" onclick="_cdpToggle(\'' + inputId + '\')">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    + '<span id="' + inputId + '-display">' + _cdpFormatDisplay(defaultIso) + '</span>'
    + '</button>'
    + '<div class="cdp-popup" id="' + inputId + '-popup" style="display:none">'
    + _cdpBuildCalHtml(inputId, defaultIso)
    + '</div>'
    + '</div>';
}

/* Render a full time picker widget (hidden input + styled button + popup list) */
function _buildTimePickerHtml(inputId, defaultVal) {
  return '<div class="ctp-wrap" id="' + inputId + '-ctp">'
    + '<input type="hidden" id="' + inputId + '" value="' + (defaultVal || '') + '">'
    + '<button class="ctp-btn" type="button" onclick="_ctpToggle(\'' + inputId + '\')">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    + '<span id="' + inputId + '-display">' + _ctpFormatDisplay(defaultVal) + '</span>'
    + '</button>'
    + '<div class="ctp-popup" id="' + inputId + '-popup" style="display:none">'
    + _ctpBuildListHtml(inputId, defaultVal)
    + '</div>'
    + '</div>';
}

/* ═══════════════════════════════════════════════════════════════
   Full reminder / task add modal
   ═══════════════════════════════════════════════════════════════ */
function openAddReminderModal(opts) {
  opts = opts || {};
  var existingId  = 'add-reminder-modal-overlay';
  var existing = document.getElementById(existingId);
  if (existing) existing.remove();

  var today = new Date().toISOString().slice(0,10);
  var overlay = document.createElement('div');
  overlay.id = existingId;
  overlay.className = 'modal-overlay modal-centered';
  overlay.style.cssText = 'display:flex;z-index:400';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var priorityOpts = [
    { val: 'low',    label: 'Low',    color: 'var(--teal)' },
    { val: 'medium', label: 'Medium', color: 'var(--amber)' },
    { val: 'high',   label: 'High',   color: '#fb7185' },
  ];

  overlay.innerHTML = '<div class="modal-card" style="max-width:420px;width:100%">'
    + '<div class="modal-header">'
    + '<div class="modal-title">Add Reminder</div>'
    + '<button class="modal-close" type="button" onclick="document.getElementById(\'' + existingId + '\').remove()">×</button>'
    + '</div>'
    + '<div class="rdp-body" style="padding:20px">'

    // Note
    + '<div class="m-field-grp">'
    + '<label class="m-field-lbl">Reminder</label>'
    + '<input class="m-input" id="arm-title" placeholder="What do you need to do?" value="' + escHtml(opts.title || '') + '">'
    + '</div>'

    // Date
    + '<div class="m-field-grp">'
    + '<label class="m-field-lbl">Due date <span style="opacity:.45;font-weight:400">(optional)</span></label>'
    + _buildDatePickerHtml('arm-date', opts.date || today)
    + '</div>'

    // Time
    + '<div class="m-field-grp">'
    + '<label class="m-field-lbl">Time <span style="opacity:.45;font-weight:400">(optional)</span></label>'
    + _buildTimePickerHtml('arm-time', opts.time || '')
    + '</div>'

    // Priority
    + '<div class="m-field-grp">'
    + '<label class="m-field-lbl">Priority</label>'
    + '<div class="arm-priority-row">'
    + priorityOpts.map(function(p) {
        return '<button class="arm-prio-btn' + (p.val === (opts.priority || 'medium') ? ' active' : '') + '" '
          + 'type="button" data-prio="' + p.val + '" style="--pcolor:' + p.color + '" '
          + 'onclick="document.querySelectorAll(\'#' + existingId + ' .arm-prio-btn\').forEach(function(b){b.classList.remove(\'active\')});this.classList.add(\'active\')">'
          + p.label + '</button>';
      }).join('')
    + '</div>'
    + '</div>'

    + '</div>'
    + '<div class="db-modal-ftr" style="padding:14px 20px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="db-btn-ghost" type="button" onclick="document.getElementById(\'' + existingId + '\').remove()">Cancel</button>'
    + '<button class="db-btn-primary" type="button" onclick="_armSave(\'' + escHtml(opts.enquiryId||'') + '\',\'' + escHtml(opts.clientLabel||'') + '\')">Add reminder →</button>'
    + '</div>'
    + '</div>';

  document.body.appendChild(overlay);
  setTimeout(function() { var t = document.getElementById('arm-title'); if (t) t.focus(); }, 80);
}

async function _armSave(enquiryId, clientLabel) {
  var title   = (document.getElementById('arm-title') || {}).value || '';
  var dueDate = (document.getElementById('arm-date')  || {}).value || '';
  var dueTime = (document.getElementById('arm-time')  || {}).value || '';
  var prioBtn = document.querySelector('#add-reminder-modal-overlay .arm-prio-btn.active');
  var priority = prioBtn ? prioBtn.dataset.prio : 'medium';
  title = title.trim();
  if (!title) { toast('Please enter a reminder note', 'err'); return; }
  try {
    await apiFetch('/api/admin-tasks', {
      method: 'POST',
      body: { title: title, due_date: dueDate || null, due_time: dueTime || null, priority: priority, enquiry_id: enquiryId || null, client_label: clientLabel || null },
    });
    var overlay = document.getElementById('add-reminder-modal-overlay');
    if (overlay) overlay.remove();
    toast('Reminder added', 'ok');
    _dhLoadTasks();
    // If on reminders view, re-render it
    if (_mobCurrentApp === 'reminders') _mobRenderReminders();
    else if (_currentView === 'reminders') renderRemindersView();
  } catch (e) {
    toast(e.message || 'Save failed', 'err');
  }
}

/* ── Mobile dock: static HTML — active state managed by mobSwitchApp ── */
function _updateMobileDock(view) {
  // Dock is now static HTML; just update active states
  document.querySelectorAll('.mob-dock-item[data-app]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.app === view);
  });
}

/* ── Reminders view (mobile-optimised task list) ──────────────── */
function renderRemindersView() {
  var content = document.getElementById('view-content');
  if (!content) return;

  // If tasks haven't been fetched yet, load them then re-render
  if (!_dhTasksLoaded) {
    content.innerHTML = '<div class="home-view" style="display:flex;align-items:center;justify-content:center;padding:48px 0"><span style="color:var(--t3);font-size:13px">Loading reminders…</span></div>';
    _dhLoadTasks().then(function() {
      if (_currentView === 'reminders' || _mobCurrentApp === 'reminders') renderRemindersView();
    }).catch(function() {});
    return;
  }

  var tasks   = _dhTasks || [];
  var pending = tasks.filter(function(t) { return !t.completed; });
  var done    = tasks.filter(function(t) { return t.completed; }).slice(0, 8);

  var html = '<div class="home-view">';
  // On desktop, show a section heading; on mobile the dock label handles context
  if (window.innerWidth > 768) {
    html += '<div class="dh-hd-row" style="margin-bottom:20px">'
      + '<div class="dh-hd-left"><div class="dh-hd-greeting">Reminders</div></div>'
      + '</div>';
  }

  // Add input
  html += '<div class="dh-util-widget" style="margin-bottom:12px">'
    + '<div class="dh-util-add">'
    + '<input class="dh-util-add-inp" id="dh-task-inp" placeholder="Add reminder…" onkeydown="dhAddTask(event)" autofocus>'
    + '</div>'
    + '</div>';

  // Pending
  if (pending.length) {
    pending.forEach(function(t) {
      html += '<div class="m-task-row" style="padding:13px 16px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:6px;border:1px solid rgba(255,255,255,0.07)">'
        + '<button class="m-task-chk" onclick="dhToggleTask(' + JSON.stringify(t.id) + ',true);navigateTo(\'reminders\')"></button>'
        + '<span class="m-task-lbl">' + escHtml(t.title || '') + '</span>'
        + '</div>';
    });
  } else {
    html += '<div style="color:var(--t3);font-size:14px;padding:28px 0;text-align:center">All clear ✓</div>';
  }

  // Done
  if (done.length) {
    html += '<div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--t3);margin:20px 0 8px">Done</div>';
    done.forEach(function(t) {
      html += '<div class="m-task-row" style="padding:13px 16px;background:rgba(255,255,255,0.02);border-radius:10px;margin-bottom:6px;opacity:0.45;border:1px solid rgba(255,255,255,0.05)">'
        + '<button class="m-task-chk m-task-chk-done" onclick="dhToggleTask(' + JSON.stringify(t.id) + ',false);navigateTo(\'reminders\')">✓</button>'
        + '<span class="m-task-lbl m-task-lbl-done">' + escHtml(t.title || '') + '</span>'
        + '</div>';
    });
  }

  html += '</div>';
  content.innerHTML = html;
  _updateMobileDock('reminders');
  setTimeout(function() {
    var inp = document.getElementById('dh-task-inp');
    if (inp) inp.focus();
  }, 100);
}

/* ── Topbar: hide on home (inline header used), show on other views ── */
function _dbUpdateTopbar(view) {
  var btnAppt   = document.getElementById('db-btn-appt');
  var btnClient = document.getElementById('db-btn-client');
  var srchWrap  = document.getElementById('db-search-wrap');

  // Show clients-specific actions when on the clients view
  var showClients = (view === 'clients');
  if (btnAppt)   btnAppt.style.display   = showClients ? 'flex' : 'none';
  if (btnClient) btnClient.style.display = showClients ? 'flex' : 'none';
  if (srchWrap)  srchWrap.style.display  = showClients ? 'flex' : 'none';

  // Active state on topbar nav buttons
  document.querySelectorAll('.topbar-nav-btn[data-view]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
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

  if (type === 'client') {
    // Reset fields and any validation highlighting
    ['db-cl-fname','db-cl-lname','db-cl-email','db-cl-phone','db-cl-notes'].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    var fSel = document.getElementById('db-cl-funder');
    if (fSel) { fSel.selectedIndex = 0; fSel.style.outline = ''; }
    var sSel = document.getElementById('db-cl-source');
    if (sSel) sSel.selectedIndex = 0;
  }

  if (type === 'appt') {
    var today = new Date().toISOString().slice(0, 10);
    // Replace native date/time inputs with custom pickers if not already done
    var dateGrp = document.getElementById('db-ap-ob-date') && document.getElementById('db-ap-ob-date').closest('.db-form-grp');
    if (dateGrp && !dateGrp.querySelector('.cdp-wrap')) {
      dateGrp.innerHTML = '<label class="db-form-lbl">Date</label>' + _buildDatePickerHtml('db-ap-ob-date', today);
    } else {
      var dateEl = document.getElementById('db-ap-ob-date');
      if (dateEl) { dateEl.value = today; var disp = document.getElementById('db-ap-ob-date-display'); if (disp) disp.textContent = _cdpFormatDisplay(today); }
    }
    var timeGrp = document.getElementById('db-ap-ob-time') && document.getElementById('db-ap-ob-time').closest('.db-form-grp');
    if (timeGrp && !timeGrp.querySelector('.ctp-wrap')) {
      timeGrp.innerHTML = '<label class="db-form-lbl">Time</label>' + _buildTimePickerHtml('db-ap-ob-time', '10:00');
    }
    // Populate custom client picker — exclude Halaxy-only patients
    var clientItems = ((_pipelineData && _pipelineData.clients) || [])
      .filter(function(c) { return !c._isHalaxyOnly && !c.halaxy_id; })
      .map(function(c) {
        return { value: c.id || '', label: c.display_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || ('Client #' + c.id) };
      });
    _cclPopulate('db-ap-ob-client', clientItems);
    _cclPick('db-ap-ob-client', '', ''); // reset selection
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

/** Handle Save on the Add Client modal */
function _dbClientNextOrSave() {
  dbSaveClientOnboarding();
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
  if (!funder) {
    var funderSel = document.getElementById('db-cl-funder');
    if (funderSel) { funderSel.style.outline = '2px solid var(--amber)'; funderSel.focus(); }
    toast('Please select a funder type before saving', 'err');
    return;
  }

  var btn = document.getElementById('db-cl-next');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    var clientName = [fname.trim(), lname.trim()].filter(Boolean).join(' ');
    var saved = await apiFetch('/api/clients', {
      method: 'POST',
      body: {
        display_name: clientName,
        email:        email.trim() || null,
        phone:        phone.trim() || null,
        source:       source       || null,
        funder:       funder       || null,
        notes:        notes.trim() || null,
      }
    });
    if (btn) { btn.textContent = '✓'; btn.style.cssText += ';background:var(--teal);color:#051c11'; }
    _playSuccessChime();
    setTimeout(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'Save →'; btn.style.cssText = btn.style.cssText.replace(/background:[^;]+;?/g,'').replace(/color:[^;]+;?/g,''); }
      _dbShowApptPrompt('db-modal-client', (saved && saved.id) || null, clientName, (saved && saved.enquiry_id) || null);
    }, 550);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save →'; }
    toast('Could not save client: ' + err.message, 'err');
  }
}

/** Handle Next / Save on the Add Appointment modal */
function _dbApptNextOrSave() {
  dbSaveApptOnboarding();
}

/** Save an onboarding/admin appointment to the dashboard */
async function dbSaveApptOnboarding() {
  var clientId   = (document.getElementById('db-ap-ob-client')  || {}).value || '';
  var date       = (document.getElementById('db-ap-ob-date')    || {}).value || '';
  var time       = (document.getElementById('db-ap-ob-time')    || {}).value || '';
  var apptType   = (document.getElementById('db-ap-ob-type')    || {}).value || 'intake';
  var notes      = (document.getElementById('db-ap-ob-notes')   || {}).value || '';

  if (!date) { toast('Date is required', 'err'); return; }

  var dispEl = document.getElementById('db-ap-ob-client-display');
  var clientName = (dispEl && clientId) ? dispEl.textContent.trim() : '';

  var typeLabel  = { intake: 'Intake call', session: 'Appointment', admin: 'Admin' }[apptType] || 'Appointment';
  var fullNotes  = typeLabel + (notes ? ' — ' + notes : '');

  var btn = document.getElementById('db-ap-next');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    var sessResult = await apiFetch('/api/sessions', {
      method: 'POST',
      body: {
        client_id:    clientId   || null,
        session_date: date,
        session_time: time       || null,
        notes:        fullNotes  || null,
        client_name:  clientName || null,
        status:       'upcoming',
      }
    });

    // ✓ success tick + chime
    if (btn) { btn.textContent = '✓'; btn.style.cssText += ';background:var(--teal);color:#051c11'; }
    _playSuccessChime();
    if (sessResult && sessResult.gcal_event_id) toast('Appointment saved + Google Calendar event created', 'ok');

    // Push new appt into schedule cache so it shows immediately
    _dhAppts.push({
      dateStr:  date,
      startIso: date + 'T' + (time || '09:00') + ':00',
      startMs:  new Date(date + 'T' + (time || '09:00') + ':00').getTime(),
      timeStr:  time || '',
      name:     clientName || 'Client',
      status:   'upcoming',
    });

    // Navigate schedule to the saved date
    var savedWeekOff = _dhWeekOffsetForDate(date);
    if (savedWeekOff >= -1 && savedWeekOff <= 1) {
      _dhSchedWeekOff = savedWeekOff;
      _dhSchedDateStr = date;
    }

    // Find linked enquiry_id from the selected client
    var linkedClient = clientId ? ((_pipelineData && _pipelineData.clients) || []).find(function(c) { return String(c.id) === String(clientId); }) : null;
    var apptEnquiryId = linkedClient ? linkedClient.enquiry_id : null;

    _dhRenderSchedCard();

    setTimeout(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'Save →'; btn.style.cssText = btn.style.cssText.replace(/background:[^;]+;?/,'').replace(/color:[^;]+;?/,''); }
      _dbShowTaskPrompt('db-modal-appt', apptEnquiryId || null, clientName || 'Client');
    }, 550);

  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save →'; }
    toast('Could not save appointment: ' + err.message, 'err');
  }
}

// ── Post-save sequential prompts ─────────────────────────────────────────────
// After saving a client the modal steps through:
//   1. "Schedule an appointment?" → 2. "Add a task?" → close
// After saving an appointment: "Add a task?" → close

function _dbShowApptPrompt(modalId, clientId, clientName, enquiryId) {
  var modal = document.getElementById(modalId);
  if (!modal) return;
  var body = modal.querySelector('.db-modal-body');
  var ftr  = modal.querySelector('.db-modal-ftr');
  var today = new Date().toISOString().slice(0, 10);
  if (body) {
    body.innerHTML =
      '<div style="padding:20px 20px 8px">'
      + '<div style="font-size:12px;color:var(--t3);margin-bottom:16px;text-align:center">Schedule an appointment for <strong>' + escHtml(clientName) + '</strong>?</div>'
      + '<div class="db-form-row">'
      + '<div class="db-form-grp"><label class="db-form-lbl">Date</label>'
      + _buildDatePickerHtml('db-ap-prmt-date', today) + '</div>'
      + '<div class="db-form-grp"><label class="db-form-lbl">Time <span style="color:var(--t3);font-weight:400">(optional)</span></label>'
      + _buildTimePickerHtml('db-ap-prmt-time', '') + '</div>'
      + '</div>'
      + '</div>';
  }
  if (ftr) {
    var eid = escHtml(enquiryId || '');
    var cid = escHtml(clientId  || '');
    var cnm = escHtml(clientName || '');
    var mid = escHtml(modalId);
    ftr.innerHTML =
      '<button class="db-btn-ghost" onclick="_dbShowTaskPrompt(\'' + mid + '\',\'' + eid + '\',\'' + cnm + '\')">Skip</button>'
      + '<button class="db-btn-primary" id="db-ap-prmt-btn" onclick="_dbSavePromptAppt(\'' + mid + '\',\'' + cid + '\',\'' + cnm + '\',\'' + eid + '\')">Add appointment →</button>';
  }
}

async function _dbSavePromptAppt(modalId, clientId, clientName, enquiryId) {
  var date = (document.getElementById('db-ap-prmt-date') || {}).value || '';
  var time = (document.getElementById('db-ap-prmt-time') || {}).value || '';
  if (!date) { toast('Please pick a date', 'err'); return; }
  var btn = document.getElementById('db-ap-prmt-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    var promptSessResult = await apiFetch('/api/sessions', {
      method: 'POST',
      body: { client_id: clientId || null, session_date: date, session_time: time || null, client_name: clientName || null, status: 'upcoming' },
    });
    _dhAppts.push({ dateStr: date, startIso: date + 'T' + (time || '09:00') + ':00', startMs: new Date(date + 'T' + (time || '09:00') + ':00').getTime(), timeStr: time || '', name: clientName || 'Client', status: 'upcoming' });
    _playSuccessChime();
    if (promptSessResult && promptSessResult.gcal_event_id) toast('Appointment + calendar event saved', 'ok');
    _dbShowTaskPrompt(modalId, enquiryId || null, clientName);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Add appointment →'; }
    toast('Could not save appointment: ' + err.message, 'err');
  }
}

function _dbShowTaskPrompt(modalId, enquiryId, clientName) {
  var modal = document.getElementById(modalId);
  if (!modal) return;
  var today = new Date().toISOString().slice(0,10);
  var eid = escHtml(enquiryId || '');
  var cnm = escHtml(clientName || '');
  var mid = escHtml(modalId);
  var priorityOpts = [
    { val: 'low', label: 'Low' }, { val: 'medium', label: 'Medium' }, { val: 'high', label: 'High' },
  ];
  var body = modal.querySelector('.db-modal-body');
  var ftr  = modal.querySelector('.db-modal-ftr');
  if (body) {
    body.innerHTML =
      '<div style="padding:16px 20px 4px;text-align:center">'
      + '<div style="font-size:22px;color:var(--teal);margin-bottom:4px">✓</div>'
      + '<div style="font-weight:600;font-size:14px;margin-bottom:2px">' + escHtml(clientName || 'Saved') + '</div>'
      + '<div style="font-size:12px;color:var(--t3);margin-bottom:16px">Add a follow-up reminder?</div>'
      + '</div>'
      + '<div style="padding:0 20px 8px">'
      + '<div class="m-field-grp"><label class="m-field-lbl">Reminder</label>'
      + '<input id="db-ps-task-inp" class="db-form-input" placeholder="e.g. Send intake form, call to confirm…" '
      + 'onkeydown="if(event.key===\'Enter\')_dbSavePostTask(\'' + mid + '\',\'' + eid + '\',\'' + cnm + '\')" /></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">'
      + '<div class="m-field-grp"><label class="m-field-lbl">Due date</label>'
      + _buildDatePickerHtml('ps-arm-date', today) + '</div>'
      + '<div class="m-field-grp"><label class="m-field-lbl">Time</label>'
      + _buildTimePickerHtml('ps-arm-time', '') + '</div>'
      + '</div>'
      + '<div class="m-field-grp" style="margin-top:8px"><label class="m-field-lbl">Priority</label>'
      + '<div class="arm-priority-row">'
      + priorityOpts.map(function(p) {
          return '<button class="arm-prio-btn' + (p.val === 'medium' ? ' active' : '') + '" type="button" data-prio="' + p.val + '" '
            + 'onclick="document.querySelectorAll(\'#' + modalId + ' .arm-prio-btn\').forEach(function(b){b.classList.remove(\'active\')});this.classList.add(\'active\')">'
            + p.label + '</button>';
        }).join('')
      + '</div></div>'
      + '</div>';
    setTimeout(function() { var i = document.getElementById('db-ps-task-inp'); if (i) i.focus(); }, 80);
  }
  if (ftr) {
    ftr.innerHTML =
      '<button class="db-btn-ghost" onclick="_dbPostSaveClose(\'' + mid + '\')">Skip</button>'
      + '<button class="db-btn-primary" id="db-ps-task-btn" onclick="_dbSavePostTask(\'' + mid + '\',\'' + eid + '\',\'' + cnm + '\')">Add reminder →</button>';
  }
}

async function _dbSavePostTask(modalId, enquiryId, clientName) {
  var inp = document.getElementById('db-ps-task-inp');
  var title = inp ? inp.value.trim() : '';
  if (!title) { _dbPostSaveClose(modalId); return; }
  var dueDate  = (document.getElementById('ps-arm-date') || {}).value || '';
  var dueTime  = (document.getElementById('ps-arm-time') || {}).value || '';
  var prioBtn  = document.querySelector('#' + modalId + ' .arm-prio-btn.active');
  var priority = prioBtn ? prioBtn.dataset.prio : 'medium';
  var btn = document.getElementById('db-ps-task-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  try {
    await apiFetch('/api/admin-tasks', {
      method: 'POST',
      body: { title: title, due_date: dueDate || null, due_time: dueTime || null, priority: priority, enquiry_id: enquiryId || null, client_label: clientName || null },
    });
    _playSuccessChime();
    _dbPostSaveClose(modalId);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Add reminder →'; }
    toast('Could not save: ' + err.message, 'err');
  }
}

async function _dbPostSaveClose(modalId) {
  closeDbModal(modalId);
  await loadPipeline();
  renderHomeView();
  _dhLoadTasks();
}

function _playSuccessChime() {
  try {
    var ctx  = new (window.AudioContext || window.webkitAudioContext)();
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {}
}

function _dhWeekOffsetForDate(dateStr) {
  var p    = dateStr.split('-');
  var d    = new Date(+p[0], +p[1]-1, +p[2]);
  var now  = new Date();
  var mon  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var dow  = mon.getDay();
  mon.setDate(mon.getDate() + (dow === 0 ? -6 : 1 - dow));
  return Math.round((d - mon) / (7 * 864e5));
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
  } else if (e.key === 'Escape') {
    // Close the detail drawer if it's open (no backdrop to click away on)
    var dp = document.getElementById('modal-overlay');
    if (dp && dp.classList.contains('is-open')) { closeDetailPanel(); }
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
    // 1. Check the already-merged schedule array (fastest)
    var sess = (_dhAppts || []).find(function(s) { return s.id === id; });
    // 2. Halaxy/Cal unified sessions
    if (!sess) {
      var unified = _buildUnifiedSessions();
      var all = unified.upcoming.concat(unified.past);
      sess = all.find(function(s) { return s.id === id; });
    }
    // 3. Locally-added dashboard sessions
    if (!sess) {
      sess = _getLocalSessions().find(function(s) { return s.id === id; });
    }
    if (sess) {
      // If this Halaxy session has a matching invoice, skip the session popup
      // and go straight to the invoice modal — single source of truth for billing info
      if (sess.patientId && sess.dateStr && _halaxyData && _halaxyData.invoices) {
        var _matchInv = (_halaxyData.invoices || []).find(function(i) {
          return String(i.patientId) === String(sess.patientId) && (i.date || '').slice(0, 10) === sess.dateStr;
        });
        if (_matchInv) {
          openInvoiceModal(String(_matchInv.id));
          return;
        }
      }
      html = _renderSessionDetailPanel(sess);
      titleText = sess.name || 'Appointment';
    }
  } else if (type === 'enquiry') {
    var enqs = (_pipelineData && _pipelineData.enquiries) || [];
    var enq = enqs.find(function(e) { return String(e.id) === String(id); });
    if (enq) { html = _renderEnquiryDetailPanel(enq); titleText = [enq.first_name, enq.last_name].filter(Boolean).join(' ') || 'Lead'; }
  } else if (type === 'client') {
    var clients = (_pipelineData && _pipelineData.clients) || [];
    var cl = clients.find(function(c) { return String(c.id) === String(id); });
    if (cl) { html = _renderClientDetailPanel(cl); titleText = cl.display_name || 'Client'; }
  } else if (type === 'task') {
    var task = _dhTasks.find(function(t) { return String(t.id) === String(id); });
    if (task) { html = _renderTaskDetailPanel(task); titleText = 'Reminder'; }
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
    _recomputeInboxBuckets(); // halaxy data now present — (re)build inbox issue buckets
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
  if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
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
    _recomputeInboxBuckets(); // halaxy data now present — (re)build inbox issue buckets
    // (silent — a background data sync should never announce itself)
  }).catch(function(err) {
    toast('Refresh failed: ' + err.message, 'err');
  }).finally(function() {
    if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
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

/* ── Mobile intro animation ─────────────────────────────────── */
var _mobIntroRan    = false;
var _mobAnimRunning = false; /* true while the intro animation sequence is in-flight */

/** Typewrite `text` into `el` character by character, then call `cb`. */
function _mobTypewriter(el, text, cb, speed) {
  if (!el) { if (cb) cb(); return; }
  el.textContent = '';
  var i = 0;
  speed = speed || 48; /* 48ms per char — deliberate, readable pace */
  var t = setInterval(function() {
    el.textContent += text[i];
    i++;
    if (i >= text.length) { clearInterval(t); if (cb) cb(); }
  }, speed);
}

/** Fade+slide an element into view after `delay` ms. */
function _mobSlideIn(el, delay) {
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateY(8px)';
  el.style.transition = 'none';
  setTimeout(function() {
    el.style.transition = 'opacity 0.38s ease, transform 0.38s ease';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  }, delay || 0);
}

/** Typewrite the greeting, then slide in the date and meta rows. */
function _mobAnimHeader() {
  var mobHd = document.getElementById('mob-hd');
  if (!mobHd) return;
  var greetingEl = mobHd.querySelector('.mob-hd-greeting');
  var dateEl     = mobHd.querySelector('.mob-hd-date');
  var metaEl     = mobHd.querySelector('.mob-hd-meta');

  /* Capture text, then immediately clear it so when we make mob-hd visible
     the user sees an empty greeting — no flash of the pre-filled text. */
  var fullGreeting = greetingEl ? greetingEl.textContent : '';
  if (greetingEl) greetingEl.textContent = '';

  /* Pre-hide date and meta (slide in after typing) */
  if (dateEl) { dateEl.style.opacity = '0'; dateEl.style.transform = 'translateY(8px)'; }
  if (metaEl) { metaEl.style.opacity = '0'; metaEl.style.transform = 'translateY(8px)'; }

  /* Reveal mob-hd now that greeting is cleared — clean entry point */
  mobHd.style.opacity = '1';

  if (!greetingEl || !fullGreeting) {
    if (dateEl) _mobSlideIn(dateEl, 0);
    if (metaEl) _mobSlideIn(metaEl, 120);
    _mobAnimRunning = false;
    return;
  }
  _mobTypewriter(greetingEl, fullGreeting, function() {
    if (dateEl) _mobSlideIn(dateEl, 60);
    if (metaEl) _mobSlideIn(metaEl, 200);
    /* Animation fully complete — allow future header updates */
    setTimeout(function() { _mobAnimRunning = false; }, 300);
  }, 70);
}

/* ═══════════════════════════════════════════════════════════════
   Pull-to-refresh (mobile PWA)
   ═══════════════════════════════════════════════════════════════ */
var _ptrInited = false;

function _mobInitPullToRefresh() {
  if (window.innerWidth > 768 || _ptrInited) return;
  _ptrInited = true;

  var scrollEl  = document.querySelector('.app-content');
  var contentEl = document.getElementById('view-content');
  if (!scrollEl || !contentEl) return;

  /* Build indicator */
  var bar = document.createElement('div');
  bar.id  = 'ptr-bar';
  bar.innerHTML = '<div class="ptr-inner"><span class="ptr-icon">↓</span><span class="ptr-text">Pull to refresh</span></div>';
  document.body.appendChild(bar);

  var THRESHOLD = 62;   // visual px needed to trigger
  var MAX_PULL  = 92;   // max visual pull distance
  var DAMPING   = 0.42; // resistance (touch travel × factor = visual)

  var touching  = false;
  var startY    = 0;
  var live      = 0;    // current visual pull distance
  var busy      = false;

  function barTop() {
    return scrollEl.getBoundingClientRect().top;
  }

  function applyPull(dist) {
    live = dist;
    var ready = dist >= THRESHOLD;
    /* Indicator */
    bar.style.top     = barTop() + 'px';
    bar.style.height  = dist + 'px';
    bar.style.opacity = dist > 4 ? Math.min((dist / 28), 1) : 0;
    bar.classList.toggle('ptr-ready', ready);
    var icon = bar.querySelector('.ptr-icon');
    var text = bar.querySelector('.ptr-text');
    if (icon && !icon.classList.contains('ptr-spinning')) icon.textContent = ready ? '↑' : '↓';
    if (text) text.textContent = ready ? 'Release to refresh' : 'Pull to refresh';
    /* Slide content down */
    contentEl.style.transform = dist > 0 ? 'translateY(' + dist + 'px)' : '';
  }

  function spring(toDist, duration, cb) {
    bar.style.transition     = 'height ' + duration + 'ms ease, opacity ' + duration + 'ms ease';
    contentEl.style.transition = 'transform ' + duration + 'ms ease';
    applyPull(toDist);
    setTimeout(function() {
      bar.style.transition     = '';
      contentEl.style.transition = '';
      if (toDist === 0) { contentEl.style.transform = ''; }
      if (cb) cb();
    }, duration + 10);
  }

  async function triggerRefresh() {
    busy = true;
    /* Hold at 52px for the spinner */
    spring(52, 120);
    setTimeout(function() {
      var icon = bar.querySelector('.ptr-icon');
      var text = bar.querySelector('.ptr-text');
      bar.classList.remove('ptr-ready');
      if (icon) { icon.textContent = '⟳'; icon.classList.add('ptr-spinning'); }
      if (text) text.textContent = 'Refreshing…';
    }, 80);

    try {
      await new Promise(function(resolve, reject) {
        loadCalendarPending();
        fetch('/api/admin-enquiries')
          .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function(d) {
            _pipelineData  = d;
            _halaxyData    = d.halaxy || { connected: false, appointments: [], patients: [], funders: [], fees: [], feeMap: {} };
            _halaxyFunders = _halaxyData.funders || [];
            _halaxyFeeMap  = _halaxyData.feeMap  || {};
            _halaxyFees    = (_halaxyData.fees && _halaxyData.fees.length) ? _halaxyData.fees : _halaxyFees;
            if (_halaxyData.webUrl) _halaxyWebUrl = _halaxyData.webUrl;
            renderHelloSection();
            renderPipeline();
            updateHalaxyDot();
            _recomputeInboxBuckets(); // halaxy data now present — (re)build inbox issue buckets
            _dhLoadTasks();
            resolve();
          })
          .catch(reject);
      });
      /* Success */
      var icon = bar.querySelector('.ptr-icon');
      var text = bar.querySelector('.ptr-text');
      if (icon) { icon.classList.remove('ptr-spinning'); icon.textContent = '✓'; }
      if (text) text.textContent = 'Up to date';
      bar.querySelector('.ptr-inner').style.color = 'var(--teal)';
    } catch (e) {
      var icon = bar.querySelector('.ptr-icon');
      var text = bar.querySelector('.ptr-text');
      if (icon) { icon.classList.remove('ptr-spinning'); icon.textContent = '⚠'; }
      if (text) text.textContent = 'Refresh failed';
      toast('Refresh failed', 'err');
    }

    /* Brief pause then collapse */
    setTimeout(function() {
      spring(0, 220, function() {
        busy = false;
        /* Reset icon/text for next pull */
        var icon = bar.querySelector('.ptr-icon');
        var text = bar.querySelector('.ptr-text');
        if (icon) { icon.textContent = '↓'; }
        if (text) text.textContent = 'Pull to refresh';
        bar.querySelector('.ptr-inner').style.color = '';
      });
    }, 640);
  }

  scrollEl.addEventListener('touchstart', function(e) {
    if (busy) return;
    if (scrollEl.scrollTop !== 0) return;
    startY   = e.touches[0].clientY;
    touching = true;
    live     = 0;
  }, { passive: true });

  scrollEl.addEventListener('touchmove', function(e) {
    if (!touching || busy) return;
    if (scrollEl.scrollTop > 0) { touching = false; return; }
    var dy = e.touches[0].clientY - startY;
    if (dy <= 0) { if (live > 0) applyPull(0); return; }
    e.preventDefault(); /* prevent native rubber-band */
    applyPull(Math.min(dy * DAMPING, MAX_PULL));
  }, { passive: false });

  function onEnd() {
    if (!touching || busy) return;
    touching = false;
    if (live >= THRESHOLD) {
      triggerRefresh();
    } else {
      spring(0, 200);
    }
  }

  scrollEl.addEventListener('touchend',    onEnd, { passive: true });
  scrollEl.addEventListener('touchcancel', onEnd, { passive: true });
}

/**
 * One-shot mobile intro: fires AFTER data loads (renderPipeline).
 * The splash logo has been sitting centred and still until this point.
 * Now gently shrink + lift it toward the top, cross-fade to the
 * persistent logo bar, then typewrite the greeting.
 * No-ops on desktop or after the first run.
 */
function _mobRunIntro() {
  if (window.innerWidth > 768) return;
  if (_mobIntroRan) {
    /* Don't clobber the header mid-animation — wait until it's done */
    if (!_mobAnimRunning) _mobUpdateHeader();
    return;
  }
  _mobIntroRan    = true;
  _mobAnimRunning = true;

  var splash     = document.getElementById('mob-splash');
  var splashLogo = document.getElementById('mob-splash-logo');
  var logoBar    = document.getElementById('mob-logo-bar');

  /* Populate header DOM now so nodes exist, but keep it invisible until
     the splash is fully gone — prevents the full greeting text from flashing
     through the fading splash overlay before the typewriter starts. */
  _mobUpdateHeader();
  var _introMobHd = document.getElementById('mob-hd');
  if (_introMobHd) _introMobHd.style.opacity = '0';

  if (!splash) {
    if (_introMobHd) _introMobHd.style.opacity = '1';
    if (logoBar) logoBar.style.opacity = '1';
    _mobAnimHeader();
    return;
  }

  /* Wait two frames to ensure the splash is fully painted before animating */
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      /* Measure exact position of the logo bar image so we can animate the
         splash logo precisely to that spot — no guesswork, no fade. */
      var targetImg  = logoBar ? logoBar.querySelector('.mob-logo-img') : null;
      var targetRect = targetImg  ? targetImg.getBoundingClientRect()  : null;
      var splashRect = splashLogo ? splashLogo.getBoundingClientRect() : null;

      var translateY = -0.36 * window.innerHeight; // safe fallback
      var scale      = 0.52;

      if (targetRect && splashRect && splashRect.height > 0) {
        /* Centre-to-centre vertical delta */
        var splashCY = splashRect.top  + splashRect.height / 2;
        var targetCY = targetRect.top  + targetRect.height / 2;
        translateY   = targetCY - splashCY;
        scale        = targetRect.height / splashRect.height;
      }

      /* Fade out the loading pulse just before the logo animates away */
      var splashLoader = document.getElementById('mob-splash-loader');
      if (splashLoader) { splashLoader.style.transition = 'opacity 0.2s'; splashLoader.style.opacity = '0'; }

      /* Phase 1: animate splash logo to exactly where the logo bar logo lives */
      if (splashLogo) {
        splashLogo.style.transition = 'transform 0.88s cubic-bezier(0.4, 0, 0.2, 1)';
        splashLogo.style.transform  = 'translateY(' + translateY + 'px) scale(' + scale + ')';
      }

      /* Phase 2: once the animation lands, snap splash away — no fade */
      setTimeout(function() {
        splash.style.transition = 'none';
        splash.style.opacity    = '0';
        splash.style.display    = 'none';
        /* Reveal the persistent logo bar in place of where the splash logo just was */
        if (logoBar) {
          logoBar.style.transition = 'none';
          logoBar.style.opacity    = '1';
        }
        setTimeout(_mobAnimHeader, 80);
      }, 900);
    });
  });
}

function renderPipeline() {
  if (!_pipelineData) return;
  if (window.innerWidth <= 768) {
    _mobInitPullToRefresh(); /* one-shot — safe to call every render */
    _mobRunIntro(); /* handles header population + one-shot intro animation */
  } else {
    _mobUpdateHeader();
  }
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
    return a.description || a.comment || apptType || svc || 'Personal appointment';
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
    if ((label === 'Personal appointment' || !label) && effectivePatientId) {
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
      var existingNamed = existing.name && existing.name !== 'Personal appointment';
      var thisNamed = s.name && s.name !== 'Personal appointment';
      if (thisNamed && !existingNamed) apptByStartIso[key] = s;
    }
  });
  sessions = sessions.filter(function(s) { return apptByStartIso[s.startIso] === s; });

  // Build ISO-time set from surviving Halaxy entries for cross-source dedup
  var halaxyStartIsoSet = new Set(sessions.map(function(s) { return s.startIso; }));

  /* ── 2. Google Calendar events ── */
  Object.keys(_calEventMap).forEach(function(eid) {
    if (_calDismissed.has(eid)) return;
    var ev = _calEventMap[eid];
    if (!ev || !ev.start) return;

    // Skip if a Halaxy appointment already occupies the same start time
    if (halaxyStartIsoSet.has(ev.start)) return;

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
      id:         uid,
      source:     'cal',
      status:     status,
      dateMs:     dateD.getTime(),
      startMs:    startMs,
      dateStr:    dateStr,
      dateLabel:  dateLabel,
      timeStr:    timeStr,
      name:       ev.title || ev.summary || 'Calendar event',
      patientId:  null,
      eventId:    String(eid),
      isReminder: _calReminders.has(String(eid)),
      ev:         ev,
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
    // Upcoming Google Calendar event not yet in Halaxy → one-click set up (create patient + book).
    if (status === 'upcoming' && sess.source === 'cal' && sess.eventId) {
      return '<button class="dp-btn dp-btn--primary" style="font-size:10px;padding:4px 9px" onclick="_sihFromCalEvent(\'' + escHtml(sess.eventId) + '\')">⚕ Set up in Halaxy →</button>';
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
      + (sess.source === 'cal' && sess.status === 'upcoming'
          ? '<span class="dp-badge" style="background:rgba(224,123,57,0.16);color:#e07b39">Not in Halaxy</span>'
          : '')
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

  /* ── Header row: + New Session + Set up in Halaxy + view toggle ── */
  html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:2px">'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
    +   '<button class="dp-btn dp-btn--soft" style="font-size:12px;padding:4px 10px" onclick="openNewSessionModal()">+ New Appointment</button>'
    +   '<button class="dp-btn dp-btn--primary" style="font-size:12px;padding:4px 10px" onclick="openSetupInHalaxy()">⚕ Set up in Halaxy</button>'
    + '</div>'
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
          html += '<div class="week-event week-event--cal" onclick="toggleWeekEvent(this)">'
            + '<div class="week-event-time">' + escHtml(time) + '</div>'
            + '<span class="week-event-source">Google Cal</span>'
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
 * Determine if a Halaxy invoice is fully settled (nothing more owed to us).
 *
 * THE BALANCE IS THE SOURCE OF TRUTH. `totalBalance <= 0` means the invoice is
 * paid — whether the client paid by card/cash, Medicare paid, or a funder
 * (NDIS plan manager, WorkCover, DVA) sent remittance and the payment was
 * recorded. There is NO "paid but not yet reconciled" state: recording the
 * payment in Halaxy IS the reconciliation, and that's what drives the balance
 * to 0. (Halaxy keeps such invoices at status='active' — verified against a
 * "PAID IN FULL" NDIS invoice — so status is NOT a reliable paid signal.)
 *
 * Only genuine non-receivables (cancelled / draft) are excluded.
 */
function _invIsPaid(inv) {
  if (inv.status === 'cancelled' || inv.status === 'draft') return false;
  if (inv.totalBalance !== null && inv.totalBalance !== undefined) {
    return parseFloat(inv.totalBalance) <= 0; // balance cleared = settled
  }
  // No balance figure — fall back to explicit settled statuses.
  return inv.status === 'balanced' || inv.status === 'paid';
}

/**
 * Returns true for the RARE case of a funder invoice we've submitted but NOT
 * yet been paid for — e.g. WorkCover: submit via Halaxy → wait for remittance
 * → record the payment (balance → 0). It is therefore a *flavour of
 * outstanding* (the money isn't in yet), distinct from a private invoice the
 * client owes: here we're waiting on the funder, not chasing a client.
 *
 * Detected as: funder-billed (payorOrg set) AND still unpaid (balance > 0).
 * Once remittance is recorded the balance hits 0 and _invIsPaid() takes over.
 */
function _invIsAwaitingRemittance(inv) {
  if (inv.status === 'cancelled' || inv.status === 'draft') return false;
  return !!inv.payorOrg && parseFloat(inv.totalBalance || 0) > 0;
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
          subAction = '<button style="font-size:10px;padding:2px 8px;border:1px solid rgba(52,211,153,0.25);border-radius:6px;background:rgba(52,211,153,0.07);color:var(--teal,#34D399);cursor:pointer;margin-left:6px" onclick="event.stopPropagation();_markBillingSubmitted(\'' + escHtml(inv.id) + '\')">Mark submitted</button>';
        }
        var invRef = _fmtInvRef(inv);
        html += '<div class="bill-card bill-card--open">'
          + '<div class="bill-card-top">'
          + '<span class="bill-card-name">' + escHtml(name) + '</span>'
          + (amt ? '<span class="bill-card-amount">' + escHtml(amt) + '</span>' : '')
          + '</div>'
          + '<div class="bill-card-meta">'
          + (invRef ? '<span class="bill-card-ref">' + escHtml(invRef) + '</span>' : '')
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
        var paidRef = _fmtInvRef(inv);
        html += '<div class="bill-card" style="opacity:0.7">'
          + '<div class="bill-card-top">'
          + '<span class="bill-card-name">' + escHtml(name) + '</span>'
          + (amt ? '<span class="bill-card-amount">' + escHtml(amt) + '</span>' : '')
          + '</div>'
          + '<div class="bill-card-meta">'
          + (paidRef ? '<span class="bill-card-ref">' + escHtml(paidRef) + '</span>' : '')
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
  // Convert to client — available on any non-closed enquiry
  if (status !== 'closed') {
    actionsHtml += '<button class="pl-action-btn pl-action-btn--convert" onclick="event.stopPropagation();convertEnquiryPl(\'' + e.id + '\')">Convert to client →</button>';
  }
  if (actionsHtml) actionsHtml = '<div class="pl-card-actions" style="margin-top:8px">' + actionsHtml + '</div>';

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
  var timeStr = s.session_time ? s.session_time.slice(0, 5) : '';
  var typeMap = { video: '📹', in_person: '🏢', phone: '📞' };
  var typeIcon = s.session_type ? (typeMap[s.session_type] || '') : '';
  var gcalDot = s.gcal_event_id ? '<span title="In Google Calendar" style="color:var(--db-teal);font-size:9px">●</span>' : '';
  var next = STATUS_NEXT[s.status];
  return '<div class="pl-session-mini">'
    + '<span style="color:var(--mid);font-weight:500;font-size:11px">' + dateStr + (timeStr ? ' ' + timeStr : '') + '</span>'
    + (typeIcon ? '<span style="font-size:10px">' + typeIcon + '</span>' : '')
    + gcalDot
    + '<span style="color:var(--soft);font-size:10px">' + escHtml(s.invoice_ref || '') + '</span>'
    + (next
        ? '<button class="pl-action-btn pl-action-btn--soft" style="font-size:9px;padding:2px 7px" onclick="event.stopPropagation();advanceSessionPl(\'' + s.id + '\',\'' + next.next + '\',\'' + clientId + '\')">' + next.label + '</button>'
        : '<span class="cl-status-btn status-' + s.status + '" style="font-size:9px;padding:2px 7px;cursor:default">' + STATUS_DISPLAY[s.status] + '</span>'
      )
    + '</div>';
}

/* ── Add session form (pipeline) ── */
function renderAddSessionFormPl(clientId) {
  var today = new Date().toISOString().slice(0, 10);
  return '<div class="cl-add-session-form" id="pl-add-sess-' + clientId + '">'
    + '<div class="cl-form-row">'
    + '<div class="cl-form-field"><label>Date</label>'
    + '<input class="cl-form-input" id="pl-sess-date-' + clientId + '" type="date" value="' + today + '"></div>'
    + '<div class="cl-form-field"><label>Time</label>'
    + '<input class="cl-form-input" id="pl-sess-time-' + clientId + '" type="time" placeholder="09:00">'
    + '<div style="font-size:9px;color:var(--soft);margin-top:2px">Creates calendar event</div>'
    + '</div>'
    + '</div>'
    + '<div class="cl-form-row">'
    + '<div class="cl-form-field"><label>Type</label>'
    + '<select class="cl-form-input" id="pl-sess-type-' + clientId + '">'
    + '<option value="">— type —</option>'
    + '<option value="video">Video</option>'
    + '<option value="in_person">In Person</option>'
    + '<option value="phone">Phone</option>'
    + '</select></div>'
    + '<div class="cl-form-field"><label>Status</label>'
    + '<select class="cl-form-input" id="pl-sess-status-' + clientId + '">'
    + '<option value="upcoming">Upcoming</option>'
    + '<option value="completed">Completed</option>'
    + '<option value="invoiced">Invoiced</option>'
    + '</select></div>'
    + '</div>'
    + '<div class="cl-form-row">'
    + '<div class="cl-form-field"><label>Invoice ref</label>'
    + '<input class="cl-form-input" id="pl-sess-inv-' + clientId + '" type="text" placeholder="e.g. INV-001"></div>'
    + '<div class="cl-form-field"><label>Notes</label>'
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

/* ── Home view shared helpers ────────────────────────────────── */
function _dhAvCol(n) { return ['av-teal','av-blue','av-purple','av-amber','av-red'][(n||'').charCodeAt(0)%5]; }
function _dhIni(n) {
  if (!n) return '?';
  var p = n.trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

var _dhSourceLabels = {
  website:         'Website',
  email:           'Email referral',
  phone:           'Phone call',
  gp_referral:     'GP referral',
  eap:             'EAP',
  word_of_mouth:   'Word of mouth',
  manual:          'Added manually',
  modal:           'Added via dashboard',
  'home-page-inline': 'Website form',
  debug:           'Test entry',
  halaxy:          'Halaxy import',
  ndis:            'NDIS',
};
var _dhCalIcon = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

function _dhEnqMeta(e) {
  var client    = _dhEnqClientMap[e.id];
  var hxId      = client && client.halaxy_id ? String(client.halaxy_id) : null;
  var nextAppt  = hxId && _dhPatientApptMap[hxId] && _dhPatientApptMap[hxId][0];
  var actCount  = (e.activity || []).length;
  var taskCount = (_dhTasks || []).filter(function(t) { return t.enquiry_id === e.id && !t.completed; }).length;
  var sourceLbl = _dhSourceLabels[e.source || ''] || (e.source ? e.source.replace(/-/g,' ') : 'Direct');

  // Relative age
  var ageStr = '';
  if (e.created_at) {
    var days = Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86400000);
    ageStr = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days + 'd ago';
  }

  var parts = [];

  // Source pill
  var srcIsDebug = (e.source === 'debug');
  var srcColor   = srcIsDebug ? 'rgba(120,120,120,0.5)' : 'rgba(42,88,80,0.1)';
  var srcText    = srcIsDebug ? '#888' : 'var(--t3)';
  parts.push('<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:' + srcColor + ';color:' + srcText + ';white-space:nowrap">' + escHtml(sourceLbl) + '</span>');

  // Age
  if (ageStr) parts.push('<span style="color:var(--t3);font-size:11px">' + escHtml(ageStr) + '</span>');

  // Email
  if (e.email) parts.push('<span style="color:var(--t3);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">' + escHtml(e.email) + '</span>');

  // Next appointment
  if (nextAppt) {
    parts.push('<span style="color:var(--teal);display:inline-flex;align-items:center;gap:3px;font-size:11px">'
      + _dhCalIcon + escHtml(nextAppt.dateLabel + (nextAppt.timeStr ? ' · ' + nextAppt.timeStr : '')) + '</span>');
  }

  // Open tasks
  if (taskCount) parts.push('<span style="color:var(--amber);font-size:11px">● ' + taskCount + ' task' + (taskCount !== 1 ? 's' : '') + '</span>');

  // Notes count (if no tasks, as fallback)
  if (!taskCount && actCount) parts.push('<span style="color:var(--t3);font-size:11px">' + actCount + ' note' + (actCount !== 1 ? 's' : '') + '</span>');

  return parts.join('<span style="color:var(--t3);margin:0 1px;font-size:10px"> · </span>');
}

function _dhRenderInboxItems(listEl, items, status) {
  if (!items || !items.length) {
    var _ctx = status || _dhInboxFilter;
    var _emptyMsg = {
      'new':          '<strong>No new enquiries</strong><br>When someone submits an intake form or contact request, they\'ll appear here first.',
      'contacted':    '<strong>No contacted leads</strong><br>Move enquiries here after initial outreach — these are people you\'re actively following up.',
      'upcoming_appt':'<strong>No upcoming appointments</strong><br>Enquiries linked to a client with a scheduled Halaxy appointment appear here automatically.',
      'closed':       '<strong>Nothing closed</strong><br>Archived leads and converted clients land here once you close or convert them.',
      'all':          '<strong>No enquiries yet</strong><br>All enquiries regardless of status will show here once they come in.'
    }[_ctx] || 'Nothing here';
    listEl.innerHTML = '<div class="dh-attn-empty" style="padding:28px 20px;text-align:center;color:var(--t3);font-size:12.5px;line-height:1.55">' + _emptyMsg + '</div>';
    return;
  }
  listEl.innerHTML = items.slice(0, 12).map(function(e) {
    var nm = [e.first_name, e.last_name].filter(Boolean).join(' ') || 'Unknown';
    return '<div class="dh-attn-item" onclick="openDetailPanel(\'enquiry\',\'' + escHtml(String(e.id)) + '\')">'
      + '<div class="dh-attn-av ' + _dhAvCol(nm) + '">' + _dhIni(nm) + '</div>'
      + '<div class="dh-attn-body"><div class="dh-attn-name">' + escHtml(nm) + '</div>'
      + '<div class="dh-attn-meta" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:2px">' + _dhEnqMeta(e) + '</div></div>'
      + '<span class="dh-attn-arrow">›</span></div>';
  }).join('');
}

// mode: undefined/'billing' = normal, 'critical' = red, 'actions' = amber
function _dhRenderSessionItems(listEl, sessions, mode) {
  var emptyMsg = mode === 'critical' ? '🟢 No Halaxy invoice issues found'
               : mode === 'actions'  ? 'No calendar/dashboard appointments need action'
               : 'No unpaid appointments';
  if (!sessions || !sessions.length) {
    listEl.innerHTML = '<div class="dh-attn-empty" style="padding:32px 20px;text-align:center;color:var(--t3);font-size:13px">' + emptyMsg + '</div>';
    return;
  }
  var STAT_LABELS = { 'pending-invoice': 'No invoice yet', 'invoiced': 'Invoice unpaid', 'needs-recording': 'Needs recording' };
  // Visual accent per mode
  var accentStyle = mode === 'critical' ? 'border-left:3px solid #ef4444'
                  : mode === 'actions'  ? 'border-left:3px solid var(--amber)'
                  : '';
  var metaStyle   = mode === 'critical' ? 'color:#ef4444'
                  : mode === 'actions'  ? 'color:var(--amber)'
                  : '';
  var prefix      = mode === 'critical' ? '⚠ No invoice · '
                  : mode === 'actions'  ? '↗ Needs action · '
                  : '';
  listEl.innerHTML = sessions.slice(0, 12).map(function(s) {
    var nm       = s.name || 'Client';
    var label    = STAT_LABELS[s.status] || s.status;
    var dateStr  = s.dateLabel || s.dateStr || '';
    var sid      = escHtml(String(s.id || ''));
    var avStyle  = mode === 'critical'
      ? 'background:rgba(239,68,68,0.12);color:#ef4444;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0'
      : mode === 'actions'
      ? 'background:rgba(245,158,11,0.12);color:var(--amber);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0'
      : '';
    var avEl = avStyle
      ? '<div class="dh-attn-av" style="' + avStyle + '">' + escHtml((nm[0] || '?').toUpperCase()) + '</div>'
      : '<div class="dh-attn-av ' + _dhAvCol(nm) + '">' + _dhIni(nm) + '</div>';
    return '<div class="dh-attn-item" onclick="openDetailPanel(\'session\',\'' + sid + '\')"'
      + (accentStyle ? ' style="' + accentStyle + '"' : '') + '>'
      + avEl
      + '<div class="dh-attn-body"><div class="dh-attn-name">' + escHtml(nm) + '</div>'
      + '<div class="dh-attn-meta"' + (metaStyle ? ' style="' + metaStyle + '"' : '') + '>'
      + prefix + escHtml(dateStr) + ' · ' + escHtml(label) + '</div></div>'
      + '<span class="dh-attn-arrow">›</span></div>';
  }).join('');
}

// Merged "Not in Halaxy" bucket: calendar appts not yet booked in Halaxy — upcoming (unlinked) +
// past (needs recording/invoicing), past-first (most urgent). All resolve via "Set up in Halaxy".
function _dhNotInHalaxy() {
  var up = _dhUnlinkedCalAppts || [];
  var pa = _dhNonHalaxyActions || [];
  return up.concat(pa).sort(function(a, b) { return (a.startMs || 0) - (b.startMs || 0); });
}

function _dhRenderUnlinkedCalItems(listEl, appts) {
  if (!appts || !appts.length) {
    listEl.innerHTML = '<div class="dh-attn-empty" style="padding:32px 20px;text-align:center;color:var(--t3);font-size:13px">Nothing waiting to be set up in Halaxy</div>';
    return;
  }
  listEl.innerHTML = appts.slice(0, 20).map(function(s) {
    var nm      = s.name || 'Calendar event';
    var dateStr = (s.dateLabel || s.dateStr || '') + (s.timeStr ? ' · ' + s.timeStr : '');
    var sid     = escHtml(String(s.id || ''));
    var note    = s.patientId ? 'Needs recording' : 'Not in Halaxy';
    return '<div class="dh-attn-item" onclick="openDetailPanel(\'session\',\'' + sid + '\')" style="border-left:3px solid #E07B39">'
      + '<div class="dh-attn-av" style="background:rgba(224,123,57,0.14);color:#b85a1e;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">'
      + escHtml((nm[0] || '?').toUpperCase()) + '</div>'
      + '<div class="dh-attn-body"><div class="dh-attn-name">' + escHtml(nm) + '</div>'
      + '<div class="dh-attn-meta" style="color:#b85a1e">⚕ ' + note + ' · ' + escHtml(dateStr) + '</div></div>'
      + '<span class="dh-attn-arrow">›</span></div>';
  }).join('');
}

var _dhInboxFilter = 'new';
function dhInboxFilter(status, el) {
  _dhInboxFilter = status;
  document.querySelectorAll('.dh-inbox-folder').forEach(function(f) {
    f.classList.toggle('active', f.dataset.status === status);
  });
  var listEl = document.getElementById('dh-inbox-list');
  if (!listEl) return;
  if (status === 'critical') {
    _dhRenderSessionItems(listEl, _dhHalaxyNoInvoice, 'critical');
    return;
  }
  if (status === 'unlinked') {
    _dhRenderUnlinkedCalItems(listEl, _dhNotInHalaxy());
    return;
  }
  if (!_pipelineData) return;
  var all = _pipelineData.enquiries || [];
  var filtered;
  if (status === 'all') {
    filtered = all;
  } else if (status === 'upcoming_appt') {
    // Enquiries whose linked client has an upcoming Halaxy appointment
    filtered = all.filter(function(e) {
      var client = _dhEnqClientMap[e.id];
      return client && client.halaxy_id && (_dhPatientApptMap[String(client.halaxy_id)] || []).length > 0;
    });
  } else {
    filtered = all.filter(function(e) { return (e.status || 'new') === status; });
  }
  _dhRenderInboxItems(listEl, filtered, status);
}

/* ── Schedule card state & helpers ── */
var _dhAppts            = [];  // cached appointments for schedule nav
var _dhBillingSessions  = [];  // sessions needing billing action (for Unpaid folder)
var _dhEnqClientMap     = {};  // enquiry.id → client object (for inbox sub-info)
var _dhPatientApptMap   = {};  // halaxy_id string → sorted upcoming sessions[]
var _dhUnlinkedCalAppts = [];  // upcoming GCal events with no Halaxy patient (for Unlinked folder)
var _dhSchedDateStr     = '';  // selected day ISO string ('' = auto-select today/first)
var _dhSchedWeekOff     = 0;   // week offset: 0=this week, 1=next week

/* ── Module-level patient/client name resolver (used by billing bento + panel) ── */
function _resolvePatientName(patientId) {
  if (!patientId) return 'Unknown';
  var pm = (_halaxyData && _halaxyData.patientMap) || {};
  if (pm[patientId]) return pm[patientId];
  var pts = (_halaxyData && _halaxyData.patients) || [];
  var p = pts.find(function(pt) { return String(pt.id) === String(patientId); });
  if (p) return p.name;
  var clients = (_pipelineData && _pipelineData.clients) || [];
  var c = clients.find(function(cl) { return String(cl.halaxy_id) === String(patientId); });
  return c ? (c.display_name || c.first_name || 'Client') : 'Client #' + patientId;
}

/* ── Inbox issue buckets ─────────────────────────────────────────── */
var _dhHalaxyNoInvoice  = []; // past Halaxy appts with no invoice → CRITICAL
var _dhNonHalaxyActions = []; // non-Halaxy appts needing merge/dismiss → action

/**
 * Returns true for "Personal appointment" entries — legacy Halaxy
 * placeholder name used before proper patient records were linked.
 * These should be silently excluded from all inbox action buckets.
 */
function _isPersonalAppt(s) {
  var n = (s.name || '').trim().toLowerCase();
  return n === 'personal appointment' || n === 'personal';
}

/**
 * Recompute all inbox buckets from current data and refresh whichever
 * view is visible. Call this whenever Halaxy or Calendar data arrives
 * asynchronously so the inbox is never stale.
 */
function _recomputeInboxBuckets() {
  if (!_pipelineData) return;
  var clients   = (_pipelineData.clients   || []);
  var _uni = (_halaxyData && _halaxyData.connected)
    ? _buildUnifiedSessions()
    : { upcoming: [], past: [] };

  _dhBillingSessions = _uni.past.filter(function(s) {
    return !_isPersonalAppt(s) && (s.status === 'pending-invoice' || s.status === 'invoiced' || s.status === 'needs-recording');
  });
  _dhHalaxyNoInvoice = _uni.past.filter(function(s) {
    return !_isPersonalAppt(s) && s.source === 'halaxy' && (s.status === 'pending-invoice' || s.status === 'needs-recording');
  });
  _dhNonHalaxyActions = _uni.past.filter(function(s) {
    return !_isPersonalAppt(s) && s.source !== 'halaxy' && (s.status === 'pending-invoice' || s.status === 'needs-recording');
  });
  _dhEnqClientMap = {};
  clients.forEach(function(c) { if (c.enquiry_id) _dhEnqClientMap[c.enquiry_id] = c; });
  _dhPatientApptMap = {};
  _uni.upcoming.forEach(function(s) {
    if (!s.patientId) return;
    var key = String(s.patientId);
    if (!_dhPatientApptMap[key]) _dhPatientApptMap[key] = [];
    _dhPatientApptMap[key].push(s);
  });
  Object.keys(_dhPatientApptMap).forEach(function(k) {
    _dhPatientApptMap[k].sort(function(a, b) { return a.startMs - b.startMs; });
  });
  // Every upcoming cal event without a Halaxy patient must surface in Unlinked
  _dhUnlinkedCalAppts = _uni.upcoming.filter(function(s) {
    return s.source === 'cal' && !s.patientId && !s.isReminder;
  });

  // Refresh whichever surface is currently showing inbox/home data
  // Desktop: inbox lives inside the home bento — re-render home
  // Mobile:  inbox is a standalone app — re-render it directly
  if (window.innerWidth <= 768) {
    if (_mobCurrentApp === 'queue') _mobRenderInbox();
    else if (_mobCurrentApp === 'home') _mobRenderHome();
  } else {
    if (_currentView === 'home') renderHomeView();
  }
}

/* ── Reminders sort + priority state ─────────────────────────────── */
var _dhRemindSort = 'date'; // 'date' | 'priority'
var _dhTaskPrios  = JSON.parse(localStorage.getItem('task_prios') || '{}');

function _dhGetPrio(id) { return _dhTaskPrios[String(id)] || 'normal'; }
function dhSetTaskPrio(id, prio) {
  _dhTaskPrios[String(id)] = prio;
  localStorage.setItem('task_prios', JSON.stringify(_dhTaskPrios));
  _dhRenderRemindBento();
  if (window.innerWidth <= 768) _mobRenderReminders();
}
function dhRemindCycleSort() {
  _dhRemindSort = _dhRemindSort === 'date' ? 'priority' : 'date';
  _dhRenderRemindBento();
  if (typeof _mobRenderReminders === 'function' && window.innerWidth <= 768) _mobRenderReminders();
}

/* ── Module-level AUD formatter ───────────────────────────────────── */
function _fmtAUD(n) { return '$' + Math.round(n || 0).toLocaleString('en-AU'); }

/**
 * Format a Halaxy invoice reference for display.
 * Halaxy FHIR resource IDs look like "FD-12345678" — if the identifier
 * value matches or is missing, fall back to stripping the alpha prefix so
 * we always show a clean numeric-style reference (e.g. "#12345678").
 * Returns empty string if nothing useful is available.
 */
function _fmtInvRef(inv) {
  if (!inv) return '';
  // Prefer a clean identifier value that differs from the FHIR resource id
  if (inv.ref && inv.ref !== inv.id && inv.ref.length < 30) return inv.ref;
  // Fall back: strip the leading alpha prefix from the FHIR id (e.g. "FD-" → "#")
  var id = inv.id || inv.ref || '';
  if (!id) return '';
  var stripped = id.replace(/^[A-Za-z]+-/, '');
  return stripped && stripped !== id ? '#' + stripped : '';
}

/* ── Billing bento paid-period toggle ─────────────────────────────── */
var _dhBillMode = 'mtd'; // 'mtd' | 'fy'
function dhBillToggleMode() {
  _dhBillMode = _dhBillMode === 'mtd' ? 'fy' : 'mtd';
  _dhRenderBillingBento();
}

function dhSchedSelectDay(iso) {
  _dhSchedDateStr = iso;
  _dhRenderSchedCard();
}

function dhSchedNavWeek(dir) {
  _dhSchedWeekOff = Math.max(-1, Math.min(1, _dhSchedWeekOff + dir));
  _dhSchedDateStr = '';
  _dhRenderSchedCard();
}

function _dhRenderSchedCard() {
  var inner = document.getElementById('dh-sched-inner');
  if (!inner) return;

  var appts    = _dhAppts;
  var now      = new Date();
  var todayStr = now.toDateString();

  // Monday of the displayed week
  var base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var dow  = base.getDay();
  base.setDate(base.getDate() + (dow === 0 ? -6 : 1 - dow) + _dhSchedWeekOff * 7);

  var WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var strip = [];
  for (var i = 0; i < 7; i++) {
    var d   = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    var ds  = d.toDateString();
    var iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    var cnt = appts.filter(function(a){ return a.dateStr && a.status !== 'cancelled' && a.dateStr === iso; }).length;
    strip.push({ name: WD[d.getDay()], num: d.getDate(), cnt: cnt, today: ds===todayStr, iso: iso });
  }

  // Determine the selected ISO date
  var defaultIso = (_dhSchedWeekOff === 0)
    ? ((strip.find(function(s){ return s.today; }) || strip[0]).iso)
    : strip[0].iso;
  var selIso   = _dhSchedDateStr || defaultIso;
  var selParts = selIso.split('-');
  var selDate  = new Date(parseInt(selParts[0]), parseInt(selParts[1])-1, parseInt(selParts[2]));
  var selDateStr = selDate.toDateString();

  var selAppts = appts.filter(function(a) {
    return a.dateStr && a.status !== 'cancelled' && a.dateStr === selIso;
  }).sort(function(a,b){ return (a.startMs || 0) - (b.startMs || 0); });

  var isToday  = selDateStr === todayStr;
  var dateLabel = isToday ? "Today's Appointments"
    : selDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

  function _ft(iso) { var d=new Date(iso),h=d.getHours(),m=d.getMinutes(); return (h%12||12)+':'+(m<10?'0':'')+m+(h>=12?'pm':'am'); }
  function _ac(n)   { return ['av-teal','av-blue','av-purple','av-amber','av-red'][(n||'').charCodeAt(0)%5]; }
  function _in(n)   { if (!n) return '?'; var p=n.trim().split(/\s+/); return (p[0][0]+(p[1]?p[1][0]:'')).toUpperCase(); }
  var arrowSVG = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h8M6 2l4 4-4 4"/></svg>';

  var h = '';

  // Week strip
  h += '<div class="dh-week-strip">';
  strip.forEach(function(w) {
    var pip = w.cnt > 0 ? (w.today ? 'dh-wd-pip--today' : 'dh-wd-pip--has') : '';
    var cls = 'dh-week-day'
      + (w.today        ? ' dh-week-day--today'  : '')
      + (w.iso===selIso ? ' dh-week-day--active' : '');
    h += '<button class="' + cls + '" onclick="dhSchedSelectDay(\'' + w.iso + '\')" type="button">'
      + '<span class="dh-wd-name">' + w.name + '</span>'
      + '<span class="dh-wd-num">'  + w.num  + '</span>'
      + '<span class="dh-wd-pip '   + pip    + '"></span>'
      + '</button>';
  });
  h += '</div>';

  // Card header + week nav
  var weekLbl = _dhSchedWeekOff === -1 ? 'Last Week' : _dhSchedWeekOff === 1 ? 'Next Week' : 'This Week';
  h += '<div class="dh-card-hd">'
    + '<span class="dh-card-title">' + escHtml(dateLabel) + '</span>'
    + '<div class="dh-sched-nav">'
    + '<button class="dh-sched-nav-btn" onclick="dhSchedNavWeek(-1)" type="button" title="Previous week"'
    + (_dhSchedWeekOff <= -1 ? ' disabled' : '') + '>'
    + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2L4 7l5 5"/></svg>'
    + '</button>'
    + '<span class="dh-sched-nav-lbl">' + escHtml(weekLbl) + '</span>'
    + '<button class="dh-sched-nav-btn" onclick="dhSchedNavWeek(1)" type="button" title="Next week"'
    + (_dhSchedWeekOff >= 1 ? ' disabled' : '') + '>'
    + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2l5 5-5 5"/></svg>'
    + '</button>'
    + '</div>'
    + '</div>';

  // Sessions list
  if (!selAppts.length) {
    h += '<div class="dh-sched-empty">No appointments' + (isToday ? ' today' : '')
      + '<br><span style="font-size:12px;opacity:0.5">Enjoy the breathing room.</span></div>';
  } else {
    selAppts.slice(0,6).forEach(function(a) {
      var nm   = a.name || a.patientName || 'Client';
      var time = a.timeStr || (a.startIso ? _ft(a.startIso) : a.start ? _ft(a.start) : '');
      var sid  = escHtml(String(a.id || ''));
      var isReminder = a.isReminder;
      var srcCls = isReminder ? ' dh-sched-row--personal'
                 : a.source === 'cal' ? ' dh-sched-row--cal'
                 : (a.source === 'halaxy' && a.patientId) ? ' dh-sched-row--halaxy'
                 : ' dh-sched-row--personal';

      // Source pill
      var pillLabel, pillStyle;
      if (isReminder) {
        pillLabel = 'Reminder';
        pillStyle = 'background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.35)';
      } else if (a.source === 'cal') {
        pillLabel = 'Google Cal';
        pillStyle = 'background:rgba(224,123,57,0.15);color:#E07B39';
      } else if (a.source === 'halaxy') {
        pillLabel = 'Halaxy';
        pillStyle = 'background:rgba(59,130,246,0.14);color:#60a5fa';
      } else if (a.source === 'dashboard') {
        pillLabel = 'Added';
        pillStyle = 'background:rgba(52,211,153,0.1);color:var(--teal)';
      } else {
        pillLabel = 'Personal';
        pillStyle = 'background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.35)';
      }

      // Status tag
      var statusTag = '';
      var statusMap = {
        'needs-recording': ['Needs further action', '#a78bfa'],
        'pending-invoice': ['Needs invoice',        '#a78bfa'],
        'invoiced':        ['Invoice unpaid',        '#E07B39'],
        'paid':            ['Paid',                  '#34d399'],
      };
      if (statusMap[a.status]) {
        var sc = statusMap[a.status];
        var bg = a.status === 'paid'
          ? 'rgba(52,211,153,0.1)'
          : a.status === 'invoiced'
            ? 'rgba(224,123,57,0.12)'
            : 'rgba(167,139,250,0.1)';
        statusTag = '<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;background:' + bg + ';color:' + sc[1] + ';white-space:nowrap">' + sc[0] + '</span>';
      }

      h += '<div class="dh-sched-row' + srcCls + '" onclick="openDetailPanel(\'session\',\'' + sid + '\')" style="cursor:pointer">'
        + '<div class="dh-sched-time">' + escHtml(time) + '</div>'
        + '<div class="dh-sched-av ' + _ac(nm) + '">' + _in(nm) + '</div>'
        + '<span class="dh-sched-name">' + escHtml(nm) + '</span>'
        + '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0">'
        + statusTag
        + '<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;' + pillStyle + '">' + pillLabel + '</span>'
        + '</div>'
        + '</div>';
    });
  }

  inner.innerHTML = h;
}

/* ── Home dashboard view ── */
function renderHomeView() {
  var content = document.getElementById('view-content');
  if (!content || !_pipelineData) return;

  // On mobile: just render the schedule app and update the persistent header
  if (window.innerWidth <= 768) {
    if (!_mobAnimRunning) _mobUpdateHeader();
    _mobRenderSchedule();
    _updateMobileDock('home');
    return;
  }

  var enquiries = (_pipelineData.enquiries || []);
  var invoices  = (_halaxyData && _halaxyData.invoices) || [];
  // Use the full unified session pipeline so patient names and statuses are resolved
  var _uni = (_halaxyData && _halaxyData.connected) ? _buildUnifiedSessions() : { upcoming: [], past: [] };
  var uniSet = new Set(_uni.upcoming.concat(_uni.past).map(function(s) { return s.startIso; }));
  var extraLocal = _getLocalSessions().filter(function(s) { return !uniSet.has(s.startIso); });
  var appts = _uni.upcoming.concat(_uni.past).concat(extraLocal);
  var clients   = (_pipelineData.clients || []);

  function _avCol(n) { return ['av-teal','av-blue','av-purple','av-amber','av-red'][(n||'').charCodeAt(0)%5]; }
  function _ini(n) {
    if (!n) return '?';
    var p = n.trim().split(/\s+/);
    return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }
  function _fmtTime(iso) {
    var d = new Date(iso), h = d.getHours(), m = d.getMinutes();
    return (h%12||12) + ':' + (m<10?'0':'') + m + (h>=12?'pm':'am');
  }
  function _fmt$(n) { return _fmtAUD(n); }

  var now        = new Date();
  var todayStr   = now.toDateString();
  var activeClients = clients.filter(function(c) { return c.active !== false; });
  var newEnquiries  = enquiries.filter(function(e) { return (e.status||'new') === 'new'; });

  // Billing breakdown
  var bPending = 0, bPaid = 0;
  var _billMonthStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  invoices.forEach(function(inv) {
    var bal = parseFloat(inv.totalBalance != null ? inv.totalBalance : 0);
    if (bal > 0) bPending += bal;
    // Halaxy marks paid via totalBalance=0; no paidDate field — use invoice date for month filter
    if (_invIsPaid(inv) && inv.date && inv.date.startsWith(_billMonthStr)) {
      bPaid += parseFloat(inv.totalPaid != null ? inv.totalPaid : (inv.amount || 0));
    }
  });

  // Inline SVG icons
  var IC = {
    people: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    inbox:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>',
    cal:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    dollar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    clock:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    alert:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    tasks:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>',
    card:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  };

  var greeting = (function() {
    var h = now.getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();
  var dateLabel = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  // Shared SVG arrow for "see all" links
  var arrowSVG = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h8M6 2l4 4-4 4"/></svg>';

  var html = '<div class="dh-wrap">';

  // User first name from server-injected window.ADMIN_USER
  var firstName = ((window.ADMIN_USER || '').split(' ')[0]) || '';

  // ── Pre-compute lookup maps (needed for KPI + inbox) ─────────
  _dhBillingSessions = _uni.past.filter(function(s) {
    return !_isPersonalAppt(s) && (s.status === 'pending-invoice' || s.status === 'invoiced' || s.status === 'needs-recording');
  });

  // ── Issue buckets ─────────────────────────────────────────────
  // Halaxy appointment with no invoice = critical data integrity problem
  // "Personal appointment" entries are legacy Halaxy placeholders — exclude silently
  _dhHalaxyNoInvoice  = _uni.past.filter(function(s) {
    return !_isPersonalAppt(s) && s.source === 'halaxy' && (s.status === 'pending-invoice' || s.status === 'needs-recording');
  });
  // Non-Halaxy appointment needing merge or dismiss (calendar / dashboard)
  _dhNonHalaxyActions = _uni.past.filter(function(s) {
    return !_isPersonalAppt(s) && s.source !== 'halaxy' && (s.status === 'pending-invoice' || s.status === 'needs-recording');
  });

  _dhEnqClientMap = {};
  clients.forEach(function(c) { if (c.enquiry_id) _dhEnqClientMap[c.enquiry_id] = c; });
  _dhPatientApptMap = {};
  _uni.upcoming.forEach(function(s) {
    if (!s.patientId) return;
    var key = String(s.patientId);
    if (!_dhPatientApptMap[key]) _dhPatientApptMap[key] = [];
    _dhPatientApptMap[key].push(s);
  });
  Object.keys(_dhPatientApptMap).forEach(function(k) {
    _dhPatientApptMap[k].sort(function(a, b) { return a.startMs - b.startMs; });
  });
  _dhUnlinkedCalAppts = _uni.upcoming.filter(function(s) {
    return s.source === 'cal' && !s.patientId && !s.isReminder;
  });

  var allEnqs       = enquiries;
  var contactedEnqs = enquiries.filter(function(e){ return e.status === 'contacted'; });
  var closedEnqs    = enquiries.filter(function(e){ return e.status === 'closed'; });
  var unpaidCount   = _dhBillingSessions.length;
  var unlinkedCount = _dhNotInHalaxy().length;
  var upcomingApptEnqs = enquiries.filter(function(e) {
    var client = _dhEnqClientMap[e.id];
    return client && client.halaxy_id && (_dhPatientApptMap[String(client.halaxy_id)] || []).length > 0;
  });

  // KPI helpers
  var _wd0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var _dow = _wd0.getDay();
  _wd0.setDate(_wd0.getDate() + (_dow === 0 ? -6 : 1 - _dow));
  var _wd7 = new Date(_wd0); _wd7.setDate(_wd7.getDate() + 7);
  var thisWeekCount = appts.filter(function(a) {
    var d = new Date(a.startIso || a.start || (a.dateStr ? a.dateStr + 'T00:00' : ''));
    return d >= _wd0 && d < _wd7 && a.status !== 'cancelled';
  }).length;
  var needsActionCount = newEnquiries.length
    + _uni.past.filter(function(s){ return s.status === 'pending-invoice'; }).length;

  // Today / Next Session helpers
  var todayIso = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  var todayAppts = appts.filter(function(a) {
    return a.dateStr === todayIso && a.status !== 'cancelled' && !_isPersonalAppt(a);
  }).sort(function(a,b){ return (a.startMs||0)-(b.startMs||0); });
  // Exclude personal-appointment placeholders from "next appointment" too
  var nextAppt = _uni.upcoming.filter(function(a) {
    return a.status !== 'cancelled' && a.startMs && a.startMs > Date.now() && !_isPersonalAppt(a);
  }).sort(function(a,b){ return a.startMs - b.startMs; })[0];
  function _fmtT(iso) { var d=new Date(iso),h=d.getHours(),m=d.getMinutes(); return (h%12||12)+':'+(m<10?'0':'')+m+(h>=12?'pm':'am'); }

  // Billing
  var needsInvoiceCount = _uni.past.filter(function(s) { return s.status === 'pending-invoice'; }).length;
  // Outstanding = money still owed to us = balance > 0 (excludes cancelled/draft).
  // Paid invoices have balance 0 and are NOT counted — including funder invoices
  // (NDIS plan-managed etc.) once remittance is recorded.
  var awaitingPayCount  = invoices.filter(function(i) {
    return i.status !== 'cancelled' && i.status !== 'draft' && parseFloat(i.totalBalance || 0) > 0;
  }).length;

  // ── Issue counts (needed by snapshot + inbox sidebar) ─────────
  var critCount    = _dhHalaxyNoInvoice.length;
  var hasIssues    = critCount > 0 || unlinkedCount > 0;

  // ── Receptionist-style paragraph snapshot ─────────────────────
  // Build as natural sentences, like a front-desk briefing when you walk in.
  var _snapSentences = [];

  // 1. Today's sessions
  if (todayAppts.length === 0) {
    _snapSentences.push('No sessions today.');
  } else if (todayAppts.length === 1) {
    var _sa = todayAppts[0];
    var _saT = _sa.timeStr || (_sa.startIso ? _fmtT(_sa.startIso) : '');
    _snapSentences.push('<strong>' + escHtml(_sa.name || 'Client') + '</strong> is in'
      + (_saT ? ' at ' + escHtml(_saT) : '') + '.');
  } else if (todayAppts.length === 2) {
    var _sa1 = todayAppts[0], _sa2 = todayAppts[1];
    var _saT1 = _sa1.timeStr || (_sa1.startIso ? _fmtT(_sa1.startIso) : '');
    var _saT2 = _sa2.timeStr || (_sa2.startIso ? _fmtT(_sa2.startIso) : '');
    _snapSentences.push('<strong>' + escHtml(_sa1.name || 'Client') + '</strong>'
      + (_saT1 ? ' at ' + escHtml(_saT1) : '') + ' and <strong>'
      + escHtml(_sa2.name || 'Client') + '</strong>'
      + (_saT2 ? ' at ' + escHtml(_saT2) : '') + ' today.');
  } else {
    var _sa = todayAppts[0];
    var _saT = _sa.timeStr || (_sa.startIso ? _fmtT(_sa.startIso) : '');
    _snapSentences.push('You have <strong>' + todayAppts.length + ' sessions</strong> today'
      + ' — first up is <strong>' + escHtml(_sa.name || 'Client') + '</strong>'
      + (_saT ? ' at ' + escHtml(_saT) : '') + '.');
  }

  // 2. Next appointment (skip if it's the same as the only today session already mentioned)
  var _nextIsAlreadyMentioned = todayAppts.length === 1 && nextAppt
    && nextAppt.dateStr === todayIso && nextAppt.startMs === todayAppts[0].startMs;
  if (nextAppt && !_nextIsAlreadyMentioned) {
    var _nN = escHtml(nextAppt.name || nextAppt.patientName || 'Client');
    var _nT = nextAppt.timeStr || (nextAppt.startIso ? _fmtT(nextAppt.startIso) : '');
    var _nIsToday = nextAppt.dateStr === todayIso;
    if (_nIsToday) {
      _snapSentences.push('Next up: <strong>' + _nN + '</strong>'
        + (_nT ? ' at ' + escHtml(_nT) : '') + '.');
    } else {
      var _nDay = new Date(nextAppt.dateStr + 'T00:00').toLocaleDateString('en-AU',
        { weekday: 'long', day: 'numeric', month: 'long' });
      _snapSentences.push('Next appointment is <strong>' + _nN + '</strong>'
        + ' on ' + escHtml(_nDay) + (_nT ? ' at ' + escHtml(_nT) : '') + '.');
    }
  } else if (!nextAppt && todayAppts.length === 0) {
    _snapSentences.push('Your calendar is clear.');
  }

  // 3. Admin heads-up — combine into one sentence
  var _alertItems = [];
  if (critCount > 0)       _alertItems.push('<span style="color:#ef4444">' + critCount + ' invoice' + (critCount !== 1 ? 's' : '') + ' to create</span>');
  if (awaitingPayCount > 0) _alertItems.push('<span style="color:var(--amber)">' + awaitingPayCount + ' awaiting payment</span>');
  if (unlinkedCount > 0)   _alertItems.push('<span style="color:#b85a1e">' + unlinkedCount + ' unlinked calendar event' + (unlinkedCount !== 1 ? 's' : '') + '</span>');
  if (_alertItems.length === 1) {
    _snapSentences.push('Heads up — ' + _alertItems[0] + '.');
  } else if (_alertItems.length === 2) {
    _snapSentences.push('Heads up — ' + _alertItems[0] + ' and ' + _alertItems[1] + '.');
  } else if (_alertItems.length >= 3) {
    var _last = _alertItems.pop();
    _snapSentences.push('Heads up — ' + _alertItems.join(', ') + ', and ' + _last + '.');
  }

  // 4. New enquiries
  if (newEnquiries.length === 1) {
    _snapSentences.push('<span style="color:var(--teal)">1 new enquiry in your inbox.</span>');
  } else if (newEnquiries.length > 1) {
    _snapSentences.push('<span style="color:var(--teal)">' + newEnquiries.length + ' new enquiries in your inbox.</span>');
  }

  var _snapshotHtml = _snapSentences.join(' ') || 'All clear — have a good one.';

  html += '<div class="dh-hd-row">'
    + '<div class="dh-hd-left">'
    + '<img src="/assets/logo.svg" class="dh-hd-logo" alt="" width="52" height="52">'
    + '<div class="dh-hd-name-row">'
    + '<div class="dh-hd-greeting">' + escHtml(greeting) + (firstName ? ', ' + escHtml(firstName) : '') + '</div>'
    + '<div class="dh-add-wrap">'
    + '<button class="topbar-add-btn" id="dh-mob-add-btn" onclick="toggleMobAddMenu()">'
    + '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
    + ' Add'
    + '</button>'
    + '<div class="dh-add-menu" id="dh-mob-add-menu" style="display:none">'
    + '<button class="dh-add-item" onclick="closeMobAddMenu();openDbModal(\'client\')">'
    + IC.people + 'Client</button>'
    + '<button class="dh-add-item" onclick="closeMobAddMenu();openDbModal(\'appt\')">'
    + IC.cal + 'Appointment</button>'
    + '<button class="dh-add-item" onclick="closeMobAddMenu();focusReminderInp()">'
    + IC.tasks + 'Reminder</button>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="dh-hd-meta" id="dh-hd-meta">' + _snapshotHtml + '</div>'
    + '</div>'
    + '</div>';

  // ── 4-quadrant bento grid ─────────────────────────────────────
  html += '<div class="dh-bento">';

  // TL: Schedule
  _dhAppts = appts;
  html += '<div class="dh-b-6 dh-fold" id="dh-q-sched">'
    + '<div class="dh-fold-tab">' + IC.cal + 'Schedule</div>'
    + '<div class="dh-sched-card" id="dh-sched-inner"></div>'
    + '</div>';

  // TR: Inbox
  html += '<div class="dh-b-6 dh-fold" id="dh-q-inbox">'
    + '<div class="dh-fold-tab">'
    + IC.inbox + 'Inbox'
    + (hasIssues ? '<span class="dh-fold-badge" style="background:rgba(239,68,68,0.15);color:#ef4444">⚠ ' + (critCount + unlinkedCount) + ' issue' + (critCount + unlinkedCount !== 1 ? 's' : '') + '</span>' : '')
    + (newEnquiries.length ? '<span class="dh-fold-badge">' + newEnquiries.length + ' new</span>' : '')
    + '</div>'
    + '<div class="dh-attn-card">';

  html += '<div class="dh-inbox-sidebar">';

  // ── Issues section (only rendered when there are problems) ──
  if (hasIssues) {
    html += '<div class="dh-if-section-label">Issues</div>';
    if (critCount > 0) {
      html += '<div class="dh-inbox-folder dh-if-critical" data-status="critical" onclick="dhInboxFilter(\'critical\',this)">'
        + '<span class="dh-if-label">⚠ No Invoice</span>'
        + '<span class="dh-if-count dh-if-count-crit">' + critCount + '</span></div>';
    }
    if (unlinkedCount > 0) {
      html += '<div class="dh-inbox-folder dh-if-unlinked" data-status="unlinked" onclick="dhInboxFilter(\'unlinked\',this)">'
        + '<span class="dh-if-label">⚕ Not in Halaxy</span>'
        + '<span class="dh-if-count" style="color:#b85a1e">' + unlinkedCount + '</span></div>';
    }
    html += '<div class="dh-if-divider"></div>';
  }

  // ── Enquiry pipeline section ──
  html += '<div class="dh-inbox-folder' + (!hasIssues ? ' active' : '') + '" data-status="new" onclick="dhInboxFilter(\'new\',this)">'
    + '<span class="dh-if-label">New</span><span class="dh-if-count">' + newEnquiries.length + '</span></div>'
    + '<div class="dh-inbox-folder" data-status="contacted" onclick="dhInboxFilter(\'contacted\',this)">'
    + '<span class="dh-if-label">Contacted</span><span class="dh-if-count">' + contactedEnqs.length + '</span></div>'
    + '<div class="dh-inbox-folder" data-status="upcoming_appt" onclick="dhInboxFilter(\'upcoming_appt\',this)">'
    + '<span class="dh-if-label">Upcoming</span><span class="dh-if-count"' + (upcomingApptEnqs.length ? ' style="color:var(--teal)"' : '') + '>' + upcomingApptEnqs.length + '</span></div>'
    + '<div class="dh-inbox-folder" data-status="closed" onclick="dhInboxFilter(\'closed\',this)">'
    + '<span class="dh-if-label">Closed</span><span class="dh-if-count">' + closedEnqs.length + '</span></div>'
    + '<div class="dh-inbox-folder" data-status="all" onclick="dhInboxFilter(\'all\',this)">'
    + '<span class="dh-if-label">All</span><span class="dh-if-count">' + allEnqs.length + '</span></div>'
    + '</div>';
  html += '<div class="dh-inbox-list" id="dh-inbox-list"></div>';
  html += '</div></div>'; // .dh-attn-card + dh-b-6.dh-fold

  // BL: Reminders — table layout with sort
  html += '<div class="dh-b-6 dh-fold" id="dh-q-util">'
    + '<div class="dh-fold-tab">'
    + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'
    + 'Reminders'
    + '<span class="dh-fold-badge" id="dh-util-remind-badge" style="display:none"></span>'
    + '<button class="dh-remind-sort-btn" onclick="event.stopPropagation();dhRemindCycleSort()" title="Sort" id="dh-remind-sort-btn" style="margin-left:auto;font-size:10px;color:var(--t3);background:none;border:none;cursor:pointer;padding:0 4px;white-space:nowrap">Sort: date</button>'
    + '</div>'
    + '<div class="dh-tasks-card dh-remind-table-wrap" style="flex:1;min-height:0;cursor:default">'
    + '<div class="dh-rt-head"><span class="dh-rt-h-task">Task</span><span class="dh-rt-h-client">Client</span><span class="dh-rt-h-prio">Priority</span><span class="dh-rt-h-date">Added</span></div>'
    + '<div class="dh-tasks-body" id="dh-util-remind-list"><div class="dh-tasks-loading">Loading…</div></div>'
    + '<div class="dh-tasks-add">'
    + '<span class="dh-tasks-plus">+</span>'
    + '<input class="dh-task-inp" id="dh-task-inp" placeholder="Add reminder…" onkeydown="dhAddTask(event)">'
    + '</div>'
    + '</div>'
    + '</div>'; // .dh-fold

  // BR: Billing bento — live invoice list + paid/FY toggle
  html += '<div class="dh-b-6 dh-fold" id="dh-q-bill">'
    + '<div class="dh-fold-tab">'
    + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>'
    + 'Billing'
    + (awaitingPayCount ? '<span class="dh-fold-badge" style="background:rgba(245,158,11,0.18);color:var(--amber)">' + awaitingPayCount + ' outstanding</span>' : '')
    + '</div>'
    + '<div class="dh-billing-card dh-billing-live" style="cursor:default;flex:1;min-height:0;display:flex;flex-direction:column">'
    + '<div id="dh-bill-bento-inner"></div>'
    + '</div>'
    + '</div>'; // .dh-fold

  html += '</div>'; // .dh-bento
  html += '</div>'; // .dh-wrap

  content.innerHTML = html;
  _dhSchedWeekOff = 0;
  _dhSchedDateStr = '';
  _dhRenderSchedCard();
  _dhLoadTasks();
  _dhRenderBillingBento();
  var _inboxListEl = document.getElementById('dh-inbox-list');
  if (_inboxListEl) {
    if (critCount > 0) {
      // Auto-open critical folder if there are Halaxy no-invoice issues
      _dhInboxFilter = 'critical';
      document.querySelectorAll('.dh-inbox-folder').forEach(function(f) {
        f.classList.toggle('active', f.dataset.status === 'critical');
      });
      _dhRenderSessionItems(_inboxListEl, _dhHalaxyNoInvoice, 'critical');
    } else if (unlinkedCount > 0) {
      // Auto-open unlinked if that's the only issue
      _dhInboxFilter = 'unlinked';
      document.querySelectorAll('.dh-inbox-folder').forEach(function(f) {
        f.classList.toggle('active', f.dataset.status === 'unlinked');
      });
      _dhRenderUnlinkedCalItems(_inboxListEl, _dhNotInHalaxy());
    } else {
      _dhRenderInboxItems(_inboxListEl, newEnquiries, 'new');
    }
  }
  _updateMobileDock('home');

  // Fire AI brief after DOM is painted (non-blocking)
  requestAnimationFrame(function() {
    var _now = new Date();
    _loadAIBrief({
      currentTime: _now.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }),
      todaySessions: todayAppts.map(function(a) {
        var startMs = a.startMs || (a.startIso ? new Date(a.startIso).getTime() : null);
        return { name: (a.name || 'Client').split(' ')[0], time: a.timeStr || (a.startIso ? _fmtT(a.startIso) : ''), done: startMs ? startMs < _now.getTime() : false };
      }),
      nextAppt: nextAppt ? {
        name: (nextAppt.name || nextAppt.patientName || 'Client').split(' ')[0],
        day:  nextAppt.dateStr !== todayIso
          ? new Date(nextAppt.dateStr + 'T00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
          : 'today',
        time: nextAppt.timeStr || (nextAppt.startIso ? _fmtT(nextAppt.startIso) : ''),
      } : null,
      critCount,
      awaitingPayCount,
      unlinkedCount,
      newEnquiries: newEnquiries.length,
    });
  });
}

/* ── Home view task helpers ─────────────────────────────────────
   Separate from the settings-view task system — these target the
   #dh-tasks-body widget on the dashboard home card.
────────────────────────────────────────────────────────────────── */
var _dhTasks = [];       // module-level cache for openDetailPanel lookup
var _dhTasksLoaded = false; // true once the first successful fetch completes

/* ── Mobile landing home view ────────────────────────────────────
 * Shows AI brief card, today's sessions mini-list, therapy quote.
 ────────────────────────────────────────────────────────────────── */
var _MOB_QUOTES = [
  { q: 'The curious paradox is that when I accept myself just as I am, then I can change.', a: 'Carl Rogers' },
  { q: 'Between stimulus and response there is a space. In that space is our power to choose our response.', a: 'Viktor Frankl' },
  { q: 'The privilege of a lifetime is to become who you truly are.', a: 'Carl Jung' },
  { q: 'Until you make the unconscious conscious, it will direct your life and you will call it fate.', a: 'Carl Jung' },
  { q: 'Vulnerability is not winning or losing. It\'s having the courage to show up when you can\'t control the outcome.', a: 'Brené Brown' },
  { q: 'The good life is a process, not a state of being.', a: 'Carl Rogers' },
  { q: 'What we don\'t need in the midst of struggle is shame for being human.', a: 'Brené Brown' },
  { q: 'Out of your vulnerabilities will come your strength.', a: 'Sigmund Freud' },
  { q: 'Owning our story and loving ourselves through that process is the bravest thing we\'ll ever do.', a: 'Brené Brown' },
  { q: 'The meeting of two personalities is like the contact of two chemical substances — if there is any reaction, both are transformed.', a: 'Carl Jung' },
];

function _mobRenderHome() {
  var content = document.getElementById('view-content');
  if (!content || !_pipelineData) return;

  var now      = new Date();
  function _fmtMobT(iso) { var d=new Date(iso),h=d.getHours(),m=d.getMinutes(); return (h%12||12)+':'+(m<10?'0':'')+m+(h>=12?'pm':'am'); }
  var todayIso = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  var _uniMob  = (_halaxyData && _halaxyData.connected) ? _buildUnifiedSessions() : { upcoming: [], past: [] };
  var allMob   = _uniMob.upcoming.concat(_uniMob.past);
  var h = now.getHours();
  // After 4pm (or no sessions remaining today), flip to tomorrow
  var todaySessAll = allMob.filter(function(a) {
    return a.dateStr === todayIso && a.status !== 'cancelled' && !_isPersonalAppt(a);
  }).sort(function(a,b){ return (a.startMs||0)-(b.startMs||0); });
  var remainingToday = todaySessAll.filter(function(a) { return !a.startMs || a.startMs > Date.now(); });

  var showTomorrow = h >= 16 || (h >= 12 && remainingToday.length === 0);
  var sessLabel, displaySess;

  if (showTomorrow) {
    var tomorrow    = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    var tomorrowIso = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth()+1).padStart(2,'0') + '-' + String(tomorrow.getDate()).padStart(2,'0');
    displaySess = allMob.filter(function(a) {
      return a.dateStr === tomorrowIso && a.status !== 'cancelled' && !_isPersonalAppt(a);
    }).sort(function(a,b){ return (a.startMs||0)-(b.startMs||0); });
    sessLabel = 'Tomorrow';
  } else {
    displaySess = todaySessAll;
    sessLabel   = 'Today';
  }

  var nextMob = _uniMob.upcoming.filter(function(a) {
    return a.status !== 'cancelled' && a.startMs && a.startMs > Date.now() && !_isPersonalAppt(a);
  }).sort(function(a,b){ return a.startMs-b.startMs; })[0];

  var noSessMsg = showTomorrow ? 'No sessions tomorrow' : 'No sessions today';
  var sessHtml = displaySess.length ? displaySess.map(function(a) {
    var nm = a.name || 'Client';
    var tm = a.timeStr || (a.startIso ? _fmtMobT(a.startIso) : '');
    return '<div class="mob-home-sess" onclick="openDetailPanel(\'session\',\'' + escHtml(String(a.id||'')) + '\')">'
      + '<div class="mob-home-sess-av ' + _dhAvCol(nm) + '">' + _dhIni(nm) + '</div>'
      + '<div class="mob-home-sess-info"><div class="mob-home-sess-name">' + escHtml(nm) + '</div>'
      + (tm ? '<div class="mob-home-sess-time">' + escHtml(tm) + '</div>' : '') + '</div>'
      + '<span style="color:var(--t3);font-size:18px;line-height:1">›</span></div>';
  }).join('')
  : '<div class="mob-home-no-sess">' + noSessMsg + '</div>';

  // Day-of-year index so quote changes daily but is stable across re-renders
  var doy   = Math.floor((now - new Date(now.getFullYear(),0,0)) / 86400000);
  var quote = _MOB_QUOTES[doy % _MOB_QUOTES.length];

  content.innerHTML =
    '<div class="mob-home-wrap">'
    // Briefing card — AI text + quote as sign-off
    + '<div class="mob-home-brief-card" id="mob-brief-card">'
    +   '<div class="mob-home-brief-label">Today\'s briefing</div>'
    +   '<div class="mob-home-brief-text ai-brief-streaming" id="mob-brief-text"><span class="ai-brief-loading"></span></div>'
    +   '<div class="mob-home-brief-signoff">'
    +     '<div class="mob-home-brief-quote">“' + escHtml(quote.q) + '”</div>'
    +     '<div class="mob-home-brief-attr">— ' + escHtml(quote.a) + '</div>'
    +   '</div>'
    + '</div>'
    // Sessions section
    + '<div class="mob-home-section">'
    +   '<div class="mob-home-sect-hd">' + sessLabel
    +   (displaySess.length ? '<span class="mob-home-sect-badge">' + displaySess.length + '</span>' : '') + '</div>'
    +   sessHtml
    + '</div>'
    + '</div>';

  _updateMobileDock('home');

  // Fire AI brief into the card
  var enquiries     = (_pipelineData && _pipelineData.enquiries) || [];
  var invoices      = (_halaxyData   && _halaxyData.invoices)    || [];
  var newEnqs       = enquiries.filter(function(e){ return (e.status||'new') === 'new'; });
  var critCnt       = (_dhHalaxyNoInvoice  || []).length;
  var unlinkedCnt   = _dhNotInHalaxy().length;
  var awaitPayCnt   = invoices.filter(function(i){ return i.status !== 'cancelled' && i.status !== 'draft' && parseFloat(i.totalBalance||0) > 0; }).length;
  var _mobNow = new Date();
  _loadAIBrief({
    currentTime: _mobNow.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }),
    todaySessions: todaySessAll.map(function(a) {
      var startMs = a.startMs || (a.startIso ? new Date(a.startIso).getTime() : null);
      return { name: (a.name||'Client').split(' ')[0], time: a.timeStr||(a.startIso?_fmtMobT(a.startIso):''), done: startMs ? startMs < _mobNow.getTime() : false };
    }),
    nextAppt: nextMob ? {
      name: (nextMob.name||nextMob.patientName||'Client').split(' ')[0],
      day:  nextMob.dateStr !== todayIso ? new Date(nextMob.dateStr+'T00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'}) : 'today',
      time: nextMob.timeStr||(nextMob.startIso?_fmtMobT(nextMob.startIso):''),
    } : null,
    critCount: critCnt, awaitingPayCount: awaitPayCnt, unlinkedCount: unlinkedCnt,
    newEnquiries: newEnqs.length,
  }, 'mob-brief-text');
}

/* ── AI receptionist brief ───────────────────────────────────────
 * Calls /api/admin-tasks?brief=1 with current dashboard data and
 * fades the response in as styled paragraph chunks.
 * Accepts optional targetId (defaults to 'dh-hd-meta').
 * Caches per date+hour in sessionStorage so refreshes within the
 * same hour reuse the cached text without hitting the API.
 ────────────────────────────────────────────────────────────────── */
async function _loadAIBrief(data, targetId) {
  var metaEl = document.getElementById(targetId || 'dh-hd-meta');
  if (!metaEl) return;

  // Cache key: target + date + hour so each surface caches independently
  var now      = new Date();
  var cacheKey = 'ai-brief-' + (targetId || 'dh-hd-meta') + '-' + now.toISOString().slice(0, 13);
  var cached   = sessionStorage.getItem(cacheKey);
  if (cached) {
    metaEl.innerHTML = cached;
    return;
  }

  // Show a subtle pulsing placeholder while the API responds
  metaEl.innerHTML = '<span class="ai-brief-loading">&#8203;</span>';
  metaEl.classList.add('ai-brief-streaming');

  try {
    var _briefCtrl    = new AbortController();
    var _briefTimeout = setTimeout(function() { _briefCtrl.abort(); }, 12000);
    var resp = await fetch('/api/admin-tasks?brief=1', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
      signal:  _briefCtrl.signal,
    });
    clearTimeout(_briefTimeout);

    if (!resp.ok) throw new Error('brief ' + resp.status);

    var result = await resp.json();
    var text   = (result.text || '').trim();
    if (!text) throw new Error('empty brief');

    // Split into paragraphs on blank lines or double-newlines; fall back to single newlines
    var paras = text.split(/\n\n+/).map(function(p){ return p.replace(/\n/g, ' ').trim(); }).filter(Boolean);
    if (paras.length === 1) {
      // Try splitting on single newlines if no double-newlines found
      var single = text.split(/\n/).map(function(p){ return p.trim(); }).filter(Boolean);
      if (single.length > 1) paras = single;
    }

    // Build HTML: each paragraph gets its own styled element
    var html = paras.map(function(p) {
      return '<p class="ai-brief-para">' + p.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</p>';
    }).join('');

    metaEl.classList.remove('ai-brief-streaming');
    metaEl.innerHTML = html;
    metaEl.classList.add('ai-brief-pulse-in');
    metaEl.addEventListener('animationend', function() {
      metaEl.classList.remove('ai-brief-pulse-in');
    }, { once: true });

    try { sessionStorage.setItem(cacheKey, metaEl.innerHTML); } catch(_) {}

  } catch (err) {
    // Silent fallback — clear loading state
    metaEl.classList.remove('ai-brief-streaming');
    if (!metaEl.textContent.trim()) metaEl.innerHTML = '';
  }
}

async function _dhLoadTasks() {
  try {
    var tasks = await apiFetch('/api/admin-tasks');
    _dhTasks = Array.isArray(tasks) ? tasks : [];
    _dhTasksLoaded = true;
    _dhRenderRemindBento();
    // Legacy settings view tasks widget
    var body = document.getElementById('dh-tasks-body');
    if (body) {
      body.innerHTML = !_dhTasks.length ? '<div class="dh-tasks-empty">No tasks yet</div>'
        : _dhTasks.map(function(t) {
            var done = t.completed ? ' done' : '';
            var chk  = t.completed ? '✓' : '';
            return '<div class="dh-task-item' + done + '" data-id="' + escHtml(String(t.id)) + '">'
              + '<button class="dh-task-chk" onclick="dhToggleTask(' + JSON.stringify(t.id) + ',' + !t.completed + ')" type="button">' + chk + '</button>'
              + '<span class="dh-task-lbl">' + escHtml(t.title || t.text || '') + '</span>'
              + '<button class="dh-task-arrow" onclick="openDetailPanel(\'task\',\'' + escHtml(String(t.id)) + '\')" type="button">›</button>'
              + '</div>';
          }).join('');
    }
  } catch(e) {
    var listEl = document.getElementById('dh-util-remind-list');
    if (listEl) listEl.innerHTML = '<div class="dh-tasks-empty">Could not load</div>';
  }
}

/* Render the task list inside the home bento reminders widget */
function _dhRenderRemindBento() {
  var listEl = document.getElementById('dh-util-remind-list');
  if (!listEl) return;
  var pending = _dhTasks.filter(function(t){ return !t.completed; });
  var badge   = document.getElementById('dh-util-remind-badge');
  if (badge) {
    badge.textContent = pending.length || '';
    badge.style.display = pending.length ? '' : 'none';
  }
  // Update sort button label
  var sortBtn = document.getElementById('dh-remind-sort-btn');
  if (sortBtn) sortBtn.textContent = 'Sort: ' + _dhRemindSort;

  if (!_dhTasks.length) {
    listEl.innerHTML = '<div class="dh-tasks-empty">No reminders yet</div>';
    return;
  }

  // Sort
  var sorted = _dhTasks.slice();
  if (_dhRemindSort === 'priority') {
    // High → Normal → Low, then newest date within each tier
    var _prioOrder = { high: 0, normal: 1, low: 2 };
    sorted.sort(function(a, b) {
      var pa = _prioOrder[_dhGetPrio(a.id)] !== undefined ? _prioOrder[_dhGetPrio(a.id)] : 1;
      var pb = _prioOrder[_dhGetPrio(b.id)] !== undefined ? _prioOrder[_dhGetPrio(b.id)] : 1;
      if (pa !== pb) return pa - pb;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  } else {
    // date: newest first
    sorted.sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
  }

  function _fmtAdded(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  listEl.innerHTML = sorted.map(function(t) {
    var done   = t.completed ? ' done' : '';
    var prio   = _dhGetPrio(t.id);
    var prioDot = prio === 'high' ? '<span class="dh-prio-dot high" onclick="event.stopPropagation();dhSetTaskPrio(' + JSON.stringify(t.id) + ',\'normal\')" title="High priority — click to clear">!</span> '
                : prio === 'low'  ? '<span class="dh-prio-dot low"  onclick="event.stopPropagation();dhSetTaskPrio(' + JSON.stringify(t.id) + ',\'normal\')" title="Low priority — click to clear"></span> '
                : '<span class="dh-prio-dot" onclick="event.stopPropagation();dhSetTaskPrio(' + JSON.stringify(t.id) + ',\'high\')" title="Set high priority"></span> ';
    var client  = t.client_label ? escHtml(t.client_label) : '<span style="color:var(--t3)">—</span>';
    var prioLabel = prio === 'high' ? '<span class="dh-prio-badge">High</span>'
                  : prio === 'low'  ? '<span class="dh-prio-badge low">Low</span>'
                  : '<span class="dh-prio-badge dim">—</span>';
    var descHtml  = t.description ? '<div class="dh-rt-desc">' + escHtml(t.description) + '</div>' : '';
    return '<div class="dh-rt-row' + done + '" data-id="' + escHtml(String(t.id)) + '" onclick="openDetailPanel(\'task\',\'' + escHtml(String(t.id)) + '\')" style="cursor:pointer">'
      + '<button class="dh-task-chk" onclick="event.stopPropagation();dhToggleTask(' + JSON.stringify(t.id) + ',' + !t.completed + ')" type="button">' + (t.completed ? '✓' : '') + '</button>'
      + '<div class="dh-rt-title-wrap">' + prioDot + '<div><div class="dh-rt-title-text">' + escHtml(t.title || t.text || '') + '</div>' + descHtml + '</div></div>'
      + '<div class="dh-rt-client">' + client + '</div>'
      + '<div class="dh-rt-prio">' + prioLabel + '</div>'
      + '<div class="dh-rt-date">' + _fmtAdded(t.created_at) + '</div>'
      + '</div>';
  }).join('');
}

/* ── Billing bento — live invoice list + paid toggle ─────────────── */
function _dhRenderBillingBento() {
  var inner = document.getElementById('dh-bill-bento-inner');
  if (!inner) return;

  var now      = new Date();
  var invoices = (_halaxyData && _halaxyData.invoices) || [];
  var monthStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  var fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  var fyStart  = fyStartYear + '-07-01';
  var fyLabel  = 'FY' + fyStartYear + '–' + String(fyStartYear + 1).slice(2);

  // Paid amount (togglable MTD / FY)
  var paidAmt = invoices.reduce(function(sum, inv) {
    if (!_invIsPaid(inv) || !inv.date) return sum;
    if (_dhBillMode === 'mtd' && !inv.date.startsWith(monthStr)) return sum;
    if (_dhBillMode === 'fy'  && inv.date < fyStart) return sum;
    return sum + (parseFloat(inv.totalPaid != null ? inv.totalPaid : (inv.amount || 0)));
  }, 0);

  var periodLabel = _dhBillMode === 'mtd'
    ? now.toLocaleDateString('en-AU', { month: 'long' })
    : fyLabel;

  // Outstanding — no date limit
  var outstanding = invoices.filter(function(inv) {
    return !_invIsPaid(inv) && inv.status !== 'cancelled' && inv.status !== 'draft';
  }).sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });

  var totalOwing = outstanding.reduce(function(s, inv) {
    return s + (parseFloat(inv.totalBalance != null ? inv.totalBalance : 0) || 0);
  }, 0);

  var html = '<div class="dh-bill-bento-bar">'
    + '<div class="dh-bill-bento-stat dh-bill-paid-toggle" onclick="dhBillToggleMode()" title="Toggle month / financial year">'
    + '<div class="dh-bbs-val teal">' + _fmtAUD(paidAmt) + '</div>'
    + '<div class="dh-bbs-lbl">Paid · ' + escHtml(periodLabel) + ' <span class="dh-bill-swap">↔</span></div>'
    + '</div>'
    + '<div class="dh-bill-bento-stat">'
    + '<div class="dh-bbs-val ' + (totalOwing ? 'amber' : 'teal') + '">' + _fmtAUD(totalOwing) + '</div>'
    + '<div class="dh-bbs-lbl">Outstanding · ' + outstanding.length + ' inv.</div>'
    + '</div>'
    + '</div>';

  // Invoice rows
  if (!outstanding.length && (_halaxyData && _halaxyData.connected)) {
    html += '<div class="dh-tasks-empty">No outstanding invoices ✓</div>';
  } else if (!_halaxyData || !_halaxyData.connected) {
    html += '<div class="dh-tasks-empty">Connect Halaxy in Settings</div>';
  } else {
    html += '<div class="dh-bill-inv-rows">';
    outstanding.slice(0, 10).forEach(function(inv) {
      var name = _resolvePatientName(inv.patientId);
      var dt   = inv.date ? new Date(inv.date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—';
      var _rawBal2 = parseFloat(inv.totalBalance != null ? inv.totalBalance : 0);
      var bal  = _rawBal2 > 0 ? _rawBal2 : parseFloat(inv.amount || 0);
      var sub  = _getSubStatus(inv.id);
      var _isAR2 = _invIsAwaitingRemittance(inv);
      var subBadge = _isAR2
        ? '<span class="dh-inv-sub" style="color:#FBBF24">Submitted · awaiting remittance</span>'
        : sub
          ? '<span class="dh-inv-sub ' + (sub.chase ? 'chase' : 'ok') + '">' + (sub.chase ? '⚠ Chase up' : '✓ Submitted') + '</span>'
          : '<button class="dh-inv-mark" onclick="event.stopPropagation();_markBillingSubmitted(\'' + escHtml(String(inv.id)) + '\')">Mark submitted</button>';
      var bentoRef = _fmtInvRef(inv);
      html += '<div class="dh-bill-inv-row" onclick="openInvoiceModal(\'' + escHtml(String(inv.id)) + '\')">'
        + '<div class="dh-bir-name">' + escHtml(name) + (bentoRef ? '<span class="dh-bir-ref">' + escHtml(bentoRef) + '</span>' : '') + '</div>'
        + '<span class="dh-bir-org' + (!inv.payorOrg ? ' dh-bir-org--dim' : '') + '">' + escHtml(inv.payorOrg || 'Private') + '</span>'
        + '<div class="dh-bir-action">' + subBadge + '</div>'
        + '<div class="dh-bir-right">'
        + '<span class="dh-bir-amt">' + (bal ? _fmtAUD(bal) : '—') + '</span>'
        + '<span class="dh-bir-date">' + escHtml(dt) + '</span>'
        + '</div>'
        + '</div>';
    });
    if (outstanding.length > 10) {
      html += '<div class="dh-bill-see-all" style="cursor:default;opacity:0.55">Showing 10 of ' + outstanding.length + ' outstanding</div>';
    }
    html += '</div>';
  }

  inner.innerHTML = html;
}

/* ── Task detail panel (desktop right-panel edit form) ───────── */
function _renderTaskDetailPanel(t) {
  var created = t.created_at
    ? new Date(t.created_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  var prio = _dhGetPrio(t.id);
  var tid  = escHtml(String(t.id));
  var sid  = JSON.stringify(t.id);

  // Shared save pill style (teal, small, absolute)
  var savePillStyle = 'display:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600'
    + ';background:rgba(52,211,153,0.14);border:1px solid rgba(52,211,153,0.28);color:#34D399'
    + ';cursor:pointer;font-family:inherit;flex-shrink:0';

  var html = '';

  // Date + status
  html += '<div class="m-meta">'
    + escHtml(created)
    + ' · ' + (t.completed
      ? '<span class="m-chip m-chip-teal">Done</span>'
      : '<span class="m-chip m-chip-dim">Active</span>')
    + '</div>';

  // ── Title row: input + Save pill on the right, revealed on edit
  html += '<div style="display:flex;align-items:center;gap:8px;margin-top:10px">'
    +   '<input class="rdp-title-input" id="rdp-task-title-' + tid + '" type="text"'
    +     ' value="' + escHtml(t.title || '') + '" placeholder="Reminder title…"'
    +     ' style="flex:1;min-width:0"'
    +     ' oninput="_rdpShowSave(\'' + tid + '\')">'
    +   '<button id="rdp-save-' + tid + '" onclick="dhSaveTaskEdit(' + sid + ')" style="' + savePillStyle + '">Save</button>'
    + '</div>';

  // ── Description: textarea with Save pill at bottom-right, revealed on edit
  html += '<div style="position:relative;margin-top:10px">'
    +   '<textarea class="m-input rdp-task-desc" id="rdp-task-desc-' + tid + '"'
    +     ' placeholder="Description…" rows="3" style="margin-bottom:0;padding-bottom:36px"'
    +     ' oninput="_rdpShowSaveDesc(\'' + tid + '\')">'
    +     escHtml(t.description || '')
    +   '</textarea>'
    +   '<button id="rdp-save-desc-' + tid + '" onclick="dhSaveTaskEdit(' + sid + ')"'
    +     ' style="' + savePillStyle + ';position:absolute;bottom:8px;right:8px">Save</button>'
    + '</div>';

  // ── Client with existing-client dropdown
  html += '<div style="position:relative;margin-top:8px">'
    +   '<input class="m-input" id="rdp-task-client-' + tid + '" type="text"'
    +     ' value="' + escHtml(t.client_label || '') + '" placeholder="Client (optional)"'
    +     ' style="margin-bottom:0"'
    +     ' onfocus="_rdpClientFocus(\'' + tid + '\')"'
    +     ' oninput="_rdpClientInput(\'' + tid + '\',this.value)"'
    +     ' onblur="setTimeout(function(){var d=document.getElementById(\'rdp-client-dd-' + tid + '\');if(d)d.style.display=\'none\'},200)">'
    +   '<div id="rdp-client-dd-' + tid + '"'
    +     ' style="display:none;position:absolute;top:calc(100% + 3px);left:0;right:0'
    +       ';background:rgba(10,16,28,0.98);border:1px solid rgba(255,255,255,0.12);border-radius:10px'
    +       ';z-index:200;overflow:hidden;max-height:180px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.4)">'
    +   '</div>'
    + '</div>';

  // ── Priority pills — click auto-saves to localStorage immediately (no Save pill)
  html += '<div class="rdp-prio-pills" id="rdp-task-prio-' + tid + '" data-prio="' + prio + '" style="margin-top:10px">'
    + '<button class="rdp-prio-pill low' + (prio === 'low' ? ' active' : '') + '"'
    +   ' onclick="rdpSetPrio(\'' + tid + '\',\'low\');dhSetTaskPrio(' + sid + ',\'low\')" type="button">Low</button>'
    + '<button class="rdp-prio-pill' + (prio === 'normal' ? ' active' : '') + '"'
    +   ' onclick="rdpSetPrio(\'' + tid + '\',\'normal\');dhSetTaskPrio(' + sid + ',\'normal\')" type="button">Normal</button>'
    + '<button class="rdp-prio-pill high' + (prio === 'high' ? ' active' : '') + '"'
    +   ' onclick="rdpSetPrio(\'' + tid + '\',\'high\');dhSetTaskPrio(' + sid + ',\'high\')" type="button">High</button>'
    + '</div>';

  // ── Bottom bar: Mark as done (small) on left, Delete on right
  html += '<div style="display:flex;align-items:center;gap:10px'
    + ';margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)">'
    + (t.completed
      ? '<button onclick="dhToggleTask(' + sid + ',false);closeDetailPanel()"'
          + ' style="padding:5px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit'
          + ';background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5)">'
          + 'Mark as active</button>'
      : '<button onclick="dhToggleTask(' + sid + ',true);closeDetailPanel()"'
          + ' style="padding:5px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit'
          + ';background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.45)">'
          + 'Mark as done</button>')
    + '<div style="flex:1"></div>'
    + '<button class="m-btn-danger" onclick="dhDeleteTaskFromPanel(' + sid + ')">Delete</button>'
    + '</div>';

  return html;
}

function _rdpShowSave(tid) {
  var btn = document.getElementById('rdp-save-' + tid);
  if (btn) btn.style.display = '';
}
function _rdpShowSaveDesc(tid) {
  var btn = document.getElementById('rdp-save-desc-' + tid);
  if (btn) btn.style.display = '';
}

/* Client dropdown for task detail panel */
function _rdpClientFocus(tid) { _rdpRenderClientDropdown(tid, document.getElementById('rdp-task-client-' + tid) ? document.getElementById('rdp-task-client-' + tid).value : ''); }
function _rdpClientInput(tid, val) {
  _rdpShowSave(tid);
  _rdpRenderClientDropdown(tid, val);
}
function _rdpRenderClientDropdown(tid, query) {
  var dd = document.getElementById('rdp-client-dd-' + tid);
  if (!dd) return;
  var clients = (_pipelineData && _pipelineData.clients) || [];
  var q = (query || '').toLowerCase().trim();
  var matches = clients.filter(function(c) {
    return !q || (c.display_name || '').toLowerCase().indexOf(q) !== -1;
  }).slice(0, 8);
  if (!matches.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = matches.map(function(c) {
    return '<div class="rdp-client-opt" onmousedown="event.preventDefault();_rdpSelectClient(\'' + tid + '\',\'' + escHtml(c.display_name || '') + '\')">'
      + escHtml(c.display_name || '') + '</div>';
  }).join('');
  dd.style.display = '';
}
function _rdpSelectClient(tid, name) {
  var inp = document.getElementById('rdp-task-client-' + tid);
  if (inp) { inp.value = name; inp.focus(); }
  var dd = document.getElementById('rdp-client-dd-' + tid);
  if (dd) dd.style.display = 'none';
  _rdpShowSave(tid);
}

function rdpSetPrio(tid, prio) {
  var wrap = document.getElementById('rdp-task-prio-' + tid);
  if (!wrap) return;
  wrap.dataset.prio = prio;
  wrap.querySelectorAll('.rdp-prio-pill').forEach(function(btn) {
    btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === prio);
  });
}

async function dhSaveTaskEdit(id) {
  var titleInp  = document.getElementById('rdp-task-title-'  + id);
  var descInp   = document.getElementById('rdp-task-desc-'   + id);
  var clientInp = document.getElementById('rdp-task-client-' + id);
  var prioWrap  = document.getElementById('rdp-task-prio-'   + id);

  var newTitle  = titleInp  ? titleInp.value.trim()  : '';
  var newDesc   = descInp   ? descInp.value.trim()   : null;
  var newClient = clientInp ? clientInp.value.trim()  : null;

  if (!newTitle) { toast('Title is required', 'err'); return; }
  try {
    await apiFetch('/api/admin-tasks?id=' + encodeURIComponent(id), {
      method: 'PATCH',
      body: {
        title:        newTitle,
        description:  newDesc   || null,
        client_label: newClient || null,
      }
    });
    /* Update local cache */
    var t = _dhTasks.find(function(x) { return String(x.id) === String(id); });
    if (t) { t.title = newTitle; t.description = newDesc; t.client_label = newClient; }
    /* Hide both save pills — stay on panel */
    ['rdp-save-', 'rdp-save-desc-'].forEach(function(prefix) {
      var btn = document.getElementById(prefix + id);
      if (btn) btn.style.display = 'none';
    });
    toast('Saved');
    _dhRenderRemindBento();
  } catch(e) {
    toast('Could not save: ' + e.message, 'err');
  }
}

/* Legacy alias kept for any remaining callers */
async function dhUpdateTaskTitle(id) { return dhSaveTaskEdit(id); }

async function dhDeleteTaskFromPanel(id) {
  try {
    await apiFetch('/api/admin-tasks?id=' + encodeURIComponent(id), { method: 'DELETE' });
    _dhTasks = _dhTasks.filter(function(t) { return String(t.id) !== String(id); });
    closeDetailPanel();
    // Refresh all surfaces that show reminders
    _dhRenderRemindBento();
    if (typeof _mobRenderReminders === 'function') _mobRenderReminders();
    if (typeof renderHomeView === 'function' && _currentView === 'home') renderHomeView();
    toast('Reminder deleted');
  } catch(e) {
    toast('Could not delete: ' + e.message, 'err');
  }
}

function dhToggleTask(id, completed) {
  // Optimistic update in _dhTasks cache
  var t = _dhTasks.find(function(x){ return String(x.id) === String(id); });
  if (t) t.completed = completed;
  _dhRenderRemindBento();
  if (completed) _showSuccess('mark', 'Done');
  apiFetch('/api/admin-tasks?id=' + id, { method: 'PATCH', body: { completed: completed } })
    .catch(function() {
      // Revert on failure
      if (t) t.completed = !completed;
      _dhRenderRemindBento();
    });
}

async function dhAddTask(ev) {
  if (ev.key !== 'Enter') return;
  var inp  = document.getElementById('dh-task-inp');
  var text = inp ? inp.value.trim() : '';
  if (!text) return;
  inp.value = ''; inp.disabled = true;
  try {
    var t = await apiFetch('/api/admin-tasks', { method: 'POST', body: { title: text } });
    if (t && t.id) {
      _dhTasks.push(t);
      _dhRenderRemindBento();
      toast('Reminder added');
    }
  } catch(e) {
    if (inp) inp.value = text;
    toast('Could not add reminder', 'err');
  }
  if (inp) inp.disabled = false;
}

/* ── Intake link picker modal ───────────────────────────────────
   Quick-copy the right Halaxy intake URL per funder type.
   Triggered by the "Send Intake" quick-action chip on the home view.
───────────────────────────────────────────────────────────────── */
function openIntakePicker() {
  var entries = [
    { label: 'Private / New Patient', key: 'new',       cls: 'db-badge-grey' },
    { label: 'NDIS Plan-Managed',      key: 'ndis_plan', cls: 'db-badge-teal' },
    { label: 'Medicare',               key: 'medicare',  cls: 'db-badge-blue' },
    { label: 'QFES EAP',              key: 'qfes',      cls: 'db-badge-purple' },
    { label: 'DVA / ADFHSC',          key: 'dva',        cls: 'db-badge-purple' },
    { label: 'WorkCover QLD',          key: 'workcover', cls: 'db-badge-amber' },
  ];

  var rows = entries.map(function(e) {
    var url    = HALAXY_URLS[e.key] || '';
    var hasUrl = !!url;
    var safeUrl = url.replace(/'/g, '%27');
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.05)">'
      + '<span class="db-badge ' + e.cls + '" style="min-width:130px;justify-content:center;font-size:10.5px">' + escHtml(e.label) + '</span>'
      + (hasUrl
        ? '<button class="db-lead-action-btn db-lead-action-btn--reply" style="font-size:11px;padding:4px 11px"'
          + ' onclick="navigator.clipboard.writeText(\'' + safeUrl + '\');toast(\'Intake link copied!\',\'ok\')">Copy link</button>'
        : '<span style="font-size:11px;color:var(--db-t3);font-style:italic">URL not configured</span>')
      + (hasUrl
        ? '<a href="' + escHtml(url) + '" target="_blank" style="font-size:11.5px;color:var(--db-teal);text-decoration:none;font-weight:600;white-space:nowrap">Open ↗</a>'
        : '<button class="db-lead-action-btn" style="font-size:10.5px;padding:4px 10px" onclick="navigateTo(\'settings\');this.closest(\'.db-modal-overlay\').remove()">Configure</button>')
      + '</div>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.className = 'db-modal-overlay open';
  overlay.onclick = function(ev) { if (ev.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div class="db-modal" style="width:460px">'
    + '<div class="db-modal-hdr">'
    + '<div><div class="db-modal-title">Send Intake Form</div>'
    + '<div class="db-modal-sub">Copy the right intake link for each funder type</div></div>'
    + '<button class="db-modal-close" onclick="this.closest(\'.db-modal-overlay\').remove()">×</button>'
    + '</div>'
    + '<div class="db-modal-body" style="gap:0;padding:16px 24px">' + rows + '</div>'
    + '<div class="db-modal-ftr" style="justify-content:space-between">'
    + '<span style="font-size:11.5px;color:var(--db-t3)">Intake URLs are configured in Settings → Halaxy</span>'
    + '<button class="db-btn-primary" onclick="this.closest(\'.db-modal-overlay\').remove()">Done</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
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

  var enquiries = (_pipelineData.enquiries || []);

  // ── Column definitions (exclude 'closed') ─────────────────
  var columns = [
    { key: 'new',       label: 'NEW',       color: 'var(--dk-amber)'  },
    { key: 'contacted', label: 'CONTACTED', color: 'var(--dk-blue)'   },
    { key: 'booked',    label: 'BOOKED',    color: 'var(--dk-purple)' },
    { key: 'converted', label: 'CONVERTED', color: 'var(--dk-teal)'   },
  ];

  // Advance status sequence
  var _nextStatus = { 'new': 'contacted', 'contacted': 'booked', 'booked': 'converted' };
  var _advanceLabel = { 'new': 'Mark Contacted', 'contacted': 'Mark Booked', 'booked': 'Mark Converted' };

  var html = '<div class="dkb-wrap"><div class="dkb-board">';

  columns.forEach(function(col) {
    var cards = enquiries.filter(function(e) {
      return (e.status || 'new') === col.key;
    });

    html += '<div class="dkb-col">'
      + '<div class="dkb-col-hdr">'
      + '<span class="dkb-col-title" style="color:' + col.color + '">' + col.label + '</span>'
      + '<span class="dkb-col-count">' + cards.length + '</span>'
      + '</div>'
      + '<div class="dkb-cards">';

    if (cards.length === 0) {
      html += '<div class="dkb-col-empty">No ' + col.label.toLowerCase() + ' enquiries</div>';
    } else {
      cards.forEach(function(e) {
        var eid      = escHtml(String(e.id || ''));
        var name     = escHtml([e.first_name, e.last_name].filter(Boolean).join(' ') || 'Unknown');
        var email    = escHtml(e.email || '');
        var phone    = escHtml(e.phone || '');
        var src      = e.source ? '<span class="dkb-card-src">' + escHtml(e.source) + '</span>' : '';
        var preview  = e.message ? (e.message.length > 80 ? e.message.slice(0, 80) + '…' : e.message) : '';
        var notes    = escHtml(e.notes || '');
        var nextSt   = _nextStatus[col.key] || null;
        var advBtn   = nextSt
          ? '<button class="dkb-card-advance" onclick="apiFetch(\'/api/admin-enquiries?id=' + eid + '\',{method:\'PATCH\',body:{status:\'' + nextSt + '\'}}).then(function(){renderQueueView()}).catch(function(e){toast(e.message,\'err\')})">'
            + escHtml(_advanceLabel[col.key]) + '</button>'
          : '<span class="dkb-card-done">✓ Done</span>';

        html += '<div class="dkb-card">'
          + '<div class="dkb-card-name">' + name + '</div>'
          + src
          + '<div class="dkb-card-contact">' + email + (email && phone ? ' · ' : '') + phone + '</div>'
          + (preview ? '<div class="dkb-card-preview">' + escHtml(preview) + '</div>' : '')
          + '<textarea class="dkb-card-notes" placeholder="Notes…"'
          + ' onclick="event.stopPropagation()"'
          + ' onblur="apiFetch(\'/api/admin-enquiries?id=' + eid + '\',{method:\'PATCH\',body:{notes:this.value}}).catch(function(e){toast(e.message,\'err\')})">'
          + notes + '</textarea>'
          + '<div class="dkb-card-actions">'
          + advBtn
          + '<button class="dkb-card-close" onclick="apiFetch(\'/api/admin-enquiries?id=' + eid + '\',{method:\'PATCH\',body:{status:\'closed\'}}).then(function(){renderQueueView()}).catch(function(e){toast(e.message,\'err\')})">Close ✕</button>'
          + '</div>'
          + '</div>';
      });
    }

    html += '</div></div>'; // dkb-cards, dkb-col
  });

  html += '</div></div>'; // dkb-board, dkb-wrap
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
  var isUnlinked = !sess.patientId && (!sess.name || sess.name === 'Personal appointment');
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

  // Persist search state
  if (window._clientSearch === undefined) window._clientSearch = '';

  var allClients = (_pipelineData.clients || []).filter(function(c) { return c.active !== false; });

  // ── Helpers ──────────────────────────────────────────────────
  var _dclColors = ['av-teal','av-blue','av-purple','av-amber','av-red'];
  function _dclAvColor(name) {
    return _dclColors[(name || '').charCodeAt(0) % _dclColors.length];
  }
  function _dclInitials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  // Funder display map
  var _funderMap = {
    ndis_plan: 'NDIS', ndis_self: 'NDIS',
    medicare: 'Medicare', private: 'Private',
    qfes: 'QFES', workcover: 'WorkCover', dva: 'DVA'
  };
  function _funderLabel(f) { return _funderMap[f] || f || ''; }

  // Last session date from sessions array
  function _lastSessionDate(c) {
    var dates = (c.sessions || []).map(function(s) { return s.session_date || ''; }).filter(Boolean);
    return dates.length ? dates.reduce(function(mx, d) { return d > mx ? d : mx; }, '') : null;
  }

  // Relative date formatting
  var _now = new Date();
  function _relDate(iso) {
    if (!iso) return '';
    var d   = new Date(iso + 'T12:00:00');
    var ms  = _now.getTime() - d.getTime();
    var days = Math.round(ms / 86400000);
    if (days < 1)  return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7)  return days + ' days ago';
    if (days < 14) return '1 week ago';
    if (days < 30) return Math.floor(days / 7) + ' weeks ago';
    // Older than 30 days — show date
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  // ── Sort clients by most recent session ─────────────────────
  var sorted = allClients.slice().sort(function(a, b) {
    var da = _lastSessionDate(a) || '';
    var db = _lastSessionDate(b) || '';
    return db > da ? 1 : db < da ? -1 : 0;
  });

  // ── Apply search ─────────────────────────────────────────────
  var searchQ = (window._clientSearch || '').trim().toLowerCase();
  var filtered = searchQ
    ? sorted.filter(function(c) { return (c.display_name || '').toLowerCase().indexOf(searchQ) !== -1; })
    : sorted.slice(0, 20);

  // ── Build HTML ───────────────────────────────────────────────
  var html = '<div class="dcl-wrap">';

  // Search bar
  html += '<div class="dcl-search-wrap">'
    + '<span class="dcl-search-icon">⌕</span>'
    + '<input class="dcl-search-input" type="text" placeholder="Search clients…"'
    + ' value="' + escHtml(window._clientSearch || '') + '"'
    + ' oninput="window._clientSearch=this.value;renderClientsView()">'
    + '</div>';

  html += '<div class="dcl-sec-label">' + (searchQ ? 'RESULTS' : 'RECENT') + '</div>';

  html += '<div class="dcl-list">';

  if (filtered.length === 0) {
    html += '<div class="dcl-empty">' + (searchQ ? 'No clients match "' + escHtml(searchQ) + '"' : 'No clients yet') + '</div>';
  } else {
    filtered.forEach(function(c) {
      var name     = c.display_name || '—';
      var av       = _dclAvColor(name);
      var ini      = _dclInitials(name);
      var fLabel   = _funderLabel(c.funder);
      var lastDate = _lastSessionDate(c);
      var relDate  = lastDate ? _relDate(lastDate) : 'No sessions';
      var cid      = escHtml(String(c.id || ''));
      html += '<div class="dcl-row" onclick="renderClientDetailView(\'' + cid + '\')">'
        + '<div class="dcl-av ' + av + '">' + escHtml(ini) + '</div>'
        + '<div class="dcl-body">'
        + '<div class="dcl-name">' + escHtml(name) + '</div>'
        + '<div class="dcl-meta">' + (fLabel ? escHtml(fLabel) + ' · ' : '') + 'Last seen ' + escHtml(relDate) + '</div>'
        + '</div>'
        + (fLabel ? '<span class="dcl-funder-badge">' + escHtml(fLabel) + '</span>' : '')
        + '<span class="dcl-arrow">›</span>'
        + '</div>';
    });
  }

  html += '</div>'; // dcl-list
  html += '</div>'; // dcl-wrap
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
        + (fyPaid > 0 ? ' <span style="font-size:11px;color:rgba(255,255,255,0.35);font-weight:400;margin-left:8px">$' + fyPaid.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' paid</span>' : '')
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
          var dpRef = _fmtInvRef(inv);
          return '<div class="cl-detail-inv-row">'
            + '<span style="flex:1;font-size:12px;color:rgba(255,255,255,0.4)">' + escHtml(dateStr) + (dpRef ? '<span style="font-size:10px;margin-left:6px;opacity:0.6">' + escHtml(dpRef) + '</span>' : '') + '</span>'
            + '<span style="font-weight:600;color:rgba(255,255,255,0.85)">' + (amount > 0 ? '$' + amount.toFixed(2) : '—') + '</span>'
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
    html += '<a class="rdp-ghost-btn" style="width:auto;padding:9px 18px;text-decoration:none" href="' + escHtml(_halaxyWebUrl ? _halaxyWebUrl + '/calendar' : 'https://www.halaxy.com/practitioner') + '" target="_blank" rel="noopener">View in Halaxy →</a>';
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
    var funderClass = { medicare: 'medicare', ndis: 'ndis', workcover: 'workcover', private: 'private' }[c.funder] || 'default';
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
   INVOICE TASK HELPERS
   ═══════════════════════════════════════════════════ */

/** Render the task list section inside an open invoice modal. */
function _invRenderTasks(invId, overlay) {
  var el = overlay.querySelector('#inv-task-list-' + CSS.escape(String(invId)));
  if (!el) return;
  var taskIds  = _invGetTaskIds(invId);
  // Use _dhTasks — the canonical module-level cache shared with Reminders
  var allTasks = _dhTasks || [];
  var linked   = taskIds.map(function(tid) {
    return allTasks.find(function(t) { return String(t.id) === String(tid); });
  }).filter(Boolean);

  if (!linked.length) {
    el.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,0.28);padding:6px 0 2px">No reminders yet</div>';
    return;
  }
  el.innerHTML = linked.map(function(t) {
    var done = !!t.completed;
    var tid  = escHtml(String(t.id));
    var eid  = escHtml(String(invId));
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0'
      + ';border-bottom:1px solid rgba(255,255,255,0.05)">'
      + '<button onclick="_invToggleTask(\'' + eid + '\',\'' + tid + '\',this)"'
      + ' style="width:18px;height:18px;flex-shrink:0;border-radius:5px;cursor:pointer'
      + ';border:1.5px solid ' + (done ? '#34D399' : 'rgba(255,255,255,0.22)') + ';'
      + 'background:' + (done ? '#34D399' : 'transparent') + ';font-size:10px;line-height:1'
      + ';color:#0a1218;display:flex;align-items:center;justify-content:center">'
      + (done ? '✓' : '') + '</button>'
      + '<span style="flex:1;font-size:12.5px;' + (done ? 'color:rgba(255,255,255,0.3);text-decoration:line-through' : 'color:rgba(255,255,255,0.8)') + '">'
      + escHtml(t.title || '') + '</span>'
      + '</div>';
  }).join('');
}

/** Toggle a reminder done/undone from inside the invoice modal. */
async function _invToggleTask(invId, taskId, btn) {
  var task = (_dhTasks || []).find(function(t) { return String(t.id) === String(taskId); });
  if (!task) return;
  var newVal = !task.completed;
  try {
    await apiFetch('/api/admin-tasks?id=' + encodeURIComponent(taskId), { method: 'PATCH', body: { completed: newVal } });
    task.completed = newVal;
    var overlay = btn.closest('.inv-modal-overlay');
    if (overlay) _invRenderTasks(invId, overlay);
    // Refresh reminders view / home if open
    if (_currentView === 'reminders') renderRemindersView();
    else if (_mobCurrentApp === 'reminders') _mobRenderReminders();
    else if (_currentView === 'home') renderHomeView();
  } catch(e) { toast(e.message, 'err'); }
}

/** Create a new reminder from the invoice modal quick-add field. */
async function _invAddTask(invId, overlay) {
  var input = overlay.querySelector('#inv-task-input-' + CSS.escape(String(invId)));
  if (!input) return;
  var title = input.value.trim();
  if (!title) return;
  input.value = '';
  try {
    var task = await apiFetch('/api/admin-tasks', { method: 'POST', body: { title: title } });
    // Push into _dhTasks — the single source of truth used by Reminders
    if (!Array.isArray(_dhTasks)) _dhTasks = [];
    _dhTasks.push(task);
    _dhTasksLoaded = true;
    _invLinkTask(invId, task.id);
    _invRenderTasks(invId, overlay);
    // Refresh reminders view / home if open
    if (_currentView === 'reminders') renderRemindersView();
    else if (_mobCurrentApp === 'reminders') _mobRenderReminders();
  } catch(e) { toast('Could not add reminder: ' + e.message, 'err'); }
}

/* ═══════════════════════════════════════════════════
   INVOICE DETAIL MODAL
   ═══════════════════════════════════════════════════ */

function openInvoiceModal(invId) {
  var invoices = (_halaxyData && _halaxyData.invoices) || [];
  var inv = invoices.find(function(i) { return String(i.id) === String(invId); });
  if (!inv) { toast('Invoice not found', 'err'); return; }

  var name     = _resolvePatientName(inv.patientId);
  var invRef   = _fmtInvRef(inv);
  var dt       = inv.date
    ? new Date(inv.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  // amt = gross billed amount (what was invoiced). Always use this for display.
  // bal = remaining balance (only positive when still owed).
  // Do NOT use bal for display — it's 0 for paid invoices regardless of payor.
  var amt      = parseFloat(inv.amount != null ? inv.amount : (inv.totalPaid || 0));
  var bal      = parseFloat(inv.totalBalance != null ? inv.totalBalance : 0);
  var paid     = _invIsPaid(inv);
  var awaitingRemit = _invIsAwaitingRemittance(inv); // funder invoice submitted, remittance not yet in
  var sub      = _getSubStatus(inv.id);

  // Look up the appointment time directly from Halaxy appointments (no date-range cutoff)
  var _invSessTime = '';
  if (inv.patientId && inv.date) {
    var _invDateStr = (inv.date || '').slice(0, 10);
    var _hAppts     = (_halaxyData && _halaxyData.appointments) || [];
    var _hAppt      = _hAppts.find(function(a) {
      var startStr = a.start || (a.period && a.period.start) || '';
      if (startStr.slice(0, 10) !== _invDateStr) return false;
      var pid = _apptPatientId(a);
      // Accept if patientId matches OR if the appointment has no patient (solo day, infer by date)
      return !pid || String(pid) === String(inv.patientId);
    });
    if (_hAppt) {
      var _apptStart = _hAppt.start || (_hAppt.period && _hAppt.period.start) || '';
      if (_apptStart) {
        try {
          var _apptTime = new Date(_apptStart).toLocaleTimeString('en-AU', {
            hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Brisbane'
          });
          if (_apptTime) _invSessTime = ' · ' + _apptTime;
        } catch(e) {}
      }
    }
  }

  // Reminders section visibility:
  // Paid invoices → only show if already-linked reminders exist.
  // Outstanding (incl. awaiting-remittance) → always show including the add-reminder input,
  // so you can set a follow-up while waiting on a funder.
  var _settled           = paid;
  var _hasLinkedTasks    = _invGetTaskIds(inv.id).length > 0;
  var _showReminders     = !_settled || _hasLinkedTasks;
  var _showAddReminder   = !_settled;

  // Status chip — use explicit hex so dark theme CSS vars can't interfere
  var statusHtml;
  if (paid) {
    statusHtml = '<span style="color:#34D399;font-weight:600">✓ Paid</span>';
  } else if (awaitingRemit) {
    // Funder invoice submitted via Halaxy — waiting on the funder's remittance.
    // Amber, and genuinely outstanding (money not yet received), but we're waiting
    // on the funder, not chasing the client.
    statusHtml = '<span style="color:#FBBF24;font-weight:600">Submitted to funder</span>'
      + '<span style="color:rgba(255,255,255,0.4);font-size:11px;margin-left:6px">· awaiting remittance</span>';
  } else if (sub) {
    statusHtml = sub.chase
      ? '<span style="color:#FBBF24;font-weight:600">⚠ Submitted ' + escHtml(sub.date) + ' — follow up</span>'
      : '<span style="color:#34D399;font-weight:600">✓ Submitted ' + escHtml(sub.date) + '</span>';
  } else {
    statusHtml = '<span style="color:#FBBF24;font-weight:600">Outstanding</span>';
  }

  var payorLabel = _resolvePayorLabel(inv.payorOrg);

  // Build direct Halaxy invoice URL: strip alphabetic prefix from FHIR ID
  // e.g. "FD-1096324559" → "1096324559", or use inv.ref if it's purely numeric
  var invNumericId = (inv.ref && /^\d+$/.test(String(inv.ref))) ? String(inv.ref)
    : String(inv.id || '').replace(/^[A-Za-z]+-/, '');
  var halaxyUrl = (_halaxyWebUrl && invNumericId)
    ? (_halaxyWebUrl + '/invoice/' + invNumericId)
    : (_halaxyWebUrl || 'https://www.halaxy.com/practitioner');

  // Linked Supabase client (for "Open client" button)
  var clients      = (_pipelineData && _pipelineData.clients) || [];
  var linkedClient = clients.find(function(c) { return String(c.halaxy_id) === String(inv.patientId); });

  // Primary action
  var primaryAction = '';
  if (!paid && !awaitingRemit) {
    if (sub) {
      primaryAction = '<button class="db-btn-ghost" onclick="_clearBillingSubmission(\'' + escHtml(String(inv.id)) + '\')">Clear submission</button>';
    } else {
      primaryAction = '<button class="db-btn-primary" onclick="_markBillingSubmitted(\'' + escHtml(String(inv.id)) + '\')">Mark submitted</button>';
    }
  }

  // Helper: one detail row — label left, value right, subtle divider
  function _row(label, value, valStyle) {
    return '<div style="display:flex;justify-content:space-between;align-items:center'
      + ';padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.06)">'
      + '<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.38)">'
      + label + '</span>'
      + '<span style="font-size:13px;font-weight:500;' + (valStyle || 'color:rgba(255,255,255,0.85)') + '">'
      + value + '</span>'
      + '</div>';
  }

  var overlay = document.createElement('div');
  overlay.className = 'db-modal-overlay open inv-modal-overlay';
  overlay.onclick   = function(ev) { if (ev.target === overlay) overlay.remove(); };

  overlay.innerHTML =
    '<div class="db-modal" style="width:400px;max-width:calc(100vw - 32px)">'
    // ── Header
    + '<div class="db-modal-hdr">'
    +   '<div style="min-width:0">'
    +     '<div class="db-modal-title" style="font-size:17px">' + escHtml(name) + '</div>'
    +     '<div style="margin-top:6px;font-size:13px">' + statusHtml + '</div>'
    +   '</div>'
    +   '<button class="db-modal-close" onclick="this.closest(\'.inv-modal-overlay\').remove()">×</button>'
    + '</div>'
    // ── Detail rows
    + '<div class="db-modal-body" style="padding:4px 24px 6px;gap:0">'
    // Amount — large top treatment
    +   '<div style="padding:16px 0 12px;border-bottom:1px solid rgba(255,255,255,0.06)">'
    +     '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.38);margin-bottom:4px">Amount</div>'
    +     '<div style="font-size:26px;font-weight:700;color:' + (paid ? '#34D399' : '#FBBF24') + ';letter-spacing:-0.02em">'
    +       (amt ? _fmtAUD(amt) : '—')
    +     '</div>'
    +   '</div>'
    +   _row('Date',    escHtml(dt + _invSessTime))
    +   _row('Funder',  escHtml(payorLabel || 'Private'))
    +   (function() {
          var rawInvRef = invRef || inv.id || '';
          if (!rawInvRef) return _row('Invoice', '—');
          var copyVal = escHtml(rawInvRef);
          return '<div style="display:flex;justify-content:space-between;align-items:center'
            + ';padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.06)">'
            + '<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.38)">Invoice</span>'
            + '<span style="display:flex;align-items:center;gap:7px">'
            +   '<span style="font-size:12px;font-weight:500;color:rgba(255,255,255,0.55);font-family:monospace">' + copyVal + '</span>'
            +   '<button onclick="navigator.clipboard.writeText(\'' + copyVal + '\').then(function(){var b=this;b.textContent=\'✓\';setTimeout(function(){b.textContent=\'⎘\'},1400)}.bind(this))"'
            +     ' title="Copy invoice ID"'
            +     ' style="width:22px;height:22px;border-radius:5px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06)'
            +       ';cursor:pointer;font-size:11px;color:rgba(255,255,255,0.45);display:flex;align-items:center;justify-content:center'
            +       ';transition:all 0.12s;flex-shrink:0">⎘</button>'
            + '</span>'
            + '</div>';
        })()
    // ── Remittance check (awaiting-remittance funder invoices only) ──
    +   (awaitingRemit
        ? '<div style="padding:14px 0 4px;border-bottom:1px solid rgba(255,255,255,0.06)">'
          +   '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:rgba(255,255,255,0.38);margin-bottom:8px">Remittance</div>'
          +   '<button id="inv-remit-btn" onclick="_checkRemittance(\'' + escHtml(String(inv.ref || invNumericId)) + '\',this)"'
          +     ' style="width:100%;padding:9px 12px;border-radius:8px;font-size:12.5px;cursor:pointer;font-family:inherit'
          +       ';background:rgba(251,191,36,0.10);border:1px solid rgba(251,191,36,0.28);color:#FBBF24;transition:all 0.12s">'
          +     '🔍 Check inbox for remittance</button>'
          +   '<div id="inv-remit-result" style="margin-top:9px"></div>'
          + '</div>'
        : '')
    // ── Tasks section (hidden on paid invoices unless linked reminders exist)
    +   (_showReminders
        ? '<div style="padding:14px 0 4px">'
          +   '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:rgba(255,255,255,0.38);margin-bottom:8px">Reminders</div>'
          +   '<div id="inv-task-list-' + escHtml(String(inv.id)) + '"></div>'
          +   (_showAddReminder
              ? '<button onclick="_openInvAddReminderModal(\'' + escHtml(String(inv.id)) + '\',\'' + escHtml(name) + '\')"'
                +   ' style="margin-top:10px;width:100%;padding:9px 12px;border-radius:8px;font-size:12.5px'
                +     ';cursor:pointer;font-family:inherit;text-align:left'
                +     ';background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09)'
                +     ';color:rgba(255,255,255,0.38);transition:all 0.12s">+ Add a reminder…</button>'
              : '')
          + '</div>'
        : '')
    + '</div>'
    // ── Footer actions
    + '<div class="db-modal-ftr" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
    +   '<div style="display:flex;gap:8px;align-items:center">'
    +     '<a class="db-btn-ghost" href="' + escHtml(halaxyUrl) + '" target="_blank" rel="noopener" style="text-decoration:none">View in Halaxy →</a>'
    +     (linkedClient
          ? '<button class="db-btn-ghost" onclick="this.closest(\'.inv-modal-overlay\').remove();openDetailPanel(\'client\',\'' + escHtml(String(linkedClient.id)) + '\')">Open client</button>'
          : '')
    +   '</div>'
    +   (primaryAction ? '<div>' + primaryAction + '</div>' : '')
    + '</div>'
    + '</div>';

  document.body.appendChild(overlay);
  // Render existing linked tasks now that the DOM is live
  _invRenderTasks(invId, overlay);
}

/* ── Remittance inbox check (awaiting-remittance invoices) ───────────
   Searches admin@ + reachout@ for the invoice number. A hit means the funder's
   money has arrived in the inbox even though Halaxy still shows it unpaid →
   go record/reconcile the payment in Halaxy. */
function _remitMsg(tone, msg) {
  var c = tone === 'amber' ? '#FBBF24' : tone === 'dim' ? 'rgba(255,255,255,0.5)' : '#34D399';
  return '<div style="font-size:12px;color:' + c + ';padding:6px 2px">' + msg + '</div>';
}
// Deep-link to the message in the correct mailbox. Gmail accepts an email
// address (not just a numeric index) in the /u/<acct>/ segment, so the link
// opens reachout@ / admin@ directly. #all/<id> jumps to the message.
function _remitGmailUrl(mailbox, id) {
  var acct = (mailbox && mailbox.indexOf('@') > -1) ? encodeURIComponent(mailbox) : '0';
  return 'https://mail.google.com/mail/u/' + acct + '/#all/' + encodeURIComponent(id);
}
// "Funder Name <accounts@x.com>" → "Funder Name"; bare address → the address.
function _remitFromName(from) {
  var m = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(from || '');
  return ((m ? m[1] : (from || '')).trim()) || '';
}
function _checkRemittance(invNum, btn) {
  var resultEl = document.getElementById('inv-remit-result');
  btn.disabled = true; btn.style.opacity = '0.7';
  btn.textContent = 'Searching admin@ + reachout@…';
  if (resultEl) resultEl.innerHTML = '';
  fetch('/api/admin-enquiries?check_remittance=' + encodeURIComponent(invNum))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      btn.disabled = false; btn.style.opacity = '1';
      btn.textContent = '🔍 Re-check inbox for remittance';
      if (!resultEl) return;
      if (d.found && d.hits && d.hits.length) {
        var rows = d.hits.slice(0, 3).map(function(h) {
          var when = h.internalDate
            ? new Date(h.internalDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
            : escHtml(h.date || '');
          var mbox = (h.mailbox || '').split('@')[0] || 'inbox';
          var who  = escHtml(_remitFromName(h.from)) || escHtml(mbox);
          var url  = _remitGmailUrl(h.mailbox, h.id);
          return '<a href="' + url + '" target="_blank" rel="noopener"'
            + ' style="display:flex;align-items:center;gap:11px;text-decoration:none;margin-top:6px'
            + ';padding:10px 12px;border-radius:9px;background:rgba(52,211,153,0.07);border:1px solid rgba(52,211,153,0.20);transition:background 0.12s"'
            + ' onmouseover="this.style.background=\'rgba(52,211,153,0.13)\'" onmouseout="this.style.background=\'rgba(52,211,153,0.07)\'">'
            + '<span style="font-size:14px;color:#34D399;flex:none">✓</span>'
            + '<span style="flex:1;min-width:0">'
            +   '<span style="display:block;font-size:12.5px;color:#E7F6EF;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + who + '</span>'
            +   '<span style="display:block;font-size:11px;color:rgba(255,255,255,0.45);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(h.subject) + ' · ' + when + '</span>'
            + '</span>'
            + '<span style="font-size:11.5px;color:rgba(52,211,153,0.85);flex:none;white-space:nowrap">Open in ' + escHtml(mbox) + ' ↗</span>'
            + '</a>';
        }).join('');
        resultEl.innerHTML = '<div style="font-size:11.5px;color:#34D399;font-weight:600;margin-bottom:2px">Remittance found — reconcile this invoice in Halaxy.</div>' + rows;
      } else if (d.errors && d.errors.length) {
        var e0 = d.errors[0];
        var notConnected = /no mailbox connected|insufficient|scope|invalid_grant|unauthor/i.test(e0.error || '');
        resultEl.innerHTML = _remitMsg('amber', notConnected
          ? 'Inbox search isn’t connected yet — re-authorise Google (Settings) to grant mailbox read access.'
          : 'Couldn’t search the inbox: ' + escHtml(e0.error || 'unknown error'));
      } else {
        resultEl.innerHTML = _remitMsg('dim', 'No remittance email found for #' + escHtml(invNum) + '. Do an advanced check manually.');
      }
    })
    .catch(function(e) {
      btn.disabled = false; btn.style.opacity = '1';
      btn.textContent = '🔍 Check inbox for remittance';
      if (resultEl) resultEl.innerHTML = _remitMsg('amber', 'Search failed: ' + escHtml(e.message));
    });
}

/* ── Full reminder creation modal (invoked from invoice modal) ─────── */
function _openInvAddReminderModal(invId, prefillClient) {
  var safeInvId = escHtml(String(invId));

  var modal = document.createElement('div');
  modal.className = 'db-modal-overlay open';
  modal.style.zIndex = '1001'; // stack above invoice modal (z-index 1000)
  modal.onclick = function(ev) { if (ev.target === modal) modal.remove(); };

  modal.innerHTML =
    '<div class="db-modal" style="width:380px;max-width:calc(100vw - 32px)">'
    + '<div class="db-modal-hdr">'
    +   '<div class="db-modal-title">Add reminder</div>'
    +   '<button class="db-modal-close" onclick="this.closest(\'.db-modal-overlay\').remove()">×</button>'
    + '</div>'
    + '<div class="db-modal-body" style="padding:8px 24px 16px;display:flex;flex-direction:column;gap:10px">'
    // Title
    +   '<input id="inv-rem-title" type="text" placeholder="Reminder title…" autofocus'
    +     ' style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px'
    +       ';padding:9px 12px;font-size:13px;color:rgba(255,255,255,0.85);font-family:inherit;outline:none;width:100%;box-sizing:border-box">'
    // Description
    +   '<textarea id="inv-rem-desc" placeholder="Notes or context… (optional)" rows="2"'
    +     ' style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px'
    +       ';padding:9px 12px;font-size:13px;color:rgba(255,255,255,0.85);font-family:inherit;outline:none;width:100%;box-sizing:border-box;resize:vertical"></textarea>'
    // Client
    +   '<input id="inv-rem-client" type="text" value="' + escHtml(prefillClient || '') + '" placeholder="Client (optional)"'
    +     ' style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px'
    +       ';padding:9px 12px;font-size:13px;color:rgba(255,255,255,0.85);font-family:inherit;outline:none;width:100%;box-sizing:border-box">'
    // Priority
    +   '<div class="rdp-prio-pills" id="inv-rem-prio" data-prio="normal">'
    +     '<button class="rdp-prio-pill low" onclick="invRemSetPrio(\'low\',this)" type="button">Low</button>'
    +     '<button class="rdp-prio-pill active" onclick="invRemSetPrio(\'normal\',this)" type="button">Normal</button>'
    +     '<button class="rdp-prio-pill high" onclick="invRemSetPrio(\'high\',this)" type="button">High</button>'
    +   '</div>'
    + '</div>'
    + '<div class="db-modal-ftr" style="justify-content:flex-end;gap:8px">'
    +   '<button class="db-btn-ghost" onclick="this.closest(\'.db-modal-overlay\').remove()">Cancel</button>'
    +   '<button class="db-btn-primary" onclick="_invSaveNewReminder(\'' + safeInvId + '\',this.closest(\'.db-modal-overlay\'))">Add reminder</button>'
    + '</div>'
    + '</div>';

  document.body.appendChild(modal);
  setTimeout(function() { var ti = document.getElementById('inv-rem-title'); if (ti) ti.focus(); }, 60);
}

function invRemSetPrio(prio, btn) {
  var wrap = btn.closest('[data-prio]');
  if (!wrap) return;
  wrap.dataset.prio = prio;
  wrap.querySelectorAll('button').forEach(function(b) {
    b.classList.toggle('active', b.textContent.trim().toLowerCase() === prio);
  });
}

async function _invSaveNewReminder(invId, modal) {
  var titleInp  = document.getElementById('inv-rem-title');
  var descInp   = document.getElementById('inv-rem-desc');
  var clientInp = document.getElementById('inv-rem-client');
  var prioWrap  = document.getElementById('inv-rem-prio');

  var title  = titleInp  ? titleInp.value.trim()  : '';
  var desc   = descInp   ? descInp.value.trim()   : '';
  var client = clientInp ? clientInp.value.trim()  : '';
  var prio   = prioWrap  ? (prioWrap.dataset.prio || 'normal') : 'normal';

  if (!title) {
    if (titleInp) { titleInp.style.borderColor = '#fb7185'; titleInp.focus(); }
    return;
  }

  try {
    var task = await apiFetch('/api/admin-tasks', {
      method: 'POST',
      body: { title: title, description: desc || null, client_label: client || null }
    });
    if (task && task.id) {
      _dhTasks.push(task);
      _dhTasksLoaded = true;
      _invLinkTask(invId, task.id);
      dhSetTaskPrio(task.id, prio);
      modal.remove();
      // Refresh task list inside the invoice modal
      var invOverlay = document.querySelector('.inv-modal-overlay');
      if (invOverlay) _invRenderTasks(invId, invOverlay);
      // Refresh reminders views
      _dhRenderRemindBento();
      if (typeof _mobRenderReminders === 'function') _mobRenderReminders();
      if (typeof renderRemindersView === 'function' && _currentView === 'reminders') renderRemindersView();
      toast('Reminder added');
    }
  } catch(e) {
    toast('Could not add reminder: ' + e.message, 'err');
  }
}

/* ═══════════════════════════════════════════════════
   BILLING VIEW (legacy — desktop routing removed; kept for renderBillingPanel reference)
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

  // Paid amounts — only count invoices where totalBalance=0 (fully paid)
  // Halaxy has no payment-date field; invoice date is the best proxy
  var ytd = invoices.reduce(function(sum, inv) {
    if (!inv.date || inv.date < fyStart) return sum;
    if (!_invIsPaid(inv)) return sum;
    return sum + (parseFloat(inv.totalPaid != null ? inv.totalPaid : (inv.amount || 0)));
  }, 0);

  var mtd = invoices.reduce(function(sum, inv) {
    if (!inv.date || !inv.date.startsWith(monthStr)) return sum;
    if (!_invIsPaid(inv)) return sum;
    return sum + (parseFloat(inv.totalPaid != null ? inv.totalPaid : (inv.amount || 0)));
  }, 0);

  // Outstanding — all unpaid, no date limit
  var outstandingInvs = invoices.filter(function(inv) {
    return !_invIsPaid(inv) && inv.status !== 'cancelled' && inv.status !== 'draft';
  });
  var owing = outstandingInvs.reduce(function(sum, inv) {
    var bal = parseFloat(inv.totalBalance);
    return sum + (bal > 0 ? bal : 0);
  }, 0);

  function fmt(n) { return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  var html = '<div class="billing-view">';
  html += '<div class="billing-view-hd"><span class="view-title">Billing</span></div>';

  // Summary cards — paid stat is a toggle card
  html += '<div class="bill-summary">';
  html += '<div class="bill-stat bill-stat-toggle" onclick="dhBillToggleMode();renderBillingView()" title="Toggle period" style="cursor:pointer">'
    + '<div class="bill-stat-label">' + (_dhBillMode === 'mtd' ? 'Paid · Month to Date' : 'Paid · Financial Year') + ' <span style="font-size:10px;opacity:0.5">↔</span></div>'
    + '<div class="bill-stat-val' + ((_dhBillMode === 'mtd' ? mtd : ytd) === 0 ? ' zero' : '') + '">' + fmt(_dhBillMode === 'mtd' ? mtd : ytd) + '</div>'
    + '<div class="bill-stat-sub">' + (_dhBillMode === 'mtd' ? now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) : fyLabel + ' total') + '</div>'
    + '</div>';
  html += '<div class="bill-stat">'
    + '<div class="bill-stat-label">Outstanding</div>'
    + '<div class="bill-stat-val' + (owing > 0 ? ' owing' : ' zero') + '">' + fmt(owing) + '</div>'
    + '<div class="bill-stat-sub">across ' + outstandingInvs.length + ' invoice' + (outstandingInvs.length !== 1 ? 's' : '') + '</div>'
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

/* Settings → "Booking fees": map each BOOKABLE_MENU item to a live Halaxy fee.
 * Auto-matches by name+amount; Julian confirms/overrides; Save persists `session_fee_map`. */
function _renderBookingFeesSection() {
  var fees  = (_halaxyFees || []).slice().sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
  var saved = (_pipelineData && _pipelineData.session_fee_map) || {};

  var html = '<div class="settings-section"><div class="settings-section-title">Booking fees</div>';
  if (!fees.length) {
    html += '<div class="settings-row"><span class="settings-row-label">No Halaxy fees loaded yet — use “Sync funders &amp; fees” above first.</span></div></div>';
    return html;
  }
  html += '<div class="settings-danger-desc" style="border:none;background:none;padding:0 0 6px">'
    + 'For each session type Cheree can book, pick the Halaxy fee it should use. Auto-matched by name where possible — confirm or adjust, then Save. The “Set up in Halaxy” flow uses these.</div>';

  function feeOptions(selectedId) {
    var opts = '<option value="">— choose fee —</option>';
    fees.forEach(function(f) {
      var lbl = (f.name || ('Fee #' + f.id)) + ' — $' + Number(f.amount).toFixed(2);
      opts += '<option value="' + escHtml(String(f.id)) + '"' + (String(f.id) === String(selectedId) ? ' selected' : '') + '>' + escHtml(lbl) + '</option>';
    });
    return opts;
  }
  var selStyle = 'background:rgba(255,255,255,0.06);color:var(--t1);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 10px;font-size:12px;font-family:var(--sans);color-scheme:dark;cursor:pointer;max-width:60%';

  BOOKABLE_MENU.forEach(function(fn) {
    html += '<div class="settings-row" style="border-top:1px solid rgba(255,255,255,0.06);margin-top:6px">'
      + '<span class="settings-row-label" style="font-weight:600;color:var(--t1)">' + escHtml(fn.label) + '</span></div>';
    if (fn.note) html += '<div style="font-size:11px;color:var(--t3);margin:-4px 0 4px;line-height:1.5">' + escHtml(fn.note) + '</div>';
    fn.items.forEach(function(it) {
      var sel  = saved[it.id] || _bookableFeeMatch(it) || '';
      var meta = (it.mbsItem ? ' · MBS ' + it.mbsItem : '') + (it.durationMin ? ' · ' + it.durationMin + ' min' : '');
      html += '<div class="settings-row">'
        + '<span class="settings-row-label">' + escHtml(it.label) + meta + (it.note ? ' <span style="color:var(--amber)">' + escHtml(it.note) + '</span>' : '') + '</span>'
        + '<select class="bf-select" data-item="' + escHtml(it.id) + '" style="' + selStyle + '">' + feeOptions(sel) + '</select>'
        + '</div>';
    });
    if (fn.planManaged) {
      var pms = (_halaxyFunders || []).filter(function(f) { return f.billingKey === 'ndis_plan'; });
      html += '<div style="font-size:11px;color:var(--t3);margin:2px 0 4px;line-height:1.5">Plan managers Cheree can pick at booking (' + pms.length + '): '
        + (pms.length ? pms.map(function(p) { return escHtml(p.name); }).join(', ') : '— none synced —') + '</div>';
    }
  });

  html += '<div class="settings-row"><span class="settings-row-label"></span>'
    + '<div class="settings-row-action"><button id="bf-save-btn" onclick="saveBookingFees()">Save booking fees</button></div></div>';
  html += '</div>';
  return html;
}

async function saveBookingFees() {
  var map = {};
  document.querySelectorAll('.bf-select').forEach(function(sel) {
    if (sel.value) map[sel.dataset.item] = sel.value;
  });
  var btn = document.getElementById('bf-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await apiFetch('/api/admin-enquiries?settings_set=1', { method: 'POST', body: { key: 'session_fee_map', value: map } });
    if (_pipelineData) _pipelineData.session_fee_map = map;
    toast('Booking fees saved', 'ok');
  } catch (e) {
    toast('Could not save booking fees: ' + (e && e.message ? e.message : 'error'), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save booking fees'; }
  }
}

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
  html += '<div class="settings-row"><span class="settings-row-label">Google <span style="color:rgba(255,255,255,0.4);font-weight:400;font-size:11px">· Calendar + inbox (remittance search)</span></span><span class="settings-row-val">' + (calOk ? '✓ Connected' : 'Not connected') + '</span>'
    + '<div class="settings-row-action"><a href="/api/google-auth" title="Reconnect to grant calendar + read-only inbox access. Authorise each mailbox (admin@, reachout@) in turn.">Reconnect</a></div></div>';
  html += '</div>';

  // Booking fees — map each bookable session type to its Halaxy fee (drives "Set up in Halaxy")
  html += _renderBookingFeesSection();

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

  // Email tests — send any onboarding template to admin@ for review
  html += '<div class="settings-section"><div class="settings-section-title">Email tests</div>';
  html += '<div class="settings-row">'
    + '<span class="settings-row-label">Send a test to admin@chereemcgarry.com</span>'
    + '<select id="email-test-type" style="background:rgba(255,255,255,0.06);color:var(--t1);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 10px;font-size:12px;font-family:var(--sans);color-scheme:dark;cursor:pointer">'
    + '<optgroup label="Live client emails">'
    + '<option value="enquiry">Reach Out — thanks for enquiring (auto-reply)</option>'
    + '<option value="session">Session request — confirmation (auto-reply)</option>'
    + '<option value="registration">Registration — funding picker</option>'
    + '<option value="complete">Registration complete — thank-you</option>'
    + '<option value="reminder">Appointment reminder — 48h</option>'
    + '</optgroup>'
    + '<optgroup label="Registration variants (legacy / per-funder)">'
    + '<option value="personal">Personal / Private (single link)</option>'
    + '<option value="new">New (generic)</option>'
    + '<option value="medicare">Medicare</option>'
    + '<option value="ndis">NDIS</option>'
    + '</optgroup>'
    + '</select>'
    + '<div class="settings-row-action"><button id="email-test-btn" onclick="sendTestEmail()">Send test →</button></div>'
    + '</div>';
  html += '</div>';

  // Danger zone
  html += '<div class="settings-section settings-danger-section">';
  html += '<div class="settings-section-title settings-danger-title">Danger zone</div>';
  html += '<div class="settings-danger-desc">Reset clears all manually-entered dashboard data — enquiries, clients, sessions, tasks, and activity logs. '
    + 'Halaxy appointments and Google Calendar events are fetched live and will reappear automatically. '
    + 'Your Google Calendar connection and settings are not affected.</div>';
  html += '<div class="settings-danger-confirm">'
    + '<input class="settings-danger-input" id="reset-confirm-input" type="text" placeholder="Type RESET to confirm" autocomplete="off" oninput="document.getElementById(\'reset-btn\').disabled = this.value !== \'RESET\'">'
    + '<button class="settings-danger-btn" id="reset-btn" disabled onclick="_resetDashboardData()">Reset dashboard data</button>'
    + '</div>';
  html += '</div>';

  html += '</div>';
  content.innerHTML = html;
}

// Send a test onboarding email (chosen template) to admin@chereemcgarry.com
async function sendTestEmail() {
  var sel = document.getElementById('email-test-type');
  var btn = document.getElementById('email-test-btn');
  var clientType = sel ? sel.value : 'personal';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    await apiFetch('/api/admin-intake', { method: 'POST', body: { test: 1, clientType: clientType } });
    toast('Test email sent to admin@chereemcgarry.com', 'ok');
  } catch (e) {
    toast('Could not send test: ' + (e && e.message ? e.message : 'error'), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send test →'; }
  }
}

async function _resetDashboardData() {
  var inp = document.getElementById('reset-confirm-input');
  if (!inp || inp.value !== 'RESET') return;
  var btn = document.getElementById('reset-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Resetting…'; }
  try {
    var result = await apiFetch('/api/admin-tasks', { method: 'POST', body: { confirm: 'RESET' } });
    var d = result.deleted || {};
    toast('Reset complete — ' + ((d.enquiries || 0) + (d.clients || 0) + (d.sessions || 0) + (d.tasks || 0)) + ' records removed');
    _pipelineData  = null;
    _dhTasks       = [];
    _dhAppts       = [];
    _dhEnqClientMap = {};
    loadPipeline();
    renderHomeView();
  } catch (e) {
    toast('Reset failed: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Reset dashboard data'; }
  }
}

/* ═══════════════════════════════════════════════════
   DETAIL PANEL RENDERERS
   ═══════════════════════════════════════════════════ */

function _renderSessionDetailPanel(sess) {
  var _calEvId = sess.eventId || sess.id;
  var _hUrl = _halaxyWebUrl ? (_halaxyWebUrl + '/calendar') : 'https://www.halaxy.com/practitioner';

  var _inv = null;
  if (sess.patientId && sess.dateStr && _halaxyData && _halaxyData.invoices) {
    _inv = (_halaxyData.invoices || []).find(function(i) {
      return String(i.patientId) === String(sess.patientId) && (i.date || '').slice(0, 10) === sess.dateStr;
    });
  }
  var _fee = _inv ? parseFloat(_inv.totalPrice   || 0) : 0;
  var _bal = _inv ? parseFloat(_inv.totalBalance || 0) : 0;

  var html = '';

  // Meta line — date + time + status chip
  html += '<div class="m-meta">'
    + escHtml(sess.dateLabel || sess.dateStr || '')
    + (sess.timeStr ? ' · ' + escHtml(sess.timeStr) : '');

  if (sess.isReminder) {
    html += ' · <span class="m-chip m-chip-purple">📋 Reminder</span>';
  } else if (sess.status === 'paid') {
    html += ' · <span class="m-chip m-chip-teal">Paid ✓</span>';
  } else if (sess.status === 'invoiced') {
    html += ' · <span class="m-chip m-chip-amber">Invoice raised</span>';
  } else if (sess.status === 'pending-invoice') {
    html += ' · <span class="m-chip m-chip-purple">No invoice</span>';
  } else if (sess.status === 'needs-recording') {
    html += ' · <span class="m-chip m-chip-purple">Needs recording</span>';
  } else if (sess.status === 'upcoming') {
    html += ' · <span class="m-chip m-chip-blue">Upcoming</span>';
  }
  html += '</div>';

  // Amount
  if (_fee > 0 && sess.status === 'paid') {
    html += '<div class="m-amount"><span class="m-amount-val m-amount-teal">$' + _fee.toFixed(2) + '</span></div>';
  } else if (_bal > 0) {
    html += '<div class="m-amount"><span class="m-amount-val m-amount-amber">$' + _bal.toFixed(2) + ' owing</span></div>';
  }

  // Reminder state
  if (sess.isReminder) {
    html += '<div class="m-info-box">Visible in your schedule but not counted as a client appointment.</div>';
    html += '<button class="m-btn-ghost" onclick="_calMarkAsReminder_undo(\'' + escHtml(_calEvId) + '\')">Restore as appointment</button>';
    html += '<div class="m-foot"><button class="m-btn-danger" onclick="deleteScheduleAppt(\'' + escHtml(_calEvId) + '\')">Delete from calendar</button></div>';
    return html;
  }

  // Unlinked GCal events — delegate to _calUnlinkedActionHtml
  var isUnlinkedCal = sess.source === 'cal' && !sess.patientId;
  if (isUnlinkedCal && (sess.status === 'needs-recording' || sess.status === 'upcoming')) {
    html += _calUnlinkedActionHtml(sess.eventId || sess.id, sess.name);
    return html;
  }

  // Primary CTA per status
  if (sess.status === 'needs-recording') {
    var _pid = sess.patientId || '';
    html += '<button class="m-btn-primary" onclick="openHalaxyApptLogPanel(\'' + escHtml(sess.id) + '\',\'' + escHtml(_pid) + '\',\'' + escHtml(sess.name || '') + '\',\'' + escHtml(sess.dateStr) + '\',\'' + escHtml(sess.startIso || (sess.dateStr + 'T09:00:00')) + '\',\'' + escHtml(sess.halaxyApptId || '') + '\')">Write session notes</button>';
  } else if (sess.status === 'pending-invoice') {
    html += '<a class="m-btn-primary" href="' + escHtml(_hUrl) + '" target="_blank" rel="noopener">Open Halaxy to invoice →</a>';
  } else if (sess.status === 'invoiced' || sess.status === 'upcoming' || sess.status !== 'paid') {
    html += '<a class="m-btn-ghost" href="' + escHtml(_hUrl) + '" target="_blank" rel="noopener">View in Halaxy →</a>';
  }

  // Rename (GCal events only)
  if (sess.source === 'cal') {
    html += '<div class="m-links"><button class="m-link" onclick="_calRenameEvent(\'' + escHtml(_calEvId) + '\',\'' + escHtml(sess.name || '') + '\')">✎ Rename event</button></div>';
  }

  // Halaxy ID (secondary detail)
  if (sess.halaxyApptId) {
    html += '<div class="m-section"><div class="m-row"><span class="m-key">Halaxy ID</span><span class="m-val m-val-mono">' + escHtml(sess.halaxyApptId) + '</span></div></div>';
  }

  return html;
}

/* ── Unlinked GCal event action zone ──────────────────────────────── */
function _calUnlinkedActionHtml(eventId, calName) {
  var safeId   = escHtml(String(eventId));
  var safeName = escHtml(calName || 'Calendar event');

  var html = '';

  // Primary: the wizard handles BOTH new and existing clients (it searches Halaxy by name + email),
  // books the session and raises the invoice — no need to open Halaxy first.
  html += '<button class="m-btn-primary" onclick="_sihFromCalEvent(\'' + safeId + '\')">⚕ Set up in Halaxy &amp; book →</button>';
  html += '<div class="m-info-box" style="margin:8px 0 14px">Finds or creates the client in Halaxy, books this session, and raises the invoice — all here.</div>';

  html += '<div class="m-question">Or…</div>';
  html += '<div class="m-option-list">';

  html += '<button class="m-option-item" onclick="_calDismissAlreadyBooked(\'' + safeId + '\',\'' + safeName + '\')">'
    + '<span class="m-option-label">Already booked in Halaxy</span>'
    + '<span class="m-option-hint">Just hide this calendar duplicate — no fee or invoice</span>'
    + '</button>';

  html += '<button class="m-option-item" onclick="_calMarkAsReminder(\'' + safeId + '\',\'' + safeName + '\')">'
    + '<span class="m-option-label">A personal reminder, not a session</span>'
    + '<span class="m-option-hint">Keep it in the schedule but not tracked as billable</span>'
    + '</button>';

  html += '</div>';

  html += '<div class="m-foot"><button class="m-btn-danger" onclick="deleteScheduleAppt(\'' + safeId + '\')">Delete from calendar</button></div>';

  return html;
}

// "Already booked in Halaxy" — only hides the dashboard's calendar duplicate (no billing).
function _calDismissAlreadyBooked(eventId, name) {
  if (!window.confirm('Hide "' + (name || 'this event') + '" from the dashboard?\n\nUse this only if you ALREADY booked this appointment directly in Halaxy — it just removes the calendar duplicate here. No fee or invoice is created.')) return;
  dismissCalEvent(eventId);
  closeDetailPanel();
  _showSuccess('merge', 'Hidden — already in Halaxy');
}


async function _calMarkAsReminder(eventId, title) {
  _calReminders.add(String(eventId));
  localStorage.setItem('cal_reminders', JSON.stringify([..._calReminders]));
  // Create a task/reminder in the Reminders section
  try {
    await apiFetch('/api/admin-tasks', { method: 'POST', body: { title: (title || 'Reminder') } });
  } catch(e) { console.warn('[calMarkAsReminder] task create skipped:', e.message); }
  closeDetailPanel();
  renderHomeView();
  _showSuccess('reminder', 'Moved to Reminders');
}

function _calMarkAsReminder_undo(eventId) {
  _calReminders.delete(String(eventId));
  localStorage.setItem('cal_reminders', JSON.stringify([..._calReminders]));
  closeDetailPanel();
  renderHomeView();
  toast('Restored as appointment');
}

async function _calRenameEvent(eventId, currentTitle) {
  var newTitle = prompt('Rename event:', currentTitle || '');
  if (!newTitle || !newTitle.trim() || newTitle.trim() === currentTitle) return;
  try {
    await apiFetch('/api/calendar-pending?eventId=' + encodeURIComponent(eventId), {
      method: 'PATCH', body: { title: newTitle.trim() }
    });
    // Update local cache so the rename shows immediately on re-open
    if (_calEventMap[eventId]) _calEventMap[eventId].title = newTitle.trim();
    closeDetailPanel();
    renderHomeView();
    toast('Renamed to "' + newTitle.trim() + '"');
  } catch(e) { toast('Could not rename: ' + e.message, 'err'); }
}

async function _dhRenameClient(clientId, currentName) {
  var newName = prompt('Rename client:', currentName || '');
  if (!newName || !newName.trim() || newName.trim() === currentName) return;
  try {
    await apiFetch('/api/clients', { method: 'PATCH', body: { id: clientId, display_name: newName.trim() } });
    if (_pipelineData) {
      var cl = (_pipelineData.clients || []).find(function(c) { return c.id === clientId; });
      if (cl) cl.display_name = newName.trim();
    }
    closeDetailPanel();
    toast('Client renamed to "' + newName.trim() + '"');
  } catch(e) { toast('Could not rename: ' + e.message, 'err'); }
}

async function deleteScheduleAppt(eventId) {
  if (!confirm('Delete this appointment from the calendar?')) return;
  try {
    await apiFetch('/api/calendar-pending?eventId=' + encodeURIComponent(eventId), { method: 'DELETE' });
  } catch (e) {
    // Non-fatal — may not be in the pending calendar
    console.warn('[deleteScheduleAppt] GCal delete skipped:', e.message);
  }
  dismissCalEvent(eventId);
  closeDetailPanel();
  _showSuccess('delete', 'Deleted');
}

function _renderEnquiryDetailPanel(enq) {
  var name = [enq.first_name, enq.last_name].filter(Boolean).join(' ') || '—';
  var CLOSED_REASON_LABELS_RDP = { not_interested: 'Not interested', wrong_service: 'Wrong service', no_response: 'No response', converted_elsewhere: 'Converted elsewhere', duplicate: 'Duplicate enquiry', other: 'Other' };
  var STATUS_LABELS_RDP = { new: 'New', contacted: 'Contacted', in_halaxy: 'Awaiting first booking', closed: 'Closed', converted: 'Converted' };

  var isClosed    = enq.status === 'closed' || enq.status === 'converted';
  var isNew       = enq.status === 'new' || !enq.status;
  var isContacted = enq.status === 'contacted';
  var isInHalaxy  = enq.status === 'in_halaxy';

  var statusChipCls = isClosed ? 'm-chip-dim' : (enq.status === 'converted' ? 'm-chip-teal' : isInHalaxy ? 'm-chip-teal' : isContacted ? 'm-chip-blue' : 'm-chip-purple');

  var html = '';

  // Meta line
  html += '<div class="m-meta">'
    + escHtml(_relativeDate(enq.created_at))
    + (enq.source ? ' · ' + escHtml(enq.source) : '')
    + ' · <span class="m-chip ' + statusChipCls + '">' + escHtml(STATUS_LABELS_RDP[enq.status] || 'New') + '</span>'
    + (enq.status === 'closed' && enq.closed_reason ? ' · ' + escHtml(CLOSED_REASON_LABELS_RDP[enq.closed_reason] || enq.closed_reason) : '')
    + '</div>';

  // Contact strip — phone + email as quick pill links
  if (enq.phone || enq.email) {
    html += '<div class="m-contact-strip">';
    if (enq.phone) html += '<a class="m-contact-link" href="tel:' + escHtml(enq.phone) + '">' + escHtml(enq.phone) + '</a>';
    if (enq.email) html += '<a class="m-contact-link" href="mailto:' + escHtml(enq.email) + '">' + escHtml(enq.email) + '</a>';
    html += '</div>';
  }

  if (!isClosed) {
    // Stage-specific primary action
    if (isNew) {
      html += '<button class="m-btn-primary" onclick="advanceEnquiryStatus(\'' + enq.id + '\',\'contacted\');closeDetailPanel()">Mark as contacted</button>';
    } else if (isInHalaxy) {
      html += '<button class="m-btn-primary" onclick="convertEnquiryPl(\'' + enq.id + '\')">Convert to client</button>';
    }

    // Registration now happens entirely on /register (the embedded Halaxy widget), and
    // the Halaxy Patient·Create webhook auto-advances the card to in_halaxy on completion.
    // The old "pick funding + paste Halaxy URL" send and manual "Add to Halaxy" search/
    // create flow have been retired. A single "Send registration email" button (linking to
    // /register) is the planned replacement — see TODO.md.
    html += '<div class="m-links">';
    html += '<button class="m-link m-link-dim" onclick="_openCloseEnquiryModal(\'' + enq.id + '\')">Close enquiry…</button>';
    html += '</div>';
  }

  // Details — only when there's something to show (no empty-state noise)
  if (enq.service || enq.reason || enq.intake_funder || enq.message) {
    html += '<div class="m-section">';
    html += '<div class="m-section-hd"><span class="m-section-label">Details</span></div>';
    if (enq.service)       html += '<div class="m-row"><span class="m-key">Service</span><span class="m-val">' + escHtml(enq.service) + '</span></div>';
    if (enq.reason)        html += '<div class="m-row"><span class="m-key">Reason</span><span class="m-val">' + escHtml(enq.reason) + '</span></div>';
    if (enq.intake_funder) html += '<div class="m-row"><span class="m-key">Funder</span><span class="m-val">' + escHtml(FUNDER_LABELS[enq.intake_funder] || enq.intake_funder) + '</span></div>';
    if (enq.message)       html += '<div class="m-row m-row-block"><span class="m-key">Message</span><span class="m-val m-val-wrap">' + escHtml(enq.message) + '</span></div>';
    html += '</div>';
  }

  // Appointments (if linked Halaxy client)
  var _linkedClient = _dhEnqClientMap[enq.id];
  var _hxId = _linkedClient && _linkedClient.halaxy_id ? String(_linkedClient.halaxy_id) : null;
  if (_hxId) {
    var _allSess = _buildUnifiedSessions();
    var _clientSess = _allSess.upcoming.concat(_allSess.past).filter(function(s) {
      return String(s.patientId) === _hxId;
    }).sort(function(a, b) { return b.startMs - a.startMs; });
    if (_clientSess.length) {
      var _STAT_COLOUR = { paid: 'var(--teal)', invoiced: 'var(--amber)', 'pending-invoice': 'var(--purple)', upcoming: 'var(--blue)', cancelled: 'var(--t3)' };
      var _STAT_LABEL  = { paid: 'Paid', invoiced: 'Unpaid', 'pending-invoice': 'No invoice', upcoming: 'Upcoming', cancelled: 'Cancelled' };
      html += '<div class="m-section">';
      html += '<div class="m-section-hd"><span class="m-section-label">Appointments</span></div>';
      _clientSess.slice(0, 6).forEach(function(s) {
        html += '<div class="m-row m-row-tap" onclick="openDetailPanel(\'session\',\'' + escHtml(String(s.id)) + '\')">'
          + '<span class="m-key">' + escHtml(s.dateLabel || s.dateStr) + (s.timeStr ? ' · ' + s.timeStr : '') + '</span>'
          + '<span class="m-val" style="color:' + (_STAT_COLOUR[s.status] || 'var(--t3)') + '">' + escHtml(_STAT_LABEL[s.status] || s.status) + '</span>'
          + '</div>';
      });
      html += '</div>';
    }
  }

  // Tasks — list only when present (the "+ Task" affordance lives in the actions row below)
  var _enqTasks = (_dhTasks || []).filter(function(t) { return t.enquiry_id === enq.id; });
  if (_enqTasks.length) {
    html += '<div class="m-section">';
    html += '<div class="m-section-hd"><span class="m-section-label">Tasks</span></div>';
    _enqTasks.forEach(function(t) {
      html += '<div class="m-task-row">'
        + '<button class="m-task-chk ' + (t.completed ? 'm-task-chk-done' : '') + '" onclick="dhToggleTask(\'' + escHtml(String(t.id)) + '\',' + !t.completed + ')">' + (t.completed ? '✓' : '') + '</button>'
        + '<span class="m-task-lbl ' + (t.completed ? 'm-task-lbl-done' : '') + '">' + escHtml(t.title || '') + '</span>'
        + '</div>';
    });
    html += '</div>';
  }

  // Notes
  html += '<div class="m-section">';
  html += '<div class="m-section-hd"><span class="m-section-label">Notes</span></div>';
  html += '<textarea class="m-textarea" id="rdp-notes-' + enq.id + '" onblur="saveNotes(\'' + enq.id + '\',this.value)" placeholder="Add notes…">' + escHtml(enq.notes || '') + '</textarea>';
  html += '</div>';

  // Activity timeline — only when there's history (no empty-state noise)
  var activity = enq.activity || [];
  if (activity.length) {
    var TL_DOT = { status: 'tl-status', notes: '', halaxy: 'tl-status', converted: 'tl-status', intake: 'tl-intake', call: 'tl-call', email: 'tl-email', note: '' };
    var TL_LABEL = {
      status:    function(a) { var s = (a.detail || '').split(':')[0]; var reason = (a.detail || '').split(':')[1]; var sl = { new: 'Enquiry received', contacted: 'Marked as contacted', in_halaxy: 'Added to Halaxy', closed: 'Enquiry closed' + (reason ? ' — ' + (CLOSED_REASON_LABELS_RDP[reason] || reason) : ''), converted: 'Converted to client' }; return sl[s] || ('Status → ' + escHtml(s)); },
      notes:     function() { return 'Notes updated'; },
      halaxy:    function(a) { return a.detail === 'linked' ? 'Halaxy patient linked' : 'Halaxy link cleared'; },
      converted: function() { return 'Converted to client'; },
      intake:    function(a) { return 'Onboarding sent' + (a.detail ? ' — ' + escHtml(FUNDER_LABELS[a.detail] || a.detail) : ''); },
      call:      function(a) { return '📞 ' + escHtml(a.detail || 'Phone call'); },
      email:     function(a) { return '✉ ' + escHtml(a.detail || 'Email'); },
      note:      function(a) { return '📝 ' + escHtml(a.detail || 'Note'); },
    };
    html += '<div class="m-section">';
    html += '<div class="m-section-hd"><span class="m-section-label">Activity</span></div>';
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
    html += '</div>';
  }

  // Secondary actions — one quiet row (task / log), plus the hidden log form. No empty sections.
  if (!isClosed) {
    html += '<div class="m-links" style="margin-top:2px">'
      + '<button class="m-link" onclick="_rdpAddTask(\'' + escHtml(enq.id) + '\',\'' + escHtml(name) + '\')">+ Task</button>'
      + '<button class="m-link" onclick="_toggleLogInteractionForm(\'' + enq.id + '\')">+ Log interaction</button>'
      + '</div>';
    html += '<div id="rdp-log-form-' + enq.id + '" class="m-log-form" style="display:none">';
    html += '<select class="m-select" id="rdp-log-type-' + enq.id + '">'
      + '<option value="call">📞 Phone call</option>'
      + '<option value="email">✉ Email</option>'
      + '<option value="note">📝 Note</option>'
      + '</select>';
    html += '<textarea class="m-textarea" id="rdp-log-text-' + enq.id + '" placeholder="What happened? e.g. Left voicemail, client confirmed Thursday…"></textarea>';
    html += '<div class="m-log-actions">'
      + '<button class="m-btn-ghost m-btn-sm" onclick="_toggleLogInteractionForm(\'' + enq.id + '\')">Cancel</button>'
      + '<button class="m-btn-teal m-btn-sm" onclick="_submitLogInteraction(\'' + enq.id + '\')">Save</button>'
      + '</div>';
    html += '</div>';
  }

  return html;
}

async function _rdpAddTask(enquiryId, clientName) {
  var title = prompt('New task for ' + (clientName || 'client') + ':');
  if (!title || !title.trim()) return;
  try {
    var t = await apiFetch('/api/admin-tasks', {
      method: 'POST',
      body: { title: title.trim(), enquiry_id: enquiryId || null, client_label: clientName || null },
    });
    _dhTasks = (_dhTasks || []).concat(t);
    // Refresh the detail panel so the new task appears immediately
    openDetailPanel('enquiry', enquiryId ? enquiryId : '');
    _dhLoadTasks();
  } catch (err) {
    toast('Could not add task: ' + err.message, 'err');
  }
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

function _renderClientDetailPanel(cl) {
  var dbSessions  = (cl.sessions || []).slice().sort(function(a, b) { return b.session_date.localeCompare(a.session_date); });
  var funderLabel = FUNDER_LABELS[cl.funder] || cl.funder || '—';

  var hid = cl.halaxy_id ? String(cl.halaxy_id) : null;
  var halaxyVerified = false;
  var halaxyInvs     = [];

  if (hid && _halaxyData) {
    var allPts = _halaxyData.patients || [];
    halaxyVerified = allPts.some(function(p) { return String(p.id) === hid; });
    if (!halaxyVerified && _halaxyData.patientMap && _halaxyData.patientMap[hid]) halaxyVerified = true;
    halaxyInvs = (_halaxyData.invoices || [])
      .filter(function(i) { return String(i.patientId) === hid; })
      .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  }

  var html = '';

  // Meta line
  html += '<div class="m-meta">'
    + escHtml(funderLabel)
    + (hid ? (' · Halaxy ' + (halaxyVerified
        ? '<span class="m-chip m-chip-teal">Linked ✓</span>'
        : '<span class="m-chip m-chip-amber">⚠ Unverified</span>'))
      : '')
    + '</div>';

  // Warning banner for unverified Halaxy link
  if (hid && !halaxyVerified) {
    html += '<div class="m-banner m-banner-amber">Halaxy ID <strong>' + escHtml(hid) + '</strong> was not found in the current patient list. This may be a stale test record — remove it below.</div>';
  }

  // Primary CTA — single action, no competing buttons
  if (hid && _halaxyWebUrl) {
    html += '<a class="m-btn-primary" href="' + escHtml(_halaxyWebUrl + '/clients') + '" target="_blank" rel="noopener">Open in Halaxy →</a>';
    html += '<button class="m-btn-ghost" onclick="openNewSessionModal()">Log appointment</button>';
  } else {
    html += '<button class="m-btn-primary" onclick="openNewSessionModal()">Log appointment</button>';
    html += '<div class="m-links"><button class="m-link" onclick="_dhRenameClient(\'' + escHtml(cl.id) + '\',\'' + escHtml(cl.display_name || '') + '\')">✎ Edit name</button></div>';
  }

  // Details section
  var TYPE_LABELS = { individual: 'Individual', couples: 'Couples', child: 'Child' };
  html += '<div class="m-section">';
  html += '<div class="m-section-hd"><span class="m-section-label">Details</span>'
    + '<button class="m-action-btn" onclick="openEditClientTypePanel(\'' + escHtml(cl.id) + '\')">Edit</button></div>';
  html += '<div class="m-row"><span class="m-key">Type</span><span class="m-val">'
    + (cl.is_contact ? '<span class="m-chip m-chip-dim">Contact (non-billable)</span>' : escHtml(TYPE_LABELS[cl.client_type] || 'Individual'))
    + '</span></div>';
  if (cl.parent_client_id) {
    var parentRec2 = (_pipelineData && _pipelineData.clients || []).find(function(x) { return x.id === cl.parent_client_id; });
    html += '<div class="m-row"><span class="m-key">Parent/Guardian</span><span class="m-val">' + escHtml(parentRec2 ? parentRec2.display_name : cl.parent_client_id) + '</span></div>';
  }
  if (cl.plan_manager) html += '<div class="m-row"><span class="m-key">Plan manager</span><span class="m-val">' + escHtml(cl.plan_manager) + '</span></div>';
  if (cl.notes)        html += '<div class="m-row m-row-block"><span class="m-key">Notes</span><span class="m-val m-val-wrap">' + escHtml(cl.notes) + '</span></div>';
  if (hid)             html += '<div class="m-row"><span class="m-key">Halaxy ID</span><span class="m-val m-val-mono">' + escHtml(hid) + '</span></div>';
  html += '</div>';

  // Halaxy billing
  if (halaxyInvs.length) {
    var totalPaid  = halaxyInvs.reduce(function(s, i) { return s + (parseFloat(i.totalPaid)    || 0); }, 0);
    var totalOwing = halaxyInvs.reduce(function(s, i) { return s + (parseFloat(i.totalBalance) || 0); }, 0);
    html += '<div class="m-section">';
    html += '<div class="m-section-hd"><span class="m-section-label">Halaxy billing — ' + halaxyInvs.length + ' invoice' + (halaxyInvs.length !== 1 ? 's' : '') + '</span></div>';
    if (totalPaid > 0 || totalOwing > 0.005) {
      html += '<div class="m-billing-summary">';
      if (totalPaid > 0)      html += '<span class="m-billing-val m-billing-paid">$' + totalPaid.toFixed(0) + ' paid</span>';
      if (totalOwing > 0.005) html += '<span class="m-billing-val m-billing-owing">$' + totalOwing.toFixed(0) + ' owing</span>';
      html += '</div>';
    }
    halaxyInvs.slice(0, 15).forEach(function(inv) {
      var owing = parseFloat(inv.totalBalance) || 0;
      var paid  = owing < 0.01;
      html += '<div class="m-row"><span class="m-key">' + escHtml(inv.date || '—') + '</span>'
        + '<span class="m-val">'
        + (inv.amount != null ? '$' + parseFloat(inv.amount).toFixed(0) : '—')
        + (paid ? '<span class="m-tick">✓</span>' : (owing > 0 ? '<span class="m-owing"> $' + owing.toFixed(0) + '</span>' : ''))
        + '</span></div>';
    });
    html += '</div>';
  } else if (hid && halaxyVerified) {
    html += '<div class="m-section"><div class="m-section-hd"><span class="m-section-label">Halaxy billing</span></div>';
    html += '<div class="m-empty">No invoices in the last 90 days</div></div>';
  }

  // Dashboard sessions
  if (dbSessions.length) {
    html += '<div class="m-section">';
    html += '<div class="m-section-hd"><span class="m-section-label">Logged sessions (' + dbSessions.length + ')</span></div>';
    dbSessions.slice(0, 10).forEach(function(s) {
      html += '<div class="m-row"><span class="m-key">' + escHtml(s.session_date || '') + '</span>'
        + '<span class="m-val">' + escHtml(s.status || '') + (s.amount ? ' · $' + s.amount : '') + '</span></div>';
    });
    html += '</div>';
  }

  if (!halaxyInvs.length && !dbSessions.length && !(hid && halaxyVerified)) {
    html += '<div class="m-section"><div class="m-empty">No billing history or logged sessions yet.</div></div>';
  }

  // Footer — danger
  html += '<div class="m-foot">'
    + '<button class="m-btn-danger" data-cid="' + escHtml(cl.id) + '" data-cn="' + escHtml(cl.display_name || '') + '" onclick="deleteClient(this.dataset.cid,this.dataset.cn)">Remove dashboard record</button>'
    + '<div class="m-foot-note">Does not affect Halaxy</div>'
    + '</div>';

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

// Guards against double-submit (double-click → duplicate status PATCH) on advanceEnquiryStatus
var _advanceInFlight = {};

/* ── Hello / greeting section (stubbed — replaced by sidebar badge) ── */
function renderHelloSection() {
  updateSidebarBadge(); // update queue badge instead
}

/* ════════════════════════════════════════════════════════════════════
   "SET UP IN HALAXY" — Cheree self-serve onboarding wizard (step 2)
   Match-or-create patient → (coverage) → $book (Halaxy auto-creates the
   invoice). Reuses the proven endpoints ?halaxy_create_patient /
   ?halaxy_coverage / ?halaxy_appt_action, and the funder×session-type→fee
   config from session_fee_map (Settings → Booking fees). No Halaxy UI.
   Full design: docs/halaxy-onboarding-spec.md.
   ════════════════════════════════════════════════════════════════════ */
var _sihState = { patientId: null, eventId: null };

function openSetupInHalaxy(prefill) {
  prefill = prefill || {};
  _sihState = { patientId: null, eventId: prefill.eventId || null };

  var funderOpts = '<option value="">Select funding…</option>'
    + BOOKABLE_MENU.map(function(f) { return '<option value="' + f.key + '">' + escHtml(f.label) + '</option>'; }).join('');

  var existing = document.getElementById('sih-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'sih-overlay';
  overlay.className = 'db-modal-overlay open';
  overlay.innerHTML =
      '<div class="db-modal" style="width:480px;max-width:94vw">'
    + '<div class="db-modal-hdr"><div>'
    +   '<div class="db-modal-title">Set up in Halaxy</div>'
    +   '<div class="db-modal-sub">Create the client &amp; book — the invoice is made automatically. No need to open Halaxy.</div>'
    + '</div><button class="db-modal-close" onclick="this.closest(\'.db-modal-overlay\').remove()">×</button></div>'
    + '<div class="db-modal-body" id="sih-body" style="display:flex;flex-direction:column;gap:10px;padding:16px 24px;max-height:70vh;overflow:auto;transition:opacity .15s">'
    +   '<div id="sih-client-entry" style="display:flex;flex-direction:column;gap:10px">'
    +     '<div style="display:flex;gap:8px">'
    +       '<input id="sih-first" class="db-form-input" placeholder="First name" value="' + escHtml(prefill.firstName || '') + '" style="flex:1">'
    +       '<input id="sih-last"  class="db-form-input" placeholder="Last name"  value="' + escHtml(prefill.lastName  || '') + '" style="flex:1">'
    +     '</div>'
    +     '<input id="sih-email" class="db-form-input" type="email" placeholder="Email" value="' + escHtml(prefill.email || '') + '" oninput="_sihState.patientId=null" onblur="_sihSearchPatient()">'
    +     '<input id="sih-phone" class="db-form-input" placeholder="Phone (optional)" value="' + escHtml(prefill.phone || '') + '">'
    +     '<div id="sih-match" style="font-size:11.5px;color:var(--t3);min-height:16px"></div>'
    +     '<input id="sih-namesearch" class="db-form-input" placeholder="🔍 …or find an existing Halaxy patient by name" oninput="_sihDebounceNameSearch()">'
    +     '<div id="sih-nameresults"></div>'
    +   '</div>'
    +   '<div id="sih-client-hero" style="display:none"></div>'
    +   '<select id="sih-funder" class="db-form-input" onchange="_sihOnFunderChange()">' + funderOpts + '</select>'
    +   '<select id="sih-pm" class="db-form-input" style="display:none"></select>'
    +   '<select id="sih-type" class="db-form-input" style="display:none" onchange="_sihOnTypeChange()"></select>'
    +   '<div id="sih-fee" style="font-size:12px;color:var(--teal);min-height:16px"></div>'
    +   '<div style="display:flex;gap:8px">'
    +     '<input id="sih-date" class="db-form-input" type="date" value="' + escHtml(prefill.dateISO || '') + '" style="flex:1">'
    +     '<input id="sih-time" class="db-form-input" type="time" value="' + escHtml(prefill.time || '10:00') + '" style="width:118px">'
    +     '<input id="sih-dur"  class="db-form-input" type="number" min="1" value="' + (prefill.durationMin || 60) + '" style="width:80px" title="Minutes">'
    +   '</div>'
    +   '<div id="sih-msg" style="font-size:12px;min-height:16px"></div>'
    + '</div>'
    + '<div class="db-modal-ftr" style="padding:14px 20px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;justify-content:flex-end">'
    +   '<button id="sih-cancel-btn" onclick="this.closest(\'.db-modal-overlay\').remove()" style="background:transparent;border:1px solid rgba(255,255,255,0.18);color:var(--t2);border-radius:9px;padding:8px 16px;font-size:13px;font-family:var(--sans);cursor:pointer">Cancel</button>'
    +   '<button class="db-btn-primary" id="sih-book-btn" onclick="_sihSubmit()">Book in Halaxy →</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
  if (prefill.email) _sihSearchPatient();
}

// Open the "Set up in Halaxy" wizard prefilled from a Google Calendar event.
function _sihFromCalEvent(eventId) {
  var ev = _calEventMap[String(eventId)];
  if (!ev) { openSetupInHalaxy(); return; }
  var title = (ev.title || ev.summary || '').trim();
  var parts = title ? title.split(/\s+/) : [];
  var firstName = parts.shift() || '';
  var lastName  = parts.join(' ');
  var start = ev.start || '';
  var dateISO = start.slice(0, 10);
  // Pull wall-clock time straight from the ISO string's offset (avoids browser-TZ skew).
  var time = (!ev.allDay && start.indexOf('T') === 10) ? start.slice(11, 16) : '';
  var durationMin = 60;
  if (start && ev.end) {
    var mins = Math.round((new Date(ev.end) - new Date(start)) / 60000);
    if (mins > 0 && mins < 24 * 60) durationMin = mins;
  }
  openSetupInHalaxy({
    firstName: firstName, lastName: lastName, email: ev.email || '',
    dateISO: dateISO, time: time || '10:00', durationMin: durationMin, eventId: String(eventId),
  });
}

function _sihOnFunderChange() {
  var fkey   = (document.getElementById('sih-funder') || {}).value || '';
  var funder = _bookableFunder(fkey);
  var typeSel = document.getElementById('sih-type');
  var pmSel   = document.getElementById('sih-pm');
  var feeDiv  = document.getElementById('sih-fee');
  if (feeDiv) feeDiv.textContent = '';

  if (funder && funder.planManaged) {
    var pms = (_halaxyFunders || []).filter(function(f) { return f.billingKey === 'ndis_plan'; });
    pmSel.innerHTML = '<option value="">Select plan manager…</option>'
      + pms.map(function(p) { return '<option value="' + escHtml(p.name) + '">' + escHtml(p.name) + '</option>'; }).join('');
    pmSel.style.display = '';
  } else { pmSel.style.display = 'none'; pmSel.innerHTML = ''; }

  if (funder) {
    var opts = '<option value="">Select session type…</option>';
    funder.items.forEach(function(it) {
      var fee = _bookableResolveFee(it);
      var lbl = it.label + (fee ? ' — $' + fee.amount.toFixed(2) : ' — (no fee set)');
      opts += '<option value="' + it.id + '"' + (fee ? '' : ' disabled') + '>' + escHtml(lbl) + '</option>';
    });
    typeSel.innerHTML = opts;
    typeSel.style.display = '';
  } else { typeSel.style.display = 'none'; typeSel.innerHTML = ''; }
  _sihOnTypeChange();
}

function _sihOnTypeChange() {
  var funder = _bookableFunder((document.getElementById('sih-funder') || {}).value || '');
  var tid    = (document.getElementById('sih-type') || {}).value || '';
  var item   = funder && funder.items.find(function(i) { return i.id === tid; });
  var feeDiv = document.getElementById('sih-fee');
  var durEl  = document.getElementById('sih-dur');
  if (!item) { if (feeDiv) feeDiv.textContent = ''; return; }
  var fee = _bookableResolveFee(item);
  if (feeDiv) {
    feeDiv.textContent = fee ? ('Fee: ' + fee.name + ' — $' + fee.amount.toFixed(2)) : '⚠ No fee configured — set it in Settings → Booking fees.';
    feeDiv.style.color = fee ? 'var(--teal)' : 'var(--amber)';
  }
  // QFES bands lock the duration (Halaxy invoicing requires the appt length to match).
  if (item.durationMin && durEl) { durEl.value = item.durationMin; durEl.readOnly = true; }
  else if (durEl) { durEl.readOnly = false; }
}

async function _sihSearchPatient() {
  var email = ((document.getElementById('sih-email') || {}).value || '').trim();
  var matchDiv = document.getElementById('sih-match');
  if (!email) { if (matchDiv) matchDiv.textContent = ''; return; }
  if (matchDiv) { matchDiv.textContent = '🔍 Checking Halaxy…'; matchDiv.style.color = 'var(--t3)'; }
  try {
    var d = await apiFetch('/api/admin-enquiries?halaxy_search=' + encodeURIComponent(email));
    var pts = (d && d.patients) || [];
    if (pts.length) {
      _sihState.patientId = String(pts[0].id);
      if (matchDiv) { matchDiv.innerHTML = '✓ Found <strong>' + escHtml(pts[0].name) + '</strong> in Halaxy — will book the existing patient.'; matchDiv.style.color = 'var(--teal)'; }
    } else {
      _sihState.patientId = null;
      if (matchDiv) { matchDiv.textContent = 'No Halaxy match — a new patient will be created.'; matchDiv.style.color = 'var(--t3)'; }
    }
  } catch (e) {
    _sihState.patientId = null;
    if (matchDiv) { matchDiv.textContent = 'Could not check Halaxy (will create new on book).'; matchDiv.style.color = 'var(--amber)'; }
  }
}

var _sihNameTimer = null;
function _sihDebounceNameSearch() { clearTimeout(_sihNameTimer); _sihNameTimer = setTimeout(_sihNameSearch, 350); }

// Find an EXISTING Halaxy patient by name (so existing clients are booked, not duplicated).
async function _sihNameSearch() {
  var q = ((document.getElementById('sih-namesearch') || {}).value || '').trim();
  var box = document.getElementById('sih-nameresults');
  if (!box) return;
  if (q.length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = '<div style="font-size:11px;color:var(--t3);padding:4px 0">Searching Halaxy…</div>';
  try {
    var d = await apiFetch('/api/admin-enquiries?halaxy_patient_name=' + encodeURIComponent(q));
    var pts = (d && d.patients) || [];
    if (!pts.length) { box.innerHTML = '<div style="font-size:11px;color:var(--t3);padding:4px 0">No Halaxy patient found — fill the name above to create a new one.</div>'; return; }
    box.innerHTML = pts.slice(0, 8).map(function(p) {
      return '<div onclick="_sihPickPatient(\'' + escHtml(String(p.id)) + '\',\'' + escHtml(p.name) + '\')" '
        + 'style="padding:7px 10px;border:1px solid rgba(255,255,255,0.12);border-radius:7px;margin-top:4px;cursor:pointer;font-size:12px;color:var(--t1)">'
        + escHtml(p.name) + ' <span style="color:var(--t3)">#' + escHtml(String(p.id)) + '</span></div>';
    }).join('');
  } catch (e) { box.innerHTML = '<div style="font-size:11px;color:var(--amber)">Search failed — try again.</div>'; }
}

function _sihPickPatient(id, name) {
  _sihState.patientId = String(id);
  // Keep the name in the (now-hidden) fields so a later create still has it if cleared.
  var parts = (name || '').trim().split(/\s+/);
  var fe = document.getElementById('sih-first'), le = document.getElementById('sih-last');
  if (fe && parts.length) fe.value = parts[0];
  if (le) le.value = parts.slice(1).join(' ');

  // Collapse the whole entry section and show a single "selected patient" hero.
  var entry = document.getElementById('sih-client-entry');
  var hero  = document.getElementById('sih-client-hero');
  if (entry) entry.style.display = 'none';
  if (hero) {
    var ini = (name || '?').split(/\s+/).slice(0, 2).map(function(w) { return (w[0] || '').toUpperCase(); }).join('');
    hero.style.display = '';
    hero.innerHTML =
        '<div style="display:flex;align-items:center;gap:12px;background:rgba(119,207,189,0.10);border:1px solid rgba(119,207,189,0.35);border-radius:12px;padding:13px 15px">'
      + '<div style="width:38px;height:38px;flex:0 0 auto;border-radius:50%;background:var(--teal);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px">' + escHtml(ini) + '</div>'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--teal);font-weight:600">Existing Halaxy patient</div>'
      +   '<div style="font-size:15px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(name) + '</div>'
      +   '<div style="font-size:11px;color:var(--t3)">Booking against this patient — no duplicate created</div>'
      + '</div>'
      + '<button onclick="_sihClearPatient()" title="Change patient" style="flex:0 0 auto;background:transparent;border:1px solid rgba(255,255,255,0.18);color:var(--t2);border-radius:8px;padding:6px 11px;font-size:11.5px;cursor:pointer">Change</button>'
      + '</div>';
  }
}

// Undo a patient selection — restore the entry fields so a different patient (or a new one) can be entered.
function _sihClearPatient() {
  _sihState.patientId = null;
  var entry = document.getElementById('sih-client-entry');
  var hero  = document.getElementById('sih-client-hero');
  if (hero)  { hero.style.display = 'none'; hero.innerHTML = ''; }
  if (entry) entry.style.display = '';
  var md = document.getElementById('sih-match'); if (md) md.textContent = '';
  var ns = document.getElementById('sih-namesearch'); if (ns) { ns.value = ''; ns.focus(); }
}

// Undo the armed state — restore the form and the Book/Cancel buttons.
function _sihUnarm() {
  var bodyEl = document.getElementById('sih-body');
  if (bodyEl) { bodyEl.style.opacity = ''; bodyEl.style.pointerEvents = ''; }
  var bk = document.getElementById('sih-book-btn');
  var cn = document.getElementById('sih-cancel-btn');
  if (bk) { bk.disabled = false; bk.textContent = 'Book in Halaxy →'; bk.setAttribute('onclick', '_sihSubmit()'); }
  if (cn) { cn.textContent = 'Cancel'; cn.setAttribute('onclick', "this.closest('.db-modal-overlay').remove()"); }
  var msg = document.getElementById('sih-msg'); if (msg) msg.textContent = '';
}

async function _sihSubmit(confirmed) {
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  var msg = document.getElementById('sih-msg');
  function err(t) { if (msg) { msg.textContent = t; msg.style.color = 'var(--terra)'; } }

  var first = val('sih-first'), last = val('sih-last'), email = val('sih-email'), phone = val('sih-phone');
  var fkey = val('sih-funder'), tid = val('sih-type'), date = val('sih-date'), time = val('sih-time');
  var dur = parseInt(val('sih-dur') || '60', 10) || 60;
  var funder = _bookableFunder(fkey);
  if (!first || !last) return err('Enter the client’s first and last name.');
  if (!funder)         return err('Choose a funding type.');
  var item = funder.items.find(function(i) { return i.id === tid; });
  if (!item)           return err('Choose a session type.');
  if (!date)           return err('Choose a date.');
  var fee = _bookableResolveFee(item);
  if (!fee)            return err('This session type has no fee configured — set it in Settings → Booking fees.');
  var pmName = funder.planManaged ? val('sih-pm') : '';
  if (funder.planManaged && !pmName) return err('Choose the NDIS plan manager.');

  // Arm-to-confirm — no popup, no duplicated summary. First tap dims the form for a final glance
  // and turns the button into a deliberate "Confirm — book $X" with the amount on it; a second tap
  // commits. "Edit" un-arms. Proves intent without a dialog or repeating the details.
  if (!confirmed) {
    if (msg) msg.textContent = '';
    var bodyEl = document.getElementById('sih-body');
    if (bodyEl) { bodyEl.style.opacity = '0.45'; bodyEl.style.pointerEvents = 'none'; }
    var bk = document.getElementById('sih-book-btn');
    var cn = document.getElementById('sih-cancel-btn');
    if (bk) {
      bk.textContent = 'Confirm — book $' + fee.amount.toFixed(2) + ' →';
      bk.setAttribute('onclick', '_sihSubmit(true)');
      bk.disabled = true; // brief guard so an accidental double-tap can't auto-confirm
      setTimeout(function () { var b = document.getElementById('sih-book-btn'); if (b) b.disabled = false; }, 350);
    }
    if (cn) { cn.textContent = 'Edit'; cn.setAttribute('onclick', '_sihUnarm()'); }
    return;
  }

  // Brisbane = UTC+10, no DST. Build start, derive end from duration.
  var TZ = '+10:00';
  var apptStart = date + 'T' + (time.length === 5 ? time : '10:00') + ':00' + TZ;
  var endMs = new Date(apptStart).getTime() + dur * 60 * 1000;
  var _e = new Date(endMs + 10 * 3600 * 1000), _p = function(n) { return ('0' + n).slice(-2); };
  var apptEnd = _e.getUTCFullYear() + '-' + _p(_e.getUTCMonth() + 1) + '-' + _p(_e.getUTCDate())
    + 'T' + _p(_e.getUTCHours()) + ':' + _p(_e.getUTCMinutes()) + ':00' + TZ;

  var btn = document.getElementById('sih-book-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }
  if (msg) { msg.style.color = 'var(--t3)'; msg.textContent = 'Setting up…'; }
  try {
    var patientId = _sihState.patientId;
    if (!patientId) {
      if (msg) msg.textContent = 'Creating patient in Halaxy…';
      var cr = await apiFetch('/api/admin-enquiries?halaxy_create_patient=1', { method: 'POST', body: {
        firstName: first, lastName: last, email: email || undefined, phone: phone || undefined,
        funder: funder.billingKey, planManager: pmName || undefined,
      } });
      patientId = cr && cr.halaxyId;
      if (!patientId) throw new Error('Halaxy did not return a patient id');
    }
    if (funder.billingKey !== 'private') {
      var payorId = null, payorName = funder.label;
      if (funder.planManaged) {
        var pm = (_halaxyFunders || []).find(function(f) { return f.name === pmName; });
        payorId = pm ? pm.id : null; payorName = pmName;
      } else {
        var hxF = (_halaxyFunders || []).find(function(f) { return f.billingKey === funder.billingKey; });
        payorId = hxF ? hxF.id : null; payorName = hxF ? hxF.name : funder.label;
      }
      if (msg) msg.textContent = 'Linking funder coverage…';
      try {
        await apiFetch('/api/admin-enquiries?halaxy_coverage=1', { method: 'POST', body: { patientId: String(patientId), payorId: payorId, payorName: payorName } });
      } catch (ce) { console.warn('[sih] coverage failed:', ce && ce.message); }
    }
    if (msg) msg.textContent = 'Booking appointment + creating invoice…';
    // Halaxy's $book only accepts location-type 'clinic' on CREATE (online/phone → 422). The
    // modality is already captured by the chosen fee (e.g. "Online — $180"), so the invoice is
    // correct; the appointment's location can be adjusted in Halaxy later if it matters.
    await apiFetch('/api/admin-enquiries?halaxy_appt_action=1', { method: 'POST', body: {
      action: 'book', patientId: String(patientId), apptStart: apptStart, apptEnd: apptEnd,
      feeId: fee.feeId, feeName: fee.name, feeAmount: fee.amount, locationType: 'clinic',
    } });
    toast('Set up in Halaxy ✓ — patient booked, invoice created', 'ok');
    var ov = document.getElementById('sih-overlay'); if (ov) ov.remove();
    refreshPipeline();
  } catch (e) {
    _sihUnarm(); // restore the form + buttons so they can fix and retry
    err('Failed: ' + (e && e.message ? e.message : 'error'));
  }
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
  var date    = (document.getElementById('pl-sess-date-'   + clientId) || {}).value;
  var time    = (document.getElementById('pl-sess-time-'   + clientId) || {}).value.trim();
  var type    = (document.getElementById('pl-sess-type-'   + clientId) || {}).value;
  var status  = (document.getElementById('pl-sess-status-' + clientId) || {}).value || 'upcoming';
  var inv     = (document.getElementById('pl-sess-inv-'    + clientId) || {}).value.trim();
  var notes   = (document.getElementById('pl-sess-notes-'  + clientId) || {}).value.trim();
  if (!date) { toast('Enter a session date.', 'err'); return; }

  // Look up client name so the GCal event has a meaningful title
  var client = _pipelineData && (_pipelineData.clients || []).find(function(c) { return c.id === clientId; });
  var clientName = client ? client.display_name : null;

  try {
    var result = await apiFetch('/api/sessions', {
      method: 'POST',
      body: {
        client_id:    clientId,
        session_date: date,
        session_time: time    || null,
        session_type: type    || null,
        status:       status,
        invoice_ref:  inv     || null,
        notes:        notes   || null,
        client_name:  clientName,
      },
    });
    var calMsg = (time && result.gcal_event_id) ? ' + calendar event created' : '';
    toast('Session added' + calMsg);
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
// ── Optimistic enquiry mutation ──────────────────────────────────────────────
// Apply `changes` to an enquiry in the local _pipelineData immediately (+ an optional
// synthetic activity entry), so the UI reflects it instantly with no server round-trip.
// Returns revert() to undo if the background PATCH fails. Callers re-render with
// renderPipeline() (reads local data — no fetch, no "Pipeline refreshed" flash).
function _optimisticEnquiry(id, changes, activityEntry) {
  if (!_pipelineData || !_pipelineData.enquiries) return function () {};
  var e = _pipelineData.enquiries.find(function (x) { return String(x.id) === String(id); });
  if (!e) return function () {};
  var prev = {};
  Object.keys(changes).forEach(function (k) { prev[k] = e[k]; e[k] = changes[k]; });
  if (activityEntry) e.activity = [activityEntry].concat(e.activity || []);
  return function revert() {
    Object.keys(prev).forEach(function (k) { e[k] = prev[k]; });
    if (activityEntry && e.activity) { var i = e.activity.indexOf(activityEntry); if (i !== -1) e.activity.splice(i, 1); }
  };
}

async function advanceEnquiryStatus(id, newStatus) {
  var key = id + ':' + newStatus;
  if (_advanceInFlight[key]) return;                     // block double-submit
  _advanceInFlight[key] = true;

  // Optimistic: update local state + re-render in place (instant, no fetch), confirm with the
  // success tick. The background PATCH reconciles; revert + re-render only if it fails.
  var act = { action: 'status', detail: newStatus, created_at: new Date().toISOString(), actor: (window.ADMIN_USER || 'You') };
  var revert = _optimisticEnquiry(id, { status: newStatus }, act);
  renderPipeline();
  _showSuccess('mark', newStatus === 'contacted' ? 'Marked contacted' : 'Status updated');

  try {
    await apiFetch('/api/admin-enquiries?id=' + id, { method: 'PATCH', body: { status: newStatus } });
  } catch (err) {
    revert();
    renderPipeline();
    toast('Could not update — change reverted: ' + err.message, 'err');
  } finally {
    delete _advanceInFlight[key];
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
    + '<div style="font-size:22px;font-weight:600;color:var(--t1,rgba(255,255,255,0.92));margin-bottom:6px">Map to Halaxy</div>'
    + '<div style="font-size:13px;color:var(--t3,rgba(255,255,255,0.4));margin-bottom:24px">Link <strong>' + displayName + '</strong> to their Halaxy patient record.</div>'

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
    + '<div style="font-size:22px;font-weight:600;color:var(--t1,rgba(255,255,255,0.92));margin-bottom:6px">Create in Halaxy</div>'
    + '<div style="font-size:13px;color:var(--t3,rgba(255,255,255,0.4));margin-bottom:24px">A new patient record will be created in Halaxy and linked to this onboarding record.</div>'

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
  if (active) {
    // Reactivation — simple confirm
    if (!confirm('Reactivate this client?')) return;
    try {
      await apiFetch('/api/clients', { method: 'PATCH', body: { id: clientId, active: true } });
      toast('Client reactivated');
      refreshPipeline();
    } catch (err) {
      toast('Could not reactivate: ' + err.message, 'err');
    }
    return;
  }

  // Archive — show a richer confirmation modal
  var client   = _pipelineData && (_pipelineData.clients || []).find(function(c) { return c.id === clientId; });
  if (!client) return;

  var sessions = client.sessions || [];
  var gcalSess = sessions.filter(function(s) { return s.gcal_event_id; });
  var FUNDER_LABELS_LOCAL = {
    ndis_plan: 'NDIS Plan-Managed', ndis_self: 'NDIS Self-Managed',
    medicare: 'Medicare', private: 'Private', qfes: 'QFES EAP',
    workcover: 'WorkCover', dva: 'DVA / ADFHSC',
  };
  var funderLabel = FUNDER_LABELS_LOCAL[client.funder] || client.funder || '—';
  var halaxyLinked = !!(client.halaxy_id && client.halaxy_id.trim());

  var gcalNote = gcalSess.length > 0
    ? '<div class="db-hint-box" style="background:rgba(190,110,68,0.08);border-color:rgba(190,110,68,0.22);color:var(--db-amber);margin-top:12px">'
      + '<span>⚠</span><span>' + gcalSess.length + ' Google Calendar event' + (gcalSess.length !== 1 ? 's' : '') + ' will be deleted from the Pending Clients calendar.</span>'
      + '</div>'
    : '<div style="font-size:11.5px;color:var(--db-t3);margin-top:10px">No calendar events to remove.</div>';

  var halaxyNote = halaxyLinked
    ? '<div class="db-hint-box" style="margin-top:8px"><span>✓</span><span>Linked to Halaxy — they\'ll continue to appear via Halaxy sync after archiving.</span></div>'
    : '<div class="db-hint-box" style="background:rgba(217,79,47,0.07);border-color:rgba(217,79,47,0.2);color:var(--db-red);margin-top:8px"><span>!</span><span>Not yet linked to Halaxy. Link them first or they\'ll disappear from the active list.</span></div>';

  var overlay = document.createElement('div');
  overlay.className = 'db-modal-overlay open';
  overlay.onclick = function(ev) { if (ev.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div class="db-modal" style="width:420px">'
    + '<div class="db-modal-hdr">'
    + '<div><div class="db-modal-title">Archive ' + escHtml(client.display_name) + '?</div>'
    + '<div class="db-modal-sub">Moves them out of the admin active list</div></div>'
    + '<button class="db-modal-close" onclick="this.closest(\'.db-modal-overlay\').remove()">×</button>'
    + '</div>'
    + '<div class="db-modal-body" style="gap:6px">'
    + '<div style="display:flex;gap:20px;padding:10px 14px;background:rgba(0,0,0,0.025);border-radius:8px">'
    + '<div><div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.09em;color:var(--db-t3);margin-bottom:3px">Funder</div><div style="font-size:13px;font-weight:600;color:var(--db-text)">' + escHtml(funderLabel) + '</div></div>'
    + '<div><div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.09em;color:var(--db-t3);margin-bottom:3px">Sessions</div><div style="font-size:13px;font-weight:600;color:var(--db-text)">' + sessions.length + '</div></div>'
    + '<div><div style="font-size:9.5px;text-transform:uppercase;letter-spacing:0.09em;color:var(--db-t3);margin-bottom:3px">Halaxy</div><div style="font-size:13px;font-weight:600;color:' + (halaxyLinked ? 'var(--db-teal)' : 'var(--db-red)') + '">' + (halaxyLinked ? 'Linked ✓' : 'Not linked') + '</div></div>'
    + '</div>'
    + halaxyNote
    + gcalNote
    + '</div>'
    + '<div class="db-modal-ftr">'
    + '<button class="db-btn-ghost" onclick="this.closest(\'.db-modal-overlay\').remove()">Cancel</button>'
    + '<button class="db-btn-primary" style="background:var(--db-red);box-shadow:0 2px 8px rgba(217,79,47,0.25)" onclick="this.closest(\'.db-modal-overlay\').remove();_doArchiveClient(\'' + clientId + '\')">Archive' + (gcalSess.length ? ' + Delete Calendar Events' : '') + '</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
}

async function _doArchiveClient(clientId) {
  try {
    await apiFetch('/api/clients', { method: 'PATCH', body: { id: clientId, active: false } });
    toast('Client archived');
    closeDetailPanel();
    refreshPipeline();
  } catch (err) {
    toast('Could not archive: ' + err.message, 'err');
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
    // Recompute inbox buckets now that cal data is live — ensures unlinked
    // appointments surface in the inbox immediately, regardless of load order
    _recomputeInboxBuckets();

  } catch (err) {
    _setChip('err', 'Calendar', 'Error: ' + err.message);
    _calEventsLoaded = true;
    renderAppointmentsPanel();
    _recomputeInboxBuckets();
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
    var _noEmailEl = document.getElementById('cl-halaxy-lookup');
    if (_noEmailEl) _noEmailEl.innerHTML = '<div class="cl-halaxy-lookup-notfound">No email address provided — search by name above to link a Halaxy patient.</div>';
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

function _hideHalaxyLookup() {
  var el = document.getElementById('cl-halaxy-lookup');
  if (el) { el.innerHTML = ''; }
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
  modal.innerHTML = '<div style="background:#111A2B;border:1px solid rgba(255,255,255,0.10);border-radius:14px;padding:24px;width:100%;max-width:420px;box-shadow:0 8px 40px rgba(0,0,0,0.5);color:var(--t1,#F4F7F6)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
    + '<strong style="font-size:15px;color:var(--t1,#F4F7F6)">New Appointment</strong>'
    + '<button onclick="closeNewSessionModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--t3,#7E93A8)">&times;</button>'
    + '</div>'
    + '<div style="font-size:11.5px;color:#9AABA8;margin-bottom:16px">Books directly into Halaxy — invoice auto-generated when a fee is selected</div>'

    + '<label style="font-size:12px;color:var(--t3,#7E93A8);display:block;margin-bottom:3px">Halaxy client</label>'
    + '<input list="ns-client-list" id="ns-client-input" class="pl-link-input" placeholder="Search Halaxy clients…" style="margin-bottom:10px" oninput="_nsClientChange()">'
    + '<datalist id="ns-client-list">' + clientOpts + '</datalist>'
    + '<input type="hidden" id="ns-halaxy-id">'

    + '<label style="font-size:12px;color:var(--t3,#7E93A8);display:block;margin-bottom:3px">Date</label>'
    + '<input type="date" id="ns-date" class="pl-link-input" value="' + defaultDate + '" style="margin-bottom:10px">'

    + '<div style="display:flex;gap:8px;margin-bottom:10px">'
    + '<div style="flex:1"><label style="font-size:12px;color:var(--t3,#7E93A8);display:block;margin-bottom:3px">Start time</label>'
    + '<input type="time" id="ns-start" class="pl-link-input" value="' + defaultTime + '"></div>'
    + '<div style="flex:1"><label style="font-size:12px;color:var(--t3,#7E93A8);display:block;margin-bottom:3px">Duration</label>'
    + '<select id="ns-duration" class="pl-link-input">'
    + '<option value="30">30 min</option><option value="45">45 min</option>'
    + '<option value="60" selected>60 min</option><option value="90">90 min</option>'
    + '<option value="120">2 hours</option></select></div>'
    + '</div>'

    + '<label style="font-size:12px;color:var(--t3,#7E93A8);display:block;margin-bottom:3px">Fee <span style="color:#9AABA8;font-weight:400">(optional — triggers auto-invoice in Halaxy)</span></label>'
    + '<select id="ns-fee" class="pl-link-input" style="margin-bottom:10px">'
    + '<option value="">— select a fee —</option>' + feeOpts + '</select>'

    + '<label style="font-size:12px;color:var(--t3,#7E93A8);display:block;margin-bottom:3px">Location</label>'
    + '<select id="ns-location" class="pl-link-input" style="margin-bottom:10px">'
    + '<option value="clinic" selected>In-clinic</option>'
    + '<option value="telehealth">Telehealth (video)</option>'
    + '<option value="phone">Phone</option>'
    + '<option value="online">Online</option>'
    + '</select>'

    + '<label style="font-size:12px;color:var(--t3,#7E93A8);display:block;margin-bottom:3px">Notes</label>'
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

  // Optimistic: close locally + re-render in place, success tick, no full re-fetch.
  var changes = { status: 'closed' };
  if (reason) changes.closed_reason = reason;
  if (note)   changes.notes = note;
  var act = { action: 'status', detail: 'closed' + (reason ? ':' + reason : ''), created_at: new Date().toISOString(), actor: (window.ADMIN_USER || 'You') };
  var revert = _optimisticEnquiry(enqId, changes, act);
  renderPipeline();
  closeDetailPanel();
  _showSuccess('delete', 'Enquiry closed');

  try {
    await apiFetch('/api/admin-enquiries?id=' + enqId, { method: 'PATCH', body: changes });
  } catch (err) {
    revert();
    renderPipeline();
    toast('Could not close — change reverted: ' + err.message, 'err');
  }
}

/* ── Funders view ── */
function renderFundersView() {
  var content = document.getElementById('view-content');
  if (!content) return;

  var invoices     = (_halaxyData && _halaxyData.invoices) || [];
  var hxCoverageMap = (_halaxyData && _halaxyData.patientFunderMap) || {};

  // ── Billing stats (from Halaxy data) ──
  var byFunder = {};
  invoices.forEach(function(inv) {
    if (!inv.patientId || inv.status === 'cancelled' || inv.status === 'draft') return;
    var pid = String(inv.patientId);
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
  function extLink() {
    return '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" style="opacity:0.55;flex-shrink:0;vertical-align:middle;margin-left:3px"><path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8M7 1h4m0 0v4m0-4L5.5 6.5"/></svg>';
  }

  var html = '<div class="funders-view">';
  html += '<div class="funders-view-hd"><span class="view-title">Funders</span></div>';

  // ── Billing activity (only if Halaxy data loaded) ──
  var billingKeys = Object.keys(byFunder).filter(function(k) { return byFunder[k].count > 0; });
  if (billingKeys.length) {
    html += '<div class="fv-sec-hdr"><span class="fv-sec-title">Billing Activity</span><div class="fv-sec-divider"></div></div>';
    html += '<div class="funder-billing-grid">';
    var allKeys = Object.keys(FUNDER_LABELS);
    Object.keys(byFunder).forEach(function(k) { if (!allKeys.includes(k)) allKeys.push(k); });
    allKeys.forEach(function(fk) {
      var stats = byFunder[fk];
      if (!stats || !stats.count) return;
      var label = FUNDER_LABELS[fk] || fk;
      html += '<div class="funder-billing-card">'
        + '<div style="flex:1;min-width:0">'
        + '<div class="funder-billing-name">' + escHtml(label) + '</div>'
        + '<div class="funder-billing-sub">' + stats.count + ' invoice' + (stats.count !== 1 ? 's' : '') + (stats.paid > 0 ? ' · ' + fmt(stats.paid) + ' paid' : '') + '</div>'
        + '</div>'
        + '<div class="funder-billing-stat">'
        + '<div class="funder-billing-val' + (stats.owing > 0 ? ' owing' : '') + '">' + (stats.owing > 0 ? fmt(stats.owing) : '—') + '</div>'
        + '<div class="funder-billing-lbl">' + (stats.owing > 0 ? 'outstanding' : 'all clear') + '</div>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
  }

  // ── Reference cards ──

  // NDIS
  html += '<div class="fv-sec-hdr"><span class="fv-sec-title">NDIS — Plan Managed</span><div class="fv-sec-divider"></div></div>';
  html += '<div class="funder-ref-grid">';

  // Plan Partners
  html += '<div class="funder-ref-card">'
    + '<div class="funder-ref-hdr">'
    + '<div class="funder-ref-icon" style="background:rgba(42,88,80,0.09)">🏢</div>'
    + '<div><div class="funder-ref-name">Plan Partners</div><div class="funder-ref-sub">NDIS plan manager — portal submission</div></div>'
    + '</div>'
    + '<div class="funder-ref-body">'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Portal</span><span class="funder-ref-val"><a href="https://dashboard.planpartners.com.au" target="_blank">dashboard.planpartners.com.au' + extLink() + '</a></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Process</span><span class="funder-ref-val"><div class="funder-ref-process"><strong>Step 1.</strong> Log in to portal<br><strong>Step 2.</strong> Upload invoice for each session</div></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Invoicing</span><span class="funder-ref-val">One invoice at a time</span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Remittance</span><span class="funder-ref-val">Available on portal — check after submission</span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Payment</span><span class="funder-ref-val"><span class="funder-pay-badge">Direct Deposit</span></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Login</span><span class="funder-ref-val" style="color:var(--mid)">reachout@chereemcgarry.com</span></div>'
    + '</div></div>';

  // In Choice
  html += '<div class="funder-ref-card">'
    + '<div class="funder-ref-hdr">'
    + '<div class="funder-ref-icon" style="background:rgba(42,88,80,0.09)">🏢</div>'
    + '<div><div class="funder-ref-name">In Choice</div><div class="funder-ref-sub">NDIS plan manager — email via Halaxy</div></div>'
    + '</div>'
    + '<div class="funder-ref-body">'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Contact</span><span class="funder-ref-val"><a href="mailto:accounts@inchoice.com.au">accounts@inchoice.com.au</a></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Process</span><span class="funder-ref-val"><div class="funder-ref-process"><strong>Step 1.</strong> Generate invoice in Halaxy<br><strong>Step 2.</strong> Email invoice directly through Halaxy to accounts@inchoice.com.au</div></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Invoicing</span><span class="funder-ref-val">One invoice at a time</span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Remittance</span><span class="funder-ref-val">Emailed by <span style="color:var(--mid)">accounts@inchoice.com.au</span></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Payment</span><span class="funder-ref-val"><span class="funder-pay-badge">Direct Deposit</span></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Login</span><span class="funder-ref-val" style="color:var(--soft)">N/A — email only</span></div>'
    + '</div></div>';

  html += '</div>'; // /NDIS grid

  // WorkCover
  html += '<div class="fv-sec-hdr"><span class="fv-sec-title">WorkCover</span><div class="fv-sec-divider"></div></div>';
  html += '<div class="funder-ref-grid" style="grid-template-columns:minmax(340px,600px)">';
  html += '<div class="funder-ref-card">'
    + '<div class="funder-ref-hdr">'
    + '<div class="funder-ref-icon" style="background:rgba(190,110,68,0.1)">🛡️</div>'
    + '<div><div class="funder-ref-name">WorkCover Queensland</div><div class="funder-ref-sub">Submit via WorkCover online portal</div></div>'
    + '</div>'
    + '<div class="funder-ref-body">'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Portal</span><span class="funder-ref-val"><a href="https://ols.workcoverqld.com.au/ols/login.wc" target="_blank">ols.workcoverqld.com.au' + extLink() + '</a></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Process</span><span class="funder-ref-val"><div class="funder-ref-process"><strong>Step 1.</strong> Generate invoice in Halaxy<br><strong>Step 2.</strong> Submit invoice through the WorkCover online portal</div></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Invoicing</span><span class="funder-ref-val">One invoice at a time</span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Remittance</span><span class="funder-ref-val">Emailed by <span style="color:var(--mid)">info@workcoverqld.com.au</span></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Payment</span><span class="funder-ref-val"><span class="funder-pay-badge">Direct Deposit</span></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Login</span><span class="funder-ref-val" style="color:var(--mid)">reachout@chereemcgarry.com</span></div>'
    + '</div></div>';
  html += '</div>'; // /WorkCover grid

  // QFES
  html += '<div class="fv-sec-hdr"><span class="fv-sec-title">QFES — Employee Assistance</span><div class="fv-sec-divider"></div></div>';
  html += '<div class="funder-ref-grid" style="grid-template-columns:minmax(340px,600px)">';
  html += '<div class="funder-ref-card">'
    + '<div class="funder-ref-hdr">'
    + '<div class="funder-ref-icon" style="background:rgba(0,0,0,0.05)">🔥</div>'
    + '<div><div class="funder-ref-name">Queensland Fire &amp; Emergency Services</div><div class="funder-ref-sub">SharePoint form + email with invoice</div></div>'
    + '</div>'
    + '<div class="funder-ref-body">'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Portal</span><span class="funder-ref-val"><a href="https://qfes.sharepoint.com/" target="_blank">qfes.sharepoint.com' + extLink() + '</a></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Process</span><span class="funder-ref-val"><div class="funder-ref-process"><strong>Step 1.</strong> Complete the SharePoint reimbursement form<br><strong>Step 2.</strong> Email invoice to <a href="mailto:bso.fessn@fire.qld.gov.au">bso.fessn@fire.qld.gov.au</a> with invoice attached</div></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Invoicing</span><span class="funder-ref-val">Batch all sessions where possible — one at a time is acceptable if needed</span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Remittance</span><span class="funder-ref-val">Emailed by <span style="color:var(--mid)">ecc.eft.remittance@chde.qld.gov.au</span></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Payment</span><span class="funder-ref-val"><span class="funder-pay-badge">Direct Deposit</span></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Login</span><span class="funder-ref-val" style="color:var(--mid)">reachout@chereemcgarry.com</span></div>'
    + '</div></div>';
  html += '</div>'; // /QFES grid

  // BUPA / ADFHSC
  html += '<div class="fv-sec-hdr"><span class="fv-sec-title">BUPA / ADFHSC — Open Arms &amp; DVA</span><div class="fv-sec-divider"></div></div>';
  html += '<div class="funder-ref-grid" style="grid-template-columns:minmax(340px,600px)">';
  html += '<div class="funder-ref-card">'
    + '<div class="funder-ref-hdr">'
    + '<div class="funder-ref-icon" style="background:rgba(61,111,168,0.1)">⭐</div>'
    + '<div><div class="funder-ref-name">BUPA / ADFHSC</div><div class="funder-ref-sub">ADF members, families &amp; DVA — portal upload</div></div>'
    + '</div>'
    + '<div class="funder-ref-body">'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Portal</span><span class="funder-ref-val"><a href="https://acs.adfhsc.com.au/login/" target="_blank">acs.adfhsc.com.au/login' + extLink() + '</a></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Process</span><span class="funder-ref-val"><div class="funder-ref-process"><strong>Step 1.</strong> Log in to the ADFHSC portal<br><strong>Step 2.</strong> Upload invoice for each session</div></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Invoicing</span><span class="funder-ref-val">One invoice at a time</span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Remittance</span><span class="funder-ref-val">Emailed by <span style="color:var(--mid)">adfhscproviders@bupa.com.au</span></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Payment</span><span class="funder-ref-val"><span class="funder-pay-badge">Direct Deposit</span></span></div>'
    + '<div class="funder-ref-row"><span class="funder-ref-lbl">Login</span><span class="funder-ref-val" style="color:var(--mid)">cheree.mcgarry@adfhsc.com.au</span></div>'
    + '</div></div>';
  html += '</div>'; // /BUPA grid

  html += '</div>'; // /.funders-view
  content.innerHTML = html;
}

/* ── Escape HTML helper ── */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
