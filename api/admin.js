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

/* ── Pipeline three-panel dashboard ── */
.pipeline-wrap {
  max-width: 1400px; margin: 0 auto;
  padding: 24px 24px 80px;
}
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

/* Three-panel grid */
.dash-panels {
  display: grid;
  grid-template-columns: 1fr 1.5fr 1fr;
  gap: 20px;
  align-items: start;
}
@media (max-width: 1100px) {
  .dash-panels { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 720px) {
  .dash-panels { grid-template-columns: 1fr; }
}

/* Each panel is a flex column */
.dash-panel {
  background: white;
  border-radius: 14px;
  border: 1px solid rgba(42,88,80,0.09);
  display: flex; flex-direction: column;
  overflow: hidden;
  min-height: 200px;
}
.dash-panel-hd {
  padding: 14px 18px 12px;
  border-bottom: 1px solid rgba(42,88,80,0.07);
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
}
.dash-panel-title {
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--soft);
}
.dash-panel-count {
  font-size: 10px; font-weight: 700;
  color: white;
  border-radius: 100px; padding: 2px 8px;
  min-width: 20px; text-align: center;
}
.dash-panel-body {
  flex: 1; overflow-y: auto;
  padding: 14px 14px 18px;
  max-height: 80vh;
}

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
  background: rgba(42,88,80,0.025);
  border: 1px solid rgba(42,88,80,0.1);
  border-radius: 10px;
  padding: 11px 13px;
  margin-bottom: 7px;
  position: relative;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.dp-card:hover { box-shadow: 0 3px 14px rgba(25,46,42,0.09); border-color: rgba(42,88,80,0.2); }
.dp-card--new { border-left: 3px solid ${C.terra}; background: rgba(190,110,68,0.025); }

