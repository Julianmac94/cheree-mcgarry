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
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin · Cheree McGarry</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Raleway:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --cream:    ${C.cream};
  --tealDeep: ${C.tealDeep};
  --teal:     ${C.teal};
  --tealMid:  ${C.tealMid};
  --mint:     ${C.mint};
  --terra:    ${C.terra};
  --soft:     ${C.soft};
  --mid:      ${C.mid};
  --sans:     'Raleway', sans-serif;
  --serif:    'Cormorant Garamond', serif;
}

body {
  background: #f0ece2;
  font-family: var(--sans);
  color: var(--tealDeep);
  min-height: 100svh;
}

/* ── Top bar ── */
.topbar {
  position: sticky; top: 0; z-index: 100;
  background: var(--tealDeep);
  padding: 0 32px;
  height: 56px;
  display: flex; align-items: center; justify-content: space-between;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.3);
}
.topbar-brand {
  display: flex; align-items: center; gap: 10px;
}
.topbar-dot {
  width: 24px; height: 24px;
  background: var(--teal);
  border-radius: 50%;
}
.topbar-name {
  font-size: 13px; font-weight: 500;
  color: rgba(255,255,255,0.9); letter-spacing: 0.02em;
}
.topbar-badge {
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: rgba(255,255,255,0.3);
  margin-left: 10px;
  padding: 2px 8px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 100px;
}
.topbar-actions {
  display: flex; align-items: center; gap: 16px;
}
.topbar-link {
  font-size: 11.5px; color: rgba(255,255,255,0.45);
  text-decoration: none; letter-spacing: 0.04em;
  transition: color 0.2s;
}
.topbar-link:hover { color: rgba(255,255,255,0.8); }
.topbar-link.site { color: var(--mint); opacity: 0.8; }
.topbar-link.site:hover { opacity: 1; }

/* ── Layout ── */
.layout-full {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 24px 0;
}
.layout {
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px 24px 80px;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;
}
@media (max-width: 820px) {
  .layout { grid-template-columns: 1fr; }
}

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

/* Current user chip in topbar */
.topbar-user {
  display: flex; align-items: center; gap: 8px;
}
.user-avatar {
  width: 28px; height: 28px;
  background: rgba(119,207,189,0.18);
  border: 1px solid rgba(119,207,189,0.30);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700;
  letter-spacing: 0.06em; color: ${C.mint};
}
.user-label {
  font-size: 11px; color: rgba(255,255,255,0.45);
  letter-spacing: 0.04em;
}

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

