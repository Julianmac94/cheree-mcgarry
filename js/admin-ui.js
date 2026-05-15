/* ── Admin dashboard client-side JS ─────────────────────────────
   Loaded as a static external script by api/admin.js so it is
   never affected by inline-script issues or template-literal
   escaping in the server-rendered HTML.
   ─────────────────────────────────────────────────────────────── */

/* ── Halaxy form URL lookup ── */
var HALAXY_URLS = {
  // Single adult — covers both private pay and Medicare (MHCP)
  new:      'https://www.halaxy.com/a/online/form/new-patient/245011/kDQfMObOfT-YECP02pycZm5BSGRoeUNxVVAzMzRCclVNTzdoZnNEZTZPdmc',
  medicare: 'https://www.halaxy.com/a/online/form/new-patient/245011/kDQfMObOfT-YECP02pycZm5BSGRoeUNxVVAzMzRCclVNTzdoZnNEZTZPdmc',
  ndis:     '', // pending — paste when available
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

var FUNDER_LABELS = {
  ndis_plan: 'NDIS Plan',
  ndis_self: 'NDIS Self',
  medicare:  'Medicare',
  qfes:      'QFES EAP',
  dva:       'DVA',
  private:   'Private',
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
  if (actionsHtml) actionsHtml = '<div class="pl-card-actions" style="margin-top:8px">' + actionsHtml + '</div>';

  var intakeHtml = '';
  if (status === 'in_halaxy') {
    intakeHtml = '<div class="pl-intake-panel" id="pl-intake-' + e.id + '">'
      + '<div class="pl-intake-row">'
      + '<select class="pl-intake-sel" id="pl-itype-' + e.id + '" onclick="event.stopPropagation()" onchange="updatePipelineIntakeUrl(\'' + e.id + '\')">'
      + '<option value="new">New client</option>'
      + '<option value="medicare">Medicare (MHCP)</option>'
      + '<option value="ndis">NDIS</option>'
      + '</select>'
      + '<input class="pl-intake-url" id="pl-iurl-' + e.id + '" type="url" placeholder="Paste Halaxy intake URL…" onclick="event.stopPropagation()">'
      + '<button class="pl-intake-send" onclick="event.stopPropagation();sendIntakePl(\'' + e.id + '\')">Send →</button>'
      + '</div>'
      + '<div id="pl-imsg-' + e.id + '" style="font-size:10px;margin-top:4px"></div>'
      + '</div>';
  }

  return '<div class="pl-card' + (isNew ? ' pl-card--new' : '') + '" id="pl-' + uid + '" onclick="togglePipelineCard(\'' + uid + '\')">'
    + '<div class="pl-card-name">' + escHtml(name) + '</div>'
    + (detail ? '<div class="pl-card-meta">' + escHtml(detail) + '</div>' : '')
    + '<div style="font-size:10px;color:var(--soft);margin-top:2px">' + plFmtDate(e.created_at) + '</div>'
    + badges
    + '<div class="pl-card-detail" id="pl-detail-' + uid + '">'
    + contactHtml
    + notesHtml
    + actionsHtml
    + intakeHtml
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
  var uid = 'cl-' + c.id;

  // Halaxy next appointment
  var apptBadge = '';
  if (_halaxyData.connected && c.halaxy_id) {
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
  if (apptBadge) badges += apptBadge;

  var sortedSess = (sessions || []).slice().sort(function(a, b) { return b.session_date.localeCompare(a.session_date); });
  var sessHtml = sortedSess.length
    ? '<div class="pl-detail-sessions">' + sortedSess.map(function(s) { return renderSessionMiniPl(s, c.id); }).join('') + '</div>'
    : '<div class="pl-empty" style="font-size:10px;margin:4px 0">No sessions yet</div>';

  var archiveBtn = c.active
    ? '<button class="pl-action-btn pl-action-btn--danger" onclick="event.stopPropagation();setClientActivePl(\'' + c.id + '\',false)">Archive</button>'
    : '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();setClientActivePl(\'' + c.id + '\',true)">Reactivate</button>';

  var detailHtml = sessHtml
    + renderAddSessionFormPl(c.id)
    + '<div style="display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(42,88,80,0.07)">'
    + '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();toggleAddSessionFormPl(\'' + c.id + '\')">+ Session</button>'
    + '<button class="pl-action-btn pl-action-btn--soft" onclick="event.stopPropagation();editClientPl(\'' + c.id + '\')">Edit</button>'
    + archiveBtn
    + '</div>';

  return '<div class="pl-card pl-card--active" id="pl-' + uid + '" onclick="togglePipelineCard(\'' + uid + '\')">'
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
  document.getElementById('cl-display-name').value = '';
  document.getElementById('cl-funder').value        = '';
  document.getElementById('cl-plan-manager').value  = '';
  document.getElementById('cl-notes').value         = '';
  togglePlanManager('');
  document.getElementById('add-client-modal').classList.add('open');
  document.getElementById('cl-display-name').focus();
}
function closeAddClient() {
  var modal = document.getElementById('add-client-modal');
  if (modal) modal.classList.remove('open');
}
function togglePlanManager(funder) {
  var field = document.getElementById('plan-manager-field');
  if (field) field.style.display = funder === 'ndis_plan' ? '' : 'none';
}

async function saveNewClient() {
  var name   = (document.getElementById('cl-display-name') || {}).value.trim();
  var funder = (document.getElementById('cl-funder') || {}).value;
  var pm     = (document.getElementById('cl-plan-manager') || {}).value.trim();
  var notes  = (document.getElementById('cl-notes') || {}).value.trim();
  if (!name)   { toast('Please enter a name.', 'err');    return; }
  if (!funder) { toast('Please select a funder.', 'err'); return; }
  try {
    await apiFetch('/api/clients', {
      method: 'POST',
      body: { display_name: name, funder: funder, plan_manager: pm || null, notes: notes || null },
    });
    toast('Client added');
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
    pendingDiv.innerHTML = d.events.map(function(e) {
      var dateStr = e.allDay
        ? new Date(e.start).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
        : new Date(e.start).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      var evtJson = JSON.stringify(e).replace(/"/g, '&quot;');
      return '<div class="pl-card" style="border-left:3px solid var(--mint);margin-bottom:7px">'
        + '<div class="pl-card-name">' + escHtml(e.title) + '</div>'
        + '<div class="pl-card-meta">' + dateStr + '</div>'
        + (e.description ? '<div style="font-size:10px;color:var(--soft);margin-top:2px">' + escHtml(e.description) + '</div>' : '')
        + '<div class="pl-card-actions" style="margin-top:6px">'
        + '<button class="pl-action-btn pl-action-btn--primary" onclick="event.stopPropagation();convertPendingPl(' + evtJson + ')">Convert to client →</button>'
        + '</div>'
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
  document.getElementById('cl-notes').value         = event.description || '';
  togglePlanManager('');
  document.getElementById('add-client-modal').classList.add('open');
  document.getElementById('cl-funder').focus();
}

/* ── Escape HTML helper ── */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
