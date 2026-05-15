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
  ndis_self: '', // paste NDIS self-managed intake URL when available
  qfes:      '', // paste QFES EAP intake URL when available
  dva:       '', // paste DVA intake URL when available
};

/* ── Toast notifications ── */
function toast(msg, type) {
  var el = document.createElement('div');
  var bg = type === 'err' ? '#BE6E44' : '#2A5850';
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;max-width:340px;'
    + 'padding:11px 18px;border-radius:9px;font-family:Raleway,sans-serif;font-size:13px;'
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
});

/* ═══════════════════════════════════════════════════════════════
   UNIFIED PIPELINE — enquiries + clients + Halaxy
   ═══════════════════════════════════════════════════════════════ */

var _pipelineData = null;
var _halaxyData   = { connected: false, appointments: [], patients: [] };
var _calEventMap    = {};    // eventId → event object
var _calDismissed   = new Set(JSON.parse(localStorage.getItem('cal_dismissed') || '[]'));
var _halaxyFees     = null; // cached ChargeItemDefinition list
var _calSearchTimer = null; // debounce timer for Halaxy patient search

/* Close any open card dropdown when clicking elsewhere */
document.addEventListener('click', function(e) {
  if (!e.target.closest('.pl-card-menu')) {
    document.querySelectorAll('.pl-card-dropdown.is-open').forEach(function(d) { d.classList.remove('is-open'); });
    document.querySelectorAll('.pl-card-menu-btn.is-open').forEach(function(b) { b.classList.remove('is-open'); });
  }
});

var FUNDER_LABELS = {
  ndis_plan: 'NDIS Plan',
  ndis_self: 'NDIS Self',
  medicare:  'Medicare',
  qfes:      'QFES EAP',
  dva:       'DVA',
  private:   'Private',
};

/* Default session rates (AUD) — editable in the fee field */
var FUNDER_RATES = {
  ndis_plan: '193.99',
  ndis_self: '193.99',
  medicare:  '141.85',
  qfes:      '190.00',
  dva:       '141.85',
  private:   '200.00',
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
  new:       { label: 'Mark contacted →', next: 'contacted'  },
  contacted: { label: 'In intake →',      next: 'in_halaxy'  },
  in_halaxy: { label: 'Close →',          next: 'closed'     },
};

var _modalSearchTimer = null; // debounce timer for Add Client modal Halaxy search
var _halaxyFunders   = null; // cached Halaxy funder org list

/* ── Load pipeline ── */
function plSkeletons(n) {
  var heights = [64, 52, 58, 48, 60];
  var html = '<div class="pl-loading">';
  for (var i = 0; i < n; i++) html += '<div class="pl-skeleton" style="height:' + heights[i % heights.length] + 'px"></div>';
  return html + '</div>';
}