/* ── Main nav tabs ── */
.main-tabs {
  display: flex; gap: 2px;
  background: rgba(42,88,80,0.07);
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 28px;
  width: fit-content;
}
.main-tab {
  padding: 7px 18px;
  border-radius: 8px;
  font-size: 12.5px; font-weight: 500;
  color: var(--soft);
  background: transparent;
  border: none; cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.main-tab.active {
  background: white;
  color: var(--tealDeep);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.main-tab:hover:not(.active) { color: var(--teal); }

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
</style>
</head>
<body>

<!-- Top bar -->
<header class="topbar">
  <div class="topbar-brand">
    <div class="topbar-dot"></div>
    <span class="topbar-name">Cheree McGarry</span>
    <span class="topbar-badge">Admin</span>
  </div>
  <div class="topbar-actions">
    ${currentUser ? `
    <div class="topbar-user">
      <div class="user-avatar">${currentUser.initials}</div>
      <span class="user-label">${currentUser.name}</span>
    </div>` : ''}
    <a class="topbar-link site" href="/" target="_blank">View site →</a>
    <a class="topbar-link" href="/admin?logout=1">Sign out</a>
  </div>
</header>

<!-- Main nav tabs -->
<div class="layout-full">
  <div class="main-tabs">
    <button class="main-tab active" onclick="switchTab('enquiries', this)">Enquiries</button>
    <button class="main-tab" onclick="switchTab('website', this)">Website</button>
  </div>
</div>

<div class="layout">

  <!-- Left: Enquiries -->
  <main id="enquiries-tab">
    <div class="sec-hd">
      <h2 class="sec-title">Client <em>enquiries</em></h2>
      ${newCount > 0 ? `<span class="sec-count">${newCount} new</span>` : ''}
    </div>

    <!-- Stats -->
    <div class="stats-row">
      ${Object.entries(STATUS_LABELS).map(([k, v]) => {
        const n = enquiries.filter(e => (e.status || 'new') === k).length;
        return `<div class="stat-chip"><div class="stat-n">${n}</div><div class="stat-l">${v.label}</div></div>`;
      }).join('')}
    </div>

    <!-- Filter tabs -->
    <div class="filter-tabs">
      <button class="ftab active" onclick="filterEnquiries('all', this)">All</button>
      ${Object.entries(STATUS_LABELS).map(([k, v]) =>
        `<button class="ftab" onclick="filterEnquiries('${k}', this)">${v.label}</button>`
      ).join('')}
    </div>

    <!-- Cards -->
    <div id="eq-list">
      ${enquiries.length
        ? enquiries.map(e => enquiryCard(e, activityByEnquiry[e.id] || [])).join('')
        : '<div class="eq-empty">No enquiries yet — they\'ll appear here when someone fills out a form.</div>'
      }
    </div>
  </main>

  <!-- Website management tab -->
  <div id="website-tab">
    <div class="ws-grid">

      <!-- Website pages -->
      <div class="ws-card">
        <div class="ws-card-hd">
          <span class="ws-card-title">Website pages</span>
          <span class="ws-card-tag">5 pages</span>
        </div>
        <div class="ws-card-body">
          <p class="ws-card-desc">Your website has five public pages. They don't update themselves — any content changes (wording, pricing, new info) need to be made in the code by Julian and redeployed. Think of it like updating a brochure.</p>
          <div class="ws-item">
            <span class="ws-item-label"><strong>Home</strong> — First impression. Intro to you and your practice, what you offer, and a call to action to book.</span>
            <a class="ws-link" href="/" target="_blank">View ↗</a>
          </div>
          <div class="ws-item">
            <span class="ws-item-label"><strong>Sessions</strong> — How sessions work, what they cost, and funding options (private, Medicare, NDIS). The most referred-to page for new clients.</span>
            <a class="ws-link" href="/sessions.html" target="_blank">View ↗</a>
          </div>
          <div class="ws-item">
            <span class="ws-item-label"><strong>About</strong> — Your background, training, approach, and what clients can expect from working with you.</span>
            <a class="ws-link" href="/about.html" target="_blank">View ↗</a>
          </div>
          <div class="ws-item">
            <span class="ws-item-label"><strong>Client Info</strong> — Practical information for existing clients: policies, cancellations, what to bring, FAQs.</span>
            <a class="ws-link" href="/info.html" target="_blank">View ↗</a>
          </div>
          <div class="ws-item">
            <span class="ws-item-label"><strong>Request a Session</strong> — The enquiry form. When someone fills this in, it goes straight to the Enquiries tab here.</span>
            <a class="ws-link" href="/request-session.html" target="_blank">View ↗</a>
          </div>
          <div class="ws-note">💡 To update any page — wording, pricing, adding a new section — let Julian know what you want changed and he'll handle it. Usually done same day.</div>
        </div>
      </div>

      <!-- New client journey -->
      <div class="ws-card">
        <div class="ws-card-hd">
          <span class="ws-card-title">New client journey</span>
          <span class="ws-card-tag">End to end</span>
        </div>
        <div class="ws-card-body">
          <p class="ws-card-desc">What happens from the moment someone fills in the form to their first session — and where you step in.</p>
          <div class="ws-item"><span class="ws-item-label">1. Client submits request form</span><span class="ws-item-val">Automatic — no action needed</span></div>
          <div class="ws-item"><span class="ws-item-label">2. Client gets a confirmation email</span><span class="ws-item-val">Sent automatically, BCC'd to you</span></div>
          <div class="ws-item"><span class="ws-item-label">3. Enquiry appears here as "New"</span><span class="ws-item-val">Pulsing badge on the card</span></div>
          <div class="ws-item"><span class="ws-item-label">4. You review &amp; update the status</span><span class="ws-item-val">Your first manual step</span></div>
          <div class="ws-item"><span class="ws-item-label">5. Send the Halaxy intake link</span><span class="ws-item-val">Via the "Send intake" button on the card</span></div>
          <div class="ws-item"><span class="ws-item-label">6. Client completes intake in Halaxy</span><span class="ws-item-val">Triggers appointment confirmation</span></div>
          <div class="ws-item"><span class="ws-item-label">7. First session confirmed</span><span class="ws-item-val">Managed fully in Halaxy from here</span></div>
          <div class="ws-note">💡 Steps 1–3 happen automatically. Your job starts at step 4 — reviewing the enquiry and deciding whether to proceed.</div>
        </div>
      </div>

      <!-- Halaxy -->
      <div class="ws-card">
        <div class="ws-card-hd">
          <span class="ws-card-title">Halaxy</span>
          <span class="ws-card-tag">Practice management</span>
        </div>
        <div class="ws-card-body">
          <p class="ws-card-desc">Halaxy is your practice management hub — the place where clients formally become clients. It handles everything after the initial enquiry: intake, appointments, notes, invoicing, and Medicare or NDIS billing. You'll use it every working day.</p>
          <div class="ws-item"><span class="ws-item-label">Intake forms</span><span class="ws-item-val">Sent to new clients from this dashboard. They fill it in before their first session.</span></div>
          <div class="ws-item"><span class="ws-item-label">Appointments</span><span class="ws-item-val">Schedule, confirm, and manage all sessions here. Online or in-person.</span></div>
          <div class="ws-item"><span class="ws-item-label">Client records</span><span class="ws-item-val">Session notes, documents, contact details — all stored securely per client.</span></div>
          <div class="ws-item"><span class="ws-item-label">Invoicing</span><span class="ws-item-val">Generate invoices per session. Halaxy handles the formatting and delivery.</span></div>
          <div class="ws-item"><span class="ws-item-label">Medicare claiming</span><span class="ws-item-val">Clients need a Mental Health Care Plan from their GP. Rebate is processed through Halaxy.</span></div>
          <div class="ws-item"><span class="ws-item-label">NDIS billing</span><span class="ws-item-val">Plan-managed: invoice goes to plan manager. Self-managed: invoice goes to client.</span></div>
          <a class="ws-link" href="https://www.halaxy.com/practitioner" target="_blank" style="display:inline-block;margin-top:12px;">Open Halaxy ↗</a>
        </div>
      </div>

      <!-- Email -->
      <div class="ws-card">
        <div class="ws-card-hd">
          <span class="ws-card-title">Automated emails</span>
          <span class="ws-card-tag">Resend</span>
        </div>
        <div class="ws-card-body">
          <p class="ws-card-desc">Two emails go out to clients automatically through the website. You're BCC'd on both so you always have a copy. They're sent via Resend — an email delivery service — using your branding.</p>
          <div class="ws-item"><span class="ws-item-label">Enquiry confirmation</span><span class="ws-item-val">Sent the moment someone submits the request form. Lets them know you'll be in touch.</span></div>
          <div class="ws-item"><span class="ws-item-label">Intake form</span><span class="ws-item-val">Sent manually by you from the enquiry card. Includes the Halaxy intake link and funding-specific instructions.</span></div>
          <div class="ws-item"><span class="ws-item-label">Sent from</span><span class="ws-item-val">Currently onboarding@resend.dev — pending domain setup</span></div>
          <div class="ws-item"><span class="ws-item-label">Reply-to / admin BCC</span><span class="ws-item-val">admin@chereemcgarry.com</span></div>
          <div class="ws-note">⚠️ Emails currently show a Resend placeholder address as the sender. Once the GoDaddy domain transfer is done, they'll send from admin@chereemcgarry.com — a quick fix Julian can do.</div>
          <a class="ws-link" href="https://resend.com/emails" target="_blank" style="display:inline-block;margin-top:12px;">View email history ↗</a>
        </div>
      </div>

      <!-- Making changes -->
      <div class="ws-card">
        <div class="ws-card-hd">
          <span class="ws-card-title">Making changes</span>
          <span class="ws-card-tag">How updates work</span>
        </div>
        <div class="ws-card-body">
          <p class="ws-card-desc">The website doesn't have a drag-and-drop editor. It's built in code, which means changes are made by Julian and pushed live — usually the same day. Here's what requires a code change vs. what you can do yourself.</p>
          <div class="ws-item"><span class="ws-item-label">Updating page text or pricing</span><span class="ws-item-val">Needs Julian → usually same day</span></div>
          <div class="ws-item"><span class="ws-item-label">Adding a new page or section</span><span class="ws-item-val">Needs Julian → 1–2 days</span></div>
          <div class="ws-item"><span class="ws-item-label">Changing your Halaxy intake URL</span><span class="ws-item-val">You do this — paste the new link in the enquiry card</span></div>
          <div class="ws-item"><span class="ws-item-label">Managing enquiries &amp; tasks</span><span class="ws-item-val">You do this — right here in this dashboard</span></div>
          <div class="ws-item"><span class="ws-item-label">Updating client records / notes</span><span class="ws-item-val">You do this — in Halaxy</span></div>
          <div class="ws-note">💡 For anything website-related, message Julian with what you want changed and where. A screenshot or quote of the current text helps speed things up.</div>
        </div>
      </div>

      <!-- How it all connects -->
      <div class="ws-card">
        <div class="ws-card-hd">
          <span class="ws-card-title">How it all connects</span>
          <span class="ws-card-tag">System overview</span>
        </div>
        <div class="ws-card-body">
          <p class="ws-card-desc">Five services work together to run your website and practice. Here's what each one does and who looks after it.</p>
          <div class="ws-item"><span class="ws-item-label">chereemcgarry.com</span><span class="ws-item-val">Your website — what clients see. Managed by Julian.</span></div>
          <div class="ws-item"><span class="ws-item-label">Vercel</span><span class="ws-item-val">Hosts the website. Every code change goes live here automatically. Managed by Julian.</span></div>
          <div class="ws-item"><span class="ws-item-label">GitHub</span><span class="ws-item-val">Stores all the website code. Julian pushes changes here and they deploy to Vercel. <a class="ws-link" href="https://github.com/Julianmac94/cheree-mcgarry" target="_blank">View repo ↗</a></span></div>
          <div class="ws-item"><span class="ws-item-label">Supabase</span><span class="ws-item-val">The database behind this dashboard. Stores enquiries, tasks, and audit logs. You don't need to touch it.</span></div>
          <div class="ws-item"><span class="ws-item-label">Resend</span><span class="ws-item-val">Sends the automated client emails. <a class="ws-link" href="https://resend.com/emails" target="_blank">Email history ↗</a></span></div>
          <div class="ws-item"><span class="ws-item-label">Halaxy</span><span class="ws-item-val">Your practice management system — intake, appointments, invoicing, Medicare/NDIS. <a class="ws-link" href="https://www.halaxy.com/practitioner" target="_blank">Open ↗</a></span></div>
          <div class="ws-item"><span class="ws-item-label">GoDaddy</span><span class="ws-item-val">Holds your domain name (chereemcgarry.com). DNS transfer in progress.</span></div>
        </div>
      </div>

    </div>
  </div>

  <!-- Right: Tasks + Site reference -->
  <aside class="right-col">

    <!-- Tasks -->
    <div class="panel">
      <div class="panel-hd">
        <span class="panel-title">Tasks</span>
      </div>
      <div class="panel-body">
        <div class="task-add">
          <input class="task-input" id="task-input" type="text"
                 placeholder="Add a task…"
                 onkeydown="if(event.key==='Enter')addTask()">
          <button class="task-add-btn" onclick="addTask()">+</button>
        </div>
        <ul class="task-list" id="task-list">
          ${tasks.length
            ? tasks.map(taskItem).join('')
            : '<li class="task-empty">No tasks yet</li>'
          }
        </ul>
      </div>
    </div>

    <!-- Setup checklist -->
    <div class="panel" id="setup-panel">
      <div class="panel-hd" style="cursor:pointer" onclick="toggleSetup()">
        <span class="panel-title">Setup checklist</span>
        <button class="setup-toggle-btn" id="setup-toggle-btn" aria-label="Toggle">▾</button>
      </div>
      <div class="panel-body" id="setup-body">
        ${[
          'Get remaining Halaxy form URLs — couple, NDIS, child/adolescent',
          'GoDaddy DNS transfer complete — chereemcgarry.com live',
          'Add DKIM records to Resend after DNS transfer',
          'Update email sender: onboarding@resend.dev → admin@chereemcgarry.com',
          'Build: 48-hr appointment reminder email',
          'Build: post-session follow-up email',
          'Build: invoice cover email',
          'Rebuild client info page (info.html)',
        ].map((item, i) => `
        <label class="setup-item" data-key="setup-${i}">
          <input type="checkbox" onchange="saveSetup(${i}, this.checked)">
          <span>${item}</span>
        </label>`).join('')}
      </div>
    </div>

    <!-- Site reference -->
    <div class="panel">
      <div class="panel-hd">
        <span class="panel-title">Site reference</span>
      </div>
      <div class="panel-body">
        <div class="ref-section">
          <div class="ref-label">Pages</div>
          ${[
            ['Home', '/'],
            ['Sessions', '/sessions.html'],
            ['About', '/about.html'],
            ['Client Info', '/info.html'],
          ].map(([n,h]) => `<div class="ref-row">${n} <a class="ref-link" href="${h}" target="_blank">↗</a></div>`).join('')}
        </div>
        <div class="ref-section">
          <div class="ref-label">Quick links</div>
          <div class="ref-row">Halaxy <a class="ref-link" href="https://www.halaxy.com/practitioner" target="_blank">Open ↗</a></div>
          <div class="ref-row">Resend <a class="ref-link" href="https://resend.com/emails" target="_blank">Open ↗</a></div>
          <div class="ref-row">Supabase <a class="ref-link" href="https://supabase.com/dashboard" target="_blank">Open ↗</a></div>
          <div class="ref-row">Vercel <a class="ref-link" href="https://vercel.com/dashboard" target="_blank">Open ↗</a></div>
          <div class="ref-row">GitHub <a class="ref-link" href="https://github.com/Julianmac94/cheree-mcgarry" target="_blank">Open ↗</a></div>
        </div>
        <div class="ref-section">
          <div class="ref-label">Email</div>
          <div class="ref-row">Contact <span>reachout@chereemcgarry.com</span></div>
          <div class="ref-row">Provider <span>Resend</span></div>
          <div class="ref-row">Domain <span>Pending GoDaddy transfer</span></div>
        </div>
        <div class="ref-section">
          <div class="ref-label">Deploy</div>
          <div class="ref-row">Host <a class="ref-link" href="https://vercel.com" target="_blank">Vercel ↗</a></div>
          <div class="ref-row">Repo <a class="ref-link" href="https://github.com/Julianmac94/cheree-mcgarry" target="_blank">GitHub ↗</a></div>
        </div>
      </div>
    </div>

  </aside>
</div>

<script>window.ADMIN_USER = '${currentUser?.name || ''}';</script>
<script>
function switchTab(tab, btn) {
  document.querySelectorAll('.main-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('enquiries-tab').style.display = tab === 'enquiries' ? 'block' : 'none';
  document.getElementById('website-tab').style.display = tab === 'website' ? 'block' : 'none';
}

</script>
<script src="/js/admin-ui.js"></script>
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
