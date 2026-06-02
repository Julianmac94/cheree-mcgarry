/**
 * api/admin.js
 * Protected admin dashboard — served at /admin
 * Fetches live data from Supabase and renders server-side.
 */

import { isAuthed, clearSessionCookie, getSessionUser } from './_auth.js';
import { supabase } from './_supabase.js';

const C = {
  cream:    '#F3EFE6',
  tealDeep: '#192E2A',
  teal:     '#2A5850',
  tealMid:  '#376B62',
  mint:     '#77CFBD',
  terra:    '#BE6E44',
  soft:     '#7A948F',
  mid:      '#3E5C56',
};

const STATUS_LABELS = {
  new:        { label: 'New',        color: C.terra    },
  contacted:  { label: 'Contacted',  color: C.tealMid  },
  in_halaxy:  { label: 'In Halaxy', color: C.teal     },
  closed:     { label: 'Closed',     color: C.soft     },
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function activityLabel(action, detail) {
  if (action === 'status')      return `Status → ${STATUS_LABELS[detail]?.label || detail}`;
  if (action === 'intake_sent') return `Intake sent (${detail})`;
  if (action === 'notes')       return 'Notes updated';
  if (action === 'halaxy')      return detail === 'linked' ? 'Halaxy linked' : 'Halaxy cleared';
  return action;
}

function enquiryCard(e, activity = []) {
  const status  = e.status || 'new';
  const isNew   = status === 'new';
  const name    = [e.first_name, e.last_name].filter(Boolean).join(' ') || '—';
  const safeName = name.replace(/'/g, "\\'");
  const detail  = [e.service, e.reason].filter(Boolean).join(' · ') || e.source || '—';
  const intakeSent = status === 'in_halaxy';
  const intakeBtnLabel = intakeSent
    ? 'Intake sent' + (e.intake_sent_at ? ' · ' + fmtDate(e.intake_sent_at) : '')
    : 'Send intake email';
  const hasNote    = !!(e.notes && e.notes.trim());
  const hasHalaxy  = !!(e.halaxy_client_url && e.halaxy_client_url.trim());

  const lastActivity = activity[0];
  const activityHtml = activity.length ? `
    <div class="eq-activity">
      ${activity.slice(0, 3).map(a => `
        <div class="eq-activity-row">
          <span class="eq-act-label">${activityLabel(a.action, a.detail)}</span>
          <span class="eq-act-meta">${a.actor} · ${fmtDate(a.created_at)}</span>
        </div>`).join('')}
    </div>` : '';

  return `
<div class="eq-card${isNew ? ' eq-card--new' : ''}" data-id="${e.id}" data-status="${status}">

  <!-- Header -->
  <div class="eq-card-top">
    <div class="eq-meta">
      <span class="eq-name">${name}${isNew ? '<span class="eq-new-badge"><span class="eq-new-dot"></span>New</span>' : ''}</span>
      <span class="eq-detail">${detail}</span>
    </div>
    <div class="eq-right">
      <span class="eq-date">${fmtDate(e.created_at)}</span>
      <select class="eq-status-sel status-${status}" onchange="updateStatus('${e.id}', this.value)">
        ${Object.entries(STATUS_LABELS).map(([k,v]) =>
          `<option value="${k}" ${status===k?'selected':''}>${v.label}</option>`
        ).join('')}
      </select>
    </div>
  </div>

  <!-- Body: main left + actions side -->
  <div class="eq-card-body">

    <!-- Left: contact, message, intake -->
    <div class="eq-body-main">
      <div class="eq-contact">
        <a href="mailto:${e.email}" class="eq-email">${e.email}</a>
        ${e.phone ? `<span class="eq-phone">${e.phone}</span>` : ''}
      </div>
      ${e.message ? `<div class="eq-msg">${e.message}</div>` : ''}
      <div class="eq-actions">
        <button class="eq-intake-btn${intakeSent ? ' sent' : ''}" id="intake-btn-${e.id}" onclick="toggleIntakePanel('${e.id}')">
          ${intakeBtnLabel}
        </button>
      </div>
      <div class="eq-intake-panel" id="intake-panel-${e.id}">
        <div class="eq-intake-row">
          <select class="eq-intake-type" id="intake-type-${e.id}" onchange="updateIntakeUrl('${e.id}')">
            <option value="new">New client</option>
            <option value="medicare">Medicare (MHCP)</option>
            <option value="ndis">NDIS</option>
          </select>
          <input class="eq-intake-url" id="intake-url-${e.id}" type="url" placeholder="Paste Halaxy intake form URL…">
          <button class="eq-intake-send" onclick="sendIntake('${e.id}')">Send &rarr;</button>
        </div>
        <div class="eq-intake-msg" id="intake-msg-${e.id}"></div>
      </div>
    </div>

    <!-- Side: note · task · halaxy link -->
    <div class="eq-body-side">

      <!-- Note -->
      <div class="eq-side-block">
        <button class="eq-side-action${hasNote ? ' active' : ''}" onclick="toggleSidePanel('note-${e.id}', this)" aria-label="Note">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h10v8l-3 3H3z"/><path d="M10 11v3"/><path d="M10 11h3"/><path d="M5 6h6M5 8.5h4"/></svg>
          <span>${hasNote ? 'Note' : 'Add note'}</span>
        </button>
        <div class="eq-side-panel${hasNote ? ' open' : ''}" id="note-${e.id}">
          <textarea class="eq-notes" placeholder="Notes…" onblur="saveNotes('${e.id}', this.value)">${e.notes || ''}</textarea>
        </div>
      </div>

      <!-- Quick task -->
      <div class="eq-side-block">
        <button class="eq-side-action" onclick="quickAddTask('${e.id}', '${safeName}')" aria-label="Add task">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5.5 8l2 2 3-3"/></svg>
          <span>Add task</span>
        </button>
        <div class="eq-side-panel" id="task-input-${e.id}">
          <div class="eq-side-row">
            <input class="eq-side-input" id="qtask-${e.id}" placeholder="Task…" onkeydown="if(event.key==='Enter')submitQuickTask('${e.id}')">
            <button class="eq-side-save-btn" onclick="submitQuickTask('${e.id}')">Add</button>
          </div>
        </div>
      </div>

      <!-- Halaxy client record -->
      <div class="eq-side-block">
        <button class="eq-side-action${hasHalaxy ? ' active' : ''}" onclick="toggleSidePanel('halaxy-${e.id}', this)" aria-label="Halaxy record">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9"/><path d="M10 2h4v4"/><path d="M7 9L14 2"/></svg>
          <span>${hasHalaxy ? 'Halaxy record' : 'Link Halaxy'}</span>
        </button>
        <div class="eq-side-panel${hasHalaxy ? ' open' : ''}" id="halaxy-${e.id}">
          ${hasHalaxy ? `
          <div class="eq-halaxy-saved">
            <a href="${e.halaxy_client_url}" target="_blank" rel="noopener" class="eq-halaxy-url">Open in Halaxy ↗</a>
            <button class="eq-halaxy-clear" onclick="clearHalaxy('${e.id}')" aria-label="Remove">×</button>
          </div>` : `
          <div class="eq-side-row">
            <input class="eq-side-input" id="halaxy-url-${e.id}" type="url" placeholder="Paste Halaxy URL…">
            <button class="eq-side-save-btn" onclick="saveHalaxy('${e.id}')">Save</button>
          </div>`}
        </div>
      </div>

    </div><!-- /.eq-body-side -->
  </div><!-- /.eq-card-body -->
  ${activityHtml}
</div>`;
}

function taskItem(t) {
  return `
<li class="task-item ${t.completed ? 'done' : ''}" data-id="${t.id}">
  <button class="task-check" onclick="toggleTask('${t.id}', ${!t.completed})" aria-label="Toggle">
    <svg viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
  <span class="task-title">${t.title}</span>
  <button class="task-del" onclick="deleteTask('${t.id}')" aria-label="Delete">
    <svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
  </button>
</li>`;
}

function adminPage({ enquiries = [], tasks = [], currentUser = null, activityByEnquiry = {} }) {
  const newCount = enquiries.filter(e => (e.status || 'new') === 'new').length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Admin · Cheree McGarry</title>
<!-- PWA / home screen -->
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/assets/pwa-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/pwa-icon.svg">
<meta name="theme-color" content="#0F1A18">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="McGarry">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/admin-dashboard.css?v=${process.env.VERCEL_GIT_COMMIT_SHA || Date.now()}">
<style>
:root {
  /* Background */
  --bg: #F5F2EE;
  --bg-2: #EFECE6;

  /* Surfaces (glassmorphism cards/panels) */
  --surface: #ffffff;
  --surface-border: rgba(0,0,0,0.08);
  --surface-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05);

  /* Brand */
  --teal:     #2A5850;
  --teal-mid: #4A7A70;
  --mint:     #8FBFB4;
  --amber:    #BE6E44;
  --cream:    #F5F2EE;

  /* Legacy aliases (kept for backward compat with existing CSS below) */
  --tealDeep: #192E2A;
  --tealMid:  #376B62;
  --terra:    #BE6E44;
  --soft:     #7A948F;
  --mid:      #3E5C56;

  /* Status semantic colors */
  --s-urgent:   #D94F2F;
  --s-post:     #C07830;
  --s-finance:  #B08820;
  --s-upcoming: #3D6FA8;
  --s-lead:     #BE6E44;
  --s-triage:   #7A7090;
  --s-complete: #4A8060;

  /* Typography */
  --sans:  'Inter', system-ui, -apple-system, sans-serif;
  --serif: 'Cormorant Garamond', Georgia, serif;
}

/* ── Reset & base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  overflow: hidden; height: 100svh;
  background: var(--bg);
  font-family: var(--sans);
  color: #1A2F2B;
  -webkit-font-smoothing: antialiased;
}

/* ── App shell ── */
.app-shell { display: flex; height: 100svh; overflow: hidden; }

/* ── Sidebar ── */
.sidebar {
  width: 220px; flex-shrink: 0;
  background: #ffffff;
  border-right: 1px solid rgba(0,0,0,0.08);
  display: flex; flex-direction: column;
  height: 100svh;
}
.sidebar-brand {
  padding: 18px 16px 15px;
  border-bottom: 1px solid rgba(0,0,0,0.07);
  display: flex; align-items: center; gap: 11px;
}
.sidebar-logo { width: 22px; height: 22px; filter: none; opacity: 1; flex-shrink: 0; }
.sidebar-brand-nm {
  font-family: var(--serif);
  font-size: 17px; font-weight: 400;
  color: var(--tealDeep);
  line-height: 1.15; display: block;
}
.sidebar-brand-nm em { font-style: italic; color: var(--teal); font-weight: 300; }
.sidebar-brand-sub {
  font-size: 9px; font-weight: 500;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: rgba(0,0,0,0.35); display: block; margin-top: 3px;
}

.sidebar-search-btn {
  margin: 10px 10px 4px;
  display: flex; align-items: center; gap: 8px;
  padding: 7px 11px; border-radius: 8px;
  background: rgba(0,0,0,0.04);
  border: 1px solid rgba(0,0,0,0.08);
  cursor: pointer; width: calc(100% - 20px);
  color: rgba(0,0,0,0.4); font-family: var(--sans); font-size: 12px;
  transition: all 0.15s;
}
.sidebar-search-btn:hover { background: rgba(0,0,0,0.07); color: rgba(0,0,0,0.65); }
.sidebar-search-icon { font-size: 13px; opacity: 0.7; }
.sidebar-search-shortcut {
  margin-left: auto; font-size: 10px; opacity: 0.4;
  background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px;
}

/* ── Sidebar + Add button ── */
.sidebar-add-wrap {
  position: relative;
  margin: 0 10px 4px;
}
.sidebar-add-btn {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 9px;
  background: rgba(52,211,153,0.07);
  border: 1px solid rgba(52,211,153,0.22);
  cursor: pointer;
  color: var(--teal);
  transition: background 0.13s, border-color 0.13s, box-shadow 0.13s;
  flex-shrink: 0;
}
.sidebar-add-btn:hover {
  background: rgba(52,211,153,0.14);
  border-color: rgba(52,211,153,0.38);
  box-shadow: 0 2px 10px rgba(52,211,153,0.14);
}
.sidebar-add-btn svg { flex-shrink: 0; }

.sidebar-section-label {
  font-size: 9px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
  color: rgba(0,0,0,0.35); padding: 12px 16px 4px;
}
.sidebar-nav { flex: 1; padding: 4px 8px; display: flex; flex-direction: column; gap: 1px; overflow-y: auto; }
.sidebar-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 7px;
  background: none; border: none; cursor: pointer; width: 100%;
  color: rgba(0,0,0,0.52); font-family: var(--sans); font-size: 13px; font-weight: 400;
  text-align: left; transition: all 0.12s; position: relative;
}
.sidebar-item:hover { background: rgba(42,88,80,0.07); color: var(--teal); }
.sidebar-item.active { background: rgba(42,88,80,0.10); color: var(--teal); font-weight: 600; }
.si-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; opacity: 0.7; }
.sidebar-item.active .si-icon { opacity: 1; }
.si-label { flex: 1; }
.si-badge {
  font-size: 9.5px; font-weight: 700; min-width: 18px; height: 18px;
  background: var(--amber); color: white;
  border-radius: 99px; padding: 0 5px;
  display: none; align-items: center; justify-content: center;
}
.si-badge.visible { display: flex; }
.si-stub { font-size: 9px; color: rgba(0,0,0,0.25); margin-left: auto; }

.sidebar-divider { height: 1px; background: rgba(0,0,0,0.06); margin: 6px 10px; }

.sidebar-footer {
  padding: 10px 12px 14px;
  border-top: 1px solid rgba(0,0,0,0.07);
  display: flex; flex-direction: column; gap: 5px;
}
.sidebar-status-row {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; color: rgba(0,0,0,0.4); padding: 2px 4px;
}
.sidebar-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(0,0,0,0.12); flex-shrink: 0; }
.sidebar-dot.ok  { background: #52c41a; }
.sidebar-dot.err { background: #E05A3A; }
.sidebar-dot.loading { background: rgba(0,0,0,0.12); animation: pulse 1.4s infinite; }
.sidebar-util-row { padding: 2px 4px; display: flex; gap: 8px; }
.sidebar-signout {
  font-family: var(--sans); font-size: 11px; color: rgba(0,0,0,0.35);
  background: none; border: none; cursor: pointer; padding: 0; text-decoration: none;
  transition: color 0.12s;
}
.sidebar-signout:hover { color: var(--teal); }
.sidebar-refresh-btn {
  font-family: var(--sans); font-size: 11px; color: rgba(0,0,0,0.35);
  background: none; border: none; cursor: pointer; padding: 0;
  transition: color 0.12s;
}
.sidebar-refresh-btn:hover { color: var(--teal); }

/* ── App main (full width — sidebar removed) ── */
.app-main {
  flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100svh;
}

/* ── Brand topbar (replaces sidebar) ── */
.app-topbar {
  height: 50px; flex-shrink: 0;
  background: #ffffff;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  display: flex; align-items: center; padding: 0 16px; gap: 8px;
}
/* Brand cluster */
.topbar-brand {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0; cursor: default; margin-right: 4px;
}
.topbar-logo { width: 28px; height: 28px; flex-shrink: 0; }
.topbar-brand-nm {
  font-family: var(--serif);
  font-size: 16px; font-weight: 400; color: var(--tealDeep); line-height: 1.15; display: block;
}
.topbar-brand-nm em { font-style: italic; color: var(--teal); font-weight: 300; }
.topbar-brand-sub {
  font-size: 8.5px; font-weight: 500;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: rgba(0,0,0,0.35); display: block; margin-top: 2px;
}
/* Icon-only button */
.topbar-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 7px;
  background: none; border: none;
  color: rgba(0,0,0,0.4); cursor: pointer;
  transition: background 0.12s, color 0.12s; flex-shrink: 0;
}
.topbar-icon-btn:hover { background: rgba(0,0,0,0.05); color: var(--teal); }
/* + Add button */
.topbar-add-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 7px;
  background: rgba(52,211,153,0.07); border: 1px solid rgba(52,211,153,0.22);
  cursor: pointer; color: var(--teal);
  font-family: var(--sans); font-size: 12px; font-weight: 500;
  transition: background 0.13s, border-color 0.13s; flex-shrink: 0;
}
.topbar-add-btn:hover { background: rgba(52,211,153,0.14); border-color: rgba(52,211,153,0.38); }
/* Text nav buttons (Clients etc) */
.topbar-nav-btn {
  display: flex; align-items: center;
  padding: 5px 10px; border-radius: 7px;
  background: none; border: 1px solid transparent;
  color: rgba(0,0,0,0.45); cursor: pointer;
  font-family: var(--sans); font-size: 12px; font-weight: 400;
  transition: all 0.12s; flex-shrink: 0; white-space: nowrap;
}
.topbar-nav-btn:hover { background: rgba(42,88,80,0.07); color: var(--teal); border-color: rgba(42,88,80,0.12); }
.topbar-nav-btn.active { color: var(--teal); font-weight: 600; background: rgba(42,88,80,0.10); border-color: rgba(42,88,80,0.12); }
/* Refresh + sign-out */
.topbar-refresh-btn {
  font-family: var(--sans); font-size: 16px; color: rgba(0,0,0,0.3);
  background: none; border: none; cursor: pointer; padding: 4px 6px;
  transition: color 0.12s, transform 0.12s; flex-shrink: 0; line-height: 1;
  display: inline-block;
}
.topbar-refresh-btn:hover { color: var(--teal); transform: rotate(30deg); }
.topbar-refresh-btn:disabled { cursor: default; opacity: 0.4; }
@keyframes topbar-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.topbar-refresh-btn.spinning { animation: topbar-spin 0.7s linear infinite; color: var(--teal); }
.topbar-signout {
  font-family: var(--sans); font-size: 11px; color: rgba(0,0,0,0.35);
  background: none; border: none; cursor: pointer; padding: 0; text-decoration: none;
  white-space: nowrap; transition: color 0.12s; flex-shrink: 0;
}
.topbar-signout:hover { color: var(--teal); }
/* Home view logo above greeting */
.dh-hd-logo { width: 52px; height: 52px; display: block; margin-bottom: 16px; opacity: 0.88; }

/* ── App content area ── */
.app-content {
  flex: 1; display: flex; min-height: 0; overflow: hidden;
}
.view-content {
  flex: 1; overflow-y: auto; min-width: 0;
  scroll-behavior: smooth;
}

/* ── Right detail panel ── */
/* ── Modal detail overlay (replaces slide-in rdp panel) ──
   NOTE: geometry/appearance is overridden by css/admin-dashboard.css (dark, !important).
   The drawer / drill-in behaviour lives there — these are the light-fallback base rules. */