.dp-card-name {
  font-size: 13px; font-weight: 500; color: var(--tealDeep);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 2px;
  padding-right: 24px; /* room for menu btn */
}
.dp-card-sub {
  font-size: 11px; color: var(--soft);
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 7px;
}
.dp-card-email {
  font-size: 11px; color: var(--teal); text-decoration: none;
}
.dp-card-email:hover { text-decoration: underline; }
.dp-card-actions {
  display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
  margin-top: 8px;
}
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
.week-event--halaxy { border-left-color: ${C.tealMid}; }
.week-event-time {
  color: var(--soft); font-size: 9px; font-weight: 600;
  letter-spacing: 0.04em; margin-bottom: 3px;
}
.week-event-source {
  display: inline-block; font-size: 8px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 1px 5px; border-radius: 3px;
  background: rgba(42,88,80,0.08); color: var(--soft); margin-bottom: 4px;
}
.week-event--halaxy .week-event-source { background: rgba(80,42,88,0.08); color: #7a5a8a; }
.week-event--personal { opacity: 0.5; border-left-color: #aaa; }
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
  background: rgba(42,88,80,0.025);
  border: 1px solid rgba(42,88,80,0.1);
  border-left: 3px solid ${C.tealMid};
  border-radius: 9px; padding: 9px 12px;
  margin-bottom: 7px;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  flex-wrap: wrap;
}
/* Google Calendar — blue-green left border */
.appt-7day-card--cal      { border-left-color: #2e7d8a; background: rgba(46,125,138,0.04); }
/* Halaxy clinical — purple left border */
.appt-7day-card--halaxy   { border-left-color: #7a5a8a; background: rgba(122,90,138,0.04); }
/* Personal / unnamed block */
.appt-7day-card--personal { border-left-color: #aaa; opacity: 0.55; }
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
.bill-card--open { border-left: 3px solid rgba(190,110,68,0.4); }

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

/* Empty states */
.dp-empty {
  font-size: 11px; color: rgba(122,148,143,0.55);
  padding: 8px 2px; font-style: italic;
}

/* Integrations status bar (right side of toolbar) */
.pl-integrations {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}

/* Halaxy / Google Cal status chips */
.pl-halaxy-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 100px;
  font-family: var(--sans); font-size: 11px; font-weight: 500;
  background: rgba(42,88,80,0.07); color: var(--soft);
  border: 1px solid rgba(42,88,80,0.12);
  cursor: default; position: relative;
  transition: background 0.15s, color 0.15s;
  text-decoration: none;
}
.pl-halaxy-chip:hover { background: rgba(42,88,80,0.12); color: var(--mid); }
.pl-halaxy-chip:hover .pl-halaxy-tooltip { opacity: 1; pointer-events: none; transform: translateY(0); }
/* Google Cal chip — pointer cursor since it's a reconnect link */
.pl-gcal-chip { cursor: pointer; }

/* ── Unified status bar ── */
.dash-status-bar {
  max-width: 1400px; margin: 0 auto;
  padding: 0 24px;
  height: 52px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  border-bottom: 1px solid rgba(42,88,80,0.1);
  background: white;
  position: sticky; top: 0; z-index: 20;
}
.dash-tabs {
  display: flex; gap: 2px;
  background: rgba(42,88,80,0.07);
  border-radius: 8px; padding: 3px;
}
.dash-tab {
  padding: 5px 16px; border-radius: 6px;
  font-size: 12px; font-weight: 500; color: var(--soft);
  background: transparent; border: none; cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.dash-tab.active {
  background: white; color: var(--tealDeep);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.dash-tab:hover:not(.active) { color: var(--teal); }
.dash-status-right {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.dash-icon-btn {
  font-family: var(--sans); font-size: 11px; font-weight: 500;
  color: var(--soft); background: none;
  border: 1px solid rgba(42,88,80,0.15); border-radius: 6px;
  cursor: pointer; padding: 4px 10px;
  transition: color 0.15s, background 0.15s;
  white-space: nowrap;
}
.dash-icon-btn:hover { color: var(--teal); background: rgba(42,88,80,0.06); }

/* ── Hello greeting section ── */
.dash-hello {
  max-width: 1400px; margin: 0 auto;
  padding: 18px 24px 0;
  display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;
}
.dash-hello-greet {
  font-family: var(--serif); font-size: 18px; font-weight: 300;
  color: var(--tealDeep); white-space: nowrap;
}
.dash-hello-items {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.hello-item {
  font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  padding: 3px 10px; border-radius: 100px;
  background: rgba(42,88,80,0.08); color: var(--mid);
}
.hello-item--alert   { background: rgba(190,110,68,0.12); color: var(--terra); }
.hello-item--billing { background: rgba(200,160,40,0.13); color: #8a6a00; }
.hello-item--ok      { background: rgba(42,150,100,0.1);  color: #1a7a50; }

/* ── Panel action button (in panel header) ── */
.dash-panel-btn {
  font-family: var(--sans); font-size: 10px; font-weight: 600;
  letter-spacing: 0.04em; padding: 4px 10px; border-radius: 6px;
  background: rgba(42,88,80,0.08); color: var(--mid);
  border: none; cursor: pointer; white-space: nowrap;
  transition: background 0.15s;
}
.dash-panel-btn:hover { background: rgba(42,88,80,0.14); color: var(--teal); }

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

<!-- Unified status bar -->
<div class="dash-status-bar">
  <div class="dash-tabs">
    <button class="dash-tab active" onclick="switchDashTab('pipeline', this)">Pipeline</button>
    <button class="dash-tab" onclick="switchDashTab('website', this)">Website</button>
  </div>
  <div class="dash-status-right">
    <div class="pl-halaxy-chip" id="halaxy-chip">
      <div id="halaxy-status-dot" class="halaxy-dot halaxy-dot--loading"></div>
      <span id="halaxy-chip-label">Halaxy</span>
      <div class="pl-halaxy-tooltip" id="halaxy-tooltip">Checking connection…</div>
    </div>
    <a class="pl-halaxy-chip pl-gcal-chip" id="gcal-chip" href="/api/google-auth" onclick="return confirmGcalReconnect(event)">
      <div id="gcal-status-dot" class="halaxy-dot halaxy-dot--loading"></div>
      <span id="gcal-chip-label">Calendar</span>
      <div class="pl-halaxy-tooltip" id="gcal-tooltip">Checking connection…</div>
    </a>
    <button onclick="refreshPipeline()" id="pl-refresh-btn" class="dash-icon-btn" title="Refresh">↺</button>
    <button onclick="syncHalaxyConfigData()" id="halaxy-sync-btn" class="dash-icon-btn" title="Sync Halaxy funders and fees">⟳ Sync</button>
  </div>
</div>

<!-- Pipeline tab — full width -->
<div id="pipeline-tab" class="pipeline-wrap">

  <!-- Hello greeting section (populated by JS after data loads) -->
  <div class="dash-hello" id="dash-hello" style="display:none">
    <div class="dash-hello-left">
      <div class="dash-hello-greet" id="dash-hello-greet">Hello, Julian.</div>
      <div class="dash-hello-items" id="dash-hello-items"></div>
    </div>
  </div>

  <!-- Three-panel dashboard -->
  <div class="dash-panels" id="pipeline-board">

    <!-- 1. TRIAGE panel -->
    <div class="dash-panel" id="panel-intake">
      <div class="dash-panel-hd">
        <span class="dash-panel-title">Triage Clients</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="dash-panel-count" id="intake-count" style="background:${C.terra}"></span>
          <button onclick="openAddClient()" class="dash-panel-btn">+ Add client</button>
        </div>
      </div>
      <div class="dash-panel-body" id="intake-panel-body">
        <div class="pl-loading">
          <div class="pl-skeleton" style="height:70px"></div>
          <div class="pl-skeleton" style="height:60px;margin-top:7px"></div>
        </div>
      </div>
    </div>

    <!-- 2. APPOINTMENTS panel -->
    <div class="dash-panel" id="panel-appointments">
      <div class="dash-panel-hd">
        <span class="dash-panel-title">Appointments</span>
        <button onclick="openAddAppointmentModal()" class="dash-panel-btn">+ Appointment</button>
      </div>
      <div class="dash-panel-body" id="appointments-panel-body">
        <div class="pl-loading">
          <div class="pl-skeleton" style="height:160px"></div>
        </div>
      </div>
    </div>

    <!-- 3. BILLING panel -->
    <div class="dash-panel" id="panel-billing">
      <div class="dash-panel-hd">
        <span class="dash-panel-title">Billing</span>
        <span class="dash-panel-count" id="billing-count" style="background:${C.terra}"></span>
      </div>
      <div class="dash-panel-body" id="billing-panel-body">
        <div class="pl-loading">
          <div class="pl-skeleton" style="height:60px"></div>
          <div class="pl-skeleton" style="height:60px;margin-top:7px"></div>
        </div>
      </div>
    </div>

  </div>
</div>

<div class="layout" id="main-layout" style="display:none">

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

<!-- Add client modal -->
<div class="cl-modal-ov" id="add-client-modal" onclick="if(event.target===this)closeAddClient()">
  <div class="cl-modal">
    <h2 class="cl-modal-title">Add <em>client</em></h2>
    <div class="cl-modal-field">
      <label for="cl-display-name">Name / alias</label>
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
    <div class="cl-modal-field">
      <label>Halaxy patient <span style="font-weight:400;color:var(--soft)">(optional)</span></label>
      <input class="cl-modal-input" id="cl-halaxy-search" type="text" placeholder="Search by name…"
        autocomplete="off" oninput="_debounceModalHalaxySearch(this.value)">
      <input type="hidden" id="cl-halaxy-id">
      <div id="cl-halaxy-lookup" style="margin-top:6px"></div>
    </div>
    <div class="cl-modal-field">
      <label for="cl-notes">Notes (optional)</label>
      <input class="cl-modal-input" id="cl-notes" type="text" placeholder="Any useful context…">
    </div>
    <div style="border-top:1px solid rgba(0,0,0,0.08);margin-top:14px;padding-top:14px">
      <div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--soft);margin-bottom:10px;text-transform:uppercase">Log session (optional)</div>
      <div class="cl-modal-field">
        <label for="cl-session-date">Date / time</label>
        <input class="cl-modal-input" id="cl-session-date" type="datetime-local">
      </div>
      <div class="cl-modal-field" id="cl-session-fee-row" style="display:none">
        <label>Fee</label>
        <select class="cl-modal-select" id="cl-session-fee" onchange="_syncModalFeeAmt()">
          <option value="">— select fee —</option>
        </select>
        <div style="display:flex;align-items:center;gap:6px;margin-top:5px">
          <span style="color:var(--soft);font-size:13px">$</span>
          <input class="cl-modal-input" id="cl-session-fee-amt" type="number" step="0.01" min="0"
            placeholder="or enter amount" style="margin:0">
        </div>
      </div>
    </div>
    <div class="cl-modal-actions">
      <button class="cl-modal-cancel" onclick="closeAddClient()">Cancel</button>
      <button class="cl-modal-save" onclick="saveNewClient()">Add client</button>
    </div>
  </div>
</div>

<!-- Create Session modal (from Website Contact) -->
<div class="cl-modal-ov" id="create-session-modal" onclick="if(event.target===this)closeCreateSessionModal()">
  <div class="cl-modal" style="max-width:480px">
    <h2 class="cl-modal-title">Create <em>session</em></h2>

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

    <!-- Session date/time -->
    <div class="cl-modal-field">
      <label for="cs-session-date">Session date / time</label>
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
      <input class="cl-modal-input" id="cs-notes" type="text" placeholder="Session notes…">
    </div>

    <div class="cl-modal-actions">
      <button class="cl-modal-cancel" onclick="closeCreateSessionModal()">Cancel</button>
      <button class="cl-modal-save" id="cs-save-btn" onclick="saveCreateSession()">Create session →</button>
    </div>
  </div>
</div>

<script>window.ADMIN_USER = '${currentUser?.name || ''}';</script>
<script src="/js/admin-ui.js"></script>
<script>
function switchTab(tab, btn) {
  switchDashTab(tab, btn);
}

// Boot
(function() {
  var params = new URLSearchParams(location.search);
  var gcal   = params.get('gcal');
  if (gcal === 'connected')  setTimeout(function(){ toast('Google Calendar connected!'); }, 300);
  if (gcal === 'error')      setTimeout(function(){ toast('Google Calendar connection failed — try again.', 'err'); }, 300);
  if (gcal === 'no_refresh') setTimeout(function(){ toast('No refresh token returned — visit /api/google-auth again to reconnect.', 'err'); }, 300);
  // Default tab: pipeline — also kick off the data load
  var defaultBtn = document.querySelector('.dash-tab');
  if (defaultBtn) switchDashTab('pipeline', defaultBtn);
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
