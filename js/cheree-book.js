/**
 * js/cheree-book.js — the shared /book app: Cheree's booking tool and
 * Julian's billing pipeline board, flipped between via the bottom dock.
 *
 * Google Calendar stays the real system of record — this just writes clean,
 * consistent, human-readable entries into it instead of ad hoc hand-typed
 * titles. Every field lives in the event's title/description in plain
 * English, so it reads fine even opened directly in Google Calendar, not
 * just through this tool.
 *
 * Title while scheduled:  "<Name> — <Funder> — <Modality>"
 * Title once resolved:    "<Name> — <Funder> — <Modality> — Attended"
 *                          "<Name> — <Funder> — <Modality> — Cancelled (Cheree)"
 *                          "<Name> — <Funder> — <Modality> — Cancelled (client)"
 * Description is simple "Key: Value" lines — parsed back out when an
 * appointment is re-opened to record its outcome. No Halaxy access at all.
 *
 * This is the only dashboard now — the old /admin and /admin-new pages
 * were retired once everything worth keeping (AI brief, Gmail remittance
 * search, a proper Settings view) had been ported over here.
 */

var _CB_DURATIONS = [[30, '30 min'], [60, '1 hr'], [90, '1.5 hrs'], [120, '2 hrs'], [150, '2.5 hrs'], [180, '3 hrs']];

var _cbClients  = [];   // [{id, name}] from Halaxy patients — existing clients only
var _cbEvents   = [];   // raw calendar-pending events
var _cbCalConnected = false; // Google Calendar connection status, for Settings
var _cbData     = null; // raw /api/admin-enquiries payload (enquiries, vapid key, activity log)
var _cbView     = 'home'; // 'home' | 'board' | 'book' | outcome-form (rendered inside 'home')
var _cbPicked   = null; // selected client for a new booking {id, name}
var _cbModality = null; // 'In person' | 'Online'
var _cbExpandedCardId = null; // Board card currently expanded in place, or null — one at a time
var _cbBookingEnquiry = null; // {id, name, email} when the New Booking flow was opened from an enquiry, else null

function _cbEsc(str) {
  // Also escapes single quotes (unlike the old admin-ui.js escHtml) since
  // names go inside single-quoted onclick() string args here, not just
  // double-quoted HTML attributes — an apostrophe name (O'Brien) would
  // otherwise break the handler.
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _cbToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.innerHTML = '<div class="toast">' + _cbEsc(msg) + '</div>';
  setTimeout(function() { t.innerHTML = ''; }, 3200);
}

/** Disables a button and swaps its label to a busy state while a save is
 * in flight, so a tap never just sits there looking frozen; returns a
 * restore() to undo both on failure (success paths usually re-render the
 * whole view anyway, which replaces the button outright). */
function _cbBusy(btn, label) {
  if (!btn) return function() {};
  var orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  return function() { btn.disabled = false; btn.textContent = orig; };
}

// Same funder → colour language everywhere a funder appears (Home cards,
// Board cards) so it reads at a glance instead of by name. Funder values
// are always one of the fixed strings from the booking form's own select,
// so the class name can just be the funder name itself — no lookup table.
var _CB_KNOWN_FUNDERS = { NDIS: 1, Medicare: 1, QFES: 1, WorkCover: 1, DVA: 1, Private: 1 };
function _cbFunderChip(funder) {
  if (!funder) return '';
  var cls = _CB_KNOWN_FUNDERS[funder] ? funder : 'Other';
  return '<span class="fchip fchip-' + cls + '">' + _cbEsc(funder) + '</span>';
}

/* ── Description parsing / building — the "proper map" Cheree reads directly
   in Google Calendar, and that this tool re-parses to show the outcome form. */
var _CB_HISTORY_MARKER = '— History —';

function _cbParseDesc(desc) {
  var out = {};
  var lines = (desc || '').split('\n');
  var historyIdx = lines.indexOf(_CB_HISTORY_MARKER);
  var fieldLines = historyIdx === -1 ? lines : lines.slice(0, historyIdx);
  fieldLines.forEach(function(line) {
    var idx = line.indexOf(': ');
    if (idx === -1) return;
    out[line.slice(0, idx).trim()] = line.slice(idx + 2).trim();
  });
  if (historyIdx !== -1) {
    out._history = lines.slice(historyIdx + 1).filter(function(l) { return l.trim(); });
  }
  return out;
}

/* Appends a timestamped line to fields._history — every stage transition
 * calls this so the calendar description ends up a full interaction
 * history, readable directly in Google Calendar, not just in this tool. */
function _cbLogHistory(fields, text) {
  var now = new Date();
  var when = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ', '
    + now.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  fields._history = (fields._history || []).concat(when + ': ' + text);
  return fields;
}

/* The title only changes at specific, meaningful states — not on every
 * history entry, which would make it unreadable. Attended/Cancelled is
 * already a title suffix (_cbSubmitOutcome); this adds one more: a ✓ once
 * a session is fully closed out (billed AND paid/reconciled, or no-charge),
 * so "nothing left to do" is visible without opening the tool. */
function _cbCloseTitle(title) {
  return / ✓$/.test(title) ? title : title + ' ✓';
}

/* Memoized per-event — every render pass calls this on the same events
   repeatedly (Home's list, the Board, the outcome form all parse the
   same description independently), so cache the parse and only redo it
   if the description has actually changed since (self-healing: no need
   to remember to invalidate at every PATCH call site). */
function _cbFields(e) {
  if (e._fieldsFor !== e.description) {
    e._fields = _cbParseDesc(e.description);
    e._fieldsFor = e.description;
  }
  return e._fields;
}

function _cbBuildDesc(fields) {
  var order = ['Funder', 'HalaxyId', 'Type', 'Duration', 'Note', 'Status', 'Bill', 'Billing', 'Invoice', 'QFES Form'];
  var head = order.filter(function(k) { return fields[k] !== undefined && fields[k] !== null; })
    .map(function(k) { return k + ': ' + fields[k]; }).join('\n');
  var hist = fields._history || [];
  return hist.length ? (head + '\n\n' + _CB_HISTORY_MARKER + '\n' + hist.join('\n')) : head;
}

function _cbBuildTitle(name, funder, modality, statusSuffix) {
  var base = name + ' — ' + funder + ' — ' + modality;
  return statusSuffix ? base + ' — ' + statusSuffix : base;
}

/* ── Data loading — shared by first load and the manual refresh button,
   so there's exactly one place that knows how to populate _cbData/_cbEvents. */
function _cbLoadData() {
  return Promise.all([
    fetch('/api/admin-enquiries', { credentials: 'include' }).then(function(r) { return r.status === 401 ? null : r.json(); }),
    // No ?days override — uses the server's wide -180d/+91d default, so a
    // session from months back that never got an outcome logged still
    // surfaces on Home/Board instead of silently aging out of the fetch
    // window (the same failure mode the old dashboard had before it was
    // fixed, just at a smaller ±60d threshold if left as an override here).
    fetch('/api/calendar-pending', { credentials: 'include' }).then(function(r) { return r.status === 401 ? null : r.json(); }),
  ]).then(function(results) {
    var pipeline = results[0], cal = results[1];
    if (!pipeline || !cal) { window.location.href = '/admin-login'; return false; }
    _cbData = pipeline;
    _cbClients = ((pipeline.halaxy && pipeline.halaxy.patients) || []).map(function(p) { return { id: p.id, name: p.name || 'Unnamed' }; });
    _cbEvents = cal.events || [];
    _cbCalConnected = !!cal.connected;
    _cbClientRows = _cbBuildClientRows(pipeline);
    return true;
  });
}

function _cbInit() {
  _cbLoadData().then(function(ok) {
    if (!ok) return;
    _cbRender();
    _cbUpdateNotifBell();
  }).catch(function(err) {
    document.getElementById('root').innerHTML = '<div class="empty">Could not load — ' + _cbEsc(err.message) + '</div>';
  });
}

function cbRefresh() {
  var btn = document.getElementById('cb-refresh-btn');
  if (btn) btn.classList.add('spinning');
  _cbLoadData().then(function(ok) {
    if (!ok) return;
    _cbRender();
    _cbUpdateNotifBell();
    _cbToast('Refreshed');
  }).catch(function(err) {
    _cbToast('Could not refresh: ' + err.message);
  }).finally(function() {
    if (btn) btn.classList.remove('spinning');
  });
}

/* ═══════════════════════════════════════════════════════════════
   VIEWS — Home (needs attention + upcoming), Board (pipeline flip),
   Book (new booking / outcome forms render inside 'home').
   ═══════════════════════════════════════════════════════════════ */

function cbSetView(view) {
  _cbView = view;
  _cbPicked = null;
  document.getElementById('dock-home').classList.toggle('active', view === 'home');
  document.getElementById('dock-board').classList.toggle('active', view === 'board');
  document.getElementById('dock-clients').classList.toggle('active', view === 'clients');
  document.getElementById('dock-add').classList.toggle('active', view === 'book');
  document.getElementById('cb-client-search').style.display = view === 'clients' ? 'block' : 'none';
  _cbRender();
}

function _cbRender() {
  if (_cbView === 'board') _cbRenderBoard();
  else if (_cbView === 'book') _cbRenderBook();
  else if (_cbView === 'clients') _cbRenderClients();
  else _cbRenderHome();
}

/* An event counts as "resolved" only once it's been explicitly given an
   outcome through this tool — no guessing from title text (same
   explicit-only principle as the Board's _cbEventStage). Anything else —
   including calendar entries Cheree hand-typed before this tool existed,
   which carry no "Status:" line at all — is still open and belongs on
   Home so she can action it here. */
function _cbIsResolved(fields) {
  return fields.Status === 'Attended' || (!!fields.Status && fields.Status.indexOf('Cancelled') === 0);
}

/* ── Home: needs-attention (past, unresolved) + upcoming (future, unresolved),
   as sections in one scroll rather than separate tabs — the whole point
   of a phone-first "app" home is not making her pick a tab first. ── */
function _cbNeedsAttentionItems() {
  var now = new Date();
  return _cbEvents.filter(function(e) {
    if (!e.start) return false;
    var fields = _cbFields(e);
    return !_cbIsResolved(fields) && new Date(e.start) < now;
  }).sort(function(a, b) { return new Date(b.start) - new Date(a.start); });
}

function _cbUpcomingItems() {
  var now = new Date();
  return _cbEvents.filter(function(e) {
    if (!e.start) return false;
    var fields = _cbFields(e);
    return !_cbIsResolved(fields) && new Date(e.start) >= now;
  }).sort(function(a, b) { return new Date(a.start) - new Date(b.start); });
}

/* Attended/Cancelled/needs-outcome/upcoming — the same four states as the
 * Board's colour language, just per-event instead of per-column. Used to
 * colour cards in every Home view mode, not just the All list. */
function _cbEventKind(e) {
  var fields = _cbFields(e);
  if (fields.Status === 'Attended') return 'attended';
  if (fields.Status && fields.Status.indexOf('Cancelled') === 0) return 'cancelled';
  return (e.start && new Date(e.start) < new Date()) ? 'attention' : 'upcoming';
}

/* A schedule entry that's moved into the action pipeline (an outcome's
 * been logged, or it's sitting past-and-unresolved) gets a small tappable
 * badge showing exactly which Board stage it's at — the "this has moved
 * to the Board" mark, right on the schedule card itself, tap through to
 * its full history instead of just a static note. */
function _cbStageBadge(e) {
  var stage = _cbEventStage(e);
  if (!stage) return '';
  var col = BOARD_COLUMNS.find(function(c) { return c.key === stage; });
  if (!col) return '';
  return '<span class="stage-badge" onclick="event.stopPropagation();cbOpenHistory(\'' + _cbEsc(e.id) + '\')">→ ' + _cbEsc(col.label) + '</span>';
}

function _cbListHtml(items) {
  // Wrapped in .card-grid so desktop widths (≥900px, see admin.js) can lay
  // these out as a multi-column grid instead of one stacked column — the
  // class carries no rule below that breakpoint, so mobile is unaffected.
  return '<div class="card-grid">' + items.map(function(e) {
    var d = new Date(e.start);
    var when = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    var fields = _cbFields(e);
    var name = e.title.split(' — ')[0] || e.title;
    var legacy = !fields.Status; // never booked/logged through this tool
    var modIcon = fields.Type === 'Online' ? '💻 ' : fields.Type === 'In person' ? '📍 ' : '';
    return '<div class="card card-' + _cbEventKind(e) + '" onclick="_cbOpenOutcome(\'' + _cbEsc(e.id) + '\')" style="cursor:pointer">'
      + '<div class="card-top"><div class="nm">' + _cbEsc(name) + '</div>' + _cbFunderChip(fields.Funder) + '</div>'
      + '<div class="mt">' + modIcon + _cbEsc(when) + (legacy ? '<span class="legacy-tag">Not logged</span>' : '') + _cbStageBadge(e) + '</div>'
      + '</div>';
  }).join('') + '</div>';
}

/* ═══════════════════════════════════════════════════════════════
   HOME VIEW MODES — Home is the schedule now, so it lands on Day
   (today) by default. Week/Month give more context; All is the
   original flat needs-outcome/upcoming list, kept as a quick-scan
   option but no longer the landing view.
   ═══════════════════════════════════════════════════════════════ */

var _cbHomeMode = 'day'; // 'day' | 'week' | 'month'
var _cbCalDate  = new Date(); // focused date for month/week/day navigation