async function loadPipeline() {
  window._pipelineLoaded = true;
  // Show skeletons in all columns while loading
  ['new','contacted','intake','active','closed'].forEach(function(col) {
    var el = document.getElementById('cards-' + col);
    if (el && el.querySelector('.pl-loading')) el.innerHTML = plSkeletons(col === 'new' ? 3 : 2);
  });
  loadCalendarPending(); // non-blocking
  try {
    var r = await fetch('/api/admin-enquiries');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var d = await r.json();
    _pipelineData = d;
    _halaxyData   = d.halaxy || { connected: false, appointments: [], patients: [] };
    renderPipeline();
    updateHalaxyDot();
  } catch (err) {
    ['new','contacted','intake','active','closed'].forEach(function(col) {
      var el = document.getElementById('cards-' + col);
      if (el) el.innerHTML = '<div class="pl-empty">Load failed: ' + escHtml(err.message) + '</div>';
    });
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
    _pipelineData = d;
    _halaxyData   = d.halaxy || { connected: false, appointments: [], patients: [] };
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
  var dot     = document.getElementById('halaxy-status-dot');
  var label   = document.getElementById('halaxy-chip-label');
  var tooltip = document.getElementById('halaxy-tooltip');
  if (!dot) return;

  if (_halaxyData.connected) {
    var apptCount = (_halaxyData.appointments || []).length;
    dot.className       = 'halaxy-dot halaxy-dot--ok';
    if (label)   label.textContent   = 'Halaxy';
    if (tooltip) tooltip.innerHTML   = '✓ Connected<br>'
      + apptCount + ' upcoming appointment' + (apptCount === 1 ? '' : 's') + ' loaded';
  } else {
    dot.className       = 'halaxy-dot halaxy-dot--error';
    if (label)   label.textContent   = 'Halaxy';
    if (tooltip) tooltip.innerHTML   = _halaxyData.error
      ? '✗ Error: ' + escHtml(_halaxyData.error) + '<br><span style="opacity:0.65">Check API credentials in Vercel env vars</span>'
      : '✗ Not connected<br><span style="opacity:0.65">Add HALAXY_CLIENT_ID + SECRET in Vercel</span>';
  }
}

function renderPipeline() {
  if (!_pipelineData) return;
  var enquiries = _pipelineData.enquiries || [];
  var clients   = _pipelineData.clients   || [];

  var cols = {
    new:       enquiries.filter(function(e) { return (e.status || 'new') === 'new'; }),
    contacted: enquiries.filter(function(e) { return e.status === 'contacted'; }),
    intake:    enquiries.filter(function(e) { return e.status === 'in_halaxy'; }),
    active:    clients.filter(function(c)   { return c.active; }),
    closed:    clients.filter(function(c)   { return !c.active; })
               .concat(enquiries.filter(function(e) { return e.status === 'closed'; })),
  };

  Object.keys(cols).forEach(function(col) {
    var items = cols[col];
    var cards = document.getElementById('cards-' + col);
    var count = document.getElementById('count-' + col);
    if (count) count.textContent = items.length || '';
    if (!cards) return;
    if (!items.length) {
      cards.innerHTML = '<div class="pl-empty">Empty</div>';
      return;
    }
    if (col === 'active') {
      cards.innerHTML = items.map(function(c) { return renderClientCardPl(c); }).join('');
    } else if (col === 'closed') {
      cards.innerHTML = items.map(function(item) {
        return (item.active !== undefined) ? renderClientCardPl(item) : renderEnquiryCardPl(item);
      }).join('');
    } else {
      cards.innerHTML = items.map(function(e) { return renderEnquiryCardPl(e); }).join('');
    }
  });
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
      + '<select class="pl-intake-sel" id="pl-itype-' + e.id + '" onclick="event.stopPropagation()" onchange="updatePipelineIntakeUrl(\'' + e.id + '\')">'
      + '<option value="new">New client</option>'
      + '<option value="private">Private</option>'
      + '<option value="medicare">Medicare (MHCP)</option>'
      + '<option value="ndis_plan">NDIS — Plan-managed</option>'
      + '<option value="ndis_self">NDIS — Self-managed</option>'
      + '<option value="qfes">QFES EAP</option>'
      + '<option value="dva">DVA / ADFHCS</option>'
      + '</select>'
      + '<input class="pl-intake-url" id="pl-iurl-' + e.id + '" type="url" placeholder="Paste Halaxy intake URL…" onclick="event.stopPropagation()">'
      + '<button class="pl-intake-send" onclick="event.stopPropagation();sendIntakePl(\'' + e.id + '\')">Send →</button>'
      + '</div>'
      + '<div id="pl-imsg-' + e.id + '" style="font-size:10px;margin-top:4px"></div>'
      + '</div>';
  }

  var menuItems = [];
  if (status !== 'closed') menuItems.push({ label: '🔗 Link to existing client', fn: 'openLinkPanel("' + uid + '","enq","' + e.id + '")' });
  menuItems.push({ label: '✕ Close without converting', fn: 'advanceEnquiryStatus("' + e.id + '","closed")', warn: true });

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
      + '<a href="https://www.halaxy.com/practitioner" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="pl-halaxy-open">Open ↗</a>'
      + '<button class="pl-halaxy-clear-btn" onclick="event.stopPropagation();clearHalaxyIdPl(\'' + c.id + '\')">Unlink</button>'
      + '</div>';
  } else {
    halaxySection += '<div class="pl-halaxy-unlinked">'
      + '<div class="pl-halaxy-steps">To link: <strong>1)</strong> Create a Patient in Halaxy &amp; set up a professional appointment &nbsp;·&nbsp; <strong>2)</strong> Paste their Halaxy Patient ID below</div>'
      + '<div class="pl-halaxy-input-row">'
      + '<input class="pl-halaxy-input" id="pl-halaxy-inp-' + c.id + '" type="text" placeholder="Halaxy Patient ID…" onclick="event.stopPropagation()">'
      + '<a href="https://www.halaxy.com/practitioner" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="pl-action-btn pl-action-btn--soft" style="text-decoration:none;font-size:10px">Open Halaxy ↗</a>'
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
    + '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();toggleAddSessionFormPl(\'' + c.id + '\')">+ Session</button>'
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

/* ── Add client modal ── */
function openAddClient() {
  document.getElementById('cl-display-name').value    = '';
  document.getElementById('cl-plan-manager').value    = '';
  document.getElementById('cl-halaxy-search').value   = '';
  document.getElementById('cl-halaxy-id').value       = '';
  document.getElementById('cl-notes').value           = '';
  document.getElementById('cl-session-date').value    = '';
  document.getElementById('cl-session-fee-amt').value = '';
  togglePlanManager('');
  _hideHalaxyLookup();
  var feeRow = document.getElementById('cl-session-fee-row');
  if (feeRow) feeRow.style.display = 'none';
  delete document.getElementById('add-client-modal').dataset.enquiryId;
  _populateFunderDropdown(); // async — fills dropdown from Halaxy
  document.getElementById('add-client-modal').classList.add('open');
  document.getElementById('cl-display-name').focus();
}
function closeAddClient() {
  var modal = document.getElementById('add-client-modal');
  if (modal) modal.classList.remove('open');
}
/** Load Halaxy funders and populate the modal dropdown */
async function _ensureFundersLoaded() {
  if (_halaxyFunders) return _halaxyFunders;
  try {
    var r = await fetch('/api/admin-enquiries?halaxy_funders=1');
    var d = await r.json();
    _halaxyFunders = d.funders || [];
  } catch (_) { _halaxyFunders = []; }
  return _halaxyFunders;
}

var FUNDER_FALLBACK_HTML = '<option value="">Select…</option>'
  + '<option value="ndis_plan">NDIS — Plan-managed</option>'
  + '<option value="ndis_self">NDIS — Self-managed</option>'
  + '<option value="medicare">Medicare</option>'
  + '<option value="qfes">QFES EAP</option>'
  + '<option value="dva">DVA / ADFHCS</option>'
  + '<option value="private">Private</option>';

async function _populateFunderDropdown() {
  var sel = document.getElementById('cl-funder');
  if (!sel) return;
  // Show fallback immediately so dropdown is never stuck on "Loading…"
  sel.innerHTML = FUNDER_FALLBACK_HTML;

  // Then try to upgrade with live Halaxy data
  var funders = await _ensureFundersLoaded();
  if (!funders.length) return; // keep fallback

  var groups      = {};
  var groupOrder  = ['medicare','ndis_plan','private','qfes','dva','other'];
  var groupLabels = { medicare:'Medicare', ndis_plan:'NDIS', private:'Private', qfes:'Third-party / EAP', dva:'DVA / Defence', other:'Other' };
  funders.forEach(function(f) {
    var k = f.billingKey || 'other';
    if (!groups[k]) groups[k] = [];
    groups[k].push(f);
  });
  var html = '<option value="">Select…</option>';
  groupOrder.forEach(function(key) {
    var grp = groups[key];
    if (!grp || !grp.length) return;
    html += '<optgroup label="' + escHtml(groupLabels[key] || key) + '">';
    grp.forEach(function(f) {
      html += '<option value="' + escHtml(f.id) + '" data-billing="' + escHtml(f.billingKey) + '" data-name="' + escHtml(f.name) + '">'
            + escHtml(f.name) + '</option>';
    });
    html += '</optgroup>';
  });
  sel.innerHTML = html;
}

/** Called when the funder dropdown changes (data-billing drives plan manager + fee load) */
function onModalFunderChange(sel) {
  var opt        = sel.options[sel.selectedIndex];
  var billingKey = (opt && opt.dataset.billing) || '';
  var pmField    = document.getElementById('plan-manager-field');
  if (pmField) pmField.style.display = billingKey === 'ndis_plan' ? '' : 'none';
  var orgId = sel.value; // Halaxy Organisation ID
  _loadModalFees(billingKey, orgId);
}

/** Legacy alias used in a few places */
function togglePlanManager(billingKey) {
  var field = document.getElementById('plan-manager-field');
  if (field) field.style.display = billingKey === 'ndis_plan' ? '' : 'none';
}

async function _loadModalFees(funderKey, orgId) {
  var feeRow = document.getElementById('cl-session-fee-row');
  var feeSel = document.getElementById('cl-session-fee');
  if (!feeRow || !feeSel) return;
  if (!funderKey) { feeRow.style.display = 'none'; return; }

  // Fetch fees — if we have an orgId try filtering server-side, else use full cached list
  var fees;
  if (orgId && orgId.length > 3) {
    try {
      var r = await fetch('/api/admin-enquiries?halaxy_fees=1&org_id=' + encodeURIComponent(orgId));
      var d = await r.json();
      fees = d.fees || [];
      // If server-side filter returned results, cache per org
      if (fees.length) { _halaxyFees = _halaxyFees || fees; } // keep full list if already loaded
    } catch (_) { fees = null; }
  }
  if (!fees) {
    if (!_halaxyFees) {
      try {
        var r2 = await fetch('/api/admin-enquiries?halaxy_fees=1');
        var d2 = await r2.json();
        _halaxyFees = d2.fees || [];
      } catch (_) { _halaxyFees = []; }
    }
    fees = _halaxyFees;
  }

  var filtered = _filterFeesForFunder(fees, funderKey);

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
  if (el) el.innerHTML = '<div class="cl-halaxy-lookup-found">✓ Linked: <strong>' + escHtml(patientName) + '</strong>'
    + ' <span style="color:var(--soft);font-size:10px">(ID: ' + escHtml(patientId) + ')</span>'
    + ' <button class="pl-action-btn pl-action-btn--soft" style="padding:2px 8px;font-size:10px;margin-left:6px"'
    + ' onclick="document.getElementById(\'cl-halaxy-id\').value=\'\';document.getElementById(\'cl-halaxy-search\').value=\'\';this.parentNode.innerHTML=\'\'">✕</button></div>';
}

async function saveNewClient() {
  var name        = (document.getElementById('cl-display-name') || {}).value.trim();
  var funderSel   = document.getElementById('cl-funder');
  var funderOpt   = funderSel && funderSel.options[funderSel.selectedIndex];
  // billingKey drives workflow (ndis_plan, medicare, etc.)
  // If using Halaxy funder list, it's in data-billing; for fallback hardcoded list the value IS the key
  var funder      = (funderOpt && (funderOpt.dataset.billing || funderSel.value)) || '';
  // For NDIS plan-managed, store the actual plan manager org name
  var pm          = (document.getElementById('cl-plan-manager') || {}).value.trim()
                 || (funderOpt && funderOpt.dataset.billing === 'ndis_plan' ? funderOpt.dataset.name || '' : '');
  var halaxyId    = (document.getElementById('cl-halaxy-id') || {}).value.trim();
  var notes       = (document.getElementById('cl-notes') || {}).value.trim();
  var sessionDate = (document.getElementById('cl-session-date') || {}).value;
  var sessionAmt  = parseFloat((document.getElementById('cl-session-fee-amt') || {}).value) || null;
  if (!name)   { toast('Please enter a name.', 'err');    return; }
  if (!funder) { toast('Please select a funder.', 'err'); return; }
  try {
    var client = await apiFetch('/api/clients', {
      method: 'POST',
      body: { display_name: name, funder: funder, plan_manager: pm || null, halaxy_id: halaxyId || null, notes: notes || null },
    });
    if (sessionDate && client && client.id) {
      var dateStr = sessionDate.slice(0, 10); // YYYY-MM-DD
      await apiFetch('/api/sessions', {
        method: 'POST',
        body: { client_id: client.id, session_date: dateStr, status: 'upcoming', amount: sessionAmt, notes: notes || null },
      });
      toast('Client + session added ✓');
    } else {
      toast('Client added ✓');
    }
    closeAddClient();
    refreshPipeline();
  } catch (err) {
    toast('Could not add client: ' + err.message, 'err');
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
async function loadCalendarPending() {
  var banner = document.getElementById('gcal-banner');
  if (!banner) return;
  try {
    var r = await fetch('/api/calendar-pending');
    var d = await r.json();

    if (!d.connected) {
      banner.className     = 'gcal-banner disconnected';
      banner.style.display = 'flex';
      banner.innerHTML     = '<span>Google Calendar not connected</span>'
        + '<a class="gcal-connect-btn" href="/api/google-auth">Connect</a>';
      return;
    }

    var count = (d.events || []).length;
    banner.className     = 'gcal-banner connected';
    banner.style.display = 'flex';
    banner.innerHTML     = '<span>✓ Calendar connected' + (count ? ' · ' + count + ' pending' : '') + '</span>'
      + '<a class="gcal-connect-btn" href="/api/google-auth" style="background:var(--mid)">Reconnect</a>';

    // Render pending events at top of New column
    var pendingDiv = document.getElementById('pending-events');
    if (!pendingDiv) return;
    if (!d.events || !d.events.length) {
      pendingDiv.innerHTML = '';
      return;
    }
    // Filter dismissed events and store in lookup map
    var visible = (d.events || []).filter(function(e) { return !_calDismissed.has(String(e.id)); });
    visible.forEach(function(e) { _calEventMap[String(e.id)] = e; });

    pendingDiv.innerHTML = visible.map(function(e) {
      var eid     = String(e.id);
      var cardUid = 'cal-' + eid;
      var dateStr = e.allDay
        ? new Date(e.start).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
        : new Date(e.start).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      var evtJson = JSON.stringify(e).replace(/"/g, '&quot;');
      var calMenu = [
        { label: '+ Convert to new client', fn: 'convertPendingPl(' + evtJson + ')' },
        { label: '✕ Dismiss',               fn: 'dismissCalEvent("' + eid + '")', warn: true },
      ];
      return '<div class="pl-card" style="border-left:3px solid var(--mint);margin-bottom:7px" id="pl-' + cardUid + '">'
        + _menuHtml(cardUid, calMenu)
        + '<div class="pl-card-name">' + escHtml(e.title) + '</div>'
        + '<div class="pl-card-meta">' + dateStr + '</div>'
        + (e.description ? '<div style="font-size:10px;color:var(--soft);margin-top:2px">' + escHtml(e.description) + '</div>' : '')
        + '<div class="pl-card-actions" style="margin-top:6px">'
        + '<button class="pl-action-btn pl-action-btn--primary" onclick="event.stopPropagation();openCalSessionPanel(\'' + cardUid + '\',\'' + eid + '\')">Log as session →</button>'
        + '</div>'
        + '<div id="pl-link-' + cardUid + '"></div>'
        + '</div>';
    }).join('');
  } catch (err) {
    if (banner) {
      banner.className     = 'gcal-banner disconnected';
      banner.style.display = 'flex';
      banner.innerHTML     = '<span>Calendar error: ' + escHtml(err.message) + '</span>'
        + '<a class="gcal-connect-btn" href="/api/google-auth">Reconnect</a>';
    }
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

  // Open modal
  document.getElementById('add-client-modal').classList.add('open');
  document.getElementById('cl-funder').focus();

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
  // NDIS: distinguish self-managed vs plan-managed
  if (s.indexOf('ndis') !== -1) {
    if (s.indexOf('self') !== -1) return 'ndis_self';
    return 'ndis_plan'; // plan manager name will be extracted separately
  }
  if (s.indexOf('medicare') !== -1 || s.indexOf('mbs') !== -1 || s.indexOf('mhcp') !== -1) return 'medicare';
  if (s.indexOf('dva') !== -1 || s.indexOf('veteran') !== -1 || s.indexOf('defence') !== -1) return 'dva';
  if (s.indexOf('qfes') !== -1 || s.indexOf('eap') !== -1)     return 'qfes';
  if (s.indexOf('private') !== -1 || s.indexOf('self') !== -1) return 'private';
  return null;
}

// Keywords matched against fee.funderName (the funder field from Halaxy ChargeItemDefinition)
// Used as fallback when funderName is absent from fee data
var FUNDER_KEYWORDS = {
  ndis_plan: ['ndis'],
  ndis_self: ['ndis'],
  medicare:  ['medicare', 'mbs', 'mhcp'],
  qfes:      ['qfes', 'eap', 'third-party', 'third party'],
  dva:       ['dva', 'defence', 'veteran', 'bupa adf', 'adfhcs'],
  private:   ['private', 'self', 'thorne'],
};

/**
 * Filter a fees array for a given funder key.
 * Prefers matching fee.funderName (from Halaxy useContext) if present on any fee,
 * otherwise falls back to keyword matching on fee.name.
 */
function _filterFeesForFunder(fees, funderKey) {
  if (!funderKey || !fees || !fees.length) return fees || [];
  var kw = FUNDER_KEYWORDS[funderKey] || [];
  // If fees have funderName data, use it for matching
  var hasFunderName = fees.some(function(f) { return f.funderName; });
  if (hasFunderName) {
    var matched = fees.filter(function(f) {
      if (!f.funderName) return false;
      var fn = f.funderName.toLowerCase();
      return kw.some(function(k) { return fn.indexOf(k) !== -1; });
    });
    if (matched.length) return matched;
  }
  // Fallback: keyword match on fee name
  if (kw.length) {
    var byName = fees.filter(function(f) {
      var n = (f.name || '').toLowerCase();
      return kw.some(function(k) { return n.indexOf(k) !== -1; });
    });
    if (byName.length) return byName;
  }
  return fees; // no match — return full list
}

async function openCalSessionPanel(cardUid, eventId) {
  var panel = document.getElementById('pl-link-' + cardUid);
  if (!panel) return;

  // Preload fees cache while showing search UI
  if (_halaxyFees === null && _halaxyData.connected) {
    panel.innerHTML = '<div class="pl-link-panel"><div class="cl-halaxy-lookup-searching">Loading…</div></div>';
    try {
      var fr = await fetch('/api/admin-enquiries?halaxy_fees=1');
      _halaxyFees = ((await fr.json()).fees) || [];
    } catch (_) { _halaxyFees = []; }
  } else if (_halaxyFees === null) { _halaxyFees = []; }

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
      return '<option value="' + f.amount + '"' + sel + '>' + lbl + '</option>';
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

  // If no funder resolved, show a manual picker
  var funderPickerHtml = '';
  if (!funderKey) {
    var fopts = Object.keys(FUNDER_LABELS).map(function(k) {
      return '<option value="' + k + '">' + FUNDER_LABELS[k] + '</option>';
    }).join('');
    funderPickerHtml = '<select class="pl-link-input" id="pl-cs-funder-' + cardUid + '" style="margin-bottom:6px"'
      + ' onclick="event.stopPropagation()" onchange="_rebuildFeesForFunder(\'' + cardUid + '\')">'
      + '<option value="">— select funder —</option>' + fopts + '</select>';
  }

  var pmHtml = '';
  if (funderKey === 'ndis_plan') {
    pmHtml = '<input class="pl-link-input" id="pl-cs-pm-' + cardUid + '" type="text"'
      + ' value="' + escHtml(planManager) + '" placeholder="Plan manager name…"'
      + ' onclick="event.stopPropagation()" style="margin-bottom:6px">';
  }

  panel.innerHTML = '<div class="pl-link-panel">'
    + '<div class="pl-link-preview">'
    + '<div class="pl-link-preview-name">' + escHtml(patientName) + '</div>'
    + '<div class="pl-link-preview-meta">Halaxy patient'
    + (funderLabel ? ' · ' + escHtml(funderLabel) : '')
    + (planManager ? ' · ' + escHtml(planManager) : '')
    + (local ? ' · in dashboard ✓' : '') + '</div>'
    + '</div>'
    + funderPickerHtml
    + pmHtml
    + feeHtml
    + '<input class="pl-link-input" id="pl-cs-notes-' + cardUid + '" type="text"'
    + ' value="' + escHtml(evt.title || '') + '" placeholder="Session notes…" onclick="event.stopPropagation()" style="margin-top:6px">'
    + '<div class="pl-card-actions" style="margin-top:8px">'
    + '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();openCalSessionPanel(\'' + cardUid + '\',\'' + eventId + '\')">← Back</button>'
    + '<button class="pl-action-btn pl-action-btn--primary" onclick="event.stopPropagation();_saveHalaxySession(\'' + cardUid + '\',\'' + eventId + '\',\'' + escHtml(patientId) + '\',\'' + escHtml(patientName) + '\',\'' + (funderKey || '') + '\')">Save session →</button>'
    + '</div></div>';
  _syncFeeInput(cardUid);
}

function _rebuildFeesForFunder(cardUid) {
  var sel = document.getElementById('pl-cs-funder-' + cardUid);
  if (!sel || !sel.value) return;
  var fk       = sel.value;
  var fees     = _halaxyFees || [];
  var filtered = _filterFeesForFunder(fees, fk);
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

/** When fee dropdown changes, sync the editable amount field */
function _syncFeeInput(cardUid) {
  var sel = document.getElementById('pl-cs-fee-' + cardUid);
  var amt = document.getElementById('pl-cs-fee-amt-' + cardUid);
  if (sel && amt && sel.value) amt.value = sel.value;
}

async function _saveHalaxySession(cardUid, eventId, patientId, patientName, funderKey) {
  var feeAmt   = document.getElementById('pl-cs-fee-amt-' + cardUid);
  var notesEl  = document.getElementById('pl-cs-notes-' + cardUid);
  var funderEl = document.getElementById('pl-cs-funder-' + cardUid);
  var pmEl     = document.getElementById('pl-cs-pm-' + cardUid);
  var evt      = _calEventMap[eventId] || {};
  var fk       = funderKey || (funderEl ? funderEl.value : '');
  var pm       = pmEl ? pmEl.value.trim() : '';
  var amount   = feeAmt  ? (parseFloat(feeAmt.value)   || null) : null;
  var notes    = notesEl ? (notesEl.value.trim() || evt.title || '') : evt.title || '';
  var date     = evt.start ? evt.start.slice(0, 10) : new Date().toISOString().slice(0, 10);

  if (!fk) { toast('Please select a funder first.', 'err'); return; }

  try {
    // Find or create local client for this Halaxy patient
    var local    = (_pipelineData && _pipelineData.clients || []).find(function(c) { return String(c.halaxy_id) === patientId; });
    var clientId = local ? local.id : null;

    if (!clientId) {
      var nc = await apiFetch('/api/clients', {
        method: 'POST',
        body: { display_name: patientName, funder: fk, plan_manager: pm || null, halaxy_id: patientId },
      });
      clientId = nc.id;
    } else if (pm && !local.plan_manager) {
      // Back-fill plan manager if we discovered it from Halaxy and it's not stored yet
      await apiFetch('/api/clients', {
        method: 'PATCH',
        body: { id: clientId, plan_manager: pm },
      });
    }

    await apiFetch('/api/sessions', {
      method: 'POST',
      body: { client_id: clientId, session_date: date, status: 'upcoming', amount: amount, notes: notes },
    });
    dismissCalEvent(eventId);
    toast('Session saved ✓');
    refreshPipeline();
  } catch (err) {
    toast('Could not save: ' + err.message, 'err');
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
    confirmLabel = 'Link &amp; log session →';
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
    await apiFetch('/api/admin-enquiries?id=' + enquiryId, { method: 'PATCH', body: { status: 'closed' } });
    toast('Enquiry closed — matched to existing client');
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
  loadCalendarPending();
}

/* ── Escape HTML helper ── */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
