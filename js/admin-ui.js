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
   CLIENTS TAB — billing tracker + Google Calendar intake queue
   ═══════════════════════════════════════════════════════════════ */

var _clientsLoaded = false;
var _allClients    = [];
var _showInactive  = false;

var FUNDER_LABELS = {
  ndis_plan: 'NDIS Plan-managed',
  ndis_self: 'NDIS Self-managed',
  medicare:  'Medicare',
  qfes:      'QFES EAP',
  dva:       'DVA / ADFHCS',
  private:   'Private',
};

var STATUS_NEXT = {
  upcoming:  { label: 'Mark complete', next: 'completed' },
  completed: { label: 'Invoice',       next: 'invoiced'  },
  invoiced:  { label: 'Mark submitted',next: 'submitted' },
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

/* ── Load everything ── */
function loadClientsTab() {
  window._clientsLoaded = true;
  loadCalendarPending();
  loadClients();
}

/* ── Google Calendar pending events ── */
async function loadCalendarPending() {
  var banner = document.getElementById('gcal-banner');
  var list   = document.getElementById('pending-list');
  try {
    var r = await fetch('/api/calendar-pending');
    var d = await r.json();

    if (!d.connected) {
      banner.className = 'gcal-banner disconnected';
      banner.style.display = 'flex';
      banner.innerHTML = '<span>Google Calendar not connected — pending intake events won\'t appear until you connect it.</span>'
        + '<a class="gcal-connect-btn" href="/api/google-auth">Connect calendar</a>';
      list.innerHTML = '<div class="cl-empty">Connect Google Calendar above to see pending intake events.</div>';
      return;
    }

    banner.className = 'gcal-banner connected';
    banner.style.display = 'flex';
    banner.innerHTML = '<span>✓ Google Calendar connected — New Clients calendar syncing.</span>'
      + '<a class="gcal-connect-btn" href="/api/google-auth" style="background:var(--mid)">Reconnect</a>';

    if (!d.events || !d.events.length) {
      list.innerHTML = '<div class="cl-empty">No upcoming events in the New Clients calendar.</div>';
      return;
    }

    var countEl = document.getElementById('pending-count');
    if (countEl) { countEl.textContent = d.events.length; countEl.style.display = ''; }

    list.innerHTML = d.events.map(function(e) {
      var dateStr = e.allDay
        ? new Date(e.start).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
        : new Date(e.start).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      return '<div class="pending-card">'
        + '<div class="pending-card-info">'
        + '<div class="pending-card-title">' + escHtml(e.title) + '</div>'
        + '<div class="pending-card-date">' + dateStr + '</div>'
        + (e.description ? '<div class="pending-card-desc">' + escHtml(e.description) + '</div>' : '')
        + '</div>'
        + '<button class="pending-convert-btn" onclick="convertPending(' + JSON.stringify(e).replace(/"/g,'&quot;') + ')">Convert →</button>'
        + '</div>';
    }).join('');
  } catch (err) {
    banner.className = 'gcal-banner disconnected';
    banner.style.display = 'flex';
    banner.innerHTML = '<span>Could not load calendar — ' + err.message + '</span>'
      + '<a class="gcal-connect-btn" href="/api/google-auth">Connect calendar</a>';
    list.innerHTML = '<div class="cl-empty">Calendar unavailable.</div>';
  }
}

/* ── Convert a calendar event into a new client ── */
function convertPending(event) {
  // Pre-fill the add-client modal with the event title as the display name
  document.getElementById('cl-display-name').value = event.title || '';
  document.getElementById('cl-funder').value        = '';
  document.getElementById('cl-plan-manager').value  = '';
  document.getElementById('cl-notes').value         = event.description || '';
  togglePlanManager('');
  document.getElementById('add-client-modal').classList.add('open');
  document.getElementById('cl-funder').focus();
}

/* ── Load active clients ── */
async function loadClients() {
  var list = document.getElementById('clients-list');
  try {
    var r = await fetch('/api/clients?all=1');
    _allClients = await r.json();
    renderClientsList();
  } catch (err) {
    list.innerHTML = '<div class="cl-empty">Could not load clients: ' + err.message + '</div>';
  }
}

function renderClientsList() {
  var list     = document.getElementById('clients-list');
  var toggle   = document.getElementById('inactive-toggle');
  var active   = _allClients.filter(function(c) { return c.active; });
  var inactive = _allClients.filter(function(c) { return !c.active; });

  if (!active.length) {
    list.innerHTML = '<div class="cl-empty">No active clients yet — add one above.</div>';
  } else {
    list.innerHTML = active.map(renderClientCard).join('');
  }

  if (inactive.length) {
    toggle.style.display = '';
    toggle.textContent   = _showInactive
      ? 'Hide inactive clients'
      : 'Show inactive clients (' + inactive.length + ')';
    if (_showInactive) {
      list.innerHTML += '<div style="margin-top:20px;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);margin-bottom:8px">INACTIVE</div>';
      list.innerHTML += inactive.map(function(c) { return renderClientCard(c, true); }).join('');
    }
  } else {
    toggle.style.display = 'none';
  }
}

function renderClientCard(client, inactive) {
  var sessions     = client.sessions || [];
  var pendingCount = sessions.filter(function(s) {
    return s.status === 'upcoming' || s.status === 'completed' || s.status === 'invoiced' || s.status === 'submitted';
  }).length;
  var funderLabel  = FUNDER_LABELS[client.funder] || client.funder;
  var metaParts    = [funderLabel];
  if (client.plan_manager) metaParts.push(client.plan_manager);
  if (pendingCount) metaParts.push(pendingCount + ' pending');

  var sessionsHtml = sessions.length
    ? sessions.sort(function(a,b){ return b.session_date.localeCompare(a.session_date); })
        .map(function(s) { return renderSessionRow(s, client.id); }).join('')
    : '<div class="cl-empty" style="font-size:12px;padding:10px 0">No sessions yet.</div>';

  return '<div class="cl-card' + (inactive ? ' inactive' : '') + '" id="cl-card-' + client.id + '">'
    + '<div class="cl-card-head" onclick="toggleClientCard(\'' + client.id + '\')">'
    + '<div class="cl-card-head-info">'
    + '<div class="cl-name">' + escHtml(client.display_name) + '</div>'
    + '<div class="cl-meta">' + escHtml(metaParts.join(' · ')) + '</div>'
    + '</div>'
    + '<span class="cl-funder-badge funder-' + client.funder + '">' + escHtml(funderLabel) + '</span>'
    + '<span class="cl-chevron">▾</span>'
    + '</div>'
    + '<div class="cl-body">'
    + '<div class="cl-sessions">'
    + '<div class="cl-sessions-head">'
    + '<span class="cl-sessions-label">Sessions</span>'
    + '<button class="cl-add-session-btn" onclick="toggleAddSessionForm(\'' + client.id + '\')">+ Add session</button>'
    + '</div>'
    + sessionsHtml
    + renderAddSessionForm(client.id)
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:12px;border-top:1px solid rgba(42,88,80,0.07);padding-top:12px">'
    + '<button class="cl-form-cancel" style="font-size:11px;padding:5px 12px" onclick="editClient(\'' + client.id + '\')">Edit client</button>'
    + (inactive
        ? '<button class="cl-form-cancel" style="font-size:11px;padding:5px 12px" onclick="setClientActive(\'' + client.id + '\',true)">Reactivate</button>'
        : '<button class="cl-form-cancel" style="font-size:11px;padding:5px 12px;color:var(--terra)" onclick="setClientActive(\'' + client.id + '\',false)">Archive</button>'
      )
    + '</div>'
    + '</div>'
    + '</div>';
}

function renderSessionRow(s, clientId) {
  var d = new Date(s.session_date + 'T12:00:00');
  var dateStr = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' });
  var next = STATUS_NEXT[s.status];
  return '<div class="cl-session-row" id="sess-row-' + s.id + '">'
    + '<span class="cl-session-date">' + dateStr + '</span>'
    + '<span class="cl-session-inv">' + (s.invoice_ref ? escHtml(s.invoice_ref) : '<span style="color:rgba(0,0,0,0.2)">—</span>') + '</span>'
    + '<span class="cl-session-notes">' + (s.notes ? escHtml(s.notes) : '') + '</span>'
    + '<div class="cl-session-actions">'
    + (next
        ? '<button class="cl-status-btn status-' + s.status + '" onclick="advanceSession(\'' + s.id + '\',\'' + next.next + '\',\'' + clientId + '\')">' + next.label + '</button>'
        : '<span class="cl-status-btn status-' + s.status + '" style="cursor:default">' + STATUS_DISPLAY[s.status] + '</span>'
      )
    + '</div>'
    + '</div>';
}

function renderAddSessionForm(clientId) {
  return '<div class="cl-add-session-form" id="add-session-form-' + clientId + '">'
    + '<div class="cl-form-row">'
    + '<div class="cl-form-field"><label for="sess-date-' + clientId + '">Date</label>'
    + '<input class="cl-form-input" id="sess-date-' + clientId + '" type="date"></div>'
    + '<div class="cl-form-field"><label for="sess-status-' + clientId + '">Status</label>'
    + '<select class="cl-form-input" id="sess-status-' + clientId + '">'
    + '<option value="upcoming">Upcoming</option>'
    + '<option value="completed">Completed</option>'
    + '<option value="invoiced">Invoiced</option>'
    + '</select></div>'
    + '</div>'
    + '<div class="cl-form-row">'
    + '<div class="cl-form-field"><label for="sess-inv-' + clientId + '">Invoice ref</label>'
    + '<input class="cl-form-input" id="sess-inv-' + clientId + '" type="text" placeholder="e.g. INV-001"></div>'
    + '<div class="cl-form-field"><label for="sess-notes-' + clientId + '">Notes</label>'
    + '<input class="cl-form-input" id="sess-notes-' + clientId + '" type="text" placeholder="Optional…"></div>'
    + '</div>'
    + '<div class="cl-form-actions">'
    + '<button class="cl-form-save" onclick="saveSession(\'' + clientId + '\')">Save session</button>'
    + '<button class="cl-form-cancel" onclick="toggleAddSessionForm(\'' + clientId + '\')">Cancel</button>'
    + '</div>'
    + '</div>';
}

/* ── Toggle client card open/closed ── */
function toggleClientCard(clientId) {
  var card = document.getElementById('cl-card-' + clientId);
  if (card) card.classList.toggle('open');
}

/* ── Toggle add-session form ── */
function toggleAddSessionForm(clientId) {
  var form = document.getElementById('add-session-form-' + clientId);
  if (!form) return;
  form.classList.toggle('open');
  if (form.classList.contains('open')) {
    var dateInput = document.getElementById('sess-date-' + clientId);
    if (dateInput) dateInput.valueAsDate = new Date();
  }
}

/* ── Save new session ── */
async function saveSession(clientId) {
  var date   = (document.getElementById('sess-date-' + clientId) || {}).value;
  var status = (document.getElementById('sess-status-' + clientId) || {}).value || 'upcoming';
  var inv    = (document.getElementById('sess-inv-' + clientId) || {}).value.trim();
  var notes  = (document.getElementById('sess-notes-' + clientId) || {}).value.trim();
  if (!date) { toast('Please enter a session date.', 'err'); return; }
  try {
    var r = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, session_date: date, status, invoice_ref: inv || null, notes: notes || null }),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    toast('Session added');
    await loadClients();
    // Re-open the card
    var card = document.getElementById('cl-card-' + clientId);
    if (card) card.classList.add('open');
  } catch (err) {
    toast('Could not save session: ' + err.message, 'err');
  }
}

