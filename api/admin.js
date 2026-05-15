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
.layout {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 24px 80px;
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

<div class="layout">

  <!-- Left: Enquiries -->
  <main>
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