function _cbDateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _cbWeekStart(d) {
  var offset = (d.getDay() + 6) % 7; // Monday-start week
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

function cbSetHomeMode(mode) {
  _cbHomeMode = mode;
  _cbRenderHome();
}

function cbCalNav(delta) {
  if (_cbHomeMode === 'month') _cbCalDate = new Date(_cbCalDate.getFullYear(), _cbCalDate.getMonth() + delta, 1);
  else if (_cbHomeMode === 'week') _cbCalDate = new Date(_cbCalDate.getTime() + delta * 7 * 86400000);
  else _cbCalDate = new Date(_cbCalDate.getTime() + delta * 86400000);
  _cbRenderHome();
}

function cbCalToday() {
  _cbCalDate = new Date();
  _cbRenderHome();
}

function cbCalOpenDay(key) {
  _cbCalDate = new Date(key + 'T00:00:00');
  _cbHomeMode = 'day';
  _cbRenderHome();
}

function _cbModesHtml() {
  var modes = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
  return '<div class="cal-modes">' + modes.map(function(m) {
    return '<button class="cal-mode-btn' + (_cbHomeMode === m[0] ? ' active' : '') + '" onclick="cbSetHomeMode(\'' + m[0] + '\')">' + m[1] + '</button>';
  }).join('') + '</div>';
}

function _cbNavLabel() {
  if (_cbHomeMode === 'month') return _cbCalDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  if (_cbHomeMode === 'week') {
    var s = _cbWeekStart(_cbCalDate);
    var e = new Date(s.getTime() + 6 * 86400000);
    var sameMonth = s.getMonth() === e.getMonth();
    return s.toLocaleDateString('en-AU', { day: 'numeric', month: sameMonth ? undefined : 'short' }) + ' – ' + e.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }
  return _cbCalDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
}

function _cbNavHtml() {
  return '<div class="cal-nav">'
    + '<button class="cal-arrow" onclick="cbCalNav(-1)" aria-label="Previous">‹</button>'
    + '<div class="cal-nav-label">' + _cbEsc(_cbNavLabel()) + '</div>'
    + '<button class="cal-arrow" onclick="cbCalNav(1)" aria-label="Next">›</button>'
    + '<button class="cal-today-btn" onclick="cbCalToday()">Today</button>'
    + '</div>';
}

function _cbMonthGridHtml() {
  var year = _cbCalDate.getFullYear(), month = _cbCalDate.getMonth();
  var firstOfMonth = new Date(year, month, 1);
  var gridStart = _cbWeekStart(firstOfMonth);
  var todayKey = _cbDateKey(new Date());

  var byDay = {};
  _cbEvents.forEach(function(e) {
    if (!e.start) return;
    var key = _cbDateKey(new Date(e.start));
    (byDay[key] = byDay[key] || []).push(e);
  });

  var html = '<div class="cal-grid">';
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function(w) { html += '<div class="cal-dow">' + w.slice(0, 1) + '</div>'; });
  for (var i = 0; i < 42; i++) {
    var cellDate = new Date(gridStart.getTime() + i * 86400000);
    var key = _cbDateKey(cellDate);
    var inMonth = cellDate.getMonth() === month;
    var kinds = {};
    (byDay[key] || []).forEach(function(e) { kinds[_cbEventKind(e)] = true; });
    var dots = Object.keys(kinds).map(function(k) { return '<span class="cal-dot cal-dot-' + k + '"></span>'; }).join('');
    html += '<div class="cal-cell' + (inMonth ? '' : ' cal-cell--out') + (key === todayKey ? ' cal-cell--today' : '') + '" onclick="cbCalOpenDay(\'' + key + '\')">'
      + '<div class="cal-daynum">' + cellDate.getDate() + '</div>'
      + (dots ? '<div class="cal-dots">' + dots + '</div>' : '')
      + '</div>';
  }
  html += '</div>';
  return html;
}

function _cbDayAgendaHtml(date, containered) {
  var key = _cbDateKey(date);
  var items = _cbEvents.filter(function(e) { return e.start && _cbDateKey(new Date(e.start)) === key; })
    .sort(function(a, b) { return new Date(a.start) - new Date(b.start); });
  var label = date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
  var html = '<div class="sec-hd cal-day-hd">' + _cbEsc(label) + '<span class="count-bubble">' + items.length + '</span></div>';
  html += items.length ? _cbListHtml(items) : '<div class="empty">Nothing booked.</div>';
  if (containered) {
    var todayCls = key === _cbDateKey(new Date()) ? ' cal-week-day--today' : '';
    html = '<div class="cal-week-day' + todayCls + '">' + html + '</div>';
  }
  return html;
}

function _cbWeekAgendaHtml() {
  var start = _cbWeekStart(_cbCalDate);
  var html = '';
  for (var i = 0; i < 7; i++) {
    html += _cbDayAgendaHtml(new Date(start.getTime() + i * 86400000), true);
  }
  return html;
}

function _cbRenderHome() {
  var root = document.getElementById('root');
  _cbUpdateHomeBadge(_cbNeedsAttentionItems().length);

  // Brief card only when Day is specifically showing today — Week/Month/a
  // navigated-to Day are browsing tools, not the daily landing screen, so
  // the briefing would just be stale context sitting above a grid she's
  // using to look at some other day.
  var isTodayView = _cbHomeMode === 'day' && _cbDateKey(_cbCalDate) === _cbDateKey(new Date());

  var html = '';
  if (isTodayView) {
    html += '<div class="brief-card" id="cb-brief-card">'
      + '<div class="brief-label">Today’s briefing</div>'
      + '<div class="brief-text ai-brief-streaming" id="cb-brief-text"><span class="ai-brief-loading">&#8203;</span></div>'
      + '</div>';
  }
  html += _cbModesHtml();

  // Above the schedule, in every mode (not just Day) — a new enquiry
  // shouldn't wait on which calendar mode she happens to be browsing.
  // Hidden entirely when triage is empty rather than an empty section
  // header (2026-08-31 feedback: enquiries needed to be actionable from
  // Home, not just the separate Board).
  var triageCards = _cbTriageCards();
  if (triageCards.length) {
    html += '<div class="sec-hd">Needs triage (' + triageCards.length + ')</div>'
      + '<div class="card-grid">' + triageCards.map(_cbCard2Html).join('') + '</div>';
  }

  if (_cbHomeMode === 'month') {
    // Grid only — clicking a day (cbCalOpenDay) is how you see what's on
    // it, not a second list dumped underneath showing the whole month at
    // once.
    html += _cbNavHtml() + _cbMonthGridHtml();
  } else if (_cbHomeMode === 'week') {
    html += _cbNavHtml() + _cbWeekAgendaHtml();
  } else {
    html += _cbNavHtml() + _cbDayAgendaHtml(_cbCalDate);
  }

  root.innerHTML = html;

  if (isTodayView) _cbFireBrief();
}

function _cbUpdateHomeBadge(n) {
  var badge = document.getElementById('dock-home-badge');
  if (!badge) return;
  if (n > 0) { badge.textContent = n > 99 ? '99+' : String(n); badge.style.display = 'flex'; }
  else { badge.style.display = 'none'; }
}

/* ── AI receptionist brief — ported from the old /admin mobile home
 * (js/admin-ui.js `_loadAIBrief`). Same server endpoint, same caching/
 * animation behaviour; the payload is /book-native instead of Halaxy-
 * matched — critCount/awaitingPayCount/unlinkedCount have no equivalent
 * here since /book deliberately does no Halaxy matching, so they're
 * just omitted. ── */
function _cbFireBrief() {
  var now = new Date();
  var todayKey = _cbDateKey(now);
  var todaySess = _cbEvents.filter(function(e) {
    if (!e.start) return false;
    var f = _cbFields(e);
    return _cbDateKey(new Date(e.start)) === todayKey && (!f.Status || f.Status.indexOf('Cancelled') !== 0);
  }).sort(function(a, b) { return new Date(a.start) - new Date(b.start); });

  var nextAppt = _cbUpcomingItems()[0];
  var enquiries = (_cbData && _cbData.enquiries) || [];
  var newEnqCount = enquiries.filter(function(e) { return e.status !== 'converted' && e.status !== 'closed'; }).length;

  _cbLoadAIBrief({
    currentTime: now.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }),
    todaySessions: todaySess.map(function(e) {
      var d = new Date(e.start);
      return {
        name: (e.title.split(' — ')[0] || e.title).split(' ')[0],
        time: d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }),
        done: d.getTime() < now.getTime(),
      };
    }),
    nextAppt: nextAppt ? {
      name: (nextAppt.title.split(' — ')[0] || nextAppt.title).split(' ')[0],
      day: _cbDateKey(new Date(nextAppt.start)) !== todayKey
        ? new Date(nextAppt.start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
        : 'today',
      time: new Date(nextAppt.start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }),
    } : null,
    critCount: 0, awaitingPayCount: 0, unlinkedCount: 0,
    newEnquiries: newEnqCount,
  }, 'cb-brief-text');
}

function _cbLoadAIBrief(data, targetId) {
  var el = document.getElementById(targetId);
  if (!el) return;

  var now = new Date();
  var cacheKey = 'ai-brief-' + targetId + '-' + now.toISOString().slice(0, 13);
  var cached = sessionStorage.getItem(cacheKey);
  if (cached) { el.innerHTML = cached; return; }

  el.innerHTML = '<span class="ai-brief-loading">&#8203;</span>';
  el.classList.add('ai-brief-streaming');

  var ctrl = new AbortController();
  var timeout = setTimeout(function() { ctrl.abort(); }, 12000);

  fetch('/api/admin-tasks?brief=1', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data), signal: ctrl.signal,
  }).then(function(r) {
    clearTimeout(timeout);
    if (!r.ok) throw new Error('brief ' + r.status);
    return r.json();
  }).then(function(result) {
    var text = (result.text || '').trim();
    if (!text) throw new Error('empty brief');

    var paras = text.split(/\n\n+/).map(function(p) { return p.replace(/\n/g, ' ').trim(); }).filter(Boolean);
    if (paras.length === 1) {
      var single = text.split(/\n/).map(function(p) { return p.trim(); }).filter(Boolean);
      if (single.length > 1) paras = single;
    }

    var html = paras.map(function(p) {
      return '<p class="ai-brief-para">' + p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    }).join('');

    el.classList.remove('ai-brief-streaming');
    el.innerHTML = html;
    el.classList.add('ai-brief-pulse-in');
    el.addEventListener('animationend', function() { el.classList.remove('ai-brief-pulse-in'); }, { once: true });

    try { sessionStorage.setItem(cacheKey, el.innerHTML); } catch (_) {}
  }).catch(function() {
    clearTimeout(timeout);
    el.classList.remove('ai-brief-streaming');
    if (!el.textContent.trim()) el.innerHTML = '';
  });
}