/* ── Advance session to next status ── */
async function advanceSession(sessionId, newStatus, clientId) {
  try {
    var r = await fetch('/api/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sessionId, status: newStatus }),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    toast('Updated to ' + STATUS_DISPLAY[newStatus]);
    await loadClients();
    var card = document.getElementById('cl-card-' + clientId);
    if (card) card.classList.add('open');
  } catch (err) {
    toast('Could not update session: ' + err.message, 'err');
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
  document.getElementById('add-client-modal').classList.remove('open');
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
  if (!name)   { toast('Please enter a name.', 'err');   return; }
  if (!funder) { toast('Please select a funder.', 'err'); return; }
  try {
    var r = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: name, funder, plan_manager: pm || null, notes: notes || null }),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    toast('Client added');
    closeAddClient();
    await loadClients();
  } catch (err) {
    toast('Could not add client: ' + err.message, 'err');
  }
}

/* ── Archive / reactivate client ── */
async function setClientActive(clientId, active) {
  var label = active ? 'reactivated' : 'archived';
  if (!active && !confirm('Archive this client? They\'ll move to the inactive list.')) return;
  try {
    var r = await fetch('/api/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: clientId, active }),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    toast('Client ' + label);
    await loadClients();
  } catch (err) {
    toast('Could not update client: ' + err.message, 'err');
  }
}

/* ── Toggle inactive clients ── */
function toggleInactive() {
  _showInactive = !_showInactive;
  renderClientsList();
}

/* ── Edit client (simple prompt for now) ── */
async function editClient(clientId) {
  var client = _allClients.find(function(c) { return c.id === clientId; });
  if (!client) return;
  var newName = prompt('Edit display name:', client.display_name);
  if (newName === null || newName.trim() === client.display_name) return;
  try {
    var r = await fetch('/api/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: clientId, display_name: newName.trim() }),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    toast('Client updated');
    await loadClients();
  } catch (err) {
    toast('Could not update client: ' + err.message, 'err');
  }
}

/* ── Escape HTML helper ── */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