.modal-overlay {
  display: none; position: fixed; inset: 0; z-index: 300;
  background: rgba(12,22,20,0.42);
  backdrop-filter: blur(4px);
  align-items: center; justify-content: center;
  padding: 20px;
}
.modal-overlay.is-open { display: flex; }
.modal-card {
  background: #F3EFE6;
  border: 1px solid rgba(42,88,80,0.10);
  border-radius: 20px;
  box-shadow: 0 24px 80px rgba(20,38,34,0.22), 0 4px 14px rgba(42,88,80,0.08);
  width: 100%; max-width: 460px;
  max-height: 88vh; overflow: hidden;
  display: flex; flex-direction: column;
  animation: modalIn 0.24s cubic-bezier(0.34,1.4,0.64,1);
}
@keyframes modalIn {
  from { transform: scale(0.93) translateY(10px); opacity: 0 }
  to   { transform: none; opacity: 1 }
}
.modal-header {
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(42,88,80,0.08);
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
}
.modal-title { font-size: 14px; font-weight: 600; color: #1A2F2B; flex: 1; }
.modal-close {
  width: 28px; height: 28px; border-radius: 8px;
  background: rgba(42,88,80,0.08); border: none; cursor: pointer;
  font-size: 17px; color: #7A9090;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.12s; line-height: 1;
}
.modal-close:hover { background: rgba(42,88,80,0.14); color: #1A2F2B; }
.rdp-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 0; }

/* Detail panel content styles */
.rdp-client { font-size: 21px; font-weight: 700; color: #1A2F2B; margin-bottom: 3px; }
.rdp-date { font-size: 12.5px; color: #7A948F; margin-bottom: 22px; }
.rdp-action-zone {
  background: rgba(42,88,80,0.06); border-radius: 12px; padding: 16px; margin-bottom: 20px;
  border: 1px solid rgba(42,88,80,0.09);
}
.rdp-primary-btn {
  display: block; width: 100%; padding: 11px 14px;
  background: #2A5850; color: white; font-family: var(--sans);
  font-size: 13px; font-weight: 600; border: none; border-radius: 7px;
  cursor: pointer; text-align: center; text-decoration: none;
  margin-bottom: 6px; transition: background 0.13s;
}
.rdp-primary-btn:hover { background: #3E5C56; }
.rdp-action-hint { font-size: 11.5px; color: #7A948F; text-align: center; }
.rdp-ghost-btn {
  display: block; width: 100%; padding: 9px 14px;
  background: none; border: 1px solid rgba(42,88,80,0.25); border-radius: 7px;
  color: #2A5850; font-family: var(--sans); font-size: 12.5px; font-weight: 500;
  cursor: pointer; text-align: center; text-decoration: none; transition: all 0.13s;
}
.rdp-ghost-btn:hover { background: rgba(42,88,80,0.06); }
.rdp-section { border-top: 1px solid rgba(42,88,80,0.08); padding-top: 14px; margin-top: 8px; }
.rdp-section-label { font-size: 11px; font-weight: 600; letter-spacing: 0.01em; color: #7A948F; margin-bottom: 10px; }
.rdp-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,0.04); font-size: 12.5px; }
.rdp-row:last-child { border-bottom: none; }
.rdp-row-label { color: #7A948F; }
.rdp-row-val { font-weight: 500; color: #1A2F2B; text-align: right; max-width: 60%; }
.rdp-status-chip {
  display: inline-block; font-size: 11px; font-weight: 600; padding: 4px 10px;
  border-radius: 99px; letter-spacing: 0.03em;
}
.rdp-status-chip.invoiced { background: rgba(200,160,0,0.12); color: #7a6300; }
.rdp-status-chip.paid     { background: rgba(39,174,96,0.12); color: #27ae60; }

/* ── Success overlay (Apple Pay-style) ── */
@keyframes suc-scale {
  0%   { transform: scale(0.55); opacity: 0; }
  65%  { transform: scale(1.09); }
  100% { transform: scale(1);    opacity: 1; }
}
@keyframes suc-check {
  from { stroke-dashoffset: 52; }
  to   { stroke-dashoffset: 0; }
}
@keyframes suc-fade-up {
  from { opacity: 0; transform: translateY(7px); }
  to   { opacity: 1; transform: none; }
}
@keyframes suc-dismiss { to { opacity: 0; } }
.suc-overlay {
  position: fixed; inset: 0; z-index: 9500;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(10,18,16,0.52); backdrop-filter: blur(10px);
  pointer-events: none;
}
.suc-ring {
  width: 84px; height: 84px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  animation: suc-scale 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
}
.suc-label {
  margin-top: 16px;
  font-family: Raleway, sans-serif; font-size: 14px; font-weight: 600;
  color: rgba(255,255,255,0.92); letter-spacing: 0.01em;
  animation: suc-fade-up 0.3s 0.18s ease both;
}

/* ── Home dashboard view ── */
.home-view { padding: 28px 28px 80px; max-width: 860px; }
@media (max-width: 900px) { .home-view { padding: 16px 14px 80px; } }
.home-hd { margin-bottom: 26px; }
.home-greeting {
  font-family: var(--serif); font-size: 28px; font-weight: 300;
  color: #1A2F2B; line-height: 1.2; margin-bottom: 8px;
}
.home-greeting em { font-style: italic; color: var(--teal); font-weight: 300; }
.home-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 28px; }
.home-action-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 18px; border-radius: 11px;
  background: var(--surface); border: 1px solid var(--surface-border);
  box-shadow: var(--surface-shadow);
  font-family: var(--sans); font-size: 13px; font-weight: 500; color: #1A2F2B;
  cursor: pointer; transition: all 0.14s;
}
.home-action-btn:hover { background: white; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.09); }
.home-action-btn .hab-icon { font-size: 15px; color: var(--teal); }
.home-action-btn.primary { background: var(--teal); color: white; border-color: var(--teal); }
.home-action-btn.primary .hab-icon { color: rgba(255,255,255,0.8); }
.home-action-btn.primary:hover { background: #224840; border-color: #224840; }
.home-section-title {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: #9AABA8; margin-bottom: 10px;
}
.home-stats { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 28px; }
.home-stat {
  flex: 1; min-width: 130px;
  background: var(--surface); border: 1px solid var(--surface-border);
  border-radius: 12px; padding: 16px 18px;
  box-shadow: var(--surface-shadow);
}
.home-stat-val { font-size: 26px; font-weight: 700; color: #1A2F2B; line-height: 1; margin-bottom: 5px; font-variant-numeric: tabular-nums; }
.home-stat-val.amber { color: var(--amber); }
.home-stat-val.teal  { color: var(--teal); }
.home-stat-label { font-size: 11px; color: #9AABA8; font-weight: 500; }
.home-appts { background: var(--surface); border: 1px solid var(--surface-border); border-radius: 12px; overflow: hidden; box-shadow: var(--surface-shadow); }
.home-appt-item {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 16px; border-bottom: 1px solid rgba(0,0,0,0.04);
  transition: background 0.1s; cursor: default;
}
.home-appt-item:last-child { border-bottom: none; }
.home-appt-time { font-size: 12px; font-weight: 600; color: var(--teal); min-width: 48px; }
.home-appt-name { font-size: 13px; font-weight: 500; color: #1A2F2B; flex: 1; }
.home-appt-type { font-size: 10.5px; color: #9AABA8; }
.home-empty { padding: 32px 20px; text-align: center; color: #9AABA8; font-size: 13px; }

/* ── Queue view ── */
.queue-view { padding: 22px 24px 80px; max-width: 860px; }
@media (max-width: 900px) { .queue-view { padding: 14px 14px 80px; } }

/* Home header */
.qhome-hd { margin-bottom: 20px; }
.qhome-greeting {
  font-family: var(--serif); font-size: 26px; font-weight: 300;
  color: #1A2F2B; line-height: 1.2; margin-bottom: 6px;
}
.qhome-greeting em { font-style: italic; color: var(--teal); font-weight: 300; }
.qhome-summary { font-size: 12px; color: #7A9090; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.qhome-alert {
  background: rgba(190,110,68,0.10); color: var(--amber);
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px;
}

/* Compact metrics bar (above sections) */
.q-metrics {
  display: flex; gap: 8px; margin-bottom: 22px; flex-wrap: wrap;
}
.q-metric {
  display: flex; align-items: center; gap: 7px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 9px; padding: 10px 14px;
  box-shadow: var(--surface-shadow);
}
.q-metric-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.q-metric-val { font-size: 20px; font-weight: 500; color: #1A2F2B; line-height: 1; font-variant-numeric: tabular-nums; }
.q-metric-val.urgent { color: var(--s-urgent); }
.q-metric-label { font-size: 10.5px; color: #7A9090; font-weight: 500; }

/* ── Queue folders ── */
.q-folder { margin-bottom: 8px; }
.q-folder-tab {
  display: flex; align-items: center; gap: 9px;
  padding: 11px 14px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 11px;
  cursor: pointer; user-select: none;
  transition: background 0.12s;
  box-shadow: var(--surface-shadow);
}
.q-folder-tab:hover { background: rgba(255,255,255,0.96); }
.q-folder-tab.is-open {
  border-radius: 11px 11px 0 0;
  border-bottom-color: transparent;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.q-folder-chevron {
  font-size: 11px; color: #C0CCCB;
  transition: transform 0.15s; display: inline-block; line-height: 1;
}
.q-folder-tab.is-open .q-folder-chevron { transform: rotate(90deg); }
.q-folder-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.q-folder-label { font-size: 12.5px; font-weight: 600; color: #2E4040; flex: 1; }
.q-folder-count {
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px;
  background: rgba(0,0,0,0.07); color: #7A9090; min-width: 22px; text-align: center;
}
.q-folder-count.urgent { background: rgba(217,79,47,0.13); color: var(--s-urgent); }
.q-folder-body {
  background: var(--surface);
  border: 1px solid var(--surface-border); border-top: none;
  border-radius: 0 0 11px 11px; overflow: hidden;
}
/* Items inside folder body: no extra chrome */
.q-folder-body .q-items {
  background: transparent; border: none;
  border-radius: 0; box-shadow: none;
}
/* Sub-group label inside folder */
.q-sub-title {
  font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: #9AABA8; padding: 9px 16px 7px;
  border-bottom: 1px solid rgba(0,0,0,0.045); display: block;
}
.q-sub-group + .q-sub-group { margin-top: 0; }

/* Queue item list (standalone — inside .q-folder-body these get reset above) */
.q-items {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 11px;
  overflow: hidden;
  box-shadow: var(--surface-shadow);
}
.q-item {
  display: flex; align-items: center; cursor: pointer;
  border-bottom: 1px solid rgba(0,0,0,0.04); transition: background 0.1s;
}
.q-item:last-child { border-bottom: none; }
.q-item:hover { background: rgba(0,0,0,0.02); }
.q-item.is-active { background: rgba(42,88,80,0.05); }

/* Left accent stripe — hidden inside folders (folder tab carries the color) */
.q-item-bar { display: none; }

/* Item content */
.q-item-main { flex: 1; padding: 11px 14px; min-width: 0; }
.q-item-type {
  font-size: 9px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  color: #9AABA8; margin-bottom: 2px;
}
.q-item-type.is-unlinked { color: var(--s-post); }
.q-item-name { font-size: 13.5px; font-weight: 600; color: #1A2F2B; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.q-item-meta { font-size: 11.5px; color: #9AABA8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.q-item-hint { font-size: 11px; color: var(--s-post); margin-top: 3px; font-weight: 500; }
.q-item-right { padding: 11px 13px 11px 8px; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 4px; }

/* Status pills */
.q-pill {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 99px;
  letter-spacing: 0.02em; white-space: nowrap;
}
.q-pill.urgent   { background: rgba(217,79,47,0.10); color: var(--s-urgent); }
.q-pill.record   { background: rgba(201,68,68,0.10); color: #C94444; }
.q-pill.pending  { background: rgba(192,120,48,0.10); color: var(--s-post); }
.q-pill.finance  { background: rgba(176,136,32,0.11); color: var(--s-finance); }
.q-pill.invoiced { background: rgba(176,136,32,0.11); color: var(--s-finance); }
.q-pill.upcoming { background: rgba(61,111,168,0.10); color: var(--s-upcoming); }
.q-pill.complete { background: rgba(74,128,96,0.10); color: var(--s-complete); }
.q-pill.paid     { background: rgba(74,128,96,0.10); color: var(--s-complete); }
.q-pill.lead     { background: rgba(190,110,68,0.10); color: var(--s-lead); }
.q-pill.new      { background: rgba(190,110,68,0.10); color: var(--s-lead); }
.q-pill.triage   { background: rgba(122,112,144,0.10); color: var(--s-triage); }
.q-pill.awaiting { background: rgba(122,112,144,0.10); color: var(--s-triage); }
.q-pill.today    { background: rgba(42,88,80,0.10); color: var(--teal); }
.q-arrow { font-size: 12px; color: rgba(0,0,0,0.15); margin-top: 2px; }
.q-empty { padding: 16px 14px; font-size: 12.5px; color: #9AABA8; font-style: italic; }

/* Collapsed completed section toggle */
.q-section-toggle {
  background: none; border: none; cursor: pointer;
  font-size: 10px; color: #9AABA8; padding: 0; font-family: var(--sans);
  margin-left: auto; transition: color 0.13s;
}
.q-section-toggle:hover { color: var(--teal); }

/* ── Mini modal (close reason, log interaction) ── */
.mm-ov {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(20,30,28,0.42);
  backdrop-filter: blur(3px);
  display: none; align-items: center; justify-content: center;
}
.mm-ov.open { display: flex; }
.mm-card {
  background: #111A2B;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 8px 40px rgba(0,0,0,0.5);
  padding: 24px 26px 20px;
  width: 380px; max-width: calc(100vw - 40px);
  animation: modalIn 0.2s ease;
  color: var(--t1, #F4F7F6);
}
.mm-title { font-size: 14px; font-weight: 600; color: var(--t1, #F4F7F6); margin-bottom: 16px; }
.mm-field { margin-bottom: 12px; }
.mm-field label { display: block; font-size: 11px; font-weight: 600; color: var(--t3, #7E93A8); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 5px; }
.mm-field select, .mm-field input, .mm-field textarea {
  width: 100%; box-sizing: border-box;
  font-size: 12.5px; padding: 7px 9px;
  border: 1px solid rgba(255,255,255,0.14); border-radius: 7px;
  background: rgba(255,255,255,0.05); color: var(--t1, #F4F7F6); outline: none; font-family: var(--sans);
  color-scheme: dark;
}
.mm-field select:focus, .mm-field input:focus, .mm-field textarea:focus { border-color: var(--teal); }
.mm-field textarea { min-height: 56px; resize: vertical; }
.mm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.mm-btn-cancel {
  font-size: 12px; padding: 7px 14px; border-radius: 7px; cursor: pointer;
  background: transparent; border: 1px solid rgba(255,255,255,0.18); color: var(--t2, #AEBECB);
}
.mm-btn-cancel:hover { background: rgba(255,255,255,0.06); }
.mm-btn-confirm {
  font-size: 12px; padding: 7px 16px; border-radius: 7px; cursor: pointer;
  background: var(--teal); border: none; color: #fff; font-weight: 500;
}
.mm-btn-confirm:hover { background: var(--tealDeep); }
.mm-btn-danger {
  font-size: 12px; padding: 7px 16px; border-radius: 7px; cursor: pointer;
  background: #d94f3b; border: none; color: #fff; font-weight: 500;
}
.mm-btn-danger:hover { background: #b93a28; }

/* ── Activity timeline ── */
.enq-timeline { margin: 14px 0 0; }
.enq-tl-item { display: flex; gap: 10px; margin-bottom: 10px; }
.enq-tl-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--soft); flex-shrink: 0; margin-top: 5px; }
.enq-tl-dot.tl-status { background: var(--teal); }
.enq-tl-dot.tl-call { background: #5498d4; }
.enq-tl-dot.tl-email { background: #8a7ec8; }
.enq-tl-dot.tl-intake { background: #4aad8e; }
.enq-tl-body { flex: 1; min-width: 0; }
.enq-tl-label { font-size: 11.5px; color: var(--tealDeep); line-height: 1.4; }
.enq-tl-meta  { font-size: 10px; color: var(--soft); margin-top: 1px; }
.enq-log-form { margin-top: 10px; padding: 10px 12px; background: rgba(42,88,80,0.05); border-radius: 8px; }
.enq-log-form select, .enq-log-form textarea { width: 100%; box-sizing: border-box; font-size: 11.5px; padding: 6px 8px; border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; background: #fff; outline: none; font-family: var(--sans); margin-bottom: 6px; }
.enq-log-form textarea { min-height: 44px; resize: vertical; }

/* ── Funders view ── */
.funders-view { padding: 0 0 60px; }
.funders-view-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
/* Section headers */
.fv-sec-hdr { display: flex; align-items: center; gap: 8px; margin: 20px 0 12px; }
.fv-sec-title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--soft); }
.fv-sec-divider { flex: 1; height: 1px; background: rgba(0,0,0,0.07); }
/* Billing summary row */
.funder-billing-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px; }
.funder-billing-card {
  background: var(--surface); border: 1px solid var(--surface-border); border-radius: 10px;
  padding: 12px 16px; display: flex; align-items: center; gap: 12px;
  box-shadow: var(--surface-shadow);
}
.funder-billing-name { font-size: 12px; font-weight: 600; color: var(--mid); flex: 1; min-width: 0; }
.funder-billing-sub  { font-size: 10px; color: var(--soft); margin-top: 1px; }
.funder-billing-stat { text-align: right; flex-shrink: 0; }
.funder-billing-val { font-size: 13px; font-weight: 600; color: var(--mid); }
.funder-billing-val.owing { color: #d94f3b; }
.funder-billing-lbl { font-size: 9.5px; color: var(--soft); }
/* Reference cards grid */
.funder-ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.funder-ref-card {
  background: var(--surface); border: 1px solid var(--surface-border); border-radius: 12px;
  overflow: hidden; box-shadow: var(--surface-shadow);
}
.funder-ref-hdr {
  padding: 13px 18px 11px; border-bottom: 1px solid rgba(0,0,0,0.06);
  display: flex; align-items: center; gap: 12px;
}
.funder-ref-icon {
  width: 34px; height: 34px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;
}
.funder-ref-name { font-size: 13px; font-weight: 700; color: var(--tealDeep); }
.funder-ref-sub  { font-size: 11px; color: var(--soft); margin-top: 2px; }
.funder-ref-body { padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
.funder-ref-row { display: flex; align-items: flex-start; gap: 10px; }
.funder-ref-lbl { font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--soft); min-width: 90px; padding-top: 2px; flex-shrink: 0; line-height: 1.5; }
.funder-ref-val { font-size: 12px; color: var(--tealDeep); font-weight: 450; line-height: 1.6; flex: 1; }
.funder-ref-val a { color: var(--teal); text-decoration: none; }
.funder-ref-val a:hover { text-decoration: underline; }
.funder-ref-process { background: rgba(42,88,80,0.06); border: 1px solid rgba(42,88,80,0.12); border-radius: 8px; padding: 9px 12px; font-size: 11.5px; color: var(--mid); line-height: 1.7; }
.funder-ref-process strong { color: var(--teal); font-weight: 600; }
.funder-pay-badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; background: rgba(42,88,80,0.10); color: var(--teal); }

/* ── Billing submission badge ── */
.bill-sub-badge {
  display: inline-block; font-size: 10px; padding: 2px 7px; border-radius: 5px;
  margin-left: 6px; font-weight: 500;
}
.bill-sub-badge.not-submitted { background: rgba(0,0,0,0.06); color: var(--soft); }
.bill-sub-badge.submitted { background: rgba(42,88,80,0.10); color: var(--teal); }
.bill-sub-badge.chase      { background: rgba(217,79,59,0.12); color: #c0412e; }

/* ── Closed enquiry reason tag ── */
.enq-closed-reason {
  display: inline-block; font-size: 10px; padding: 2px 7px; border-radius: 5px;
  background: rgba(0,0,0,0.06); color: var(--soft); margin-left: 6px;
}

/* ── Halaxy-link panel (inline in detail panel) ── */
.enq-halaxy-link-panel {
  margin: 10px 0; padding: 12px 14px;
  background: rgba(42,88,80,0.05); border-radius: 9px;
  border: 1px solid rgba(42,88,80,0.12);
}
.enq-halaxy-link-title { font-size: 11px; font-weight: 600; color: var(--teal); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.07em; }
.enq-halaxy-search-row { display: flex; gap: 6px; margin-bottom: 8px; }
.enq-halaxy-search-row input { flex: 1; font-size: 12px; padding: 6px 9px; border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; outline: none; font-family: var(--sans); }
.enq-halaxy-results { margin-top: 4px; }
.enq-halaxy-result-item { font-size: 12px; padding: 6px 10px; cursor: pointer; border-radius: 5px; color: var(--tealDeep); }
.enq-halaxy-result-item:hover { background: rgba(42,88,80,0.08); }

/* ── Command bar overlay ── */
.cmd-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(20,30,28,0.45);
  backdrop-filter: blur(4px);
  display: none; align-items: flex-start; justify-content: center;
  padding-top: 18vh;
}
.cmd-overlay.open { display: flex; }
.cmd-bar {
  width: 560px; max-width: calc(100vw - 40px);
  background: rgba(250,248,245,0.97);
  border: 1px solid rgba(0,0,0,0.10);
  border-radius: 14px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
  overflow: hidden;
}
.cmd-input-row {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid rgba(0,0,0,0.07);
}
.cmd-search-icon { font-size: 16px; color: #9AABA8; flex-shrink: 0; }
.cmd-input {
  flex: 1; font-family: var(--sans); font-size: 15px; font-weight: 400;
  color: #1A2F2B; background: none; border: none; outline: none;
}
.cmd-input::placeholder { color: #9AABA8; }
.cmd-kbd { font-size: 10px; color: #9AABA8; background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
.cmd-results { max-height: 380px; overflow-y: auto; padding: 6px; }
.cmd-section-label {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  color: #9AABA8; padding: 8px 10px 4px;
}
.cmd-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 8px; cursor: pointer;
  transition: background 0.1s;
}
.cmd-item:hover, .cmd-item.selected { background: rgba(42,88,80,0.08); }
.cmd-item-icon { font-size: 14px; width: 22px; text-align: center; color: #9AABA8; flex-shrink: 0; }
.cmd-item-main { flex: 1; min-width: 0; }
.cmd-item-label { font-size: 13px; font-weight: 500; color: #1A2F2B; }
.cmd-item-sub { font-size: 11px; color: #9AABA8; margin-top: 1px; }
.cmd-item-badge { font-size: 10px; color: #9AABA8; flex-shrink: 0; }
.cmd-empty { padding: 24px 16px; text-align: center; font-size: 13px; color: #9AABA8; }
.cmd-footer {
  padding: 8px 14px; border-top: 1px solid rgba(0,0,0,0.06);
  display: flex; gap: 14px;
  font-size: 10px; color: #9AABA8;
}
.cmd-footer kbd { background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px; font-family: var(--sans); }

/* ── Mobile: kill legacy nav elements, show new dock ── */
.bottom-nav, .bn-more-sheet { display: none !important; }
.mob-logo-bar { display: none; }
#mob-hd       { display: none; }
.mob-dock     { display: none; }
.mob-action-sheet { display: none; }
/* Splash: hidden on desktop, shown on mobile via media query below */
#mob-splash   { display: none; }

/* ── Mobile dock styles ── */
@media (max-width: 768px) {
  .sidebar { display: none !important; }
  .app-topbar { display: none !important; }
  .modal-card { max-width: 100%; margin: 0; border-radius: 16px; }

  /* Full-height flex column */
  .app-main { display: flex; flex-direction: column; height: 100svh; overflow: hidden; }

  /* ── Splash screen (full-screen cover during initial load) ── */
  #mob-splash {
    display: flex; align-items: center; justify-content: center;
    position: fixed; inset: 0; z-index: 9100;
    background: var(--canvas);
    pointer-events: none; /* never block interaction */
    transition: opacity 0.38s ease;
  }
  #mob-splash-logo {
    width: 130px; height: 130px;
    /* transition is set by JS only after data loads — avoids flash on page render */
    will-change: transform;
  }
  .mob-splash-loader {
    position: absolute;
    top: calc(50% + 80px); /* just below the bottom edge of the 130px logo */
    left: 50%; transform: translateX(-50%);
    width: 56px; height: 3px; overflow: hidden;
    border-radius: 2px;
    background: rgba(255,255,255,0.07);
  }
  .mob-splash-pulse {
    width: 40%; height: 100%;
    background: var(--teal, #34d399);
    border-radius: 2px;
    animation: splashPulse 1.2s ease-in-out infinite;
  }
  @keyframes splashPulse {
    0%   { transform: translateX(-100%); opacity: 0; }
    20%  { opacity: 1; }
    80%  { opacity: 1; }
    100% { transform: translateX(350%); opacity: 0; }
  }

  /* Logo bar — starts invisible; revealed by _mobRunIntro after animation */
  .mob-logo-bar {
    display: flex; justify-content: center; align-items: center;
    padding: calc(env(safe-area-inset-top, 0px) + 14px) 16px 4px;
    flex-shrink: 0;
    opacity: 0; /* shown by JS after intro animation */
  }
  .mob-logo-img {
    width: 68px; height: 68px;
    /* natural brand colours — no brightness override */
    opacity: 0.92;
  }

  /* Persistent header below logo */
  #mob-hd {
    display: block; flex-shrink: 0;
    padding: 22px 18px 10px;
    text-align: center;
    /* no border — home view is borderless */
  }
  .mob-hd-greeting { font-size: 26px; font-weight: 700; color: var(--t1); letter-spacing: -0.03em; line-height: 1.15; }
  .mob-hd-date     { font-size: 12px; color: var(--t3); margin-top: 3px; font-weight: 400; }
  .mob-hd-meta     { font-size: 11px; color: var(--t3); margin-top: 3px; line-height: 1.4; }
  .mob-hd-meta strong { color: var(--t2); font-weight: 500; }

  /* Scrollable app content */
  .app-content { flex: 1; overflow-y: auto; min-height: 0; padding: 0 !important; overscroll-behavior-y: none; }
  #view-content { transition: opacity 0.14s ease, transform 0.14s ease; min-height: 100%; }

  /* ── Pull-to-refresh indicator ── */
  #ptr-bar {
    position: fixed; left: 0; right: 0; z-index: 180;
    display: flex; align-items: flex-end; justify-content: center;
    height: 0; overflow: hidden; opacity: 0;
    pointer-events: none;
    background: var(--canvas);
  }
  .ptr-inner {
    display: flex; align-items: center; gap: 7px;
    padding-bottom: 11px;
    font-size: 12px; font-family: var(--sans);
    color: rgba(255,255,255,0.38);
    white-space: nowrap; transition: color 0.15s;
  }
  #ptr-bar.ptr-ready .ptr-inner { color: var(--teal); }
  .ptr-icon { font-size: 15px; line-height: 1; display: inline-block; }
  .ptr-icon.ptr-spinning { animation: ptrSpin 0.65s linear infinite; }
  @keyframes ptrSpin { to { transform: rotate(360deg); } }

  /* ── iOS 26–style liquid-glass dock ── */
  .mob-dock {
    display: flex; align-items: flex-end; justify-content: center; flex-shrink: 0;
    height: calc(76px + env(safe-area-inset-bottom, 0px));
    padding-bottom: max(env(safe-area-inset-bottom, 0px), 14px);
    background: transparent; border-top: none;
    position: relative; z-index: 200;
  }
  .mob-dock-pill {
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(14, 22, 18, 0.68);
    backdrop-filter: blur(32px) saturate(180%) brightness(1.08);
    -webkit-backdrop-filter: blur(32px) saturate(180%) brightness(1.08);
    border: 1px solid rgba(255,255,255,0.11);
    border-radius: 9999px;
    padding: 5px 8px;
    gap: 0;
    min-width: 288px;
    box-shadow:
      0 8px 32px rgba(0,0,0,0.38),
      0 1px 0 rgba(255,255,255,0.09) inset,
      0 -1px 0 rgba(0,0,0,0.2) inset;
  }
  .mob-dock-item {
    width: 54px; height: 46px;
    display: flex; align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,0.32);
    border-radius: 9999px;
    transition: color 0.18s ease, background 0.18s ease, transform 0.18s cubic-bezier(0.34,1.56,0.64,1);
    -webkit-tap-highlight-color: transparent;
  }
  .mob-dock-item svg {
    transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1), filter 0.18s ease, opacity 0.18s ease;
    opacity: 0.55;
  }
  .mob-dock-item.active {
    color: var(--teal);
    background: rgba(52,211,153,0.13);
  }
  .mob-dock-item.active svg {
    opacity: 1;
    transform: scale(1.15);
    filter: drop-shadow(0 0 7px rgba(52,211,153,0.45));
    animation: dock-icon-pop 0.32s cubic-bezier(0.34,1.56,0.64,1);
  }
  .mob-dock-item:active { transform: scale(0.88); }
  @keyframes dock-icon-pop {
    0%   { transform: scale(0.85); }
    60%  { transform: scale(1.22); }
    100% { transform: scale(1.15); }
  }
  .mob-dock-center {
    width: 46px; height: 46px; flex-shrink: 0;
    background: rgba(52,211,153,0.14);
    border: 1px solid rgba(52,211,153,0.28);
    border-radius: 9999px;
    display: flex; align-items: center; justify-content: center;
    color: var(--teal); cursor: pointer;
    transition: all 0.18s ease;
    box-shadow: 0 0 18px rgba(52,211,153,0.1);
    -webkit-tap-highlight-color: transparent;
  }
  .mob-dock-center.sheet-open svg { transform: rotate(180deg); }
  .mob-dock-center svg { transition: transform 0.22s ease; }
  .mob-dock-center:active { transform: scale(0.88); background: rgba(52,211,153,0.25); }

  /* Action sheet from ^ button */
  .mob-action-sheet {
    display: flex; position: fixed; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.45); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    align-items: flex-end; opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  .mob-action-sheet.open { opacity: 1; pointer-events: all; }
  .mob-action-panel {
    width: 100%; background: rgba(10,14,26,0.98);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 22px 22px 0 0;
    padding: 8px 12px calc(env(safe-area-inset-bottom, 20px) + 16px);
    transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1);
  }
  .mob-action-sheet.open .mob-action-panel { transform: translateY(0); }
  .mob-action-handle { width: 36px; height: 4px; background: rgba(255,255,255,0.16); border-radius: 2px; margin: 0 auto 14px; }
  .mob-action-section { font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--t3); padding: 4px 4px 8px; }
  .mob-action-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 4px; }
  .mob-action-tile {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 15px 8px 13px; background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
    cursor: pointer; font-family: var(--sans); font-size: 11px; font-weight: 600; color: var(--t1);
    transition: background 0.12s;
  }
  .mob-action-tile:active { background: rgba(52,211,153,0.1); border-color: rgba(52,211,153,0.2); }
  .mob-action-tile svg { opacity: 0.65; }
  .mob-action-divider { height: 1px; background: rgba(255,255,255,0.07); margin: 10px 0 6px; }
  .mob-action-rows { display: flex; flex-direction: column; gap: 2px; }
  .mob-action-row {
    display: flex; align-items: center; gap: 12px; padding: 11px 10px;
    border-radius: 10px; background: none; border: none; cursor: pointer;
    width: 100%; font-family: var(--sans); font-size: 13px; font-weight: 500;
    color: var(--t1); text-decoration: none; text-align: left; transition: background 0.1s;
  }
  .mob-action-row:active { background: rgba(255,255,255,0.05); }
  .mob-action-row svg { opacity: 0.4; flex-shrink: 0; }
  .mob-action-row--signout { color: rgba(239,68,68,0.7); margin-top: 2px; }
  .mob-action-row--signout svg { opacity: 0.5; stroke: rgba(239,68,68,0.8); }
  .mob-action-row--signout:active { background: rgba(239,68,68,0.07); }

  /* ── Mobile home landing ── */
  /* Extra bottom padding so content clears the floating glass dock */
  .mob-home-wrap { padding: 6px 16px 100px; display: flex; flex-direction: column; gap: 18px; }

  /* Brief card */
  .mob-home-brief-card {
    background: rgba(52,211,153,0.055); border: 1px solid rgba(52,211,153,0.14);
    border-radius: 18px; padding: 18px 20px 16px;
  }
  .mob-home-brief-label {
    font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: rgba(52,211,153,0.5); margin-bottom: 10px;
  }
  .mob-home-brief-text {
    font-size: 15px; line-height: 1.8; color: var(--t1); font-weight: 400; min-height: 18px;
    letter-spacing: 0.005em;
  }
  .mob-home-brief-text.ai-brief-streaming { min-height: 48px; }
  .mob-home-brief-text.ai-brief-pulse-in {
    animation: ai-brief-pulse-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  .mob-home-brief-text .ai-brief-para { margin: 0; padding: 0; }
  .mob-home-brief-text .ai-brief-para + .ai-brief-para {
    margin-top: 10px; padding-top: 10px;
    border-top: 1px solid rgba(52,211,153,0.1);
  }
  /* Quote as sign-off inside briefing card */
  .mob-home-brief-signoff {
    margin-top: 16px; padding-top: 14px;
    border-top: 1px solid rgba(52,211,153,0.1);
  }
  .mob-home-brief-quote {
    font-size: 12px; line-height: 1.55; color: rgba(255,255,255,0.28);
    font-style: italic; font-weight: 400;
  }
  .mob-home-brief-attr {
    font-size: 11px; color: rgba(255,255,255,0.18); margin-top: 5px;
    letter-spacing: 0.02em;
  }

  /* Sessions section */
  .mob-home-section { display: flex; flex-direction: column; gap: 0; }
  .mob-home-sect-hd {
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--t3); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
  }
  .mob-home-sect-badge {
    background: rgba(52,211,153,0.15); color: var(--teal); font-size: 10px;
    font-weight: 700; padding: 1px 6px; border-radius: 20px; letter-spacing: 0;
  }
  .mob-home-sess {
    display: flex; align-items: center; gap: 12px; padding: 11px 14px;
    background: rgba(255,255,255,0.04); border-radius: 12px; margin-bottom: 6px;
    cursor: pointer; transition: background 0.1s;
  }
  .mob-home-sess:active { background: rgba(255,255,255,0.08); }
  .mob-home-sess-av {
    width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0;
  }
  .mob-home-sess-info { flex: 1; min-width: 0; }
  .mob-home-sess-name { font-size: 14px; font-weight: 600; color: var(--t1); }
  .mob-home-sess-time { font-size: 12px; color: var(--t3); margin-top: 1px; }
  .mob-home-no-sess {
    font-size: 13px; color: var(--t3); text-align: center;
    padding: 18px; background: rgba(255,255,255,0.02); border-radius: 12px;
  }

  /* ── Mobile inbox app ── */
  .mob-inbox-view {
    display: flex; flex-direction: column;
    height: 100%; min-height: 0;
  }
  .mob-inbox-tabs {
    display: flex; flex-wrap: wrap; flex-shrink: 0;
    padding: 12px 14px 8px; gap: 7px;
  }
  .mob-inbox-tab {
    display: flex; align-items: center; gap: 5px;
    white-space: nowrap; padding: 5px 12px; border-radius: 20px;
    font-family: var(--sans); font-size: 11px; font-weight: 500;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
    color: var(--t2); cursor: pointer; transition: all 0.12s; flex-shrink: 0;
  }
  .mob-inbox-tab.active {
    background: rgba(52,211,153,0.12); border-color: rgba(52,211,153,0.25); color: var(--teal);
  }
  .mob-inbox-tab-cnt {
    font-size: 10px; font-weight: 700;
    min-width: 16px; height: 16px; border-radius: 8px;
    background: rgba(255,255,255,0.1); color: inherit;
    display: inline-flex; align-items: center; justify-content: center; padding: 0 4px;
  }
  .mob-inbox-tab.active .mob-inbox-tab-cnt { background: rgba(52,211,153,0.18); }
  /* Critical (Halaxy no-invoice) tab */
  .mob-inbox-tab-crit { color: #ef4444 !important; border-color: rgba(239,68,68,0.25) !important; background: rgba(239,68,68,0.08) !important; }
  .mob-inbox-tab-crit.active { background: rgba(239,68,68,0.15) !important; border-color: rgba(239,68,68,0.4) !important; }
  /* Unlinked (GCal no patient) tab */
  .mob-inbox-tab-unlinked { color: #b85a1e !important; border-color: rgba(224,123,57,0.25) !important; background: rgba(224,123,57,0.08) !important; }
  .mob-inbox-tab-unlinked.active { background: rgba(224,123,57,0.15) !important; border-color: rgba(224,123,57,0.4) !important; }
  /* Actions (merge/dismiss) tab */
  .mob-inbox-tab-act { color: var(--amber) !important; border-color: rgba(245,158,11,0.25) !important; background: rgba(245,158,11,0.08) !important; }
  .mob-inbox-tab-act.active { background: rgba(245,158,11,0.15) !important; border-color: rgba(245,158,11,0.4) !important; }
  /* ── Inbox list — items pin to top ── */
  .mob-inbox-view .dh-attn-card {
    flex: 1; overflow-y: auto; margin-top: 0;
    min-height: 0; border-radius: 0; border: none;
    border-top: 1px solid rgba(255,255,255,0.06);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    display: flex !important; flex-direction: column !important; align-items: stretch !important;
    justify-content: flex-start !important; align-content: flex-start !important;
  }
  .mob-inbox-view .dh-attn-item { padding: 12px 16px; }
  .mob-inbox-view .dh-attn-empty { padding: 28px 20px; }

  /* ── Mobile reminders — table layout ── */
  .mob-remind-view { padding: 14px 16px calc(env(safe-area-inset-bottom, 20px) + 80px); }
  .mob-remind-hd {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 12px;
  }
  .mob-remind-title { font-size: 17px; font-weight: 700; color: var(--t1); letter-spacing: -0.02em; }
  .mob-remind-sort-btn {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: 500; color: var(--t2);
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.11); border-radius: 8px;
    padding: 5px 11px; cursor: pointer; font-family: var(--sans);
    transition: background 0.12s, border-color 0.12s;
    white-space: nowrap; flex-shrink: 0;
  }
  .mob-remind-sort-btn:active { background: rgba(255,255,255,0.1); }
  .mob-remind-add-btn {
    font-size: 11.5px; font-weight: 600; color: var(--teal);
    background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.22);
    border-radius: 8px; padding: 5px 13px; cursor: pointer; font-family: var(--sans);
  }
  /* Column header row */
  .mob-rt-head {
    display: grid; grid-template-columns: 28px 1fr 72px 38px 46px;
    padding: 5px 0 5px 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 2px;
  }
  .mob-rt-h-task, .mob-rt-h-client, .mob-rt-h-prio, .mob-rt-h-date {
    font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--t3);
  }
  .mob-rt-h-prio { text-align: center; }
  .mob-rt-h-date { text-align: right; }
  /* Task rows — checkbox | title+desc | client | priority | date */
  .mob-rt-row {
    display: grid; grid-template-columns: 28px 1fr 72px 38px 46px;
    align-items: center; min-height: 42px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    padding: 4px 0; cursor: pointer;
  }
  .mob-rt-row:active { background: rgba(255,255,255,0.03); }
  /* Title cell — stacks title + description */
  .mob-rt-title-wrap { display: flex; flex-direction: column; gap: 1px; padding-right: 6px; }
  .mob-rt-title-text { font-size: 12.5px; color: var(--t1); line-height: 1.3; }
  .mob-rt-desc { font-size: 10.5px; color: var(--t3); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mob-rt-client { font-size: 10.5px; color: var(--t2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mob-rt-prio   { display: flex; align-items: center; justify-content: center; }
  .mob-rt-date   { font-size: 10px; color: var(--t3); text-align: right; }
  /* Priority badge */
  .mob-prio-badge {
    font-size: 9px; font-weight: 700; padding: 1px 5px;
    border-radius: 4px; background: rgba(245,158,11,0.18); color: var(--amber);
    letter-spacing: 0.03em;
  }
  .mob-prio-badge.dim { background: transparent; color: var(--t3); font-weight: 400; }
  .mob-remind-section-sub {
    font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--t3); margin: 14px 0 4px;
  }
  .mob-remind-all-done { font-size: 12px; color: var(--t3); padding: 20px 0; text-align: center; }
  /* Shared task checkbox */
  .mob-rt-row .dh-task-chk { width: 20px; height: 20px; border-radius: 50%; font-size: 10px; }

  /* ── Mobile billing view ── */
  .mob-billing-view { padding: 14px 16px calc(env(safe-area-inset-bottom, 20px) + 80px); }
  .mob-bill-stat-bar {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;
  }
  .mob-bill-stat {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px; padding: 14px 16px;
  }
  .mob-bill-paid-toggle { cursor: pointer; }
  .mob-bill-paid-toggle:active { background: rgba(255,255,255,0.07); }
  .mob-bill-stat-val { font-size: 22px; font-weight: 800; line-height: 1; margin-bottom: 4px; color: var(--t1); }
  .mob-bill-stat-val.teal  { color: var(--teal); }
  .mob-bill-stat-val.amber { color: var(--amber); }
  .mob-bill-stat-lbl { font-size: 10px; color: var(--t3); font-weight: 500; line-height: 1.3; }
  .mob-bill-section-hd {
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--t3); margin-bottom: 10px;
  }
  .mob-bill-inv-list { display: flex; flex-direction: column; gap: 8px; }
  .mob-bill-row {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 12px 14px;
  }
  .mob-bill-row-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; gap: 8px; }
  .mob-bill-name { font-size: 13.5px; font-weight: 600; color: var(--t1); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mob-bill-ref  { font-size: 10px; font-weight: 400; color: var(--t3); margin-left: 4px; }
  .mob-bill-amt  { font-size: 13px; font-weight: 700; color: var(--amber); flex-shrink: 0; }
  .mob-bill-row-bot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .mob-bill-org  { font-size: 10.5px; color: var(--t3); flex: 1; }
  .mob-bill-date { font-size: 10.5px; color: var(--t3); margin-left: auto; }
  .mob-bill-sub { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 5px; }
  .mob-bill-sub.ok    { background: rgba(52,211,153,0.1); color: var(--teal); }
  .mob-bill-sub.chase { background: rgba(245,158,11,0.15); color: var(--amber); }
  .mob-bill-mark {
    font-size: 10px; background: rgba(52,211,153,0.07);
    border: 1px solid rgba(52,211,153,0.2); color: var(--teal);
    border-radius: 6px; padding: 2px 8px; cursor: pointer; font-family: var(--sans);
  }
  .mob-bill-empty { padding: 40px 20px; text-align: center; color: var(--t3); font-size: 13px; }

  /* ── Bottom sheet modal (add reminder, etc.) ── */
  .mob-sheet-overlay {
    position: fixed; inset: 0; z-index: 8500;
    background: rgba(0,0,0,0.55); display: flex; align-items: flex-end;
    animation: sheetBgIn 0.2s ease;
  }
  .mob-sheet {
    width: 100%; background: #111827;
    border-radius: 20px 20px 0 0;
    padding: 20px 20px calc(env(safe-area-inset-bottom, 20px) + 20px);
    border-top: 1px solid rgba(255,255,255,0.1);
    animation: sheetSlideUp 0.25s cubic-bezier(0.32,0.72,0,1);
  }
  .mob-sheet-hd {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;
  }
  .mob-sheet-title { font-size: 15px; font-weight: 700; color: var(--t1); }
  .mob-sheet-close {
    font-size: 14px; color: var(--t3); background: rgba(255,255,255,0.07);
    border: none; border-radius: 50%; width: 26px; height: 26px;
    display: flex; align-items: center; justify-content: center; cursor: pointer;
    font-family: var(--sans);
  }
  .mob-sheet-body { display: flex; flex-direction: column; gap: 12px; }
  .mob-sheet-inp {
    width: 100%; box-sizing: border-box;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px; padding: 13px 14px;
    font-size: 15px; color: var(--t1); font-family: var(--sans); outline: none;
  }
  .mob-sheet-inp:focus { border-color: rgba(52,211,153,0.4); }
  .mob-sheet-inp::placeholder { color: var(--t3); }
  .mob-sheet-submit {
    width: 100%; background: rgba(52,211,153,0.12);
    border: 1px solid rgba(52,211,153,0.25); color: var(--teal);
    font-size: 14px; font-weight: 600; border-radius: 11px; padding: 13px;
    cursor: pointer; font-family: var(--sans); transition: background 0.12s;
  }
  .mob-sheet-submit:active { background: rgba(52,211,153,0.2); }
  /* Field labels inside sheet */
  .mob-sheet-field-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
    text-transform: uppercase; color: var(--t3); margin-bottom: 5px; margin-top: 12px;
  }
  .mob-sheet-field-label:first-of-type { margin-top: 0; }
  .mob-sheet-textarea { min-height: 72px; resize: vertical; }
  /* Priority pills inside sheet */
  .mob-sheet-prio-pills { display: flex; gap: 8px; }
  .mob-sheet-prio-pill {
    flex: 1; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04); color: var(--t2);
    font-size: 12px; font-weight: 500; font-family: var(--sans); cursor: pointer;
    transition: all 0.12s;
  }
  .mob-sheet-prio-pill.active { background: rgba(255,255,255,0.1); color: var(--t1); border-color: rgba(255,255,255,0.2); }
  .mob-sheet-prio-pill.high.active { background: rgba(245,158,11,0.15); color: var(--amber); border-color: rgba(245,158,11,0.35); }
  /* Complete toggle button */
  .mob-sheet-complete-btn {
    width: 100%; padding: 10px; border-radius: 9px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    color: var(--t2); font-size: 13px; font-family: var(--sans); cursor: pointer;
    margin-bottom: 4px; transition: all 0.12s;
  }
  .mob-sheet-complete-btn.done { background: rgba(52,211,153,0.1); border-color: rgba(52,211,153,0.25); color: var(--teal); }
  /* Delete button */
  .mob-sheet-delete {
    width: 100%; padding: 11px; border-radius: 10px;
    background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
    color: #ef4444; font-size: 13px; font-weight: 500; font-family: var(--sans); cursor: pointer;
  }
  @keyframes sheetBgIn    { from { opacity: 0 } to { opacity: 1 } }
  @keyframes sheetSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
}

@keyframes pulse { 0%,100% { opacity:0.3 } 50% { opacity:0.9 } }

/* How-to instructions (collapsed) in right detail panel */
.rdp-howto { margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,0.07); }
.rdp-howto details > summary {
  font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  color: #7A948F; cursor: pointer; list-style: none;
  display: flex; align-items: center; gap: 6px; user-select: none; padding: 2px 0;
}
.rdp-howto details > summary::before { content: '▸'; font-size: 8px; margin-right: 2px; }
.rdp-howto details[open] > summary::before { content: '▾'; }
.rdp-howto details > summary::-webkit-details-marker { display: none; }
.rdp-howto-steps { padding-top: 10px; }
.rdp-howto-step {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 7px 0; border-bottom: 1px solid rgba(0,0,0,0.04);
  font-size: 12px; color: #3D5C56; line-height: 1.45;
}
.rdp-howto-step:last-child { border-bottom: none; }
.rdp-howto-step-n {
  flex-shrink: 0; width: 18px; height: 18px; margin-top: 1px;
  background: rgba(42,88,80,0.10); border-radius: 50%;
  font-size: 9px; font-weight: 700; color: #2A5850;
  display: flex; align-items: center; justify-content: center;
}

/* ── Clients view ── */
/* ── Queue show-more ── */
.q-show-more {
  display: block; width: 100%; padding: 8px 14px;
  background: none; border: none; border-top: 1px solid rgba(0,0,0,0.04);
  font-family: var(--sans); font-size: 11.5px; font-weight: 500;
  color: #9AABA8; cursor: pointer; text-align: left;
  transition: color 0.13s;
}
.q-show-more:hover { color: var(--teal); }

/* ── Clients list + detail view ── */
.cl-list-view { padding: 0; height: 100%; overflow-y: auto; }
.cl-list-hd { padding: 16px 20px 10px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid rgba(0,0,0,0.05); flex-shrink: 0; }
.cl-list-hd-title { font-size: 16px; font-weight: 700; color: #1A2F2B; flex: 1; }
.cl-list-search { height: 34px; min-width: 160px; max-width: 260px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); padding: 0 12px; font-family: var(--sans); font-size: 13px; background: white; }
.cl-list-search:focus { outline: none; border-color: var(--teal); }
.cl-list-add-btn { height: 34px; padding: 0 14px; border-radius: 8px; background: var(--teal); color: white; border: none; font-family: var(--sans); font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.cl-list-add-btn:hover { background: #224840; }
.cl-list { display: flex; flex-direction: column; padding: 10px 16px 80px; gap: 4px; }
.cl-list-item { display: flex; align-items: center; gap: 12px; padding: 11px 14px; background: var(--surface); border: 1px solid var(--surface-border); border-radius: 10px; cursor: pointer; transition: all 0.13s; box-shadow: var(--surface-shadow); }
.cl-list-item:hover { background: white; border-color: rgba(42,88,80,0.25); transform: translateX(2px); }
.cl-list-av { width: 38px; height: 38px; border-radius: 50%; color: white; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
.cl-list-info { flex: 1; min-width: 0; }
.cl-list-name { font-size: 13.5px; font-weight: 600; color: #1A2F2B; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-list-tags { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
.cl-list-tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 99px; white-space: nowrap; }
.cl-list-tag.type         { background: rgba(42,88,80,0.10);    color: var(--teal); }
.cl-list-tag.funder       { background: rgba(61,111,168,0.10);  color: #3D6FA8; }
.cl-list-tag.contact      { background: rgba(154,171,168,0.14); color: #6A8A85; }
.cl-list-tag.owing        { background: rgba(190,110,68,0.12);  color: var(--amber); }
.cl-list-tag.halaxy-linked { background: rgba(42,88,80,0.10); color: var(--teal); }
.cl-list-tag.onboarding   { background: rgba(154,110,180,0.12); color: #7A50A0; }
.cl-list-meta { font-size: 11px; color: #9AABA8; flex-shrink: 0; text-align: right; line-height: 1.5; }
.cl-list-empty { padding: 60px 20px; text-align: center; color: #9AABA8; font-size: 13px; }

/* Client detail view */
.cl-detail-view { height: 100%; overflow-y: auto; }
.cl-detail-back { display: flex; align-items: center; gap: 7px; padding: 14px 20px 0; font-size: 12px; font-weight: 500; color: #7A948F; background: none; border: none; cursor: pointer; font-family: var(--sans); transition: color 0.12s; }
.cl-detail-back:hover { color: var(--teal); }
.cl-detail-hd { padding: 14px 20px 16px; border-bottom: 1px solid rgba(0,0,0,0.06); display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.cl-detail-av { width: 52px; height: 52px; border-radius: 50%; color: white; font-size: 18px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 3px 12px rgba(0,0,0,0.15); }
.cl-detail-hd-info { flex: 1; min-width: 0; }
.cl-detail-hd-name { font-size: 21px; font-weight: 700; color: #1A2F2B; margin-bottom: 6px; }
.cl-detail-hd-tags { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.cl-detail-body { padding: 18px 20px 80px; display: flex; flex-direction: column; gap: 14px; max-width: 700px; }
.cl-detail-section { background: var(--surface); border: 1px solid var(--surface-border); border-radius: 12px; overflow: hidden; box-shadow: var(--surface-shadow); }
.cl-detail-sec-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #9AABA8; padding: 11px 16px 9px; border-bottom: 1px solid rgba(0,0,0,0.05); }
.cl-detail-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 9px 16px; border-bottom: 1px solid rgba(0,0,0,0.04); font-size: 13px; }
.cl-detail-row:last-child { border-bottom: none; }
.cl-detail-row-label { color: #7A948F; font-size: 12px; flex-shrink: 0; padding-top: 1px; }
.cl-detail-row-val { font-weight: 500; color: #1A2F2B; text-align: right; }
.cl-detail-inv-row { display: flex; align-items: center; gap: 10px; padding: 9px 16px; border-bottom: 1px solid rgba(0,0,0,0.04); font-size: 12.5px; }
.cl-detail-inv-row:last-child { border-bottom: none; }
.cl-detail-inv-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 99px; white-space: nowrap; }
.cl-detail-inv-badge.paid    { background: rgba(39,174,96,0.12); color: #27ae60; }
.cl-detail-inv-badge.active  { background: rgba(190,110,68,0.12); color: var(--amber); }
.cl-detail-inv-badge.overdue { background: rgba(217,79,47,0.12);  color: var(--s-urgent); }
.cl-detail-appt-row { display: flex; align-items: center; gap: 10px; padding: 9px 16px; border-bottom: 1px solid rgba(0,0,0,0.04); font-size: 12.5px; }
.cl-detail-appt-row:last-child { border-bottom: none; }
.cl-detail-appt-date { font-weight: 600; color: var(--teal); min-width: 100px; font-size: 12px; }
.cl-detail-appt-time { color: #7A948F; font-size: 11.5px; }
.cl-detail-appt-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 99px; background: rgba(42,88,80,0.10); color: var(--teal); margin-left: auto; white-space: nowrap; }
.cl-detail-appt-badge.attended  { background: rgba(42,88,80,0.14); color: var(--teal); }
.cl-detail-appt-badge.cancelled { background: rgba(0,0,0,0.07); color: #9AABA8; text-decoration: line-through; }

/* ── Inbox two-column layout ── */
.inbox-layout { display: flex; height: 100%; min-height: 0; overflow: hidden; }
.inbox-sidebar { width: 186px; flex-shrink: 0; background: rgba(0,0,0,0.013); border-right: 1px solid rgba(0,0,0,0.06); padding: 10px 7px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.inbox-sidebar-label { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(0,0,0,0.25); padding: 7px 10px 3px; }
.inbox-folder-btn { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 8px; background: none; border: none; cursor: pointer; font-family: var(--sans); font-size: 12.5px; color: #3E5C56; text-align: left; width: 100%; transition: background 0.1s; }
.inbox-folder-btn:hover { background: rgba(42,88,80,0.07); }
.inbox-folder-btn.active { background: rgba(42,88,80,0.12); color: var(--teal); font-weight: 600; }
.inbox-folder-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.inbox-folder-label { flex: 1; }
.inbox-folder-count { font-size: 10px; font-weight: 700; min-width: 18px; height: 18px; border-radius: 99px; padding: 0 5px; display: flex; align-items: center; justify-content: center; }
.inbox-folder-count.urgent { background: rgba(217,79,47,0.13); color: var(--s-urgent); }
.inbox-folder-count.normal { background: rgba(0,0,0,0.07); color: #7A9090; }
.inbox-main { flex: 1; overflow-y: auto; padding: 16px 20px 80px; min-width: 0; }
.inbox-pane-title { font-size: 15px; font-weight: 700; color: #1A2F2B; margin-bottom: 14px; }
@media (max-width: 768px) { .inbox-sidebar { display: none; } .inbox-main { padding: 12px 12px 80px; } }

/* ── Home calendar timeline ── */
.home-cal-wrap { background: var(--surface); border: 1px solid var(--surface-border); border-radius: 12px; overflow: hidden; box-shadow: var(--surface-shadow); margin-bottom: 0; }
.home-cal-header { padding: 11px 16px 9px; border-bottom: 1px solid rgba(0,0,0,0.05); font-size: 11.5px; font-weight: 700; color: #1A2F2B; letter-spacing: 0.02em; }
.home-cal-body { display: flex; position: relative; }
.home-cal-times { width: 46px; flex-shrink: 0; padding-top: 0; }
.home-cal-hour-label { height: 52px; font-size: 9.5px; color: #B0BFBC; padding: 4px 8px 0 0; box-sizing: border-box; text-align: right; }
.home-cal-grid { flex: 1; border-left: 1px solid rgba(0,0,0,0.06); position: relative; }
.home-cal-hour-row { height: 52px; border-bottom: 1px solid rgba(0,0,0,0.04); }
.home-cal-appt-block { position: absolute; left: 5px; right: 5px; border-radius: 7px; padding: 4px 9px; font-size: 11.5px; font-weight: 500; overflow: hidden; min-height: 24px; box-sizing: border-box; }
.home-cal-appt-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-cal-appt-time { font-size: 10px; opacity: 0.8; }
.home-cal-now-line { position: absolute; left: 0; right: 0; height: 2px; z-index: 3; }
.home-cal-now-dot { position: absolute; left: -4px; width: 9px; height: 9px; border-radius: 50%; top: -3.5px; }
.home-cal-empty { padding: 24px 16px; text-align: center; font-size: 12.5px; color: #9AABA8; }

/* ── Home tasks ── */
.home-tasks-wrap { background: var(--surface); border: 1px solid var(--surface-border); border-radius: 12px; overflow: hidden; box-shadow: var(--surface-shadow); }
.home-task-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid rgba(0,0,0,0.04); }
.home-task-item:last-child { border-bottom: none; }
.home-task-check { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(42,88,80,0.3); flex-shrink: 0; cursor: pointer; background: none; display: flex; align-items: center; justify-content: center; transition: all 0.12s; font-size: 10px; color: transparent; }
.home-task-check:hover { border-color: var(--teal); }
.home-task-check.done { background: var(--teal); border-color: var(--teal); color: white; }
.home-task-text { flex: 1; font-size: 13px; color: #1A2F2B; }
.home-task-text.done { text-decoration: line-through; color: #9AABA8; }
.home-task-add { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid rgba(0,0,0,0.05); }
.home-task-add-input { flex: 1; border: none; font-family: var(--sans); font-size: 13px; background: none; outline: none; color: #1A2F2B; }
.home-task-add-input::placeholder { color: #B0BFBC; }
.home-task-add-btn { font-size: 12px; color: var(--teal); background: none; border: none; cursor: pointer; font-family: var(--sans); font-weight: 600; }

/* ── Clients view ── */
.clients-view { padding: 22px 24px 80px; max-width: 860px; }
@media (max-width: 900px) { .clients-view { padding: 14px 14px 80px; } }
.clients-view-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
.view-title { font-size: 17px; font-weight: 700; color: #1A2F2B; font-family: var(--sans); }
.clients-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
@media (max-width: 640px) { .clients-grid { grid-template-columns: 1fr; } }

/* ── Player cards for clients ── */
.cl-card-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
  gap: 12px; margin-bottom: 4px;
}
@media (max-width: 640px) { .cl-card-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; } }
.cl-card {
  background: var(--surface); border: 1px solid var(--surface-border);
  border-radius: 16px; padding: 0 0 16px;
  box-shadow: var(--surface-shadow);
  cursor: pointer; transition: all 0.16s;
  display: flex; flex-direction: column; align-items: center;
  text-align: center; position: relative; overflow: hidden;
}
.cl-card:hover { transform: translateY(-3px); box-shadow: 0 8px 28px rgba(0,0,0,0.11); }

/* Top bar: funder pill left, dupe badge right — replaces absolute positioning */
.cl-card-topbar {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 9px 10px 0; min-height: 30px; box-sizing: border-box; gap: 4px;
}
.cl-card-topbar-left  { display: flex; align-items: center; gap: 4px; min-width: 0; }
.cl-card-topbar-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.cl-card-dupe-tag {
  font-size: 9px; font-weight: 700; color: #BE6E44;
  background: rgba(190,110,68,0.10); border-radius: 5px;
  padding: 2px 5px; white-space: nowrap;
}
.cl-card-type-tag {
  font-size: 9px; font-weight: 600; border-radius: 5px;
  padding: 2px 6px; white-space: nowrap;
}
.cl-card-type-tag.couples { background: rgba(61,111,168,0.12); color: #3D6FA8; }
.cl-card-type-tag.child   { background: rgba(122,112,144,0.12); color: #7A7090; }
.cl-card-type-tag.contact { background: rgba(154,171,168,0.15); color: #6A8A85; }
.cl-card-type-tag.parent  { background: rgba(42,88,80,0.10);   color: var(--teal); }

/* Avatar + text body */
.cl-card-body {
  display: flex; flex-direction: column; align-items: center;
  padding: 12px 16px 0; width: 100%; box-sizing: border-box;
}
.cl-card-avatar {
  width: 54px; height: 54px; border-radius: 50%;
  color: white; font-size: 20px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 10px;
  box-shadow: 0 3px 12px rgba(0,0,0,0.18);
}
.cl-card-name {
  font-size: 13.5px; font-weight: 700; color: #1A2F2B;
  margin-bottom: 3px; line-height: 1.25;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cl-card-since { font-size: 11px; color: #9AABA8; margin-bottom: 12px; }
.cl-card-divider { width: 100%; border-top: 1px solid rgba(0,0,0,0.05); margin-bottom: 11px; }
.cl-card-stats { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
.cl-card-stat {
  display: flex; flex-direction: column; align-items: center;
  font-size: 10px; color: #9AABA8; line-height: 1.3;
}
.cl-card-stat-val { font-size: 17px; font-weight: 700; color: #1A2F2B; line-height: 1.1; }
.cl-card-stat-val.upcoming { color: var(--s-upcoming); }
.cl-card-stat-val.paid     { color: var(--s-complete); font-size: 14px; }
.cl-card-stat-val.owing    { color: #BE6E44; }
.cl-card-funder { display: inline-block; }

/* Card footer — actions + source indicator */
.cl-card-footer {
  width: 100%; margin-top: 12px;
  padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.05);
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
}
.cl-card-source {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 2px 7px; border-radius: 99px; white-space: nowrap;
}
.cl-card-source.linked    { background: rgba(42,88,80,0.10); color: var(--teal); }
.cl-card-source.web       { background: rgba(61,111,168,0.10); color: var(--s-upcoming); }
.cl-card-source.halaxy-only { background: rgba(122,112,144,0.10); color: var(--s-triage); }
.cl-card-source.unlinked  { background: rgba(190,110,68,0.10); color: var(--s-lead); }
.cl-card-actions { display: flex; align-items: center; gap: 5px; }
.cl-card-action {
  font-size: 10.5px; font-weight: 600; padding: 3px 8px; border-radius: 6px;
  border: none; cursor: pointer; font-family: var(--sans); text-decoration: none;
  white-space: nowrap; transition: all 0.12s; line-height: 1.4;
  display: inline-flex; align-items: center; gap: 3px;
}
.cl-card-action.queue  { background: rgba(42,88,80,0.09); color: var(--teal); }
.cl-card-action.queue:hover  { background: rgba(42,88,80,0.16); }
.cl-card-action.link   { background: rgba(190,110,68,0.10); color: var(--s-lead); }
.cl-card-action.link:hover   { background: rgba(190,110,68,0.18); }
.cl-card-action.create { background: rgba(61,111,168,0.10); color: var(--s-upcoming); }
.cl-card-action.create:hover { background: rgba(61,111,168,0.18); }

/* Delete × button — top-left corner of card (top-right is taken by funder pill) */
.cl-card-delete {
  position: absolute; top: 7px; left: 7px;
  width: 20px; height: 20px; border-radius: 50%;
  border: none; background: transparent; cursor: pointer;
  font-size: 14px; line-height: 1; color: #C0CCCB;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.15s, color 0.15s, background 0.15s;
  font-family: var(--sans); z-index: 2;
}
.cl-card:hover .cl-card-delete { opacity: 1; }
.cl-card-delete:hover { color: #BE6E44; background: rgba(190,110,68,0.10); opacity: 1; }

/* Duplicate + unverified card states */
.cl-card--dupe       { border: 1.5px solid rgba(190,110,68,0.35); }
.cl-card--unverified { border: 1.5px dashed rgba(190,110,68,0.40); opacity: 0.85; }

/* Unverified Halaxy link badge */
.cl-card-source.halaxy-unverified {
  background: rgba(190,110,68,0.10); color: #BE6E44;
}

/* Section headers */
.cl-section-hd {
  margin-top: 28px; margin-bottom: 6px;
}
.cl-section-hd:first-child { margin-top: 4px; }
.cl-section-hd-top {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 5px;
}
.cl-section-label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #7A948F; }
.cl-section-count { font-weight: 500; color: #9AABA8; }
.cl-section-hint  { font-size: 10px; color: #BE6E44; font-weight: 600; }
.cl-section-desc  {
  font-size: 11.5px; color: #9AABA8; line-height: 1.5;
  background: rgba(42,88,80,0.04); border-radius: 8px;
  padding: 7px 11px; margin-bottom: 10px;
}
.cl-section-desc strong { color: #3E5C56; font-weight: 600; }
.cl-section-toggle-wrap { display: flex; align-items: center; justify-content: space-between; }
.cl-section-collapse-btn {
  font-size: 11px; font-weight: 600; color: #9AABA8; background: none; border: none;
  cursor: pointer; padding: 2px 6px; font-family: var(--sans);
}
.cl-section-collapse-btn:hover { color: var(--teal); }

/* Danger zone + warning box in detail modal */
.rdp-danger-zone {
  margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.07);
}
.rdp-danger-btn {
  width: 100%; padding: 8px 12px; border-radius: 8px; border: none; cursor: pointer;
  font-size: 12px; font-weight: 600; font-family: var(--sans);
  background: rgba(190,110,68,0.08); color: #BE6E44; transition: background 0.15s;
}
.rdp-danger-btn:hover { background: rgba(190,110,68,0.16); }
.rdp-warn-box {
  background: rgba(190,110,68,0.08); border: 1px solid rgba(190,110,68,0.22);
  border-radius: 9px; padding: 10px 13px; margin: 8px 0;
  font-size: 11.5px; color: #BE6E44; line-height: 1.5;
}

/* Queue filtered client header */
.q-client-filter-hd {
  display: flex; align-items: center; gap: 12px; margin-bottom: 22px; flex-wrap: wrap;
}
.q-client-filter-back {
  background: none; border: 1px solid rgba(42,88,80,0.22); border-radius: 7px;
  color: var(--teal-mid); font-size: 11.5px; font-weight: 600; font-family: var(--sans);
  padding: 5px 12px; cursor: pointer; transition: all 0.12s;
}
.q-client-filter-back:hover { background: rgba(42,88,80,0.06); }
.q-client-filter-name { font-size: 18px; font-weight: 700; color: #1A2F2B; }

/* Client list — legacy compact rows (superseded by phase-5 styles above) */
.cl-list-avatar {
  width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
  background: var(--teal); color: white; font-size: 11px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}
.cl-list-main { flex: 1; min-width: 0; }
.cl-list-name { font-size: 13px; font-weight: 600; color: #1A2F2B; margin-bottom: 2px; }
.cl-list-meta { font-size: 11px; color: #9AABA8; display: flex; gap: 8px; flex-wrap: wrap; }
.cl-list-right { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.cl-list-last { font-size: 11px; color: #9AABA8; white-space: nowrap; }
.cl-funder-pill {
  font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 99px;
  letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap;
}
.cl-funder-pill.medicare   { background: rgba(42,88,80,0.10); color: var(--teal); }
.cl-funder-pill.ndis       { background: rgba(61,111,168,0.10); color: var(--s-upcoming); }
.cl-funder-pill.private    { background: rgba(122,112,144,0.10); color: var(--s-triage); }
.cl-funder-pill.workcover  { background: rgba(176,136,32,0.11); color: var(--s-finance); }
.cl-funder-pill.default    { background: rgba(0,0,0,0.06); color: #7A9090; }
/* .cl-section-label is defined inside .cl-section-hd above */

/* ── Billing view ── */
.billing-view { padding: 22px 24px 80px; max-width: 860px; }
@media (max-width: 900px) { .billing-view { padding: 14px 14px 80px; } }
.billing-view-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }

/* Billing summary cards */
.bill-summary {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px;
}
@media (max-width: 640px) { .bill-summary { grid-template-columns: 1fr 1fr; } }
.bill-stat {
  background: var(--surface); border: 1px solid var(--surface-border);
  border-radius: 11px; padding: 16px 18px;
  box-shadow: var(--surface-shadow);
}
.bill-stat-label {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  color: #9AABA8; margin-bottom: 6px;
}
.bill-stat-val {
  font-family: var(--serif); font-size: 28px; font-weight: 300; color: #1A2F2B; line-height: 1;
}
.bill-stat-val.owing { color: var(--s-post); }
.bill-stat-val.zero  { color: #9AABA8; }
.bill-stat-sub { font-size: 11px; color: #9AABA8; margin-top: 5px; }

/* ── Settings view ── */
.settings-view { padding: 26px 28px 60px; max-width: 680px; }
@media (max-width: 900px) { .settings-view { padding: 18px 16px 70px; } }
.settings-section { background: white; border-radius: 10px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.settings-section-title { font-size: 13px; font-weight: 700; color: #192E2A; margin-bottom: 14px; }
.settings-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.05); font-size: 13px; gap: 12px; }
.settings-row:last-child { border-bottom: none; }
.settings-row-label { color: #192E2A; flex: 1; }
.settings-row-val { color: #7A948F; font-size: 12px; text-align: right; }
.settings-row-action a, .settings-row-action button {
  font-size: 11.5px; font-weight: 600; color: #2A5850; background: none;
  border: 1px solid rgba(42,88,80,0.25); border-radius: 5px; padding: 4px 10px;
  cursor: pointer; text-decoration: none; font-family: var(--sans); transition: all 0.13s;
}
.settings-row-action a:hover, .settings-row-action button:hover { background: rgba(42,88,80,0.06); }

/* ── Mobile (legacy override kept for compat, new styles in the main block above) ── */

/* ── Section header ── */
.sec-hd {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 16px;
}
.sec-title {
  font-family: var(--serif);
  font-size: 22px; font-weight: 300;
  color: var(--tealDeep);
}
.sec-title em { font-style: italic; color: var(--terra); }
.sec-count {
  font-size: 11px; font-weight: 600;
  color: var(--terra);
  background: rgba(190,110,68,0.1);
  border-radius: 100px;
  padding: 2px 10px;
  letter-spacing: 0.06em;
}

/* ── Filter tabs ── */
.filter-tabs {
  display: flex; gap: 4px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.ftab {
  padding: 5px 14px;
  border-radius: 100px;
  border: 1px solid rgba(42,88,80,0.15);
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--soft);
  background: white;
  cursor: pointer;
  transition: all 0.18s;
}
.ftab.active, .ftab:hover {
  background: var(--tealDeep);
  border-color: var(--tealDeep);
  color: white;
}

/* ── Enquiry cards ── */
.eq-card {
  background: white;
  border-radius: 14px;
  border: 1px solid rgba(42,88,80,0.09);
  padding: 16px 18px;
  margin-bottom: 10px;
  transition: box-shadow 0.2s;
}
.eq-card:hover { box-shadow: 0 4px 20px rgba(25,46,42,0.08); }
.eq-card[data-status="closed"] { opacity: 0.55; }

/* New request — prominent highlight */
.eq-card--new {
  border-left: 4px solid ${C.terra};
  background: rgba(190,110,68,0.025);
}
.eq-new-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 9px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: white; background: ${C.terra};
  border-radius: 100px; padding: 2px 8px;
  margin-left: 8px; vertical-align: middle;
}
.eq-new-dot {
  display: inline-block;
  width: 5px; height: 5px;
  background: white; border-radius: 50%;
  animation: eq-pulse 1.6s ease-in-out infinite;
}
@keyframes eq-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.8); }
}

/* Activity feed */
.eq-activity {
  border-top: 1px solid rgba(42,88,80,0.07);
  margin-top: 10px; padding-top: 8px;
  display: flex; flex-direction: column; gap: 4px;
}
.eq-activity-row {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 8px;
}
.eq-act-label {
  font-size: 11px; color: var(--mid);
}
.eq-act-meta {
  font-size: 10px; color: var(--soft);
  white-space: nowrap; flex-shrink: 0;
}

/* User avatar chip in header (legacy — kept for compat) */
.topbar-user { display: flex; align-items: center; gap: 8px; }

/* Status select — prominent filled pill */
.eq-status-sel {
  font-family: var(--sans);
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.09em; text-transform: uppercase;
  border: none; border-radius: 100px;
  padding: 5px 22px 5px 10px;
  cursor: pointer; outline: none;
  appearance: none; -webkit-appearance: none;
  background-repeat: no-repeat;
  background-position: right 7px center;
  background-size: 9px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E");
}
.eq-status-sel.status-new       { background-color: rgba(190,110,68,0.12); color: ${C.terra}; }
.eq-status-sel.status-contacted { background-color: rgba(55,107,98,0.10);  color: ${C.tealMid}; }
.eq-status-sel.status-in_halaxy { background-color: rgba(42,88,80,0.10);   color: ${C.teal}; }
.eq-status-sel.status-closed    { background-color: rgba(122,148,143,0.10); color: ${C.soft}; }

.eq-card-top {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px; margin-bottom: 12px;
}
.eq-meta { flex: 1; }
.eq-name {
  display: block;
  font-size: 14px; font-weight: 500;
  color: var(--tealDeep); margin-bottom: 3px;
}
.eq-detail { font-size: 11px; color: var(--soft); letter-spacing: 0.02em; }
.eq-right {
  display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
}
.eq-date { font-size: 11px; color: var(--soft); }

/* Two-column card body */
.eq-card-body { display: flex; gap: 0; align-items: flex-start; }
.eq-body-main { flex: 1; min-width: 0; padding-right: 16px; }
.eq-body-side {
  width: 170px; flex-shrink: 0;
  border-left: 1px solid rgba(42,88,80,0.08);
  padding-left: 14px;
}

.eq-contact {
  display: flex; align-items: center; gap: 14px;
  margin-bottom: 10px;
}
.eq-email { font-size: 12.5px; color: var(--teal); text-decoration: none; letter-spacing: 0.01em; }
.eq-email:hover { text-decoration: underline; }
.eq-phone { font-size: 12px; color: var(--soft); }
.eq-msg {
  font-size: 12.5px; color: var(--mid); line-height: 1.6;
  background: rgba(42,88,80,0.04);
  border-left: 2px solid rgba(42,88,80,0.15);
  border-radius: 0 6px 6px 0;
  padding: 8px 12px; margin-bottom: 10px;
  white-space: pre-wrap;
}
.eq-empty {
  text-align: center; padding: 48px 24px;
  color: var(--soft); font-size: 13px; letter-spacing: 0.02em;
}

/* Card footer actions */
.eq-actions {
  display: flex; align-items: center; gap: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(42,88,80,0.07);
  margin-top: 4px;
}
.eq-intake-btn {
  font-family: var(--sans);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--teal);
  background: rgba(42,88,80,0.07);
  border: none; border-radius: 100px;
  padding: 5px 14px; cursor: pointer;
  transition: background 0.18s;
}
.eq-intake-btn:hover { background: rgba(42,88,80,0.14); }
.eq-intake-btn.sent { color: var(--soft); background: rgba(42,88,80,0.04); cursor: default; }

/* Intake expand panel */
.eq-intake-panel { display: none; margin-top: 12px; background: rgba(42,88,80,0.03); border: 1px solid rgba(42,88,80,0.10); border-radius: 10px; padding: 16px; }
.eq-intake-panel.open { display: block; }
.eq-intake-row { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap; }
.eq-intake-type {
  font-family: var(--sans); font-size: 12px; color: var(--tealDeep);
  border: 1.5px solid rgba(42,88,80,0.15); border-radius: 8px;
  padding: 8px 10px; background: white; outline: none; cursor: pointer;
  flex-shrink: 0; min-width: 130px; transition: border-color 0.2s;
}
.eq-intake-type:focus { border-color: var(--teal); }
.eq-intake-url {
  flex: 1; min-width: 180px;
  font-family: var(--sans); font-size: 12px; color: var(--tealDeep);
  border: 1.5px solid rgba(42,88,80,0.15); border-radius: 8px;
  padding: 8px 12px; background: white; outline: none;
  transition: border-color 0.2s;
}
.eq-intake-url:focus { border-color: var(--teal); }
.eq-intake-url::placeholder { color: var(--soft); font-size: 11.5px; }
.eq-intake-send {
  font-family: var(--sans); font-size: 12px; font-weight: 500;
  padding: 8px 18px; background: var(--teal); color: white;
  border: none; border-radius: 8px; cursor: pointer;
  transition: background 0.2s; white-space: nowrap;
}
.eq-intake-send:hover { background: var(--mid); }
.eq-intake-send:disabled { opacity: 0.55; cursor: not-allowed; }
.eq-intake-msg { font-size: 11.5px; margin-top: 8px; padding: 0 2px; }
.eq-intake-msg.ok { color: var(--teal); }
.eq-intake-msg.err { color: var(--terra); }

/* Side panel actions (note / task / halaxy) */
.eq-side-block { margin-bottom: 10px; }
.eq-side-block:last-child { margin-bottom: 0; }
.eq-side-action {
  display: flex; align-items: center; gap: 7px;
  font-family: var(--sans); font-size: 11px; font-weight: 500;
  color: var(--soft); background: none; border: none;
  cursor: pointer; padding: 3px 0; transition: color 0.15s;
  white-space: nowrap;
}
.eq-side-action:hover, .eq-side-action.active { color: var(--teal); }
.eq-side-action svg { width: 13px; height: 13px; flex-shrink: 0; }
.eq-side-panel { display: none; margin-top: 6px; }
.eq-side-panel.open { display: block; }
.eq-notes {
  width: 100%; font-family: var(--sans);
  font-size: 12px; color: var(--mid);
  border: 1px solid rgba(42,88,80,0.12); border-radius: 8px;
  padding: 7px 9px; resize: vertical; min-height: 56px;
  background: rgba(42,88,80,0.02); outline: none; transition: border-color 0.2s;
}
.eq-notes:focus { border-color: var(--teal); }
.eq-side-row { display: flex; gap: 5px; align-items: center; }
.eq-side-input {
  flex: 1; min-width: 0;
  font-family: var(--sans); font-size: 11px; color: var(--tealDeep);
  border: 1px solid rgba(42,88,80,0.15); border-radius: 6px;
  padding: 5px 7px; background: rgba(42,88,80,0.02); outline: none;
  transition: border-color 0.2s;
}
.eq-side-input:focus { border-color: var(--teal); }
.eq-side-input::placeholder { color: var(--soft); }
.eq-side-save-btn {
  font-family: var(--sans); font-size: 10.5px; font-weight: 600;
  padding: 5px 9px; background: var(--teal); color: white;
  border: none; border-radius: 6px; cursor: pointer;
  white-space: nowrap; transition: background 0.18s; flex-shrink: 0;
}
.eq-side-save-btn:hover { background: var(--mid); }
.eq-halaxy-saved { display: flex; align-items: center; gap: 6px; }
.eq-halaxy-url { font-size: 11px; color: var(--teal); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; display: inline-block; }
.eq-halaxy-url:hover { text-decoration: underline; }
.eq-halaxy-clear { background: none; border: none; color: var(--soft); cursor: pointer; font-size: 15px; line-height: 1; padding: 0 1px; flex-shrink: 0; transition: color 0.15s; }
.eq-halaxy-clear:hover { color: var(--terra); }

/* ── Right column ── */
.right-col { display: flex; flex-direction: column; gap: 24px; }

/* ── Panel card ── */
.panel {
  background: white;
  border-radius: 14px;
  border: 1px solid rgba(42,88,80,0.09);
  overflow: hidden;
}
.panel-hd {
  padding: 16px 20px 14px;
  border-bottom: 1px solid rgba(42,88,80,0.07);
  display: flex; align-items: center; justify-content: space-between;
}
.panel-title {
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--soft);
}
.panel-body { padding: 16px 20px; }

/* ── Tasks ── */
.task-add {
  display: flex; gap: 8px; margin-bottom: 14px;
}
.task-input {
  flex: 1;
  font-family: var(--sans);
  font-size: 13px; color: var(--tealDeep);
  border: 1.5px solid rgba(42,88,80,0.15);
  border-radius: 8px;
  padding: 8px 12px;
  outline: none; background: white;
  transition: border-color 0.2s;
}
.task-input:focus { border-color: var(--teal); }
.task-add-btn {
  padding: 8px 14px;
  background: var(--teal); color: white;
  border: none; border-radius: 8px;
  font-family: var(--sans); font-size: 18px;
  cursor: pointer; transition: background 0.2s;
  line-height: 1;
}
.task-add-btn:hover { background: var(--mid); }
.task-list { list-style: none; }
.task-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(42,88,80,0.06);
}
.task-item:last-child { border-bottom: none; }
.task-item.done .task-title {
  text-decoration: line-through;
  color: var(--soft);
}
.task-check {
  width: 22px; height: 22px; flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid rgba(42,88,80,0.25);
  background: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.18s;
  color: transparent;
}
.task-item.done .task-check {
  background: var(--teal); border-color: var(--teal);
  color: white;
}
.task-check svg { width: 11px; height: 11px; }
.task-title {
  flex: 1; font-size: 13px; color: var(--tealDeep);
  line-height: 1.4;
}
.task-del {
  width: 22px; height: 22px; flex-shrink: 0;
  border: none; background: transparent;
  color: rgba(42,88,80,0.2);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  border-radius: 4px; transition: all 0.15s;
}
.task-del:hover { color: var(--terra); background: rgba(190,110,68,0.08); }
.task-del svg { width: 14px; height: 14px; }
.task-empty {
  font-size: 12px; color: var(--soft);
  text-align: center; padding: 12px 0;
  letter-spacing: 0.02em;
}

/* ── Setup checklist ── */
.setup-item {
  display: flex; align-items: flex-start; gap: 9px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(42,88,80,0.06);
  cursor: pointer;
  font-size: 12px; color: var(--mid); line-height: 1.45;
}
.setup-item:last-child { border-bottom: none; }
.setup-item input[type="checkbox"] {
  margin-top: 2px; flex-shrink: 0;
  accent-color: var(--teal);
  width: 13px; height: 13px;
}
.setup-item.done span {
  text-decoration: line-through; color: var(--soft);
}
.setup-toggle-btn {
  background: none; border: none;
  font-size: 10px; color: var(--soft);
  cursor: pointer; padding: 0; line-height: 1;
  transition: color 0.15s;
}
.setup-toggle-btn:hover { color: var(--teal); }

/* ── Website tab ── */
#website-tab { display: none; }
.ws-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 700px) { .ws-grid { grid-template-columns: 1fr; } }
.ws-card {
  background: white;
  border: 1px solid rgba(42,88,80,0.09);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.ws-card-hd {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px 14px;
}
.ws-card-title {
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--teal);
}
.ws-card-tag {
  font-size: 10px; color: var(--soft);
  background: rgba(42,88,80,0.06);
  border-radius: 5px; padding: 2px 8px;
  font-weight: 500;
}
.ws-card-body {
  padding: 0 20px 18px;
  flex: 1;
}
.ws-card-desc {
  font-size: 13px; color: var(--mid);
  line-height: 1.7; margin: 0 0 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(42,88,80,0.07);
}
.ws-item {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 7px 0;
  border-bottom: 1px solid rgba(42,88,80,0.05);
  font-size: 12.5px; color: var(--mid);
  gap: 12px;
  line-height: 1.55;
}
.ws-item:last-child { border-bottom: none; }
.ws-item-label { flex: 1; }
.ws-item-val { font-size: 11px; color: var(--soft); text-align: right; flex-shrink: 0; max-width: 200px; line-height: 1.5; }
.ws-link {
  font-size: 11px; color: var(--teal);
  text-decoration: none; white-space: nowrap;
}
.ws-link:hover { text-decoration: underline; }
.ws-note {
  font-size: 11.5px; color: var(--soft);
  background: rgba(42,88,80,0.04);
  border-radius: 7px; padding: 8px 10px;
  margin-top: 10px; line-height: 1.55;
}

/* ── Site reference panel ── */
.ref-section { margin-bottom: 14px; }
.ref-section:last-child { margin-bottom: 0; }
.ref-label {
  font-size: 9px; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--soft); margin-bottom: 6px;
}
.ref-row {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 12px; padding: 3px 0;
  border-bottom: 1px solid rgba(42,88,80,0.05);
  color: var(--mid);
}
.ref-row:last-child { border-bottom: none; }
.ref-row span { font-size: 11px; color: var(--teal); font-weight: 500; }
.ref-link { font-size: 11.5px; color: var(--teal); text-decoration: none; }
.ref-link:hover { text-decoration: underline; }

/* ── Stat chips ── */
.stats-row {
  display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px;
}
.stat-chip {
  background: white; border: 1px solid rgba(42,88,80,0.09);
  border-radius: 10px; padding: 12px 16px; flex: 1; min-width: 90px;
}
.stat-n {
  font-size: 24px; font-weight: 300;
  color: var(--tealDeep); line-height: 1;
  font-family: var(--serif);
  margin-bottom: 4px;
}
.stat-l {
  font-size: 10px; color: var(--soft);
  letter-spacing: 0.06em; text-transform: uppercase;
}

/* ── Clients tab ── */
.clients-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}
.cl-add-btn {
  font-family: var(--sans); font-size: 12px; font-weight: 500;
  color: white; background: var(--teal);
  border: none; border-radius: 8px;
  padding: 7px 14px; cursor: pointer;
  transition: background 0.2s;
}
.cl-add-btn:hover { background: var(--mid); }

/* Google Calendar status chip (in toolbar) */
.gcal-banner {
  border-radius: 100px; padding: 5px 10px;
  font-family: var(--sans); font-size: 11px; font-weight: 500;
  display: flex; align-items: center; gap: 8px;
  border: 1px solid transparent;
}
.gcal-banner.connected {
  background: rgba(42,88,80,0.07);
  border-color: rgba(42,88,80,0.12);
  color: var(--mid);
}
.gcal-banner.disconnected {
  background: rgba(190,110,68,0.07);
  border-color: rgba(190,110,68,0.18);
  color: var(--terra);
}
.gcal-connect-btn {
  font-family: var(--sans); font-size: 10px; font-weight: 600;
  padding: 3px 9px; border-radius: 100px; border: none;
  background: var(--terra); color: white;
  cursor: pointer; white-space: nowrap;
  text-decoration: none; display: inline-block;
  transition: opacity 0.15s;
}
.gcal-connect-btn:hover { opacity: 0.82; }

/* Pending calendar events */
.pending-card {
  background: white; border-radius: 12px;
  border: 1px solid rgba(42,88,80,0.09);
  border-left: 4px solid var(--mint);
  padding: 12px 16px; margin-bottom: 8px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.pending-card-info { flex: 1; min-width: 0; }
.pending-card-title {
  font-size: 14px; font-weight: 500; color: var(--tealDeep);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pending-card-date { font-size: 11px; color: var(--soft); margin-top: 2px; }
.pending-card-desc { font-size: 11px; color: var(--mid); margin-top: 3px; }
.pending-convert-btn {
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  padding: 6px 14px; border-radius: 7px; border: none;
  background: var(--teal); color: white;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
  transition: background 0.2s;
}
.pending-convert-btn:hover { background: var(--mid); }

/* Client cards */
.cl-card {
  background: white; border-radius: 14px;
  border: 1px solid rgba(42,88,80,0.09);
  margin-bottom: 10px; overflow: hidden;
}
.cl-card-head {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; cursor: pointer;
  transition: background 0.15s;
}
.cl-card-head:hover { background: rgba(42,88,80,0.03); }
.cl-card-head-info { flex: 1; min-width: 0; }
.cl-name {
  font-size: 14px; font-weight: 500; color: var(--tealDeep);
}
.cl-meta { font-size: 11px; color: var(--soft); margin-top: 2px; }
.cl-funder-badge {
  font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; padding: 3px 9px;
  border-radius: 100px; white-space: nowrap; flex-shrink: 0;
}
.funder-ndis_plan  { background: rgba(42,88,80,0.1);    color: var(--teal); }
.funder-ndis_self  { background: rgba(42,88,80,0.07);   color: var(--mid); }
.funder-medicare   { background: rgba(119,207,189,0.2); color: #1a6e5e; }
.funder-qfes       { background: rgba(190,110,68,0.1);  color: var(--terra); }
.funder-dva        { background: rgba(100,80,160,0.1);  color: #5a4a9a; }
.funder-private    { background: rgba(122,148,143,0.15); color: var(--mid); }

.cl-chevron {
  color: var(--soft); font-size: 12px; flex-shrink: 0;
  transition: transform 0.2s;
}
.cl-card.open .cl-chevron { transform: rotate(180deg); }

.cl-body { display: none; border-top: 1px solid rgba(42,88,80,0.07); padding: 0 18px 14px; }
.cl-card.open .cl-body { display: block; }

/* Session rows */
.cl-sessions { margin-top: 14px; }
.cl-sessions-head {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 8px;
}
.cl-sessions-label {
  font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--soft);
}
.cl-add-session-btn {
  font-family: var(--sans); font-size: 11px; font-weight: 500;
  color: var(--teal); background: none; border: none;
  cursor: pointer; padding: 0;
}
.cl-add-session-btn:hover { text-decoration: underline; }

.cl-session-row {
  display: grid;
  grid-template-columns: 90px 1fr auto auto;
  gap: 10px; align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(42,88,80,0.05);
  font-size: 12px;
}
.cl-session-row:last-child { border-bottom: none; }
.cl-session-date { color: var(--mid); font-weight: 500; }
.cl-session-inv  { color: var(--soft); font-size: 11px; }
.cl-session-notes { color: var(--soft); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-session-actions { display: flex; gap: 6px; }

.cl-status-btn {
  font-family: var(--sans); font-size: 10px; font-weight: 600;
  letter-spacing: 0.06em; padding: 4px 10px;
  border-radius: 6px; border: none; cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.cl-status-btn:hover { opacity: 0.82; }
.status-upcoming  { background: rgba(122,148,143,0.15); color: var(--mid); }
.status-completed { background: rgba(42,88,80,0.12);    color: var(--teal); }
.status-invoiced  { background: rgba(190,110,68,0.12);  color: var(--terra); }
.status-submitted { background: rgba(200,160,40,0.15);  color: #8a6a00; }
.status-paid      { background: rgba(42,150,100,0.12);  color: #1a7a50; }
.status-cancelled { background: rgba(122,122,122,0.1);  color: #999; }

/* Inline add-session form */
.cl-add-session-form {
  background: rgba(42,88,80,0.04); border-radius: 8px;
  padding: 12px; margin-top: 8px;
  display: none;
}
.cl-add-session-form.open { display: block; }
.cl-form-row {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;
}
.cl-form-field label {
  display: block; font-size: 10px; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--soft); margin-bottom: 4px;
}
.cl-form-input {
  width: 100%; padding: 7px 10px;
  border: 1.5px solid rgba(42,88,80,0.18); border-radius: 7px;
  font-family: var(--sans); font-size: 12px; color: var(--tealDeep);
  background: white; outline: none;
  transition: border-color 0.2s;
}
.cl-form-input:focus { border-color: var(--teal); }
.cl-form-actions { display: flex; gap: 8px; }
.cl-form-save {
  font-family: var(--sans); font-size: 12px; font-weight: 500;
  padding: 7px 16px; border-radius: 7px; border: none;
  background: var(--teal); color: white; cursor: pointer;
}
.cl-form-cancel {
  font-family: var(--sans); font-size: 12px;
  padding: 7px 12px; border-radius: 7px;
  border: 1px solid rgba(42,88,80,0.18);
  background: white; color: var(--soft); cursor: pointer;
}

/* Add client modal */
.cl-modal-ov {
  position: fixed; inset: 0; z-index: 999;
  background: rgba(25,46,42,0.5);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s;
}
.cl-modal-ov.open { opacity: 1; pointer-events: all; }
.cl-modal {
  background: white; border-radius: 16px;
  width: 100%; max-width: 440px;
  padding: 28px; box-shadow: 0 24px 60px rgba(25,46,42,0.2);
  transform: translateY(16px); transition: transform 0.25s;
}
.cl-modal-ov.open .cl-modal { transform: none; }
.cl-modal-title {
  font-family: var(--serif); font-size: 22px; font-weight: 300;
  color: var(--tealDeep); margin-bottom: 20px;
}
.cl-modal-title em { font-style: italic; color: var(--terra); }
.cl-modal-field { margin-bottom: 14px; }
.cl-modal-field label {
  display: block; font-size: 10px; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--soft); margin-bottom: 5px;
}
.cl-modal-input, .cl-modal-select {
  width: 100%; padding: 9px 12px;
  border: 1.5px solid rgba(42,88,80,0.18); border-radius: 9px;
  font-family: var(--sans); font-size: 13px; color: var(--tealDeep);
  background: white; outline: none; transition: border-color 0.2s;
}
.cl-modal-input:focus, .cl-modal-select:focus { border-color: var(--teal); }
.cl-modal-actions { display: flex; gap: 10px; margin-top: 20px; }
.cl-modal-save {
  flex: 1; font-family: var(--sans); font-size: 13px; font-weight: 500;
  padding: 10px; border-radius: 9px; border: none;
  background: var(--teal); color: white; cursor: pointer;
  transition: background 0.2s;
}
.cl-modal-save:hover { background: var(--mid); }
.cl-modal-cancel {
  font-family: var(--sans); font-size: 13px;
  padding: 10px 18px; border-radius: 9px;
  border: 1px solid rgba(42,88,80,0.18);
  background: white; color: var(--soft); cursor: pointer;
}
.cl-empty { color: var(--soft); font-size: 13px; padding: 20px 0; }
/* Add Client modal — mode toggle */
.cl-mode-toggle {
  display: flex; gap: 0; margin-bottom: 18px;
  border: 1px solid rgba(42,88,80,0.18); border-radius: 9px; overflow: hidden;
}
.cl-mode-btn {
  flex: 1; padding: 8px 12px; font-family: var(--sans); font-size: 12px; font-weight: 500;
  border: none; background: transparent; color: var(--soft); cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.cl-mode-btn--active { background: var(--teal); color: white; }
.cl-mode-btn:not(.cl-mode-btn--active):hover { background: rgba(42,88,80,0.06); }
/* Link-to-client button on enquiry cards */
.enq-link-btn {
  font-family: var(--sans); font-size: 10px; font-weight: 500;
  padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(42,88,80,0.22);
  background: transparent; color: var(--soft); cursor: pointer;
  margin-top: 4px; display: inline-block;
}
.enq-link-btn:hover { background: rgba(42,88,80,0.06); color: var(--teal); }
/* Halaxy lookup result inside Add Client modal */
.cl-halaxy-lookup-searching {
  font-size: 11px; color: var(--soft);
  padding: 7px 10px; border-radius: 7px;
  background: rgba(42,88,80,0.05);
  display: flex; align-items: center; gap: 6px;
}
.cl-halaxy-lookup-found {
  font-size: 11px; color: var(--teal);
  padding: 7px 10px; border-radius: 7px;
  background: rgba(42,88,80,0.07);
  border: 1px solid rgba(42,88,80,0.2);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.cl-halaxy-lookup-notfound {
  font-size: 11px; color: var(--terra);
  padding: 7px 10px; border-radius: 7px;
  background: rgba(190,110,68,0.06);
  border: 1px solid rgba(190,110,68,0.18);
  line-height: 1.5;
}
.cl-halaxy-lookup-noemail {
  font-size: 11px; color: var(--soft);
  padding: 5px 0;
}
.cl-inactive-toggle {
  font-family: var(--sans); font-size: 11px; color: var(--soft);
  background: none; border: none; cursor: pointer; margin-top: 12px;
  text-decoration: underline;
}

/* ── Pipeline toolbar (kept for compat) ── */
.pipeline-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 10px;
  margin-bottom: 20px;
}
.pl-refresh-btn {
  font-family: var(--sans); font-size: 11px; color: var(--soft);
  background: none; border: none; cursor: pointer; padding: 0;
  letter-spacing: 0.02em;
}
.pl-refresh-btn:hover { color: var(--teal); }

/* Intake panel sections */
.intake-stage { margin-bottom: 20px; }
.intake-stage:last-child { margin-bottom: 0; }
.intake-stage-label {
  font-size: 9px; font-weight: 700;
  letter-spacing: 0.13em; text-transform: uppercase;
  color: var(--soft); margin-bottom: 8px; padding-left: 2px;
}

/* Small pipeline cards for three-panel view */
.dp-card {
  background: white;
  border: 1px solid rgba(42,88,80,0.1);
  border-radius: 10px;
  padding: 11px 13px;
  margin-bottom: 7px;
  position: relative;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.dp-card:hover { box-shadow: 0 3px 14px rgba(25,46,42,0.09); border-color: rgba(42,88,80,0.2); }
.dp-card--new { border-left: 3px solid ${C.terra}; }

/* Two-column row inside triage cards */
.dp-card-body  { display: flex; align-items: flex-start; gap: 10px; }
.dp-card-left  { flex: 1; min-width: 0; }
.dp-card-right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; padding-top: 1px; }

.dp-card-name {
  font-size: 13px; font-weight: 500; color: var(--tealDeep);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 2px;
  padding-right: 24px; /* room for menu btn */
}
.dp-card-sub {
  font-size: 11px; color: var(--soft);
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 5px;
}
.dp-card-email {
  font-size: 11px; color: var(--teal); text-decoration: none;
}
.dp-card-email:hover { text-decoration: underline; }
.dp-badge {
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; padding: 2px 7px;
  border-radius: 100px; white-space: nowrap;
}
.dp-badge--new         { background: rgba(190,110,68,0.12); color: ${C.terra}; }
.dp-badge--source      { background: rgba(122,148,143,0.12); color: var(--mid); }
.dp-badge--funder      { background: rgba(42,88,80,0.1); color: var(--teal); }
.dp-badge--needs-log   { background: rgba(190,110,68,0.13); color: var(--terra); }
.dp-badge--action      { background: rgba(200,160,40,0.15); color: #8a6a00; }
.dp-badge--cal         { background: rgba(46,125,138,0.12); color: #1e6e7a; }
.dp-badge--halaxy      { background: rgba(122,90,138,0.12); color: #6a4a7a; }
.dp-badge--status-invoiced  { background: rgba(190,110,68,0.12); color: var(--terra); }
.dp-badge--status-submitted { background: rgba(200,160,40,0.15); color: #8a6a00; }
.dp-badge--status-lodged    { background: rgba(119,207,189,0.18); color: #1a6e5e; }
.dp-badge--status-paid      { background: rgba(42,150,100,0.12); color: #1a7a50; }
.dp-badge--status-pending   { background: rgba(80,100,200,0.10); color: #3a4ab0; }
.dp-badge--upcoming         { background: rgba(74,144,217,0.12); color: #2563a0; }
.dp-badge--needs-recording  { background: rgba(224,123,57,0.12); color: #a0440a; }
.dp-badge--pending-inv      { background: rgba(108,92,231,0.12); color: #4a3ab0; }

/* Unified session list */
.session-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.session-row {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; background: #faf9f7;
  border-radius: 9px; border: 1px solid rgba(0,0,0,0.06);
  cursor: default; flex-wrap: wrap;
}
.session-row--upcoming        { border-left: 3px solid #4a90d9; }
.session-row--needs-recording { border-left: 3px solid #e07b39; }
.session-row--pending-invoice { border-left: 3px solid #6c5ce7; }
.session-row--invoiced        { border-left: 3px solid #27ae60; }
.session-row--paid            { border-left: 3px solid #aaa; }
.session-row--cancelled       { opacity: 0.45; }
.session-row--hidden          { display: none; }
.session-row-date   { font-size: 12px; color: #555; min-width: 120px; flex-shrink: 0; }
.session-row-name   { font-size: 13px; font-weight: 500; flex: 1; min-width: 100px; }
.session-row-badges { display: flex; gap: 4px; flex-shrink: 0; }
.session-row-action { margin-left: auto; flex-shrink: 0; }

/* Session filter pills + view toggle */
.session-filter-bar { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 4px; }
.session-filter-pill {
  font-size: 11px; padding: 3px 10px; border-radius: 20px;
  border: 1px solid rgba(0,0,0,0.12); background: none;
  cursor: pointer; color: #666;
}
.session-filter-pill.active { background: #3a3a3a; color: #fff; border-color: #3a3a3a; }
.session-view-toggle { display: flex; gap: 4px; }
.session-view-btn {
  font-size: 13px; padding: 3px 8px; border-radius: 6px;
  border: 1px solid rgba(0,0,0,0.12); background: none;
  cursor: pointer; color: #888;
}
.session-view-btn.active { background: #3a3a3a; color: #fff; border-color: #3a3a3a; }
.session-divider {
  font-size: 10px; color: #aaa; text-transform: uppercase;
  letter-spacing: 0.08em; padding: 6px 2px 2px;
}

.dp-btn {
  font-family: var(--sans); font-size: 10px; font-weight: 600;
  letter-spacing: 0.04em; padding: 4px 10px;
  border-radius: 6px; border: none; cursor: pointer;
  transition: opacity 0.15s; white-space: nowrap;
}
.dp-btn:hover { opacity: 0.82; }
.dp-btn--primary  { background: var(--teal); color: white; }
.dp-btn--soft     { background: rgba(42,88,80,0.1); color: var(--mid); }
.dp-btn--ghost    { background: transparent; color: var(--soft); border: 1px solid rgba(42,88,80,0.18); }
.dp-btn--ghost:hover { background: rgba(42,88,80,0.06); }
.dp-btn--convert  { background: rgba(42,88,80,0.07); color: var(--teal); border: 1px solid rgba(42,88,80,0.22); }
.dp-btn--pay      { background: rgba(42,150,100,0.12); color: #1a7a50; }
.dp-btn--warn     { background: rgba(190,110,68,0.08); color: var(--terra); }

/* Closed / paid collapsible sections */
.dp-collapsible { margin-top: 16px; }
.dp-collapsible-toggle {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 500; color: var(--soft);
  background: none; border: none; cursor: pointer; padding: 4px 2px;
  width: 100%; text-align: left;
}
.dp-collapsible-toggle:hover { color: var(--teal); }
.dp-collapsible-body { display: none; margin-top: 8px; }
.dp-collapsible-body.open { display: block; }

/* Week calendar */
.week-nav {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-bottom: 12px;
}
.week-nav-label {
  font-size: 12px; font-weight: 500; color: var(--mid);
  flex: 1; text-align: center;
}
.week-nav-btn {
  font-family: var(--sans); font-size: 14px; color: var(--soft);
  background: rgba(42,88,80,0.07); border: none;
  border-radius: 6px; cursor: pointer; padding: 3px 9px;
  transition: all 0.15s; line-height: 1.4;
}
.week-nav-btn:hover { background: rgba(42,88,80,0.14); color: var(--teal); }

.week-cols {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-bottom: 16px;
  min-width: 0;
}
.week-day {
  min-width: 0; border-radius: 8px;
  border: 1px solid rgba(42,88,80,0.08);
  background: rgba(42,88,80,0.02);
  padding: 8px 6px;
}
.week-day--today {
  background: rgba(42,88,80,0.06);
  border-color: rgba(42,88,80,0.18);
}
.week-day-hd {
  text-align: center; margin-bottom: 6px; padding-bottom: 6px;
  border-bottom: 1px solid rgba(42,88,80,0.08);
}
.week-day-name {
  font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--soft);
  display: block; margin-bottom: 2px;
}
.week-day-num {
  font-size: 17px; font-weight: 300;
  color: var(--tealDeep); font-family: var(--serif);
  display: block; line-height: 1;
}
.week-day--today .week-day-num {
  color: white; font-weight: 500;
  background: var(--teal); border-radius: 50%;
  width: 26px; height: 26px; display: inline-flex;
  align-items: center; justify-content: center; font-size: 13px;
}
.week-event {
  background: white;
  border: 1px solid rgba(42,88,80,0.12);
  border-left: 3px solid var(--teal);
  border-radius: 6px;
  padding: 7px 8px;
  margin-bottom: 5px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.week-event:hover { box-shadow: 0 2px 10px rgba(25,46,42,0.1); }
.week-event--cal      { border-left-color: #E07B39; background: linear-gradient(135deg, rgba(224,123,57,0.06) 0%, rgba(245,158,11,0.04) 100%); }
.week-event--halaxy   { border-left-color: ${C.tealMid}; background: rgba(55,107,98,0.04); }
.week-event--personal { border-left-color: #8a9a98; opacity: 0.6; }
.week-event-time {
  color: var(--soft); font-size: 9px; font-weight: 600;
  letter-spacing: 0.04em; margin-bottom: 3px;
}
.week-event-source {
  display: inline-block; font-size: 8px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 1px 5px; border-radius: 3px;
  background: rgba(42,88,80,0.08); color: var(--soft); margin-bottom: 4px;
}
.week-event--cal    .week-event-source { background: rgba(224,123,57,0.12); color: #b85a1e; }
.week-event--halaxy .week-event-source { background: rgba(55,107,98,0.12); color: ${C.tealMid}; }
.week-event--personal .week-event-source { background: rgba(0,0,0,0.08); color: #888; }
.week-event-title {
  font-size: 11px; font-weight: 600; color: var(--tealDeep);
  margin-bottom: 2px; line-height: 1.3;
}
.week-event-sub {
  font-size: 10px; color: var(--soft); line-height: 1.3;
}
.week-event-actions {
  display: none; margin-top: 7px; padding-top: 7px;
  border-top: 1px solid rgba(42,88,80,0.08);
}
.week-event.is-expanded .week-event-actions { display: block; }
.week-event-btn {
  display: inline-block;
  font-family: var(--sans); font-size: 10px; font-weight: 600;
  padding: 5px 10px; border-radius: 5px; border: none;
  background: var(--teal); color: white; cursor: pointer;
  transition: opacity 0.15s; width: 100%; text-align: center;
}
.week-event-btn:hover { opacity: 0.82; }
.week-event-dismiss {
  display: block; margin-top: 5px; width: 100%;
  font-size: 10px; color: var(--soft); background: none; border: none;
  cursor: pointer; padding: 3px; text-align: center;
}
.week-event-dismiss:hover { color: var(--terra); }

/* Needs logging section */
.appt-section-label {
  font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--soft);
  margin-bottom: 8px; padding-left: 2px;
}
.log-card {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  background: rgba(42,88,80,0.025);
  border: 1px solid rgba(42,88,80,0.1);
  border-left: 3px solid var(--mint);
  border-radius: 8px; padding: 9px 11px;
  margin-bottom: 6px;
}
.log-card-info { flex: 1; min-width: 0; }
.log-card-title {
  font-size: 12px; font-weight: 500; color: var(--tealDeep);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.log-card-date { font-size: 10px; color: var(--soft); margin-top: 2px; }
.log-caught-up {
  font-size: 12px; color: var(--soft); padding: 10px 2px;
  font-style: italic;
}

/* Section collapse toggle (week calendar) */
.appt-section-toggle {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--sans); font-size: 9px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--soft); background: none; border: none;
  cursor: pointer; padding: 2px 0; width: 100%;
}
.appt-section-toggle:hover { color: var(--mid); }

/* 7-day actionable appointment cards */
.appt-7day-card {
  background: white;
  border: 1px solid rgba(42,88,80,0.1);
  border-left: 3px solid ${C.tealMid};
  border-radius: 9px; padding: 9px 12px;
  margin-bottom: 7px;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  flex-wrap: wrap;
}
/* Google Calendar — blue-green left border */
.appt-7day-card--cal      { border-left-color: #2e7d8a; }
/* Halaxy clinical — purple left border */
.appt-7day-card--halaxy   { border-left-color: #7a5a8a; }
/* Personal / unnamed block */
.appt-7day-card--personal { border-left-color: #bbb; opacity: 0.5; }
.appt-7day-left  { flex: 1; min-width: 0; }
.appt-7day-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.appt-7day-when  { font-size: 10px; color: var(--soft); margin-bottom: 2px; }
.appt-7day-title { font-size: 12px; font-weight: 500; color: var(--tealDeep); }

/* Billing open header */
.billing-open-header {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 10px;
}
.billing-open-label {
  font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--soft); flex: 1;
}
.billing-open-count {
  font-size: 10px; font-weight: 600; color: var(--mid);
  background: rgba(42,88,80,0.08); padding: 2px 8px; border-radius: 100px;
}
.billing-open-total {
  font-size: 12px; font-weight: 700; color: var(--tealDeep);
}
.bill-card--open    { border-left: 3px solid rgba(190,110,68,0.4); }
.bill-card--pending { border-left: 3px solid rgba(80,100,200,0.35); }

/* Billing cards */
.billing-section-label {
  font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--soft);
  margin-bottom: 8px; margin-top: 16px; padding-left: 2px;
}
.billing-section-label:first-child { margin-top: 0; }
.bill-card {
  background: rgba(42,88,80,0.025);
  border: 1px solid rgba(42,88,80,0.1);
  border-radius: 10px; padding: 10px 12px;
  margin-bottom: 7px;
}
.bill-card-top {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 6px; gap: 8px;
}
.bill-card-name { font-size: 13px; font-weight: 500; color: var(--tealDeep); }
.bill-card-amount { font-size: 13px; font-weight: 600; color: var(--mid); white-space: nowrap; }
.bill-card-meta {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-bottom: 7px;
}
.bill-card-date { font-size: 11px; color: var(--soft); }
.bill-card-ref  { font-size: 10.5px; color: var(--soft); font-variant-numeric: tabular-nums; opacity: 0.75; }

/* Empty states */
.dp-empty {
  font-size: 11px; color: rgba(122,148,143,0.55);
  padding: 8px 2px; font-style: italic;
}
.dp-offline-state {
  padding: 24px 12px; text-align: center;
}
.dp-offline-icon { font-size: 28px; margin-bottom: 8px; }
.dp-offline-title { font-size: 13px; font-weight: 600; color: var(--tealDeep); margin-bottom: 4px; }
.dp-offline-msg { font-size: 11px; color: var(--soft); line-height: 1.5; max-width: 220px; margin: 0 auto; }
.dp-offline-error { font-size: 10px; color: rgba(190,110,68,0.8); margin-top: 8px; font-family: monospace; word-break: break-all; }

/* Integrations status bar (right side of toolbar) */
.pl-integrations {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}

/* Halaxy / Google Cal status chips */
/* ── Chips in dark header ── */
.pl-halaxy-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 100px;
  font-family: var(--sans); font-size: 11px; font-weight: 500;
  background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.55);
  border: 1px solid rgba(255,255,255,0.12);
  cursor: default; position: relative;
  transition: background 0.15s, color 0.15s;
  text-decoration: none;
}
.pl-halaxy-chip:hover { background: rgba(255,255,255,0.13); color: rgba(255,255,255,0.85); }
.pl-halaxy-chip:hover .pl-halaxy-tooltip { opacity: 1; pointer-events: none; transform: translateY(0); }
.pl-gcal-chip { cursor: pointer; }

/* ── Legacy tab stubs (kept for JS compat) ── */
.dash-tab { display: none; }
.dash-icon-btn { display: none; }

/* Tooltip */
.pl-halaxy-tooltip {
  position: absolute; top: calc(100% + 8px); right: 0;
  background: var(--tealDeep); color: rgba(255,255,255,0.88);
  font-size: 11px; line-height: 1.5; font-weight: 400;
  padding: 8px 12px; border-radius: 8px;
  white-space: nowrap; z-index: 50;
  opacity: 0; pointer-events: none;
  transform: translateY(4px);
  transition: opacity 0.15s, transform 0.15s;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
}
.pl-halaxy-tooltip::before {
  content: '';
  position: absolute; bottom: 100%; right: 16px;
  border: 5px solid transparent;
  border-bottom-color: var(--tealDeep);
}
/* pipeline-col styles removed — replaced by dash-panels */

/* Pipeline cards */
.pl-card {
  background: white;
  border-radius: 10px;
  border: 1px solid rgba(42,88,80,0.09);
  padding: 11px 12px;
  margin-bottom: 7px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
  position: relative;
}
.pl-card:hover { box-shadow: 0 3px 14px rgba(25,46,42,0.1); border-color: rgba(42,88,80,0.2); }
.pl-card--new { border-left: 3px solid ${C.terra}; }
.pl-card--active { border-left: 3px solid ${C.teal}; }

.pl-card-name {
  font-size: 13px; font-weight: 500; color: var(--tealDeep);
  margin-bottom: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pl-card-meta {
  font-size: 11px; color: var(--soft);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pl-card-badges {
  display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px;
}
.pl-badge {
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; padding: 2px 7px;
  border-radius: 100px;
}
.pl-badge--new      { background: rgba(190,110,68,0.12); color: ${C.terra}; }
.pl-badge--source   { background: rgba(122,148,143,0.15); color: var(--mid); }
.pl-badge--funder   { background: rgba(42,88,80,0.1); color: var(--teal); }
.pl-badge--pending  { background: rgba(200,160,40,0.15); color: #8a6a00; }
.pl-badge--appt     { background: rgba(119,207,189,0.2); color: #1a6e5e; }
.pl-badge--nohalaxy { background: rgba(190,110,68,0.08); color: ${C.terra}; border: 1px solid rgba(190,110,68,0.2); }

.pl-card-actions {
  display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;
}
.pl-action-btn {
  font-family: var(--sans); font-size: 10px; font-weight: 600;
  letter-spacing: 0.05em; padding: 4px 10px;
  border-radius: 6px; border: none; cursor: pointer;
  transition: opacity 0.15s; white-space: nowrap;
}
.pl-action-btn:hover { opacity: 0.82; }
.pl-action-btn--primary { background: var(--teal); color: white; }
.pl-action-btn--soft    { background: rgba(42,88,80,0.1); color: var(--mid); }
.pl-action-btn--convert { background: rgba(42,88,80,0.07); color: var(--teal); border: 1px solid rgba(42,88,80,0.25); font-style: italic; }
.pl-action-btn--danger  { background: rgba(190,110,68,0.08); color: var(--terra); }

/* ── Card hover menu (⋯) ── */
.pl-card { position: relative; }
.pl-card-menu { position: absolute; top: 6px; right: 6px; z-index: 10; }
.pl-card-menu-btn {
  opacity: 0; transition: opacity 0.12s;
  background: rgba(255,255,255,0.92); border: 1px solid rgba(42,88,80,0.16);
  border-radius: 6px; cursor: pointer; padding: 1px 8px 2px;
  font-size: 16px; letter-spacing: 1px; color: var(--soft);
  line-height: 1.5; font-family: var(--sans);
}
.pl-card:hover .pl-card-menu-btn,
.pl-card-menu-btn.is-open { opacity: 1; background: white; }
.pl-card-dropdown {
  display: none; position: absolute; right: 0; top: calc(100% + 3px);
  background: white; border: 1px solid rgba(42,88,80,0.14);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.13);
  min-width: 180px; overflow: hidden; z-index: 300;
}
.pl-card-dropdown.is-open { display: block; }
.pl-dd-item {
  display: block; width: 100%; text-align: left;
  padding: 9px 14px; font-size: 12px; background: none;
  border: none; border-bottom: 1px solid rgba(42,88,80,0.06);
  cursor: pointer; color: var(--mid); font-family: var(--sans); white-space: nowrap;
}
.pl-dd-item:last-child { border-bottom: none; }
.pl-dd-item:hover { background: rgba(42,88,80,0.05); color: var(--teal); }
.pl-dd-item--warn { color: var(--terra); }
.pl-dd-item--warn:hover { background: rgba(190,110,68,0.06); color: var(--terra); }

/* ── Link-to-client panel ── */
.pl-link-panel {
  margin-top: 8px; padding: 8px;
  background: rgba(42,88,80,0.04); border: 1px solid rgba(42,88,80,0.14);
  border-radius: 8px;
}
.pl-link-panel-title {
  font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--soft); margin-bottom: 6px;
}
.pl-link-input {
  width: 100%; box-sizing: border-box; padding: 6px 9px;
  font-size: 11px; font-family: var(--sans);
  border: 1px solid rgba(42,88,80,0.2); border-radius: 6px;
  background: white; color: var(--dark); outline: none;
}
.pl-link-input:focus { border-color: var(--teal); }
.pl-link-results { margin-top: 5px; max-height: 130px; overflow-y: auto; }
.pl-link-result {
  display: flex; justify-content: space-between; align-items: center;
  padding: 5px 7px; border-radius: 5px; cursor: pointer; font-size: 11px;
}
.pl-link-result:hover { background: rgba(42,88,80,0.08); }
.pl-link-result-name { color: var(--dark); font-weight: 500; }
.pl-link-result-meta { color: var(--soft); font-size: 10px; }
.pl-link-preview {
  padding: 7px 9px; background: rgba(42,88,80,0.07);
  border-radius: 7px; margin-bottom: 6px;
}
.pl-link-preview-name { font-weight: 600; color: var(--teal); font-size: 12px; margin-bottom: 2px; }
.pl-link-preview-meta { color: var(--soft); font-size: 10px; }
/* Fee row inside session panel */
.pl-fee-row {
  display: flex; align-items: center; gap: 5px; margin-top: 8px;
}
.pl-fee-label  { font-size: 11px; color: var(--soft); white-space: nowrap; }
.pl-fee-currency { font-size: 13px; font-weight: 600; color: var(--mid); }
.pl-fee-input  {
  width: 80px; padding: 5px 7px; font-size: 13px; font-weight: 600;
  font-family: var(--sans); border: 1px solid rgba(42,88,80,0.25);
  border-radius: 6px; background: white; color: var(--dark);
  text-align: right; outline: none;
}
.pl-fee-input:focus { border-color: var(--teal); }
.pl-fee-funder { font-size: 10px; color: var(--soft); }
.pl-action-btn--danger  { background: rgba(190,110,68,0.1); color: var(--terra); }

/* Expanded card detail */
.pl-card-detail {
  display: none; margin-top: 10px; padding-top: 10px;
  border-top: 1px solid rgba(42,88,80,0.08);
}
.pl-card.expanded .pl-card-detail { display: block; }
.pl-detail-row {
  font-size: 11px; color: var(--mid);
  margin-bottom: 5px; line-height: 1.5;
}
.pl-detail-row strong { color: var(--tealDeep); }
.pl-detail-sessions {
  margin-top: 8px;
}
.pl-session-mini {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; padding: 4px 0;
  border-bottom: 1px solid rgba(42,88,80,0.05);
  gap: 8px;
}
.pl-session-mini:last-child { border-bottom: none; }

/* Halaxy status dot */
.halaxy-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.halaxy-dot--loading  { background: var(--soft); }
.halaxy-dot--ok       { background: #2a9a60; }
.halaxy-dot--error    { background: var(--terra); }

/* Skeleton loading cards */
.pl-loading {
  display: flex; flex-direction: column; gap: 7px; padding: 2px 0;
}
.pl-skeleton {
  background: linear-gradient(90deg, rgba(42,88,80,0.07) 25%, rgba(42,88,80,0.12) 50%, rgba(42,88,80,0.07) 75%);
  background-size: 200% 100%;
  animation: pl-shimmer 1.4s ease-in-out infinite;
  border-radius: 10px;
}
@keyframes pl-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Initial page-load branded splash ── */
@keyframes init-logo-breathe {
  0%,100% { opacity: 0.05; }
  50%      { opacity: 0.10; }
}
@keyframes init-skel-wave {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.init-loader {
  display: flex; align-items: center; justify-content: center;
  padding: 56px 0 24px;
}
.init-logo {
  width: 140px; height: 140px;
  filter: brightness(12);
  animation: init-logo-breathe 3.5s ease-in-out infinite;
}
.init-skel-grid {
  display: grid; grid-template-columns: repeat(4,1fr); gap: 12px;
  margin: 28px 28px 14px;
}
.init-skel-list { display: flex; flex-direction: column; gap: 8px; margin: 0 28px; }
.init-skel {
  border-radius: 12px;
  background: linear-gradient(90deg,
    rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
  background-size: 200% 100%;
  animation: init-skel-wave 2.6s ease-in-out infinite;
}
.pl-empty { font-size: 11px; color: rgba(122,148,143,0.6); padding: 8px 2px; font-style: italic; }

/* Halaxy link section inside client card */
.pl-halaxy-section {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid rgba(42,88,80,0.08);
}
.pl-halaxy-linked {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 11px;
}
.pl-halaxy-linked-label { color: #1a7a50; font-weight: 600; }
.pl-halaxy-id-val { color: var(--soft); font-size: 10px; font-family: monospace; background: rgba(42,88,80,0.06); padding: 2px 6px; border-radius: 4px; }
.pl-halaxy-open { font-size: 10px; color: var(--teal); text-decoration: none; }
.pl-halaxy-open:hover { text-decoration: underline; }
.pl-halaxy-clear-btn { font-family: var(--sans); font-size: 10px; color: var(--soft); background: none; border: none; cursor: pointer; padding: 0; }
.pl-halaxy-clear-btn:hover { color: var(--terra); }
.pl-halaxy-unlinked { font-size: 11px; }
.pl-halaxy-steps { color: var(--soft); margin-bottom: 7px; line-height: 1.5; }
.pl-halaxy-steps strong { color: var(--mid); }
.pl-halaxy-input-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.pl-halaxy-input {
  flex: 1; min-width: 120px;
  font-family: var(--sans); font-size: 11px; color: var(--tealDeep);
  border: 1px solid rgba(42,88,80,0.2); border-radius: 6px;
  padding: 5px 8px; background: white; outline: none;
  transition: border-color 0.2s;
}
.pl-halaxy-input:focus { border-color: var(--teal); }
.pl-halaxy-input::placeholder { color: var(--soft); }

/* Intake panel inside pipeline card */
.pl-intake-panel { margin-top: 8px; display: none; }
.pl-intake-panel.open { display: block; }
.pl-intake-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.pl-intake-sel, .pl-intake-url {
  font-family: var(--sans); font-size: 11px;
  padding: 5px 8px; border-radius: 6px;
  border: 1px solid rgba(42,88,80,0.2); outline: none;
  background: white; color: var(--tealDeep); flex: 1; min-width: 0;
}
.pl-intake-send {
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  padding: 5px 10px; border-radius: 6px; border: none;
  background: var(--teal); color: white; cursor: pointer; white-space: nowrap;
}

/* ── Dark-theme token restore — must be LAST to win the cascade.
   admin-dashboard.css <link> loads before this <style> block, so
   its :root tokens get overridden by the legacy light-theme :root above.
   Re-declaring here ensures var(--teal) etc. resolve to dark-theme values
   throughout admin-dashboard.css's 60+ usages. ── */
:root {
  --teal:     #34D399;
  --teal-a:   rgba(52,211,153,0.22);
  --amber:    #FBBF24;
  --amber-a:  rgba(251,191,36,0.22);
  --canvas:   #080C18;
}
</style>
</head>
<body>

<div class="app-shell" id="app-shell">

  <!-- sidebar removed — navigation lives in app-topbar -->

  <!-- ── App main ── -->
  <div class="app-main" id="app-main">

    <!-- ── Mobile logo bar (always visible on mobile, hidden on desktop) ── -->
    <div class="mob-logo-bar" id="mob-logo-bar">
      <img src="/assets/logo.svg" class="mob-logo-img" alt="">
    </div>

    <!-- ── Mobile persistent header (greeting, date, summary) ── -->
    <div id="mob-hd"></div>

    <!-- ── Brand topbar (desktop) ── -->
    <header class="app-topbar" id="app-topbar">

      <!-- Brand (left) -->
      <div class="topbar-brand" onclick="navigateTo('home')" style="cursor:pointer">
        <img src="/assets/logo.svg" class="topbar-logo" alt="" width="28" height="28">
        <div>
          <span class="topbar-brand-nm"><em>Cheree</em> McGarry</span>
          <span class="topbar-brand-sub">Practice Admin</span>
        </div>
      </div>

      <!-- + Add (sits right next to brand) -->
      <div style="position:relative;flex-shrink:0;margin-left:14px" id="sb-add-wrap">
        <button class="topbar-add-btn" onclick="toggleAddMenu()">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
          </svg>
          Add
        </button>
        <div class="dh-add-menu" id="dh-add-menu" style="display:none">
          <button class="dh-add-item" onclick="closeAddMenu();openDbModal('client')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            Client
          </button>
          <button class="dh-add-item" onclick="closeAddMenu();openDbModal('appt')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Appointment
          </button>
          <button class="dh-add-item" onclick="closeAddMenu();focusReminderInp()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            Reminder
          </button>
        </div>
      </div>

      <!-- Context: clients view search + add buttons (hidden by default) -->
      <div class="db-search-wrap" style="display:none" id="db-search-wrap">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="var(--db-t3)"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398l3.85 3.85a1 1 0 001.415-1.415l-3.868-3.833zm-5.242 1.656a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"/></svg>
        <input type="text" placeholder="Search clients…" id="db-search-input">
      </div>
      <button class="db-btn-ghost" id="db-btn-appt" onclick="openDbModal('appt')" style="display:none">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 0a.5.5 0 01.5.5V1h8V.5a.5.5 0 011 0V1h1a2 2 0 012 2v11a2 2 0 01-2 2H2a2 2 0 01-2-2V3a2 2 0 012-2h1V.5a.5.5 0 01.5-.5zM1 4v10a1 1 0 001 1h12a1 1 0 001-1V4H1z"/></svg>
        Add Appointment
      </button>
      <button class="db-btn-primary" id="db-btn-client" onclick="openDbModal('client')" style="display:none">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z"/><path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0 1A8 8 0 108 0a8 8 0 000 16z"/></svg>
        Add Client
      </button>

      <div style="flex:1"></div>

      <!-- Refresh (visible, far right before settings) -->
      <button id="pl-refresh-btn" class="topbar-refresh-btn" onclick="refreshPipeline()" title="Refresh data">↺</button>

      <!-- Settings (far right) -->
      <button class="topbar-icon-btn" data-view="settings" onclick="navigateTo('settings')" title="Settings">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      </button>

      <!-- Hidden DOM nodes kept for JS state management -->
      <span class="sidebar-dot loading" id="sb-halaxy-dot" style="display:none"></span>
      <span id="sb-halaxy-label" style="display:none"></span>
      <span class="sidebar-dot loading" id="sb-gcal-dot" style="display:none"></span>
      <span id="sb-gcal-label" style="display:none"></span>

    </header>

    <!-- Floating settings cog — desktop only, top-right corner -->
    <button class="dh-desk-settings-btn" id="dh-desk-settings-btn" onclick="toggleDesktopSettings()" title="Settings" aria-label="Settings">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    </button>

    <!-- Content + right detail panel -->
    <div class="app-content">
      <div class="view-content" id="view-content">
        <!-- branded loading state — replaced by JS on data load -->
        <div class="init-loader">
          <img src="/assets/logo.svg" class="init-logo" alt="">
        </div>
        <div class="init-skel-grid">
          ${[80,80,80,80].map(h=>`<div class="init-skel" style="height:${h}px"></div>`).join('')}
        </div>
        <div class="init-skel-list">
          ${[68,68,68].map(h=>`<div class="init-skel" style="height:${h}px"></div>`).join('')}
        </div>
      </div>
      <!-- Detail panel (slide in from right) -->
      <div class="db-detail-panel" id="dbDetailPanel">
        <div class="db-dp-inner">
          <div class="db-dp-head" id="dbDpHead"></div>
          <div class="db-dp-tabs" id="dbDpTabs"></div>
          <div class="db-dp-body" id="dbDpBody"></div>
        </div>
      </div>
    </div>

    <!-- ── Mobile dock (flex-column child — sits at bottom naturally on mobile) ── -->
    <nav class="mob-dock" id="mob-dock">
      <div class="mob-dock-pill">
        <!-- Home -->
        <button class="mob-dock-item active" data-app="home" onclick="mobSwitchApp('home')" aria-label="Home">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>
        <!-- Inbox -->
        <button class="mob-dock-item" data-app="queue" onclick="mobSwitchApp('queue')" aria-label="Inbox">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
        </button>
        <!-- Add / More (centre) -->
        <button class="mob-dock-center" id="mob-dock-center-btn" onclick="toggleMobActionSheet()" aria-label="Menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <!-- Schedule -->
        <button class="mob-dock-item" data-app="sched" onclick="mobSwitchApp('sched')" aria-label="Schedule">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/></svg>
        </button>
        <!-- Billing -->
        <button class="mob-dock-item" data-app="billing" onclick="mobSwitchApp('billing')" aria-label="Billing">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>
        </button>
      </div>
    </nav>

  </div><!-- /.app-main -->

</div><!-- /.app-shell -->

<!-- ── Mobile action sheet (^ button) ── -->
<div class="mob-action-sheet" id="mob-action-sheet" onclick="if(event.target===this)closeMobActionSheet()">
  <div class="mob-action-panel">
    <div class="mob-action-handle"></div>

    <div class="mob-action-section">Add</div>
    <div class="mob-action-grid">
      <button class="mob-action-tile" onclick="closeMobActionSheet();openDbModal('client')">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        Client
      </button>
      <button class="mob-action-tile" onclick="closeMobActionSheet();openDbModal('appt')">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Appointment
      </button>
      <button class="mob-action-tile" onclick="closeMobActionSheet();openAddReminderModal()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        Reminder
      </button>
    </div>

    <div class="mob-action-divider"></div>
    <div class="mob-action-section">More</div>
    <div class="mob-action-rows">
      <button class="mob-action-row" onclick="closeMobActionSheet();mobSwitchApp('sched')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Schedule
      </button>
      <button class="mob-action-row" onclick="closeMobActionSheet();navigateTo('settings')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Settings
      </button>
      <a class="mob-action-row" href="https://www.halaxy.com" target="_blank" rel="noopener" onclick="closeMobActionSheet()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Open Halaxy
      </a>
      <a class="mob-action-row mob-action-row--signout" href="?logout" onclick="closeMobActionSheet()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign Out
      </a>
    </div>
  </div>
</div>

<!-- ── Mobile splash (fixed overlay, shown during initial load on mobile only) ── -->
<div id="mob-splash">
  <img src="/assets/logo.svg" id="mob-splash-logo" alt="">
  <div class="mob-splash-loader" id="mob-splash-loader">
    <div class="mob-splash-pulse"></div>
  </div>
</div>

<!-- ── Detail modal ── -->
<div class="modal-overlay" id="modal-overlay" onclick="if(event.target===this)closeDetailPanel()">
  <div class="modal-card" id="modal-card">
    <div class="modal-header">
      <button class="modal-back" onclick="closeDetailPanel()" aria-label="Back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <div class="modal-title" id="rdp-title">Detail</div>
      <button class="modal-close" onclick="closeDetailPanel()">×</button>
    </div>
    <div class="rdp-body" id="rdp-body"></div>
  </div>
</div>

<!-- ══ ADD CLIENT MODAL ══ -->
<div class="db-modal-overlay" id="db-modal-client" onclick="if(event.target===this)closeDbModal('db-modal-client')">
  <div class="db-modal">
    <div class="db-modal-hdr">
      <div>
        <div class="db-modal-title" id="db-modal-client-title">Add Client</div>
        <div class="db-modal-sub">Add a new client to the onboarding queue</div>
      </div>
      <button class="db-modal-close" onclick="closeDbModal('db-modal-client')">×</button>
    </div>
    <div class="db-modal-body">
      <div class="db-form-row">
        <div class="db-form-grp"><label class="db-form-lbl">First Name</label><input class="db-form-input" id="db-cl-fname" type="text" placeholder="Sarah"></div>
        <div class="db-form-grp"><label class="db-form-lbl">Last Name</label><input class="db-form-input" id="db-cl-lname" type="text" placeholder="Bell"></div>
      </div>
      <div class="db-form-row">
        <div class="db-form-grp"><label class="db-form-lbl">Email</label><input class="db-form-input" id="db-cl-email" type="email" placeholder="sarah@email.com"></div>
        <div class="db-form-grp"><label class="db-form-lbl">Phone</label><input class="db-form-input" id="db-cl-phone" type="tel" placeholder="04xx xxx xxx"></div>
      </div>
      <div class="db-form-row">
        <div class="db-form-grp"><label class="db-form-lbl">Source</label>
          <select class="db-form-input" id="db-cl-source">
            <option value="">How did they find us?</option>
            <option value="website">Website form</option>
            <option value="email">Direct email</option>
            <option value="phone">Phone call</option>
            <option value="gp_referral">GP referral</option>
            <option value="eap">EAP referral</option>
            <option value="word_of_mouth">Word of mouth</option>
          </select>
        </div>
        <div class="db-form-grp"><label class="db-form-lbl">Funder Type</label>
          <select class="db-form-input" id="db-cl-funder" onchange="this.style.outline=''">
            <option value="">Select funder type *</option>
            <option value="private">Private</option>
            <option value="medicare">Medicare</option>
            <option value="ndis_plan">NDIS Plan Managed</option>
            <option value="ndis_self">NDIS Self Managed</option>
            <option value="qfes">QFES / EAP</option>
            <option value="workcover">WorkCover</option>
            <option value="dva">DVA</option>
          </select>
        </div>
      </div>
      <div class="db-form-row">
        <div class="db-form-grp full"><label class="db-form-lbl">Notes</label><input class="db-form-input" id="db-cl-notes" type="text" placeholder="e.g. GP referral for anxiety — Dr Smith"></div>
      </div>
    </div>
    <div class="db-modal-ftr">
      <button class="db-btn-ghost" onclick="closeDbModal('db-modal-client')">Cancel</button>
      <button class="db-btn-primary" id="db-cl-next" onclick="_dbClientNextOrSave()">Save →</button>
    </div>
  </div>
</div>

<!-- ══ ADD APPOINTMENT MODAL ══ -->
<div class="db-modal-overlay" id="db-modal-appt" onclick="if(event.target===this)closeDbModal('db-modal-appt')">
  <div class="db-modal">
    <div class="db-modal-hdr">
      <div>
        <div class="db-modal-title">Add Appointment</div>
        <div class="db-modal-sub">Log an appointment or intake call in the dashboard</div>
      </div>
      <button class="db-modal-close" onclick="closeDbModal('db-modal-appt')">×</button>
    </div>
    <div class="db-modal-body">
      <div>
        <div class="db-form-row">
          <div class="db-form-grp full"><label class="db-form-lbl">Client</label>
            <div class="ccl-wrap" id="db-ap-ob-client-wrap">
              <input type="hidden" id="db-ap-ob-client" value="">
              <button class="ccl-btn" type="button" id="db-ap-ob-client-btn" onclick="_cclToggle('db-ap-ob-client')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span class="ccl-btn-lbl" id="db-ap-ob-client-display">Select client…</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="ccl-popup" id="db-ap-ob-client-popup" style="display:none">
                <div class="ccl-search-row">
                  <input class="ccl-search" id="db-ap-ob-client-search" type="text" placeholder="Search clients…" oninput="_cclFilter('db-ap-ob-client')" autocomplete="off">
                </div>
                <div class="ccl-list" id="db-ap-ob-client-list"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="db-form-row">
          <div class="db-form-grp"><label class="db-form-lbl">Date</label><input class="db-form-input" id="db-ap-ob-date" type="date"></div>
          <div class="db-form-grp"><label class="db-form-lbl">Time</label><input class="db-form-input" id="db-ap-ob-time" type="time" value="10:00"></div>
        </div>
        <div class="db-form-row">
          <div class="db-form-grp full"><label class="db-form-lbl">Type</label>
            <select class="db-form-input" id="db-ap-ob-type">
              <option value="intake">Intake / First call</option>
              <option value="session">Appointment</option>
              <option value="admin">Admin / No charge</option>
            </select>
          </div>
        </div>
        <div class="db-form-row">
          <div class="db-form-grp full"><label class="db-form-lbl">Notes</label><input class="db-form-input" id="db-ap-ob-notes" type="text" placeholder="Optional notes…"></div>
        </div>
      </div>
    </div>
    <div class="db-modal-ftr">
      <button class="db-btn-ghost" onclick="closeDbModal('db-modal-appt')">Cancel</button>
      <button class="db-btn-primary" id="db-ap-next" onclick="_dbApptNextOrSave()">Save →</button>
    </div>
  </div>
</div>

<!-- ── Mini modal (close reason, log interaction, etc.) ── -->
<div class="mm-ov" id="mini-modal-ov" onclick="if(event.target===this)this.classList.remove('open')"></div>

<!-- ── Command bar ── -->
<div class="cmd-overlay" id="cmd-overlay" onclick="if(event.target===this)closeCmdBar()">
  <div class="cmd-bar">
    <div class="cmd-input-row">
      <span class="cmd-search-icon">⌕</span>
      <input class="cmd-input" id="cmd-input" placeholder="Search clients, sessions, or navigate…" autocomplete="off" oninput="renderCmdResults()" onkeydown="cmdKeyNav(event)">
      <kbd class="cmd-kbd">Esc</kbd>
    </div>
    <div class="cmd-results" id="cmd-results"></div>
    <div class="cmd-footer">
      <span><kbd>↑↓</kbd> navigate</span>
      <span><kbd>↵</kbd> select</span>
      <span><kbd>Esc</kbd> close</span>
    </div>
  </div>
</div>

<!-- Hidden compat elements for old JS functions that look up these IDs -->
<div style="display:none">
  <div id="dash-hello-greet"></div>
  <div id="dash-hello-items"></div>
  <span id="halaxy-status-dot" class="halaxy-dot"></span>
  <span id="halaxy-chip-label"></span>
  <span id="halaxy-tooltip"></span>
  <span id="gcal-status-dot" class="halaxy-dot"></span>
  <span id="gcal-chip-label"></span>
  <span id="gcal-tooltip"></span>
  <span id="halaxy-sync-btn"></span>
  <span id="intake-count"></span>
  <span id="billing-count"></span>
  <span id="clients-count"></span>
  <div id="intake-panel-body"></div>
  <div id="appointments-panel-body"></div>
  <div id="clients-panel-body"></div>
</div>

<!-- Add client modal -->
<div class="cl-modal-ov" id="add-client-modal" onclick="if(event.target===this)closeAddClient()">
  <div class="cl-modal">
    <h2 class="cl-modal-title">Add <em>client</em></h2>

    <!-- Mode toggle -->
    <div class="cl-mode-toggle">
      <button class="cl-mode-btn cl-mode-btn--active" id="cl-mode-search-btn" onclick="setClientModalMode('search')">Import from Halaxy</button>
      <button class="cl-mode-btn" id="cl-mode-new-btn" onclick="setClientModalMode('new')">New in Halaxy</button>
      <button class="cl-mode-btn" id="cl-mode-dash-btn" onclick="setClientModalMode('dashboard')">Dashboard only</button>
    </div>

    <!-- ── FIND MODE: search existing Halaxy patients ── -->
    <div id="cl-find-mode">
      <p style="font-size:11.5px;color:#9AABA8;margin:0 0 12px;line-height:1.5">
        Link an existing Halaxy patient to the dashboard — useful for clients who were in Halaxy before this dashboard existed.
      </p>
      <div class="cl-modal-field">
        <label>Search Halaxy by name</label>
        <input class="cl-modal-input" id="cl-halaxy-search" type="text" placeholder="Start typing a name…"
          autocomplete="off" oninput="_debounceModalHalaxySearch(this.value)">
        <input type="hidden" id="cl-halaxy-id">
        <div id="cl-halaxy-lookup" style="margin-top:6px"></div>
      </div>
      <!-- Shown after a patient is selected -->
      <div id="cl-find-selected" style="display:none">
        <div class="cl-modal-field">
          <label for="cl-display-name">Dashboard alias <span style="font-weight:400;color:var(--soft)">(e.g. Sarah J.)</span></label>
          <input class="cl-modal-input" id="cl-display-name" type="text" placeholder="e.g. Sarah J.">
        </div>
        <div class="cl-modal-field">
          <label for="cl-funder">Funder</label>
          <select class="cl-modal-select" id="cl-funder" onchange="onModalFunderChange(this)">
            <option value="">Loading…</option>
          </select>
        </div>
        <div class="cl-modal-field" id="plan-manager-field" style="display:none">
          <label for="cl-plan-manager">Plan manager name</label>
          <input class="cl-modal-input" id="cl-plan-manager" type="text" placeholder="e.g. ABC Plan Management">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="cl-modal-field">
            <label for="cl-client-type">Client type</label>
            <select class="cl-modal-select" id="cl-client-type" onchange="onClientTypeChange(this,'find')">
              <option value="individual">Individual</option>
              <option value="couples">Couples</option>
              <option value="child">Child</option>
            </select>
          </div>
          <div class="cl-modal-field">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="cl-is-contact" style="margin:0"> Contact only
            </label>
            <div style="font-size:10px;color:#9AABA8;margin-top:2px">Non-billable (referrer, parent etc.)</div>
          </div>
        </div>
        <div class="cl-modal-field" id="cl-parent-field" style="display:none">
          <label for="cl-parent-id">Parent/Guardian client</label>
          <input class="cl-modal-input" id="cl-parent-search" type="text" placeholder="Search client by name…"
            autocomplete="off" oninput="_debounceParentSearch(this.value,'find')">
          <input type="hidden" id="cl-parent-id">
          <div id="cl-parent-results" style="margin-top:4px"></div>
        </div>
        <div class="cl-modal-field">
          <label for="cl-notes">Notes (optional)</label>
          <input class="cl-modal-input" id="cl-notes" type="text" placeholder="Any useful context…">
        </div>
      </div>
    </div>

    <!-- ── NEW MODE: create patient in Halaxy ── -->
    <div id="cl-new-mode" style="display:none">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="cl-modal-field">
          <label for="cl-first-name">First name <span style="color:var(--terra)">*</span></label>
          <input class="cl-modal-input" id="cl-first-name" type="text" placeholder="e.g. Sarah">
        </div>
        <div class="cl-modal-field">
          <label for="cl-last-name">Last name <span style="color:var(--terra)">*</span></label>
          <input class="cl-modal-input" id="cl-last-name" type="text" placeholder="e.g. Jones">
        </div>
      </div>
      <div class="cl-modal-field">
        <label for="cl-new-phone">Phone (optional)</label>
        <input class="cl-modal-input" id="cl-new-phone" type="tel" placeholder="04xx xxx xxx">
      </div>
      <div class="cl-modal-field">
        <label for="cl-new-email">Email (optional)</label>
        <input class="cl-modal-input" id="cl-new-email" type="email" placeholder="sarah@example.com">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="cl-modal-field">
          <label for="cl-new-dob">Date of birth (optional)</label>
          <input class="cl-modal-input" id="cl-new-dob" type="date">
        </div>
        <div class="cl-modal-field">
          <label for="cl-new-gender">Gender (optional)</label>
          <select class="cl-modal-select" id="cl-new-gender">
            <option value="">— select —</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="unknown">Prefer not to say</option>
          </select>
        </div>
      </div>
      <div class="cl-modal-field">
        <label for="cl-new-funder">Funder</label>
        <select class="cl-modal-select" id="cl-new-funder" onchange="onModalFunderChange(this, 'new')">
          <option value="">Loading…</option>
        </select>
      </div>
      <div class="cl-modal-field" id="plan-manager-field-new" style="display:none">
        <label for="cl-new-plan-manager">Plan manager name</label>
        <input class="cl-modal-input" id="cl-new-plan-manager" type="text" placeholder="e.g. ABC Plan Management">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="cl-modal-field">
          <label for="cl-new-client-type">Client type</label>
          <select class="cl-modal-select" id="cl-new-client-type" onchange="onClientTypeChange(this,'new')">
            <option value="individual">Individual</option>
            <option value="couples">Couples</option>
            <option value="child">Child</option>
          </select>
        </div>
        <div class="cl-modal-field">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="cl-new-is-contact" style="margin:0"> Contact only
          </label>
          <div style="font-size:10px;color:#9AABA8;margin-top:2px">Non-billable (referrer, parent etc.)</div>
        </div>
      </div>
      <div class="cl-modal-field" id="cl-new-parent-field" style="display:none">
        <label for="cl-new-parent-id">Parent/Guardian client</label>
        <input class="cl-modal-input" id="cl-new-parent-search" type="text" placeholder="Search client by name…"
          autocomplete="off" oninput="_debounceParentSearch(this.value,'new')">
        <input type="hidden" id="cl-new-parent-id">
        <div id="cl-new-parent-results" style="margin-top:4px"></div>
      </div>
      <div class="cl-modal-field">
        <label for="cl-new-notes">Notes (optional)</label>
        <input class="cl-modal-input" id="cl-new-notes" type="text" placeholder="Any useful context…">
      </div>
    </div>

    <!-- ── DASHBOARD ONLY MODE: Supabase record only, no Halaxy ── -->
    <div id="cl-dash-mode" style="display:none">
      <p style="font-size:11.5px;color:#9AABA8;margin:0 0 12px;line-height:1.5">
        Adds a client to the dashboard without creating or linking a Halaxy record.
        Useful for contacts, referrers, or clients not yet in Halaxy.
      </p>
      <div class="cl-modal-field">
        <label for="cl-dash-name">Display name <span style="color:var(--terra)">*</span></label>
        <input class="cl-modal-input" id="cl-dash-name" type="text" placeholder="e.g. Alex T.">
      </div>
      <div class="cl-modal-field">
        <label for="cl-dash-funder">Funder</label>
        <select class="cl-modal-select" id="cl-dash-funder" onchange="onModalFunderChange(this,'dash')">
          <option value="">Loading…</option>
        </select>
      </div>
      <div class="cl-modal-field" id="plan-manager-field-dash" style="display:none">
        <label for="cl-dash-plan-manager">Plan manager name</label>
        <input class="cl-modal-input" id="cl-dash-plan-manager" type="text" placeholder="e.g. ABC Plan Management">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="cl-modal-field">
          <label for="cl-dash-client-type">Client type</label>
          <select class="cl-modal-select" id="cl-dash-client-type">
            <option value="individual">Individual</option>
            <option value="couples">Couples</option>
            <option value="child">Child</option>
          </select>
        </div>
        <div class="cl-modal-field">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="cl-dash-is-contact" style="margin:0"> Contact only
          </label>
          <div style="font-size:10px;color:#9AABA8;margin-top:2px">Non-billable (referrer, parent etc.)</div>
        </div>
      </div>
      <div class="cl-modal-field">
        <label for="cl-dash-notes">Notes (optional)</label>
        <input class="cl-modal-input" id="cl-dash-notes" type="text" placeholder="Any useful context…">
      </div>
    </div>

    <div id="cl-modal-error" style="display:none;color:var(--terra);font-size:12px;margin-top:8px"></div>
    <div class="cl-modal-actions">
      <button class="cl-modal-cancel" onclick="closeAddClient()">Cancel</button>
      <button class="cl-modal-save" id="cl-modal-save-btn" onclick="saveNewClient()">Add client</button>
    </div>
  </div>
</div>

<!-- Create Appointment modal (from Website Contact) -->
<div class="cl-modal-ov" id="create-session-modal" onclick="if(event.target===this)closeCreateSessionModal()">
  <div class="cl-modal" style="max-width:480px">
    <h2 class="cl-modal-title">Create <em>appointment</em></h2>

    <!-- Contact info (read-only) -->
    <div id="cs-contact-card" style="background:rgba(42,88,80,0.05);border-radius:10px;padding:11px 14px;margin-bottom:14px;font-size:13px;line-height:1.5"></div>

    <!-- Halaxy patient match -->
    <div class="cl-modal-field">
      <label>Halaxy patient</label>
      <div id="cs-halaxy-status" style="margin-bottom:4px"></div>
      <input class="cl-modal-input" id="cs-halaxy-search" type="text" placeholder="Search by name…"
        autocomplete="off" oninput="_debounceCsSearch(this.value)" style="display:none">
      <div id="cs-halaxy-results"></div>
      <input type="hidden" id="cs-halaxy-id">
      <input type="hidden" id="cs-halaxy-name">
    </div>

    <!-- Funder -->
    <div class="cl-modal-field">
      <label for="cs-funder">Funder</label>
      <select class="cl-modal-select" id="cs-funder" onchange="onCsFunderChange(this)">
        <option value="">Select funder…</option>
      </select>
    </div>

    <!-- Plan manager (NDIS only) -->
    <div class="cl-modal-field" id="cs-pm-field" style="display:none">
      <label for="cs-plan-manager">Plan manager</label>
      <input class="cl-modal-input" id="cs-plan-manager" type="text" placeholder="e.g. In Choice Plan Management">
    </div>

    <!-- Appointment date/time -->
    <div class="cl-modal-field">
      <label for="cs-session-date">Appointment date / time</label>
      <input class="cl-modal-input" id="cs-session-date" type="datetime-local">
    </div>

    <!-- Fee -->
    <div class="cl-modal-field" id="cs-fee-row" style="display:none">
      <label>Fee</label>
      <select class="cl-modal-select" id="cs-fee" onchange="_syncCsFeeAmt()">
        <option value="">— select fee —</option>
      </select>
      <div style="display:flex;align-items:center;gap:6px;margin-top:5px">
        <span style="color:var(--soft);font-size:13px">$</span>
        <input class="cl-modal-input" id="cs-fee-amt" type="number" step="0.01" min="0"
          placeholder="or enter amount" style="margin:0">
      </div>
    </div>

    <!-- Notes -->
    <div class="cl-modal-field">
      <label for="cs-notes">Notes (optional)</label>
      <input class="cl-modal-input" id="cs-notes" type="text" placeholder="Appointment notes…">
    </div>

    <div class="cl-modal-actions">
      <button class="cl-modal-cancel" onclick="closeCreateSessionModal()">Cancel</button>
      <button class="cl-modal-save" id="cs-save-btn" onclick="saveCreateSession()">Create appointment →</button>
    </div>
  </div>
</div>

<script>window.ADMIN_USER = '${currentUser?.name || ''}';</script>
<script src="/js/admin-ui.js?v=${process.env.VERCEL_GIT_COMMIT_SHA || Date.now()}"></script>
<script>
function switchTab(tab, btn) { /* legacy compat — no-op */ }

// Boot
(function() {
  var params = new URLSearchParams(location.search);
  var gcal = params.get('gcal');
  if (gcal === 'connected')  setTimeout(function(){ toast('Google Calendar connected!'); }, 300);
  if (gcal === 'error')      setTimeout(function(){ toast('Google Calendar connection failed — try again.', 'err'); }, 300);
  if (gcal === 'no_refresh') setTimeout(function(){ toast('No refresh token returned — visit /api/google-auth again to reconnect.', 'err'); }, 300);
  loadPipeline();
})();
</script>
</body>
</html>`;
}

export default async function handler(req, res) {
  // Logout
  if (req.method === 'GET' && (req.query?.logout || req.url?.includes('logout'))) {
    clearSessionCookie(res);
    res.writeHead(302, { Location: '/admin-login' });
    return res.end();
  }

  // Auth gate
  if (!isAuthed(req)) {
    res.writeHead(302, { Location: '/admin-login' });
    return res.end();
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const currentUser = getSessionUser(req);
  const db = supabase();

  const [{ data: enquiries }, { data: tasks }] = await Promise.all([
    db.from('enquiries').select('*').order('created_at', { ascending: false }),
    db.from('tasks').select('*').order('created_at', { ascending: true }),
  ]);

  // Non-fatal: activity_log may not exist yet on older deployments
  let activityRaw = [];
  try {
    const { data } = await db.from('activity_log').select('*').order('created_at', { ascending: false });
    activityRaw = data || [];
  } catch (_) {}

  // Group activity by enquiry_id (already desc so first = latest)
  const activityByEnquiry = {};
  (activityRaw || []).forEach(a => {
    if (!activityByEnquiry[a.enquiry_id]) activityByEnquiry[a.enquiry_id] = [];
    if (activityByEnquiry[a.enquiry_id].length < 3) activityByEnquiry[a.enquiry_id].push(a);
  });

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(adminPage({
    enquiries:         enquiries         || [],
    tasks:             tasks             || [],
    currentUser,
    activityByEnquiry,
  }));
}