function _cbOpenOutcome(eventId) {
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  var fields = _cbFields(ev);
  var baseName = ev.title.split(' — ')[0] || ev.title;

  // Reflect whatever's actually saved, not a guess — re-opening an already
  // logged session (e.g. from the Board) must show its real outcome, not
  // silently reset the picker to Attended every time. The three cancel
  // reasons fold in the old separate "Bill for this?" step — who cancelled
  // and whether it's billable were never independent in practice (the
  // practice cancelling is never billed), so cancelled_by_practice implies
  // No and the client split just asks the one real remaining question.
  var initialOutcome = fields.Status === 'Attended' ? 'attended'
    : fields.Status === 'Cancelled by Cheree' ? 'cancelled_by_practice'
    : fields.Status === 'Cancelled by client' ? (fields.Bill === 'No' ? 'cancelled_no_payment' : 'cancelled_payment_needed')
    : null;
  var isCancelledFamily = initialOutcome && initialOutcome.indexOf('cancelled_') === 0;

  var root = document.getElementById('root');
  var html = '<div class="card"><div class="nm">' + _cbEsc(ev.title) + '</div>'
    + (fields.Funder ? '<div class="mt">' + _cbEsc(fields.Funder) + (fields.Type ? ' · ' + _cbEsc(fields.Type) : '') + (fields.Duration ? ' · ' + _cbEsc(fields.Duration) : '') + '</div>' : '<div class="mt">Not booked through this tool — fill in what\'s missing below.</div>')
    + (fields.Note ? '<div class="mt">Note: ' + _cbEsc(fields.Note) + '</div>' : '')
    + '</div>';

  // Funder/modality are already known for anything booked through this tool
  // (fields.Funder set) — but older calendar entries Cheree hand-typed
  // before this tool existed have neither, so ask here rather than lose
  // that detail when she closes the loop on them.
  html += '<div class="field"><label>Funder</label><select id="cb-out-funder">'
    + ['', 'NDIS', 'Medicare', 'QFES', 'WorkCover', 'DVA', 'Private', 'Other'].map(function(f) {
        return '<option value="' + f + '"' + (f === (fields.Funder || '') ? ' selected' : '') + '>' + (f || 'Pick a funder…') + '</option>';
      }).join('')
    + '</select></div>';

  html += '<div class="field"><label>In person or online?</label><div class="modality">'
    + '<button id="cb-out-mod-inperson" class="' + (fields.Type === 'Online' ? '' : 'sel') + '" onclick="_cbSetOutcomeModality(\'In person\')">In person</button>'
    + '<button id="cb-out-mod-online" class="' + (fields.Type === 'Online' ? 'sel' : '') + '" onclick="_cbSetOutcomeModality(\'Online\')">Online</button>'
    + '</div></div>';

  var durationKnown = _CB_DURATIONS.some(function(o) { return o[1] === fields.Duration; });
  html += '<div class="field"><label>How long did it run?</label><select id="cb-out-duration">'
    + (!fields.Duration ? '<option value="" selected>Not set</option>' : '')
    + (fields.Duration && !durationKnown ? '<option value="' + _cbEsc(fields.Duration) + '" selected>' + _cbEsc(fields.Duration) + '</option>' : '')
    + _CB_DURATIONS.map(function(o) { return '<option value="' + o[1] + '"' + (o[1] === fields.Duration ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
    + '</select></div>';

  // Three equal-weight top-level options, colour-hued so the category
  // reads at a glance (2026-08-31 feedback: reschedule as a text link
  // looked like an afterthought next to two real buttons). Rescheduled
  // isn't a toggle like the other two — nothing here can actually change
  // the date/time, so it jumps straight to the Edit sheet
  // (cbOpenEdit/cbSaveEdit) that already does that PATCH + history
  // logging, rather than a parallel picker. Only offered while nothing's
  // been recorded yet — doesn't make sense once a session has an outcome.
  html += '<div class="field"><label>What happened?</label>'
    + '<div class="modality">'
    + '<button id="cb-out-attend" class="out-attend' + (initialOutcome === 'attended' ? ' sel' : '') + '" onclick="_cbSetOutcome(\'attended\')">Attended</button>'
    + (!initialOutcome ? '<button id="cb-out-resched" class="out-resched" onclick="cbOpenEdit(\'' + _cbEsc(eventId) + '\')">Rescheduled</button>' : '')
    + '<button id="cb-out-cancel" class="out-cancel' + (isCancelledFamily ? ' sel' : '') + '" onclick="_cbSetOutcome(\'cancelled\')">Cancelled</button>'
    + '</div>'
    // Folds the old separate "Bill for this?" question in: cancelling as
    // the practice is never billed, so the only real remaining question
    // for a client cancellation is whether a fee applies.
    + '<div class="modality" id="cb-out-cancel-sub" style="display:' + (isCancelledFamily ? '' : 'none') + ';margin-top:8px">'
    +   '<button id="cb-out-no_payment" class="out-cancel-sub' + (initialOutcome === 'cancelled_no_payment' ? ' sel' : '') + '" onclick="_cbSetOutcome(\'cancelled_no_payment\')">No payment</button>'
    +   '<button id="cb-out-payment_needed" class="out-cancel-sub' + (initialOutcome === 'cancelled_payment_needed' ? ' sel' : '') + '" onclick="_cbSetOutcome(\'cancelled_payment_needed\')">Payment needed</button>'
    +   '<button id="cb-out-by_practice" class="out-cancel-sub' + (initialOutcome === 'cancelled_by_practice' ? ' sel' : '') + '" onclick="_cbSetOutcome(\'cancelled_by_practice\')">By practice</button>'
    + '</div></div>';

  html += '<button class="btn-primary" onclick="_cbSubmitOutcome(\'' + _cbEsc(eventId) + '\',\'' + _cbEsc(baseName) + '\',this)">Save</button>';
  html += '<button class="btn-ghost" onclick="cbSetView(\'home\')">Back</button>';
  root.innerHTML = html;

  window._cbOutcome = initialOutcome;
  window._cbOutcomeModality = fields.Type === 'Online' ? 'Online' : 'In person';
}

function _cbSetOutcomeModality(m) {
  window._cbOutcomeModality = m;
  document.getElementById('cb-out-mod-inperson').classList.toggle('sel', m === 'In person');
  document.getElementById('cb-out-mod-online').classList.toggle('sel', m === 'Online');
}

// v is 'attended', the bare top-level 'cancelled' (reveals the sub-row
// without finalising anything — Save still requires one of the three
// below), or one of the three final 'cancelled_*' reasons.
function _cbSetOutcome(v) {
  var isCancelledFamily = v === 'cancelled' || v.indexOf('cancelled_') === 0;
  document.getElementById('cb-out-attend').classList.toggle('sel', v === 'attended');
  document.getElementById('cb-out-cancel').classList.toggle('sel', isCancelledFamily);
  document.getElementById('cb-out-cancel-sub').style.display = isCancelledFamily ? '' : 'none';
  ['no_payment', 'payment_needed', 'by_practice'].forEach(function(k) {
    document.getElementById('cb-out-' + k).classList.toggle('sel', v === 'cancelled_' + k);
  });
  window._cbOutcome = (v === 'attended' || v.indexOf('cancelled_') === 0) ? v : null;
}

function _cbSubmitOutcome(eventId, baseName, btn) {
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  var fields = _cbFields(ev);
  var funderSel = document.getElementById('cb-out-funder');
  var funder = (funderSel && funderSel.value) || '';
  // Required, not defaulted to "Unknown" — a blank funder used to silently
  // fall back to the generic NDIS-style billing path on the Board even for
  // an actual Medicare/Private client, which is exactly the kind of quiet
  // misrouting that matters once funder drives which billing buttons show.
  if (!funder) { _cbToast('Pick a funder before saving.'); return; }
  if (!window._cbOutcome) { _cbToast('Pick what happened before saving.'); return; }
  var durationSel = document.getElementById('cb-out-duration');
  var duration = durationSel && durationSel.value ? durationSel.value : (fields.Duration || null);
  var modality = window._cbOutcomeModality || fields.Type || 'In person';
  var statusSuffix = window._cbOutcome === 'attended' ? 'Attended'
    : window._cbOutcome === 'cancelled_by_practice' ? 'Cancelled (Cheree)' : 'Cancelled (client)';
  var statusField = window._cbOutcome === 'attended' ? 'Attended'
    : window._cbOutcome === 'cancelled_by_practice' ? 'Cancelled by Cheree' : 'Cancelled by client';
  // Cancelling as the practice is never billed; a client cancellation is
  // exactly the one case that's a real judgement call (late-cancellation
  // fee or not) — this fully replaces the old separate "Bill for this?"
  // step, which asked the same question in two clicks instead of one.
  var billYes = window._cbOutcome === 'attended' || window._cbOutcome === 'cancelled_payment_needed';

  // No charge at all → nothing will ever move it through billing/remittance,
  // so it's closed the moment the outcome is saved (matches _cbEventStage's
  // own "Bill: No" ⇒ closed rule). Also preserve an already-closed state
  // from a prior save — re-opening the outcome form to fix a typo shouldn't
  // silently drop the ✓ from a session whose Billing already reached closed
  // via the Board.
  var noCharge = !billYes;
  var alreadyClosed = _CB_CLOSED_BILLING.indexOf(fields.Billing) !== -1;
  var newTitle = _cbBuildTitle(baseName, funder, modality, statusSuffix);
  if (noCharge || alreadyClosed) newTitle = _cbCloseTitle(newTitle);

  var newFields = {
    'Funder': funder, 'HalaxyId': fields.HalaxyId, 'Type': modality, 'Duration': duration, 'Note': fields.Note,
    'Status': statusField, 'Bill': billYes ? 'Yes' : 'No', 'Billing': fields.Billing,
    'Invoice': fields.Invoice, 'QFES Form': fields['QFES Form'], '_history': fields._history,
  };
  _cbLogHistory(newFields, statusField + (noCharge ? ' — no charge, closed' : ''));
  var newDesc = _cbBuildDesc(newFields);

  // Keep the actual calendar block in sync with the logged duration — only
  // for a preset from _CB_DURATIONS, since a custom/legacy Duration string
  // (kept verbatim so nothing's silently overwritten) has no known minutes
  // to resize to. Start time never changes here, only how long it runs.
  var durationMinutes = (_CB_DURATIONS.find(function(o) { return o[1] === duration; }) || [])[0];
  var patchBody = { title: newTitle, description: newDesc };
  if (durationMinutes && ev.start) {
    patchBody.end = new Date(new Date(ev.start).getTime() + durationMinutes * 60000).toISOString();
  }

  var restore = _cbBusy(btn, 'Saving…');
  fetch('/api/calendar-pending?eventId=' + encodeURIComponent(eventId), {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patchBody),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not save: ' + d.error); restore(); return; }
    ev.title = newTitle; ev.description = newDesc;
    if (patchBody.end) ev.end = patchBody.end;
    _cbToast('Saved');
    cbSetView('home');
  }).catch(function(err) { _cbToast('Could not save: ' + err.message); restore(); });
}

/* ── Edit / delete an existing session — reachable from the Board (which
 * otherwise has no way to fix a wrong date/time/duration or remove a
 * mis-entered session short of finding it on Home) and from anywhere else
 * that has an eventId. Deliberately separate from _cbOpenOutcome: that flow
 * forces picking Attended/Cancelled to save anything, which doesn't fit
 * "I typo'd the date on a session that hasn't happened yet". ── */
function cbOpenEdit(eventId) {
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  var fields = _cbFields(ev);
  var start = ev.start ? new Date(ev.start) : new Date();
  var p = function(n) { return (n < 10 ? '0' : '') + n; };

  document.getElementById('cb-edit-title').textContent = ev.title.split(' — ')[0] || 'Edit session';

  var durationMinutes = ev.start && ev.end ? Math.round((new Date(ev.end) - start) / 60000) : null;
  var durationKnown = _CB_DURATIONS.some(function(o) { return o[0] === durationMinutes; });

  var html = '<div class="field"><label>Date</label><input type="date" id="cb-edit-date" value="' + _cbDateKey(start) + '"></div>';
  html += '<div class="field"><label>Time</label><input type="time" id="cb-edit-time" value="' + p(start.getHours()) + ':' + p(start.getMinutes()) + '"></div>';
  html += '<div class="field"><label>How long?</label><select id="cb-edit-duration">'
    + (!durationMinutes || !durationKnown ? '<option value="" selected>' + (durationMinutes ? durationMinutes + ' min (custom)' : 'Not set') + '</option>' : '')
    + _CB_DURATIONS.map(function(o) { return '<option value="' + o[0] + '"' + (o[0] === durationMinutes ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
    + '</select></div>';
  html += '<div class="field"><label>In person or online?</label><div class="modality">'
    + '<button id="cb-edit-mod-inperson" class="' + (fields.Type === 'Online' ? '' : 'sel') + '" onclick="_cbSetEditModality(\'In person\')">In person</button>'
    + '<button id="cb-edit-mod-online" class="' + (fields.Type === 'Online' ? 'sel' : '') + '" onclick="_cbSetEditModality(\'Online\')">Online</button>'
    + '</div></div>';
  html += '<button class="btn-primary" onclick="cbSaveEdit(\'' + _cbEsc(eventId) + '\',this)">Save</button>';
  html += '<button class="btn-ghost" style="color:var(--red,#c0392b)" onclick="cbDeleteEvent(\'' + _cbEsc(eventId) + '\',this)">Delete this session</button>';

  document.getElementById('cb-edit-body').innerHTML = html;
  window._cbEditModality = fields.Type === 'Online' ? 'Online' : 'In person';
  document.getElementById('cb-edit-backdrop').classList.add('open');
  document.getElementById('cb-edit-sheet').classList.add('open');
}

function _cbSetEditModality(m) {
  window._cbEditModality = m;
  document.getElementById('cb-edit-mod-inperson').classList.toggle('sel', m === 'In person');
  document.getElementById('cb-edit-mod-online').classList.toggle('sel', m === 'Online');
}

function cbCloseEdit() {
  document.getElementById('cb-edit-backdrop').classList.remove('open');
  document.getElementById('cb-edit-sheet').classList.remove('open');
}

function cbSaveEdit(eventId, btn) {
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  var fields = _cbFields(ev);
  var date = document.getElementById('cb-edit-date').value;
  var time = document.getElementById('cb-edit-time').value;
  if (!date || !time) { _cbToast('Pick a date and time'); return; }

  var durationSel = document.getElementById('cb-edit-duration');
  var durationMinutes = durationSel && durationSel.value ? parseInt(durationSel.value, 10) : null;
  var durationLabel = durationMinutes
    ? (_CB_DURATIONS.find(function(o) { return o[0] === durationMinutes; }) || [durationMinutes, durationMinutes + ' min'])[1]
    : fields.Duration;
  var modality = window._cbEditModality || fields.Type || 'In person';

  var start = new Date(date + 'T' + time + ':00');
  var end = new Date(start.getTime() + (durationMinutes || 60) * 60000);

  var baseName = ev.title.split(' — ')[0] || ev.title;
  var statusSuffix = fields.Status === 'Attended' ? 'Attended'
    : fields.Status === 'Cancelled by Cheree' ? 'Cancelled (Cheree)'
    : fields.Status === 'Cancelled by client' ? 'Cancelled (client)' : null;
  var newTitle = _cbBuildTitle(baseName, fields.Funder || 'Unknown', modality, statusSuffix);
  if (/ ✓$/.test(ev.title)) newTitle = _cbCloseTitle(newTitle);

  var newFields = { 'Funder': fields.Funder, 'HalaxyId': fields.HalaxyId, 'Type': modality, 'Duration': durationLabel,
    'Note': fields.Note, 'Status': fields.Status, 'Bill': fields.Bill, 'Billing': fields.Billing,
    'Invoice': fields.Invoice, 'QFES Form': fields['QFES Form'], '_history': fields._history };

  // The actual "keep a memory of the old appointment" ask (2026-08-31):
  // this used to log only the new date/time, with no record of what it
  // was moved from. When the date/time genuinely changed, spell out
  // old → new explicitly — it lands in the event's own description (read
  // directly in Google Calendar, per _cbLogHistory) as well as this card's
  // Activity list, so the prior slot isn't lost, just superseded.
  var oldStart = ev.start ? new Date(ev.start) : null;
  var timeChanged = !oldStart || oldStart.getTime() !== start.getTime();
  var fmtWhen = function(d) {
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  };
  var histText = (timeChanged && oldStart)
    ? 'Rescheduled from ' + fmtWhen(oldStart) + ' to ' + fmtWhen(start) + ' — ' + durationLabel + ', ' + modality
    : 'Edited — ' + fmtWhen(start) + ', ' + durationLabel + ', ' + modality;
  _cbLogHistory(newFields, histText);
  var newDesc = _cbBuildDesc(newFields);

  var restore = _cbBusy(btn, 'Saving…');
  fetch('/api/calendar-pending?eventId=' + encodeURIComponent(eventId), {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: newTitle, description: newDesc, start: start.toISOString(), end: end.toISOString() }),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not save: ' + d.error); restore(); return; }
    ev.title = newTitle; ev.description = newDesc; ev.start = start.toISOString(); ev.end = end.toISOString();
    _cbToast('Saved');
    cbCloseEdit();
    _cbRender();
  }).catch(function(err) { _cbToast('Could not save: ' + err.message); restore(); });
}

function cbDeleteEvent(eventId, btn) {
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  var name = ev.title.split(' — ')[0] || 'this session';
  if (!window.confirm('Delete ' + name + '’s session? This removes it from the calendar entirely — it can’t be undone from here.')) return;

  var restore = _cbBusy(btn, 'Deleting…');
  fetch('/api/calendar-pending?eventId=' + encodeURIComponent(eventId), {
    method: 'DELETE', credentials: 'include',
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not delete: ' + d.error); restore(); return; }
    _cbEvents = _cbEvents.filter(function(e) { return String(e.id) !== String(eventId); });
    _cbToast('Deleted');
    cbCloseEdit();
    _cbRender();
  }).catch(function(err) { _cbToast('Could not delete: ' + err.message); restore(); });
}

/* ── Book new appointment (existing client only — "add new" is parked) ──
 * When opened via cbCreateAppointmentFromEnquiry, _cbBookingEnquiry names
 * who this is for — the search box pre-fills and auto-runs with their
 * name so she just needs to confirm the matching Halaxy record, but she
 * still explicitly picks it (this doesn't skip the Halaxy-client
 * requirement, just saves the typing). ── */
function _cbRenderBook() {
  var root = document.getElementById('root');
  if (!_cbPicked) {
    var forEnq = _cbBookingEnquiry;
    var banner = forEnq
      ? '<div class="card"><div class="mt">Booking for <strong style="color:var(--t1)">' + _cbEsc(forEnq.name) + '</strong> (from an enquiry) — pick their Halaxy record below, or <a href="#" onclick="_cbBookingEnquiry=null;_cbRenderBook();return false" style="color:var(--teal)">search for someone else</a>.</div></div>'
      : '';
    root.innerHTML = '<div class="sec-hd">New booking</div>' + banner
      + '<div class="field"><label>Find the client</label>'
      + '<input id="cb-search" placeholder="Search by name…" autocomplete="off" value="' + (forEnq ? _cbEsc(forEnq.name) : '') + '" oninput="_cbSearchClients(this.value)"></div>'
      + '<div id="cb-search-results"></div>'
      + '<button class="btn-ghost" onclick="_cbBookingEnquiry=null;cbSetView(\'home\')">Cancel</button>';
    setTimeout(function() {
      var i = document.getElementById('cb-search');
      if (!i) return;
      i.focus();
      if (forEnq) _cbSearchClients(forEnq.name);
    }, 60);
    return;
  }
  _cbRenderBookForm();
}

function _cbSearchClients(q) {
  var resultsEl = document.getElementById('cb-search-results');
  q = (q || '').trim().toLowerCase();
  if (!q) { resultsEl.innerHTML = ''; return; }
  var matches = _cbClients.filter(function(c) { return c.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 12);
  if (!matches.length) { resultsEl.innerHTML = '<div class="empty">No one matches "' + _cbEsc(q) + '"</div>'; return; }
  resultsEl.innerHTML = matches.map(function(c) {
    var initials = c.name.trim().split(/\s+/).slice(0, 2).map(function(p) { return p[0]; }).join('').toUpperCase();
    return '<div class="pick-row" onclick="_cbPickClient(\'' + _cbEsc(String(c.id)) + '\')">'
      + '<div class="av">' + _cbEsc(initials) + '</div><div class="nm">' + _cbEsc(c.name) + '</div></div>';
  }).join('');
}

function _cbPickClient(id) {
  var c = _cbClients.find(function(x) { return String(x.id) === String(id); });
  if (!c) return;
  _cbPicked = c;
  _cbModality = null;
  _cbRenderBookForm();
}

function _cbRenderBookForm() {
  var root = document.getElementById('root');
  var today = new Date().toISOString().slice(0, 10);
  var html = '<div class="card"><div class="nm">' + _cbEsc(_cbPicked.name) + '</div>'
    + '<div class="mt"><a href="#" onclick="_cbPicked=null;_cbRenderBook();return false" style="color:var(--teal)">Change client</a></div></div>';

  html += '<div class="field"><label>Funder</label><select id="cb-funder">'
    + ['NDIS', 'Medicare', 'QFES', 'WorkCover', 'DVA', 'Private', 'Other'].map(function(f) { return '<option value="' + f + '">' + f + '</option>'; }).join('')
    + '</select></div>';

  html += '<div class="field"><label>In person or online?</label><div class="modality">'
    + '<button id="cb-mod-inperson" onclick="_cbSetModality(\'In person\')">In person</button>'
    + '<button id="cb-mod-online" onclick="_cbSetModality(\'Online\')">Online</button>'
    + '</div></div>';

  html += '<div class="row2">'
    + '<div class="field"><label>Date</label><input type="date" id="cb-date" value="' + today + '"></div>'
    + '<div class="field"><label>Time</label><input type="time" id="cb-time" value="09:00"></div>'
    + '</div>';

  html += '<div class="field"><label>How long for?</label><select id="cb-duration">'
    + _CB_DURATIONS.map(function(o) { return '<option value="' + o[0] + '"' + (o[0] === 60 ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
    + '</select></div>';

  html += '<div class="field"><label>Note (optional)</label><input type="text" id="cb-note" placeholder="Anything worth flagging — e.g. report fee, funding change…"></div>';

  html += '<div id="cb-day-context" class="mt" style="margin-bottom:12px"></div>';

  html += '<button class="btn-primary" id="cb-submit" onclick="_cbSubmitBooking()">Add to calendar</button>';
  html += '<button class="btn-ghost" onclick="_cbBookingEnquiry=null;cbSetView(\'home\')">Cancel</button>';

  root.innerHTML = html;
  document.getElementById('cb-date').addEventListener('change', _cbShowDayContext);
  _cbShowDayContext();
}

function _cbSetModality(m) {
  _cbModality = m;
  document.getElementById('cb-mod-inperson').classList.toggle('sel', m === 'In person');
  document.getElementById('cb-mod-online').classList.toggle('sel', m === 'Online');
}

/* Show what's already booked that day so she doesn't double-book — read-only context, not a full calendar grid. */
function _cbShowDayContext() {
  var dateInput = document.getElementById('cb-date');
  var ctx = document.getElementById('cb-day-context');
  if (!dateInput || !ctx) return;
  var iso = dateInput.value;
  var same = _cbEvents.filter(function(e) { return e.start && e.start.slice(0, 10) === iso; })
    .sort(function(a, b) { return new Date(a.start) - new Date(b.start); });
  if (!same.length) { ctx.textContent = 'Nothing else booked that day.'; return; }
  ctx.innerHTML = 'Already booked that day: ' + same.map(function(e) {
    var t = new Date(e.start).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    return _cbEsc(t + ' ' + e.title.split(' — ')[0]);
  }).join(', ');
}

function _cbSubmitBooking() {
  var funder = document.getElementById('cb-funder').value;
  var date = document.getElementById('cb-date').value;
  var time = document.getElementById('cb-time').value;
  var duration = parseInt(document.getElementById('cb-duration').value, 10);
  var note = document.getElementById('cb-note').value.trim();

  if (!_cbModality) { _cbToast('Pick in person or online'); return; }
  if (!date || !time) { _cbToast('Pick a date and time'); return; }

  var start = new Date(date + 'T' + time + ':00');
  var end = new Date(start.getTime() + duration * 60000);

  var durationLabel = (_CB_DURATIONS.find(function(o) { return o[0] === duration; }) || [duration, duration + ' min'])[1];
  var title = _cbBuildTitle(_cbPicked.name, funder, _cbModality, null);
  // _cbPicked always comes from the Halaxy patient search (adding a brand
  // new, not-yet-in-Halaxy client is parked — see the note above), so its
  // id is always a real Halaxy Patient ID, not a Supabase-only enquiry id.
  var fields = { 'Funder': funder, 'HalaxyId': _cbPicked.id, 'Type': _cbModality, 'Duration': durationLabel,
    'Note': note || null, 'Status': 'Scheduled' };
  _cbLogHistory(fields, 'Booked — ' + funder + ', ' + _cbModality);
  var desc = _cbBuildDesc(fields);

  var btn = document.getElementById('cb-submit');
  btn.disabled = true; btn.textContent = 'Adding…';

  fetch('/api/calendar-pending', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title, description: desc, start: start.toISOString(), end: end.toISOString() }),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not add: ' + d.error); btn.disabled = false; btn.textContent = 'Add to calendar'; return; }
    _cbEvents.push({ id: d.id, title: title, description: desc, start: start.toISOString(), end: end.toISOString() });
    _cbToast('Added to the calendar ✓');
    _cbPicked = null;

    var bookedFor = _cbBookingEnquiry;
    _cbBookingEnquiry = null;
    if (bookedFor) {
      _cbConvertEnquiryAfterBooking(bookedFor.id, d.id);
      _cbRenderBookingConfirmed(bookedFor.name, bookedFor.email);
    } else {
      cbSetView('home');
    }
  }).catch(function(err) {
    _cbToast('Could not add: ' + err.message);
    btn.disabled = false; btn.textContent = 'Add to calendar';
  });
}

/* Bookkeeping only, fired after the calendar event already exists — never
 * blocks the confirmation screen and never fails loudly, since the actual
 * booking (the part that matters) already succeeded. Marks the enquiry
 * converted (same convention as linking to a client elsewhere) and merges
 * the new event onto it via the existing, previously-unused cal_link
 * endpoint (api/admin-enquiries.js). */
function _cbConvertEnquiryAfterBooking(enquiryId, eventId) {
  fetch('/api/admin-enquiries?id=' + encodeURIComponent(enquiryId), {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'converted' }),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { console.error('[cbConvertEnquiryAfterBooking] status update failed:', d.error); return; }
    var enq = (_cbData && _cbData.enquiries || []).find(function(e) { return String(e.id) === String(enquiryId); });
    if (enq) enq.status = 'converted';
  }).catch(function(err) { console.error('[cbConvertEnquiryAfterBooking] status update error:', err.message); });

  fetch('/api/admin-enquiries?cal_link=1', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: eventId, enquiryId: enquiryId }),
  }).catch(function(err) { console.error('[cbConvertEnquiryAfterBooking] cal_link error:', err.message); });
}

// Same idea as _cbRemitGmailUrl below, but a compose window instead of a
// search — she reviews and sends it herself, nothing is sent from here.
function _cbComposeGmailUrl(to, subject, body) {
  return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to || '')
    + '&su=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
}

function _cbRenderBookingConfirmed(name, email) {
  var root = document.getElementById('root');
  var subject = 'Your upcoming session — Cheree McGarry Counselling';
  var body = 'Hi ' + name + ',\n\nJust confirming your upcoming session with Cheree. Let me know if you have any questions.\n\nWarm regards,\nCheree';
  var composeUrl = email ? _cbComposeGmailUrl(email, subject, body) : null;

  root.innerHTML = '<div class="card"><div class="nm">Booked for ' + _cbEsc(name) + '</div>'
    + '<div class="mt">Added to the calendar and linked back to their enquiry.</div></div>'
    + (composeUrl
        ? '<a class="btn-primary" style="display:block;text-align:center;text-decoration:none" href="' + _cbEsc(composeUrl) + '" target="_blank" rel="noopener">Send them a confirmation email →</a>'
        : '')
    + '<button class="btn-ghost" onclick="cbSetView(\'home\')">Done</button>';
}

function cbCreateAppointmentFromEnquiry(enquiryId) {
  var enq = (_cbData && _cbData.enquiries || []).find(function(e) { return String(e.id) === String(enquiryId); });
  if (!enq) return;
  var name = [enq.first_name, enq.last_name].filter(Boolean).join(' ') || 'Unknown';
  _cbBookingEnquiry = { id: enquiryId, name: name, email: enq.email || null };
  _cbPicked = null;
  _cbModality = null;
  _cbExpandedCardId = null;
  cbSetView('book');
}

/* ── Link an enquiry to an existing upcoming appointment, instead of
 * creating a new one — e.g. she already booked the session before getting
 * to triage. Lists the next 60 days from _cbEvents (already loaded
 * client-side, same window _cbLoadData fetches — no extra request) and
 * merges the pick via the existing cal_link endpoint, previously wired up
 * server-side but never called from anywhere. ── */
function cbOpenLinkAppointment(enquiryId, name) {
  document.getElementById('cb-linkappt-title').textContent = 'Link ' + name + ' to…';
  var body = document.getElementById('cb-linkappt-body');

  var now = new Date();
  var cutoff = new Date(now.getTime() + 60 * 86400000);
  var upcoming = _cbEvents.filter(function(e) {
    if (!e.start) return false;
    var d = new Date(e.start);
    return d >= now && d <= cutoff;
  }).sort(function(a, b) { return new Date(a.start) - new Date(b.start); });

  if (!upcoming.length) {
    body.innerHTML = '<div class="empty">Nothing booked in the next 60 days to link to.</div>';
  } else {
    body.innerHTML = upcoming.map(function(e) {
      var d = new Date(e.start);
      var when = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
      var evName = e.title.split(' — ')[0] || e.title;
      return '<div class="pick-row" onclick="cbConfirmLinkAppointment(\'' + _cbEsc(String(enquiryId)) + '\',\'' + _cbEsc(String(e.id)) + '\',this)">'
        + '<div class="pick-body"><div class="nm">' + _cbEsc(evName) + '</div><div class="mt">' + _cbEsc(when) + '</div></div></div>';
    }).join('');
  }

  document.getElementById('cb-linkappt-backdrop').classList.add('open');
  document.getElementById('cb-linkappt-sheet').classList.add('open');
}

function cbCloseLinkAppointment() {
  document.getElementById('cb-linkappt-backdrop').classList.remove('open');
  document.getElementById('cb-linkappt-sheet').classList.remove('open');
}

function cbConfirmLinkAppointment(enquiryId, eventId, row) {
  if (row) row.style.opacity = '0.5';
  fetch('/api/admin-enquiries?cal_link=1', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: eventId, enquiryId: enquiryId }),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not link: ' + d.error); if (row) row.style.opacity = '1'; return; }
    return fetch('/api/admin-enquiries?id=' + encodeURIComponent(enquiryId), {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'converted' }),
    }).then(function(r2) { return r2.json(); });
  }).then(function(d2) {
    if (!d2) return; // the linked-catch above already toasted and returned
    if (d2.error) { _cbToast('Linked, but could not update enquiry status: ' + d2.error); }
    var enq = (_cbData && _cbData.enquiries || []).find(function(e) { return String(e.id) === String(enquiryId); });
    if (enq) enq.status = 'converted';
    _cbExpandedCardId = null;
    _cbToast('Linked to appointment');
    cbCloseLinkAppointment();
    _cbRender();
  }).catch(function(err) { _cbToast('Could not link: ' + err.message); if (row) row.style.opacity = '1'; });
}

/* ═══════════════════════════════════════════════════════════════
   CLIENTS — "who we have and what they are." Halaxy's patient list is the
   source of truth for who's a real client; local `clients` + `enquiries`
   (both already in _cbData from the same /api/admin-enquiries fetch every
   other view uses) enrich that with funder/family links and surface leads
   who aren't Halaxy patients yet. Read-only — no writes from this view.
   Ported from js/admin-new.js (that page's Clients tab is retired now
   this lives here) rather than shared, per this file's standalone-script
   convention.
   ═══════════════════════════════════════════════════════════════ */

var _cbClientRows  = [];
var _cbClientQuery = '';

/** Text-match only, no org-ID resolution — good enough for a glance-level
 * "what are they", same trade-off as everywhere else funder is guessed
 * from a raw payor string rather than an explicit pick. */
function _cbFunderKey(payorStr) {
  var s = (payorStr || '').toLowerCase();
  if (!s) return null;
  if (s.indexOf('medicare') !== -1) return 'medicare';
  if (s.indexOf('dva') !== -1 || s.indexOf('defence') !== -1 || s.indexOf('veteran') !== -1 || s.indexOf('adfhcs') !== -1 || s.indexOf('bupa') !== -1) return 'dva';
  if (s.indexOf('ndis') !== -1 || s.indexOf('plan manag') !== -1 || s.indexOf('in choice') !== -1 || s.indexOf('plan partners') !== -1 || s.indexOf('freedom') !== -1 || s.indexOf('individualised community') !== -1) return 'ndis_plan';
  if (s.indexOf('qfes') !== -1 || s.indexOf('fire and emergency') !== -1) return 'qfes';
  if (s.indexOf('workcover') !== -1 || s.indexOf('work cover') !== -1 || s.indexOf('compensation') !== -1) return 'workcover';
  if (s.indexOf('private') !== -1 || s.indexOf('self pay') !== -1) return 'private';
  return null;
}

var _CB_FUNDER_LABEL = {
  ndis_plan: 'NDIS', ndis_self: 'NDIS', medicare: 'Medicare', private: 'Private',
  qfes: 'QFES', workcover: 'WorkCover', dva: 'DVA',
};
var _CB_FUNDER_OPTIONS = ['NDIS', 'Medicare', 'QFES', 'WorkCover', 'DVA', 'Private', 'Other'];

/** `clients.funder` stores a comma-separated list so a client can carry
 * more than one funder (e.g. NDIS for one service, Medicare for another) —
 * no schema change, just a richer read of the same text column. Handles
 * both the new format (canonical labels, "Medicare,NDIS") and the old
 * single-key format ('ndis_plan') that predates multi-funder editing. */
function _cbResolveFunderTokens(raw) {
  if (!raw) return [];
  return String(raw).split(',').map(function(tok) {
    tok = tok.trim();
    if (!tok) return null;
    if (_CB_KNOWN_FUNDERS[tok]) return tok; // already a canonical label
    return _CB_FUNDER_LABEL[tok] || null; // legacy internal key
  }).filter(Boolean);
}

function _cbInitials(name) {
  if (!name) return '?';
  var p = name.trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

function _cbPatientId(participant) {
  if (!participant) return null;
  for (var i = 0; i < participant.length; i++) {
    var ref = (participant[i].actor || {}).reference || '';
    var idx = ref.indexOf('/Patient/');
    if (idx !== -1) return ref.slice(idx + 9);
    if (ref.indexOf('Patient/') === 0) return ref.slice(8);
  }
  return null;
}

function _cbFmtDate(d) {
  if (!d) return null;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

function _cbBuildClientRows(data) {
  var halaxy = data.halaxy || { patients: [], appointments: [], patientFunderMap: {} };
  var clients = data.clients || [];
  var enquiries = data.enquiries || [];
  var manualFunders = data.client_funders || {}; // { halaxyId|localClientId → ['NDIS',...] } — see cbSaveFunders

  var clientByHalaxyId = {};
  clients.forEach(function(c) { if (c.halaxy_id) clientByHalaxyId[String(c.halaxy_id)] = c; });
  var clientById = {};
  clients.forEach(function(c) { clientById[String(c.id)] = c; });

  var apptsByPatient = {};
  (halaxy.appointments || []).forEach(function(a) {
    var pid = _cbPatientId(a.participant);
    if (!pid) return;
    var startStr = a.start || (a.period && a.period.start);
    if (!startStr) return;
    var st = a.status || '';
    if (st === 'cancelled' || st === 'entered-in-error' || st === 'noshow') return;
    (apptsByPatient[pid] = apptsByPatient[pid] || []).push(new Date(startStr));
  });

  var now = new Date();
  var rows = [];
  var seenHalaxyIds = {};

  (halaxy.patients || []).forEach(function(p) {
    seenHalaxyIds[String(p.id)] = true;
    var local = clientByHalaxyId[String(p.id)];
    var dates = apptsByPatient[p.id] || [];
    var past = dates.filter(function(d) { return d <= now; }).sort(function(a, b) { return b - a; });
    var future = dates.filter(function(d) { return d > now; }).sort(function(a, b) { return a - b; });

    var manualKey = String(p.id);
    var funders = manualFunders[manualKey]
      ? manualFunders[manualKey].slice()
      : (local && local.funder
          ? _cbResolveFunderTokens(local.funder)
          : _cbResolveFunderTokens(_cbFunderKey(halaxy.patientFunderMap && halaxy.patientFunderMap[p.id])));
    var familyOf = null;
    if (local && local.parent_client_id) {
      var parent = clientById[String(local.parent_client_id)];
      if (parent) familyOf = parent.display_name;
    }

    rows.push({
      key: 'h:' + p.id, name: p.name || 'Unnamed', manualKey: manualKey, editable: true,
      type: funders.length ? funders.join(', ') : 'Unknown', funders: funders,
      lastSeen: past[0] || null, nextAppt: future[0] || null,
      familyOf: familyOf, sortDate: future[0] || past[0] || null,
      halaxyId: p.id, // shown as a copyable chip — e.g. the "Client code" QFES's ISA form asks for
    });
  });

  // Local-only clients with no halaxy_id (rare) — still real people we know of
  clients.forEach(function(c) {
    if (c.halaxy_id && seenHalaxyIds[String(c.halaxy_id)]) return;
    if (c.halaxy_id) return;
    var manualKey = String(c.id);
    var funders = manualFunders[manualKey] ? manualFunders[manualKey].slice() : _cbResolveFunderTokens(c.funder);
    var familyOf = null;
    if (c.parent_client_id) {
      var parent = clientById[String(c.parent_client_id)];
      if (parent) familyOf = parent.display_name;
    }
    rows.push({
      key: 'c:' + c.id, name: c.display_name || 'Unnamed', manualKey: manualKey, editable: true,
      type: funders.length ? funders.join(', ') : 'Local record', funders: funders,
      lastSeen: null, nextAppt: null, familyOf: familyOf,
      sortDate: c.created_at ? new Date(c.created_at) : null,
    });
  });

  // Enquiries not yet converted to a Halaxy patient — leads still being worked.
  // Not editable here — funder tagging only makes sense once they're a client.
  enquiries.forEach(function(e) {
    if (e.status === 'converted' || e.status === 'closed') return;
    var name = [e.first_name, e.last_name].filter(Boolean).join(' ') || 'Unknown';
    rows.push({
      key: 'e:' + e.id, name: name, manualKey: null, editable: false,
      type: 'Lead — ' + (e.status || 'new'), funders: [],
      lastSeen: null, nextAppt: null, familyOf: null,
      sortDate: e.created_at ? new Date(e.created_at) : null,
    });
  });

  rows.sort(function(a, b) {
    var ad = a.sortDate ? a.sortDate.getTime() : 0;
    var bd = b.sortDate ? b.sortDate.getTime() : 0;
    return bd - ad;
  });

  return rows;
}

function _cbClientSearch(v) {
  _cbClientQuery = v;
  _cbRenderClients();
}

function _cbRenderClients() {
  var root = document.getElementById('root');
  var q = _cbClientQuery.trim().toLowerCase();
  var rows = q ? _cbClientRows.filter(function(r) { return r.name.toLowerCase().indexOf(q) !== -1; }) : _cbClientRows;

  if (!rows.length) {
    root.innerHTML = '<div class="empty">' + (q ? 'No one matches "' + _cbEsc(_cbClientQuery) + '"' : 'No clients yet') + '</div>';
    return;
  }

  var html = '<div class="sec-hd">' + rows.length + (q ? ' match' + (rows.length === 1 ? '' : 'es') : ' people') + '</div>';
  html += '<div class="card-grid">';
  rows.forEach(function(r) {
    var metaParts = [];
    if (r.lastSeen) metaParts.push('Last seen ' + _cbFmtDate(r.lastSeen));
    if (r.nextAppt) metaParts.push('Next ' + _cbFmtDate(r.nextAppt));
    if (!r.lastSeen && !r.nextAppt) metaParts.push(r.type.indexOf('Lead') === 0 ? 'No appointment yet' : 'No appointment history');
    if (r.familyOf) metaParts.push('family of ' + r.familyOf);

    var chips = r.funders.length
      ? r.funders.map(function(f) { return _cbFunderChip(f); }).join('')
      : '<span class="fchip ' + (r.type.indexOf('Lead') === 0 ? 'fchip-Lead' : 'fchip-Unknown') + '">' + _cbEsc(r.type) + '</span>';

    var idBtn = r.halaxyId
      ? '<button class="cl-id-btn" onclick="_cbCopyId(\'' + _cbEsc(String(r.halaxyId)) + '\')" title="Copy Halaxy Patient ID — the QFES ISA form\'s &quot;Client code&quot;">ID ' + _cbEsc(String(r.halaxyId)) + '</button>'
      : '';

    html += '<div class="pick-row static">'
      + '<div class="av">' + _cbEsc(_cbInitials(r.name)) + '</div>'
      + '<div class="pick-body"><div class="nm">' + _cbEsc(r.name) + '</div><div class="mt">' + _cbEsc(metaParts.join(' · ')) + '</div>' + idBtn + '</div>'
      + (r.editable
          ? '<div class="cl-funders" onclick="cbEditFunders(\'' + _cbEsc(r.key) + '\')">' + chips
            + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cl-edit-icon"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg></div>'
          : chips)
      + '</div>';
  });
  html += '</div>';
  root.innerHTML = html;
}

/* Multi-funder editor — a bottom sheet (same component as Activity) with a
 * checkbox per funder. Saving writes the comma-joined selection back to
 * clients.funder: PATCHes the existing row if this person already has one,
 * or POSTs a new local client row (carrying halaxy_id, so it links back to
 * the same Halaxy patient) if this is the first manual edit for them. */
function cbEditFunders(rowKey) {
  var row = _cbClientRows.find(function(r) { return r.key === rowKey; });
  if (!row || !row.editable) return;
  window._cbEditingRow = row;
  var body = document.getElementById('cb-funder-body');
  body.innerHTML = '<div class="mt" style="margin-bottom:14px">' + _cbEsc(row.name) + '</div>'
    + _CB_FUNDER_OPTIONS.map(function(f) {
        var checked = row.funders.indexOf(f) !== -1;
        return '<label class="funder-check"><input type="checkbox" value="' + f + '"' + (checked ? ' checked' : '') + '> ' + f + '</label>';
      }).join('')
    + '<button class="btn-primary" style="margin-top:16px" onclick="cbSaveFunders(\'' + _cbEsc(rowKey) + '\')">Save</button>';
  document.getElementById('cb-funder-backdrop').classList.add('open');
  document.getElementById('cb-funder-sheet').classList.add('open');
}

function cbCloseFunderEdit() {
  document.getElementById('cb-funder-backdrop').classList.remove('open');
  document.getElementById('cb-funder-sheet').classList.remove('open');
}

function cbSaveFunders(rowKey) {
  var row = _cbClientRows.find(function(r) { return r.key === rowKey; });
  if (!row || !row.manualKey) return;
  var checks = document.querySelectorAll('#cb-funder-body input[type=checkbox]:checked');
  var selected = Array.prototype.map.call(checks, function(c) { return c.value; });

  fetch('/api/admin-enquiries?client_funders_set=1', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: row.manualKey, funders: selected }),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not save: ' + d.error); return; }
    row.funders = selected;
    row.type = selected.length ? selected.join(', ') : (row.type.indexOf('Lead') === 0 ? row.type : 'Unknown');
    cbCloseFunderEdit();
    _cbRenderClients();
    _cbToast('Funder updated');
  }).catch(function(err) { _cbToast('Could not save: ' + err.message); });
}

/* ═══════════════════════════════════════════════════════════════
   FORMS — reference-only picker for the registration/intake links
   Cheree sends new clients. Copy the right link and send it however
   you normally do (email, text, whatever) — the client fills it in
   themselves, same as /register. Deliberately NOT wired to Halaxy or
   Resend: no API calls happen here, this is just a lookup + clipboard.
   Blank URL = Cheree hasn't provided that one yet.

   Registration links are per FUNDER (Halaxy new-patient widget, same
   ones live on /register — duplicated here rather than shared, same
   standalone-script convention as the rest of this file). Questionnaire
   links are per CLIENT TYPE (couple/child) — a separate clinical form,
   independent of funder, not built anywhere yet.
   ═══════════════════════════════════════════════════════════════ */

var _CB_REG_FORMS = {
  Private:   'https://www.halaxy.com/a/widget/form/new-patient/1429515/QbMZckKL2wNiEI52_hERaElqejBjNUplOExRR3VhMnFFZEc2Q2lLN2RpNUlhQT09',
  Medicare:  'https://www.halaxy.com/a/widget/form/new-patient/245011/uwaXpvH_LYgF5LhA2zF0pVV6aFp6cDd3NG0zL0IzMWtlQ0E0OWJ4YVA2Zmk',
  NDIS:      '', // paste NDIS plan-managed registration URL when available
  DVA:       '', // paste DVA / ADFHSC registration URL when available
  QFES:      '', // paste QFES EAP registration URL when available
  WorkCover: '', // paste WorkCover registration URL when available
};

var _CB_QUESTIONNAIRE_FORMS = {
  couple: { label: 'Couples questionnaire', url: '' },
  child:  { label: 'Child / parent questionnaire', url: '' },
};

var _cbFormsType = 'individual'; // 'individual' | 'couple' | 'child'

function cbOpenForms() {
  _cbFormsType = 'individual';
  _cbRenderForms();
  document.getElementById('cb-forms-backdrop').classList.add('open');
  document.getElementById('cb-forms-sheet').classList.add('open');
}

function cbCloseForms() {
  document.getElementById('cb-forms-backdrop').classList.remove('open');
  document.getElementById('cb-forms-sheet').classList.remove('open');
}

function cbSetFormsType(type) {
  _cbFormsType = type;
  _cbRenderForms();
}

function _cbCopyFormLink(url, label) {
  navigator.clipboard.writeText(url);
  _cbToast(label + ' link copied');
}

function _cbCopyId(id) {
  navigator.clipboard.writeText(id);
  _cbToast('Halaxy ID copied');
}

function _cbFormRow(badgeHtml, label, url) {
  var action = url
    ? '<button class="frm-copy-btn" onclick="_cbCopyFormLink(\'' + _cbEsc(url) + '\',\'' + _cbEsc(label) + '\')">Copy link</button>'
    : '<span class="frm-none">Not sent yet</span>';
  return '<div class="frm-row">' + badgeHtml + action + '</div>';
}

function _cbRenderForms() {
  var body = document.getElementById('cb-forms-body');
  if (!body) return;

  var types = [['individual', 'Individual'], ['couple', 'Couple'], ['child', 'Child']];
  var html = '<div class="frm-type-toggle">' + types.map(function(t) {
    return '<button class="frm-type-btn' + (t[0] === _cbFormsType ? ' active' : '') + '" onclick="cbSetFormsType(\'' + t[0] + '\')">' + t[1] + '</button>';
  }).join('') + '</div>';

  if (_cbFormsType !== 'individual') {
    var q = _CB_QUESTIONNAIRE_FORMS[_cbFormsType];
    html += '<div class="frm-section-lbl">' + _cbEsc(q.label) + '</div>';
    html += _cbFormRow('<span class="frm-row-lbl">' + _cbEsc(q.label) + '</span>', q.label, q.url);
  }

  html += '<div class="frm-section-lbl">Registration form — by funder</div>';
  html += _CB_FUNDER_OPTIONS.filter(function(f) { return f !== 'Other'; }).map(function(f) {
    return _cbFormRow(_cbFunderChip(f), f, _CB_REG_FORMS[f] || '');
  }).join('');

  html += '<div class="frm-note">Copy the link and send it however you normally do — the client fills it in themselves, same as /register. No account or Halaxy access needed here.</div>';
  body.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════
   BOARD (flip view) — the whole pipeline: New/Triage → Booked →
   Needs outcome → Needs billing decision → Awaiting remittance → Closed.

   Deliberately reads the SAME calendar events the Home view writes
   (title + plain "Key: Value" description) rather than a separate
   database — Google Calendar stays the one source of truth for a
   booking's state. This is Julian's view of the whole pipeline plus his
   own billing-stage actions (decision, remittance close-out).
   ═══════════════════════════════════════════════════════════════ */

// No "Booked" column — a future scheduled session is just the schedule
// (Home), not something needing action. The Board starts once a session
// is in the past and needs something done about it.
var BOARD_COLUMNS = [
  { key: 'triage',     label: 'New / Triage' },
  { key: 'outcome',    label: 'Session Action' },
  { key: 'billing',    label: 'Needs billing decision' },
  { key: 'remittance', label: 'Awaiting payment' },
  { key: 'closed',     label: 'Closed' },
];

// Cheree's Halaxy practice ID — fixed, used to deep-link straight to an
// invoice in Halaxy's own web app instead of making Julian hunt for it.
var HALAXY_PRACTICE_ID = '30188411';

function _cbInvoiceUrl(num) {
  return 'https://www.halaxy.com/a/pr/' + HALAXY_PRACTICE_ID + '/invoice/' + encodeURIComponent(num);
}

/** Private/Medicare settle directly with the client (auto-debit or a sent
 * invoice) — no funder claim, no remittance. NDIS/QFES/DVA/WorkCover go
 * through funder claims with their own journeys (still to be defined), so
 * for now they keep the original two-path decision and just sit on the
 * board showing their stage. */
function _cbIsDirectFunder(funder) {
  return funder === 'Private' || funder === 'Medicare';
}

/** Stage for one calendar event, from its own title/description — no
 * guessing, only what's explicitly recorded. */
function _cbEventStage(ev) {
  var f = _cbFields(ev);
  if (!f.Status) return null; // not created via this tool — not part of this pipeline
  if (f.Status === 'Scheduled') {
    // Still upcoming → that's the schedule (Home), not the Board. Only
    // once it's in the past with no outcome yet does it need action here.
    return new Date(ev.start) < new Date() ? 'outcome' : null;
  }
  if (f.Status === 'Attended' || f.Status.indexOf('Cancelled') === 0) {
    if (f.Bill === 'No') return 'closed';
    if (!f.Billing) return 'billing';
    if (f.Billing === 'Funder — awaiting remittance' || f.Billing === 'Invoice sent') return 'remittance';
    return 'closed'; // Halaxy direct, Auto paid, remittance received, or payment received
  }
  return null;
}

/* Pulled out of _cbBoardCards so Home's "Needs triage" section can list
 * the same cards without duplicating the enquiry→card mapping. */
function _cbTriageCards() {
  return ((_cbData && _cbData.enquiries) || []).filter(function(e) {
    return e.status !== 'converted' && e.status !== 'closed';
  }).map(function(e) {
    var name = [e.first_name, e.last_name].filter(Boolean).join(' ') || 'Unknown';
    return { id: 'e:' + e.id, enquiryId: e.id, name: name, meta: 'Enquiry — ' + (e.status || 'new'), enq: e };
  });
}

function _cbBoardCards() {
  var cols = {}; BOARD_COLUMNS.forEach(function(c) { cols[c.key] = []; });
  cols.triage = _cbTriageCards();

  _cbEvents.forEach(function(ev) {
    var stage = _cbEventStage(ev);
    if (!stage) return;
    var f = _cbFields(ev);
    var name = ev.title.split(' — ')[0];
    var d = new Date(ev.start);
    var when = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    var meta = stage === 'outcome'
      ? when + ' · ' + (f.Funder || '') + (f.Type ? ' · ' + f.Type : '')
      : stage === 'billing'
        ? (f.Status || '') + ' · ' + when
        : stage === 'remittance'
          ? (f.Funder || 'Funder') + ' · billed ' + when
          : (f.Billing || (f.Bill === 'No' ? 'No charge' : 'Done'));
    cols[stage].push({ id: ev.id, name: name, meta: meta, ev: ev, fields: f });
  });

  return cols;
}

// Billing choices that leave nothing further to do — matches _cbEventStage's
// own "closed" rule (everything NOT awaiting a funder/invoice). Only these
// get a title update; the two remittance-pending choices don't.
var _CB_CLOSED_BILLING = ['Auto paid', 'Halaxy direct', 'Closed (paid)', 'Closed (remittance received)'];

function cbSetBilling(eventId, choice, btn) {
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  var f = _cbFields(ev);
  f.Billing = choice;
  _cbLogHistory(f, 'Billing: ' + choice);
  var newDesc = _cbBuildDesc(f);
  var closed = _CB_CLOSED_BILLING.indexOf(choice) !== -1;
  var newTitle = closed ? _cbCloseTitle(ev.title) : null;
  var body = { description: newDesc };
  if (newTitle) body.title = newTitle;
  var restore = _cbBusy(btn, 'Saving…');
  fetch('/api/calendar-pending?eventId=' + encodeURIComponent(eventId), {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not update: ' + d.error); restore(); return; }
    ev.description = newDesc;
    if (newTitle) ev.title = newTitle;
    // Moves the card to a new stage — collapse/close whichever surface it
    // was actioned from (Board's inline expansion or Home's drawer) so the
    // change is immediately visible instead of sitting behind stale detail.
    _cbAfterCardAction(eventId, true);
  }).catch(function(err) { _cbToast('Could not update: ' + err.message); restore(); });
}

/* Invoice number — decoupled from the billing-decision buttons above,
 * since Julian usually decides how a bill is being handled before he's
 * actually created the invoice in Halaxy and has a number for it. Stays
 * editable on the card through billing/awaiting-payment/closed, and once
 * set, becomes a one-tap deep link straight into that invoice in Halaxy. */
function cbSaveInvoice(eventId, btn) {
  var input = document.getElementById('inv-' + eventId);
  if (!input) return;
  var num = input.value.trim();
  if (!num) return;
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  var f = _cbFields(ev);
  f.Invoice = num;
  _cbLogHistory(f, 'Invoice #' + num + ' saved');
  var newDesc = _cbBuildDesc(f);
  input.disabled = true;
  var restore = _cbBusy(btn, 'Saving…');
  fetch('/api/calendar-pending?eventId=' + encodeURIComponent(eventId), {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: newDesc }),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not save invoice #: ' + d.error); input.disabled = false; restore(); return; }
    ev.description = newDesc;
    _cbAfterCardAction(eventId, false);
  }).catch(function(err) { _cbToast('Could not save invoice #: ' + err.message); input.disabled = false; restore(); });
}

function _cbInvoiceHtml(c) {
  var id = _cbEsc(String(c.id));
  if (c.fields.Invoice) {
    return '<a class="inv-link" href="' + _cbEsc(_cbInvoiceUrl(c.fields.Invoice)) + '" target="_blank" rel="noopener">Invoice #' + _cbEsc(c.fields.Invoice) + ' ↗</a>';
  }
  return '<div class="act act-inv">'
    + '<input type="text" inputmode="numeric" class="inv-input" id="inv-' + id + '" placeholder="Invoice #…">'
    + '<button onclick="cbSaveInvoice(\'' + id + '\',this)">Save</button>'
    + '</div>';
}

/* QFES-only, sits right under the Invoice line — the ISA "Individual
 * Support Activity" form has to be submitted before Julian sends a QFES
 * invoice, and this is the confirmation number that comes back once he's
 * done that. Same save mechanics as Invoice, own field on the event so
 * either can be filled in independently of the other. */
function cbSaveQfesForm(eventId, btn) {
  var input = document.getElementById('qform-' + eventId);
  if (!input) return;
  var num = input.value.trim();
  if (!num) return;
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  var f = _cbFields(ev);
  f['QFES Form'] = num;
  _cbLogHistory(f, 'QFES form ref ' + num + ' saved');
  var newDesc = _cbBuildDesc(f);
  input.disabled = true;
  var restore = _cbBusy(btn, 'Saving…');
  fetch('/api/calendar-pending?eventId=' + encodeURIComponent(eventId), {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: newDesc }),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not save QFES form ref: ' + d.error); input.disabled = false; restore(); return; }
    ev.description = newDesc;
    _cbAfterCardAction(eventId, false);
  }).catch(function(err) { _cbToast('Could not save QFES form ref: ' + err.message); input.disabled = false; restore(); });
}

function _cbQfesFormHtml(c) {
  var id = _cbEsc(String(c.id));
  if (c.fields['QFES Form']) {
    return '<div class="mt" style="margin-top:4px">QFES form ref: ' + _cbEsc(c.fields['QFES Form']) + '</div>';
  }
  return '<div class="act act-inv">'
    + '<input type="text" class="inv-input" id="qform-' + id + '" placeholder="QFES form ref…">'
    + '<button onclick="cbSaveQfesForm(\'' + id + '\',this)">Save</button>'
    + '</div>';
}

/* ── Remittance inbox check — ported from the old /admin invoice modal
 * (js/admin-ui.js `_checkRemittance`/`_remitGmailUrl`/`_remitFromName`).
 * Same server endpoint (`?check_remittance=`), searches admin@ + reachout@
 * for the invoice number so Julian can tell the funder's money has landed
 * even though Halaxy still shows the invoice unpaid. ── */
function _cbRemitGmailUrl(mailbox, query) {
  var qs = (mailbox && mailbox.indexOf('@') > -1) ? '?authuser=' + encodeURIComponent(mailbox) : '';
  return 'https://mail.google.com/mail/' + qs + '#search/' + encodeURIComponent(query || '');
}

function _cbRemitFromName(from) {
  var m = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(from || '');
  return ((m ? m[1] : (from || '')).trim()) || '';
}

function _cbCheckRemittance(invNum, cardId, btn) {
  var resultEl = document.getElementById('remit-result-' + cardId);
  btn.disabled = true;
  btn.textContent = 'Searching admin@ + reachout@…';
  if (resultEl) resultEl.innerHTML = '';

  fetch('/api/admin-enquiries?check_remittance=' + encodeURIComponent(invNum), { credentials: 'include' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      btn.disabled = false;
      btn.textContent = '🔍 Re-check inbox for remittance';
      if (!resultEl) return;

      if (d.found && d.hits && d.hits.length) {
        var rows = d.hits.slice(0, 3).map(function(h) {
          var when = h.internalDate
            ? new Date(h.internalDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
            : _cbEsc(h.date || '');
          var mbox = (h.mailbox || '').split('@')[0] || 'inbox';
          var who = _cbEsc(_cbRemitFromName(h.from)) || _cbEsc(mbox);
          var url = _cbRemitGmailUrl(h.mailbox, invNum);
          return '<a class="remit-hit" href="' + _cbEsc(url) + '" target="_blank" rel="noopener">'
            + '<span class="remit-hit-check">✓</span>'
            + '<span class="remit-hit-body">'
            +   '<span class="remit-hit-who">' + who + '</span>'
            +   '<span class="remit-hit-sub">' + _cbEsc(h.subject) + ' · ' + when + '</span>'
            + '</span></a>';
        }).join('');
        resultEl.innerHTML = '<div class="remit-msg remit-msg--found">Remittance found — reconcile this invoice in Halaxy.</div>' + rows;
      } else if (d.errors && d.errors.length) {
        var e0 = d.errors[0];
        var notConnected = /no mailbox connected|insufficient|scope|invalid_grant|unauthor/i.test(e0.error || '');
        resultEl.innerHTML = '<div class="remit-msg remit-msg--amber">' + (notConnected
          ? 'Inbox search isn’t connected — re-authorise Google.'
          : 'Couldn’t search the inbox: ' + _cbEsc(e0.error || 'unknown error')) + '</div>';
      } else {
        resultEl.innerHTML = '<div class="remit-msg remit-msg--dim">No remittance email found for #' + _cbEsc(invNum) + '.</div>';
      }
    })
    .catch(function(err) {
      btn.disabled = false;
      btn.textContent = '🔍 Check inbox for remittance';
      if (resultEl) resultEl.innerHTML = '<div class="remit-msg remit-msg--amber">Search failed: ' + _cbEsc(err.message) + '</div>';
    });
}

/* Accordion-style: expanding a card collapses whichever one was open
 * before it. Triage cards can now appear on both Home and the Board (same
 * _cbExpandedCardId either way), so this re-renders whichever view is
 * actually showing rather than assuming Board. */
function cbToggleCardExpand(id) {
  _cbExpandedCardId = (_cbExpandedCardId === id) ? null : id;
  _cbRender();
}

/* New/Triage cards are enquiries (Supabase `enquiries` table), not
 * calendar events — no billing/invoice actions apply. Shows every field
 * the enquiry actually carries (whichever form it came from — Reach Out
 * has reason/message, Request a Session has service/coverage/phone/
 * preferred times — the row select('*') already fetches all of it, this
 * just displays it) plus the ability to remove it, same as any other card
 * can be edited/deleted (2026-08-31 feedback: this was the one card type
 * with no way to see its own details or remove it). Soft-close rather
 * than a hard row delete — status:'closed' is already what _cbBoardCards
 * filters out of triage, and the PATCH endpoint/field already existed
 * (api/admin-enquiries.js), just never wired up from this rewrite. */
function _cbEnquiryActionsHtml(c) {
  var e = c.enq || {};
  var rows = [
    ['Email', e.email ? '<a href="mailto:' + _cbEsc(e.email) + '" style="color:var(--teal)">' + _cbEsc(e.email) + '</a>' : ''],
    ['Phone', e.phone],
    ['Service', e.service],
    ['Coverage', e.coverage],
    ['Client type', e.client_type],
    ['Reason', e.reason],
    ['Preferred times', e.preferred_times],
    ['Received', e.created_at ? new Date(e.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''],
  ].filter(function(r) { return r[1]; });

  var detailHtml = rows.length
    ? '<div class="mt" style="margin-top:8px;line-height:1.7">' + rows.map(function(r) {
        return '<strong style="color:var(--t1)">' + r[0] + ':</strong> ' + (r[0] === 'Email' ? r[1] : _cbEsc(r[1]));
      }).join('<br>') + '</div>'
    : '';
  var messageHtml = e.message ? '<div class="mt" style="margin-top:8px;white-space:pre-wrap">' + _cbEsc(e.message) + '</div>' : '';

  var eid = _cbEsc(String(c.enquiryId));
  var ename = _cbEsc(c.name);
  var actionsHtml = '<div class="act" style="margin-top:10px">'
    + '<button onclick="cbMarkContacted(\'' + eid + '\',\'' + ename + '\',this)">Contacted</button>'
    + '<button onclick="cbCreateAppointmentFromEnquiry(\'' + eid + '\')">Create appointment</button>'
    + '<button onclick="cbOpenLinkAppointment(\'' + eid + '\',\'' + ename + '\')">Link to appointment</button>'
    + '</div>';

  return detailHtml + messageHtml + actionsHtml
    + '<button class="btn-ghost" style="color:var(--red,#c0392b);margin-top:8px" onclick="cbDismissEnquiry(\'' + eid + '\',\'' + ename + '\',this)">Delete this enquiry</button>';
}

function cbDismissEnquiry(enquiryId, name, btn) {
  if (!window.confirm('Remove ' + name + ' from triage? This closes the enquiry — it won\'t appear on the Board again.')) return;

  var restore = _cbBusy(btn, 'Removing…');
  fetch('/api/admin-enquiries?id=' + encodeURIComponent(enquiryId), {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'closed' }),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not remove: ' + d.error); restore(); return; }
    var enq = (_cbData && _cbData.enquiries || []).find(function(e) { return String(e.id) === String(enquiryId); });
    if (enq) enq.status = 'closed';
    _cbExpandedCardId = null;
    _cbToast('Removed from triage');
    _cbRender();
  }).catch(function(err) { _cbToast('Could not remove: ' + err.message); restore(); });
}

/* Log-only — stays in triage (only 'converted'/'closed' are filtered out
 * of _cbTriageCards) since a contacted lead still needs booking. The
 * status PATCH already writes an activity_log entry for any status change
 * (api/admin-enquiries.js) — no separate logging call needed. */
function cbMarkContacted(enquiryId, name, btn) {
  var restore = _cbBusy(btn, 'Saving…');
  fetch('/api/admin-enquiries?id=' + encodeURIComponent(enquiryId), {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'contacted' }),
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { _cbToast('Could not update: ' + d.error); restore(); return; }
    var enq = (_cbData && _cbData.enquiries || []).find(function(e) { return String(e.id) === String(enquiryId); });
    if (enq) enq.status = 'contacted';
    _cbExpandedCardId = null;
    _cbToast(name + ' marked as contacted');
    _cbRender();
  }).catch(function(err) { _cbToast('Could not update: ' + err.message); restore(); });
}

// Compact by default: name/status/funder + the one meta line — a kanban
// column of cards got cramped and overdetailed once every card always
// showed its billing buttons/invoice fields/remittance check at once
// (2026-08-30 feedback). Tapping a card expands it in place (accordion-
// style, one at a time) instead of opening a separate drawer — that felt
// like too much ceremony for "show me this card's actions" and loses
// sight of the rest of the board (2026-08-30 follow-up feedback).
// _cbCardActionsHtml/_cbEnquiryActionsHtml are the same content
// cbOpenHistory shows for Home's stage badge. Shared by _cbRenderBoard's
// pipeline columns and Home's "Needs triage" section (2026-08-31) — one
// card renderer either way.
function _cbCard2Html(c) {
  var id = _cbEsc(String(c.id));
  var f = c.fields || {};
  var sdot = f.Status === 'Attended' ? '<span class="sdot sdot-green"></span>'
    : (f.Status && f.Status.indexOf('Cancelled') === 0) ? '<span class="sdot sdot-red"></span>' : '';
  var expanded = _cbExpandedCardId === c.id;
  return '<div class="card2' + (expanded ? ' card2-expanded' : '') + '">'
    + '<div onclick="cbToggleCardExpand(\'' + id + '\')" style="cursor:pointer">'
    +   '<div class="card2-top"><div class="nm">' + sdot + _cbEsc(c.name) + '</div>' + _cbFunderChip(f.Funder) + '</div>'
    +   '<div class="mt">' + _cbEsc(c.meta) + '</div>'
    + '</div>'
    + (expanded ? (c.ev ? _cbCardActionsHtml(c.ev) : _cbEnquiryActionsHtml(c)) : '')
    + '</div>';
}

function _cbRenderBoard() {
  var root = document.getElementById('root');
  var cols = _cbBoardCards();
  var html = '<div class="sec-hd">Pipeline</div><div class="board">';
  BOARD_COLUMNS.forEach(function(col) {
    var cards = cols[col.key];
    html += '<div class="col" data-stage="' + col.key + '"><div class="col-hd"><span>' + _cbEsc(col.label) + '</span><span class="n">' + cards.length + '</span></div>';
    if (!cards.length) {
      html += '<div class="col-empty">Nothing here</div>';
    } else {
      cards.forEach(function(c) { html += _cbCard2Html(c); });
    }
    html += '</div>';
  });
  html += '</div>';
  root.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════
   ACTIVITY — a bottom sheet, not a third dock destination, so the
   Home/Board flip stays the two primary places. Same log Julian's push
   notifications draw from — a record for anything missed, dismissed, or
   arriving while a phone was silenced.
   ═══════════════════════════════════════════════════════════════ */

function cbOpenActivity() {
  var log = (_cbData && _cbData.notification_activity) || [];
  var body = document.getElementById('cb-activity-body');
  if (!log.length) {
    body.innerHTML = '<div class="empty">Nothing yet — this fills in as sessions get booked and outcomes recorded.</div>';
  } else {
    body.innerHTML = log.map(function(item) {
      var dotClass = item.kind === 'booking' ? 'booking'
        : (item.detail && item.detail.status === 'Attended') ? 'outcome-attended' : 'outcome-cancelled';
      var when = item.at ? new Date(item.at).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
      return '<div class="act-item"><div class="act-dot ' + dotClass + '"></div>'
        + '<div><div class="act-title">' + _cbEsc(item.title) + '</div>'
        + '<div class="act-body">' + _cbEsc(item.body) + '</div>'
        + '<div class="act-when">' + _cbEsc(when) + '</div></div></div>';
    }).join('');
  }
  document.getElementById('cb-activity-backdrop').classList.add('open');
  document.getElementById('cb-activity-sheet').classList.add('open');
}

function cbCloseActivity() {
  document.getElementById('cb-activity-backdrop').classList.remove('open');
  document.getElementById('cb-activity-sheet').classList.remove('open');
}

/* ── Everything one card can do — billing-decision buttons, invoice/QFES
 * form ref inputs, remittance check, jump-to-schedule, edit/delete — keyed
 * off _cbEventStage rather than a column loop since this is shared by two
 * very different places it renders into: inline inside a Board card
 * (_cbRenderBoard) and inside cbOpenHistory's drawer (opened from Home's
 * stage badge, which has no board column to expand within). cbCloseHistory
 * calls here are safe even when no drawer is open — removing an 'open'
 * class that isn't set is a no-op, not an error. ── */
function _cbCardActionsHtml(ev) {
  var f = _cbFields(ev);
  var stage = _cbEventStage(ev);
  var jumpBtn = ev.start ? '<button class="btn-ghost" onclick="cbJumpToSchedule(\'' + _cbEsc(ev.id) + '\')">View in schedule →</button>' : '';
  var editBtn = '<button class="btn-ghost" onclick="cbCloseHistory();cbOpenEdit(\'' + _cbEsc(ev.id) + '\')">Edit or delete</button>';

  var actionsHtml = '';
  if (stage === 'billing') {
    actionsHtml = _cbIsDirectFunder(f.Funder)
      ? '<div class="act">'
        + '<button onclick="cbSetBilling(\'' + _cbEsc(ev.id) + '\',\'Auto paid\',this)">Auto paid</button>'
        + '<button onclick="cbSetBilling(\'' + _cbEsc(ev.id) + '\',\'Invoice sent\',this)">Invoice sent</button>'
        + '</div>'
      : '<div class="act">'
        + '<button onclick="cbSetBilling(\'' + _cbEsc(ev.id) + '\',\'Halaxy direct\',this)">Halaxy direct</button>'
        + '<button onclick="cbSetBilling(\'' + _cbEsc(ev.id) + '\',\'Funder — awaiting remittance\',this)">Via funder</button>'
        + '</div>';
  } else if (stage === 'remittance') {
    var isInvoiced = f.Billing === 'Invoice sent';
    actionsHtml = '<div class="act"><button onclick="cbSetBilling(\'' + _cbEsc(ev.id) + '\',\'' + (isInvoiced ? 'Closed (paid)' : 'Closed (remittance received)') + '\',this)">' + (isInvoiced ? 'Payment received' : 'Remittance received') + '</button></div>';
  }

  var billingHtml = '';
  if ((stage === 'billing' || stage === 'remittance' || stage === 'closed') && f.Bill === 'Yes') {
    billingHtml += _cbInvoiceHtml({ id: ev.id, fields: f });
    if (f.Funder === 'QFES') {
      billingHtml += _cbQfesFormHtml({ id: ev.id, fields: f })
        + '<div class="mt" style="margin-top:6px"><a href="#" onclick="cbCloseHistory();cbOpenQfesDetails(\'' + _cbEsc(ev.id) + '\');return false" style="color:var(--teal);font-size:11px">📋 QFES form details</a></div>';
    }
  }

  var remitHtml = '';
  if (stage === 'remittance' && f.Invoice) {
    remitHtml = '<button class="remit-btn" id="remit-btn-' + _cbEsc(ev.id) + '" onclick="_cbCheckRemittance(\'' + _cbEsc(f.Invoice) + '\',\'' + _cbEsc(ev.id) + '\',this)">🔍 Check inbox for remittance</button>'
      + '<div class="remit-result" id="remit-result-' + _cbEsc(ev.id) + '"></div>';
  }

  return jumpBtn + editBtn + actionsHtml + billingHtml + remitHtml;
}

/* Runs after a card action (billing decision, invoice save, QFES ref save)
 * succeeds — refreshes whichever view is actually showing (this fires from
 * both the Board's inline expansion and Home's history drawer) and, for a
 * stage-changing action, closes/collapses that action's surface since the
 * card just moved somewhere else; a non-stage-changing save (invoice/QFES
 * ref) instead re-opens/redraws in place so more fields can be filled in
 * without re-finding the card. */
function _cbAfterCardAction(eventId, movesStage) {
  if (movesStage) {
    _cbExpandedCardId = null;
    cbCloseHistory();
    _cbRender();
  } else {
    // Board's inline expansion redraws itself from _cbExpandedCardId as
    // part of _cbRender() → _cbRenderBoard(); only the drawer (Home) needs
    // an explicit re-open to redraw its already-rendered content.
    _cbRender();
    if (_cbView !== 'board') cbOpenHistory(eventId);
  }
}

/* ── Board card → full history. The event's own description already
 * carries every stage transition (see _cbLogHistory) — this just reads
 * it back in a readable form instead of the raw "Key: value" text. Also
 * the entry point for Home's stage badge, which has no board column to
 * expand within, so it always uses this drawer rather than inline
 * expansion. ── */
function cbOpenHistory(eventId) {
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  var f = _cbFields(ev);
  var name = ev.title.split(' — ')[0] || ev.title;

  document.getElementById('cb-history-title').textContent = name;

  var head = '<div class="card"><div class="nm">' + _cbEsc(ev.title) + '</div>'
    + '<div class="mt">' + _cbFunderChip(f.Funder) + (f.Type ? ' ' + _cbEsc(f.Type) : '')
    + (f.Duration ? ' · ' + _cbEsc(f.Duration) : '') + '</div>'
    + (f.Note ? '<div class="mt">' + _cbEsc(f.Note) + '</div>' : '')
    + '</div>';

  var hist = f._history || [];
  var histHtml = hist.length
    ? hist.map(function(line) {
        var idx = line.indexOf(': ');
        var when = idx === -1 ? '' : line.slice(0, idx);
        var text = idx === -1 ? line : line.slice(idx + 2);
        return '<div class="act-item"><div class="act-dot booking"></div>'
          + '<div><div class="act-title">' + _cbEsc(text) + '</div>'
          + '<div class="act-when">' + _cbEsc(when) + '</div></div></div>';
      }).join('')
    : '<div class="empty">No history yet — this fills in as the session moves through the Board.</div>';

  document.getElementById('cb-history-body').innerHTML = head + _cbCardActionsHtml(ev)
    + '<div class="sec-hd" style="margin-top:20px">Activity</div>' + histHtml;
  document.getElementById('cb-history-backdrop').classList.add('open');
  document.getElementById('cb-history-sheet').classList.add('open');
}

function cbCloseHistory() {
  document.getElementById('cb-history-backdrop').classList.remove('open');
  document.getElementById('cb-history-sheet').classList.remove('open');
}

function cbJumpToSchedule(eventId) {
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev || !ev.start) return;
  cbCloseHistory();
  _cbHomeMode = 'day';
  _cbCalDate = new Date(ev.start);
  cbSetView('home');
}

/* ── QFES card → "everything I need to fill in the real ISA form" sheet.
 * Type of activity/Date/Mode/Time spent come straight off the event, same
 * as everywhere else on the Board. Client code/Gender/Age and the saved
 * profile (Area/Role/Concern/Client type) need the client's Halaxy ID,
 * which only exists on events booked through /book since HalaxyId started
 * being captured — older or hand-typed entries won't have one. ── */
function cbOpenQfesDetails(eventId) {
  var ev = _cbEvents.find(function(e) { return String(e.id) === String(eventId); });
  if (!ev) return;
  var f = _cbFields(ev);
  var name = ev.title.split(' — ')[0] || ev.title;
  document.getElementById('cb-qfes-title').textContent = 'QFES form details — ' + name;

  var d = new Date(ev.start);
  var typeOfActivity = f.Status === 'Attended' ? 'Individual Support' : 'Did Not Attend (late cancellation)';
  var mode = f.Type === 'Online' ? 'Telehealth/Phone' : 'Face to face';

  var head = '<div class="field"><label>Type of activity</label><div class="mt">' + _cbEsc(typeOfActivity) + '</div></div>'
    + '<div class="field"><label>Date of activity</label><div class="mt">' + _cbEsc(d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })) + '</div></div>'
    + '<div class="field"><label>Mode of Contact</label><div class="mt">' + _cbEsc(mode) + '</div></div>'
    + '<div class="field"><label>Time spent</label><div class="mt">' + _cbEsc(f.Duration || 'Not set') + '</div></div>';

  var body = document.getElementById('cb-qfes-body');
  body.innerHTML = head + '<div class="mt">Loading client details…</div>';
  document.getElementById('cb-qfes-backdrop').classList.add('open');
  document.getElementById('cb-qfes-sheet').classList.add('open');

  if (!f.HalaxyId) {
    body.innerHTML = head + '<div class="empty">This session isn\'t linked to a Halaxy client (booked before this was tracked, or hand-typed on the calendar) — Client code/Gender/Age and any saved QFES profile aren\'t available here. Pull those from Halaxy directly.</div>';
    return;
  }

  fetch('/api/admin-enquiries?qfes_profile=' + encodeURIComponent(f.HalaxyId), { credentials: 'include' })
    .then(function(r) { return r.json(); }).then(function(d2) {
      var p = d2.profile;
      var extra = '<div class="field"><label>Client code</label><div class="mt">' + _cbEsc(f.HalaxyId) + '</div></div>';
      if (p && (p.gender || p.age_bracket)) {
        extra += (p.gender ? '<div class="field"><label>Gender</label><div class="mt">' + _cbEsc(p.gender) + '</div></div>' : '')
          + (p.age_bracket ? '<div class="field"><label>Age</label><div class="mt">' + _cbEsc(p.age_bracket) + '</div></div>' : '');
      }
      if (p && (p.area || p.client_type || p.concern_primary
          || (p.urban_firefighters && p.urban_firefighters !== 'Not Applicable')
          || (p.rural_firefighters && p.rural_firefighters !== 'Not Applicable')
          || (p.qfd_staff && p.qfd_staff !== 'Not Applicable'))) {
        extra += (p.area ? '<div class="field"><label>Area</label><div class="mt">' + _cbEsc(p.area) + '</div></div>' : '')
          + (p.client_type ? '<div class="field"><label>Client type</label><div class="mt">' + _cbEsc(p.client_type) + '</div></div>' : '')
          + ((p.urban_firefighters && p.urban_firefighters !== 'Not Applicable') ? '<div class="field"><label>Urban Firefighters</label><div class="mt">' + _cbEsc(p.urban_firefighters) + '</div></div>' : '')
          + ((p.rural_firefighters && p.rural_firefighters !== 'Not Applicable') ? '<div class="field"><label>Rural Firefighters</label><div class="mt">' + _cbEsc(p.rural_firefighters) + '</div></div>' : '')
          + ((p.qfd_staff && p.qfd_staff !== 'Not Applicable') ? '<div class="field"><label>QFD Staff</label><div class="mt">' + _cbEsc(p.qfd_staff) + '</div></div>' : '')
          + (p.concern_primary ? '<div class="field"><label>' + (p.concern_category === 'nonwork' ? 'Non-work' : 'Work') + ' concern</label><div class="mt">' + _cbEsc(p.concern_primary) + (p.concern_secondary ? ', ' + _cbEsc(p.concern_secondary) : '') + '</div></div>' : '');
      } else {
        extra += '<div class="empty">No saved QFES profile for this client yet — <a href="/book/qfes" style="color:var(--teal)">fill one in</a> for Area/Role/Concern/Client type.</div>';
      }
      body.innerHTML = head + extra;
    }).catch(function() {
      body.innerHTML = head + '<div class="empty">Could not load client details.</div>';
    });
}

function cbCloseQfesDetails() {
  document.getElementById('cb-qfes-backdrop').classList.remove('open');
  document.getElementById('cb-qfes-sheet').classList.remove('open');
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATIONS — "Cheree books/records an outcome → Julian's phone buzzes."
   iOS Safari only allows Push after this page has been added to the Home
   Screen (Share → Add to Home Screen) and opened from that icon — a plain
   Safari tab can't receive pushes there, full stop, no workaround. Other
   platforms (Android Chrome, desktop) don't need that step but the same
   subscribe flow works for them too.
   ═══════════════════════════════════════════════════════════════ */

function _cbIsIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function _cbIsStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function _cbUrlB64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw = window.atob(base64);
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* Bell icon in the top bar replaces the old full-width banner — a coloured
   dot signals "needs attention", tapping it either explains why (toast) or
   goes straight to enabling, so nothing permanent eats vertical space. */
function _cbUpdateNotifBell() {
  var btn = document.getElementById('cb-notif-btn');
  var dot = document.getElementById('cb-notif-dot');
  if (!btn || !dot) return;
  btn.classList.remove('icon-btn--on');
  dot.className = 'icon-dot';

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return; // not supported — no dot, tap explains
  if (_cbIsIOS() && !_cbIsStandalone()) { dot.classList.add('icon-dot-amber'); return; }
  if (Notification.permission === 'denied') { dot.classList.add('icon-dot-red'); return; }
  if (Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(function(reg) { return reg.pushManager.getSubscription(); })
      .then(function(sub) {
        if (sub) { btn.classList.add('icon-btn--on'); }
        else { dot.classList.add('icon-dot-amber'); }
      }).catch(function() { dot.classList.add('icon-dot-amber'); });
    return;
  }
  dot.classList.add('icon-dot-amber'); // permission not yet asked
}

function cbNotifTap() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { _cbToast('Notifications aren\'t supported in this browser.'); return; }
  if (_cbIsIOS() && !_cbIsStandalone()) { _cbToast('Add this to your Home Screen first (Share → Add to Home Screen), then open it from that icon.'); return; }
  if (Notification.permission === 'denied') { _cbToast('Notifications are blocked — check your phone\'s settings to re-enable.'); return; }
  if (Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(function(reg) { return reg.pushManager.getSubscription(); })
      .then(function(sub) { if (sub) { _cbToast('Notifications are on.'); } else { cbEnableNotifications(); } });
    return;
  }
  cbEnableNotifications();
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS V2 — a real settings sheet built on top of what already
   existed as loose top-bar icons (refresh, notifications), plus the
   connection/account context those actions were missing on their own.
   ═══════════════════════════════════════════════════════════════ */

function cbOpenSettings() {
  _cbRenderSettings();
  document.getElementById('cb-settings-backdrop').classList.add('open');
  document.getElementById('cb-settings-sheet').classList.add('open');
}

function cbCloseSettings() {
  document.getElementById('cb-settings-backdrop').classList.remove('open');
  document.getElementById('cb-settings-sheet').classList.remove('open');
}

function _cbRenderSettings() {
  var body = document.getElementById('cb-settings-body');
  if (!body) return;
  var whoEl = document.querySelector('.app-who');
  var who = (whoEl && whoEl.textContent.trim()) || 'Julian';

  var html = '';

  html += '<div class="stg-section"><div class="stg-section-title">Notifications</div>'
    + '<div class="stg-row"><div class="stg-row-main"><div class="stg-row-label">Push notifications</div>'
    +   '<div class="stg-row-sub">New bookings and recorded outcomes</div></div>'
    +   '<span class="stg-row-val" id="stg-notif-val">…</span>'
    +   '<div class="stg-row-action"><button onclick="cbNotifTap()">Manage</button></div>'
    + '</div></div>';

  html += '<div class="stg-section"><div class="stg-section-title">Data</div>'
    + '<div class="stg-row"><div class="stg-row-main"><div class="stg-row-label">Refresh</div>'
    +   '<div class="stg-row-sub">Pull the latest calendar events and enquiries</div></div>'
    +   '<div class="stg-row-action"><button onclick="cbRefresh()">Refresh now</button></div>'
    + '</div></div>';

  html += '<div class="stg-section"><div class="stg-section-title">Connections</div>'
    + '<div class="stg-row"><div class="stg-row-main"><div class="stg-row-label">Google Calendar</div>'
    +   '<div class="stg-row-sub">The calendar this tool reads and writes to</div></div>'
    +   (_cbCalConnected
        ? '<span class="stg-row-val stg-row-val--ok">✓ Connected</span>'
        : '<span class="stg-row-val stg-row-val--off">Not connected</span>')
    +   '<div class="stg-row-action"><a href="/api/google-auth">Reconnect</a></div>'
    + '</div></div>';

  html += '<div class="stg-section"><div class="stg-section-title">Account</div>'
    + '<div class="stg-row"><div class="stg-row-main"><div class="stg-row-label">Signed in as</div></div>'
    +   '<span class="stg-row-val">' + _cbEsc(who) + '</span>'
    + '</div>'
    + '<div class="stg-row"><div class="stg-row-main"><div class="stg-row-label">Sign out</div></div>'
    +   '<div class="stg-row-action"><a class="stg-signout" href="?logout">Sign out</a></div>'
    + '</div></div>';

  html += '<div class="stg-section"><div class="stg-section-title">Quick links</div>'
    + '<div class="stg-row"><div class="stg-row-main"><div class="stg-row-label">chereemcgarry.com</div></div>'
    +   '<div class="stg-row-action"><a href="/" target="_blank" rel="noopener">Open ↗</a></div>'
    + '</div>'
    + '<div class="stg-row"><div class="stg-row-main"><div class="stg-row-label">Halaxy practitioner</div></div>'
    +   '<div class="stg-row-action"><a href="https://www.halaxy.com/practitioner" target="_blank" rel="noopener">Open ↗</a></div>'
    + '</div></div>';

  body.innerHTML = html;
  _cbUpdateSettingsNotifRow();
}

/* Mirrors the bell-dot logic in _cbUpdateNotifBell but as a text label —
 * subscription state needs an async check, so this fills in after the
 * synchronous render above rather than blocking it. */
function _cbUpdateSettingsNotifRow() {
  var val = document.getElementById('stg-notif-val');
  if (!val) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { val.textContent = 'Unsupported'; val.className = 'stg-row-val stg-row-val--off'; return; }
  if (_cbIsIOS() && !_cbIsStandalone()) { val.textContent = 'Add to Home Screen'; val.className = 'stg-row-val stg-row-val--off'; return; }
  if (Notification.permission === 'denied') { val.textContent = 'Blocked'; val.className = 'stg-row-val stg-row-val--off'; return; }
  if (Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(function(reg) { return reg.pushManager.getSubscription(); })
      .then(function(sub) {
        val.textContent = sub ? 'On' : 'Off';
        val.className = sub ? 'stg-row-val stg-row-val--ok' : 'stg-row-val stg-row-val--off';
      }).catch(function() { val.textContent = 'Off'; val.className = 'stg-row-val stg-row-val--off'; });
    return;
  }
  val.textContent = 'Off';
  val.className = 'stg-row-val stg-row-val--off';
}

function cbEnableNotifications() {
  if (!_cbData || !_cbData.vapid_public_key) { _cbToast('Notifications aren\'t set up on the server yet.'); return; }
  navigator.serviceWorker.register('/sw.js')
    .then(function() { return Notification.requestPermission(); })
    .then(function(perm) {
      if (perm !== 'granted') { _cbUpdateNotifBell(); return null; }
      return navigator.serviceWorker.ready.then(function(reg) {
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: _cbUrlB64ToUint8Array(_cbData.vapid_public_key),
        });
      });
    })
    .then(function(sub) {
      if (!sub) return;
      return fetch('/api/admin-enquiries?push_subscribe=1', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
    })
    .then(function() { _cbUpdateNotifBell(); _cbUpdateSettingsNotifRow(); _cbToast('Notifications are on.'); })
    .catch(function(err) { _cbToast('Could not enable notifications: ' + err.message); _cbUpdateNotifBell(); _cbUpdateSettingsNotifRow(); });
}

document.addEventListener('DOMContentLoaded', function() {
  _cbInit();
  // Lives in the page shell, not inside #root, so re-rendering the Clients
  // list on every keystroke doesn't blow away focus/cursor position.
  var searchInput = document.getElementById('cb-client-search');
  if (searchInput) searchInput.addEventListener('input', function() { _cbClientSearch(searchInput.value); });

  // Feedback after a Google OAuth reconnect (Settings → Google Calendar →
  // Reconnect) — api/google-callback.js redirects back here with ?gcal=.
  var gcalParams = new URLSearchParams(location.search);
  var gcal = gcalParams.get('gcal');
  if (gcal === 'connected')  setTimeout(function() { _cbToast('Google connected.'); }, 300);
  if (gcal === 'error')      setTimeout(function() { _cbToast('Google connection failed — try again.'); }, 300);
  if (gcal === 'missing')    setTimeout(function() { _cbToast('Google connection failed — try again.'); }, 300);
  if (gcal === 'no_refresh') setTimeout(function() { _cbToast('No refresh token returned — try Reconnect again.'); }, 300);
  if (gcal) history.replaceState(null, '', location.pathname);
});
