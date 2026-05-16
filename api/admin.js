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

/* ── App shell ── */
body { overflow: hidden; height: 100svh; background: #F0EDE5; }
.app-shell { display: flex; height: 100svh; overflow: hidden; }

/* ── Sidebar ── */
.sidebar {
  width: 208px; flex-shrink: 0;
  background: #192E2A;
  display: flex; flex-direction: column;
  height: 100svh;
  border-right: 1px solid rgba(255,255,255,0.06);
}
.sidebar-brand {
  padding: 16px 16px 13px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  display: flex; align-items: center; gap: 10px;
}
.sidebar-logo { width: 22px; height: 22px; filter: brightness(0) invert(1); opacity: 0.65; flex-shrink: 0; }
.sidebar-brand-nm {
  font-family: var(--serif);
  font-size: 17px; font-weight: 400;
  color: rgba(255,255,255,0.82);
  line-height: 1.15; display: block;
}
.sidebar-brand-nm em { font-style: italic; color: var(--mint); font-weight: 300; }
.sidebar-brand-sub {
  font-size: 9px; font-weight: 500;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: rgba(255,255,255,0.28); display: block; margin-top: 2px;
}
.sidebar-nav { flex: 1; padding: 10px 8px; display: flex; flex-direction: column; gap: 1px; }
.sidebar-item {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 11px; border-radius: 7px;
  background: none; border: none; cursor: pointer;
  color: rgba(255,255,255,0.48); font-family: var(--sans);
  font-size: 13px; font-weight: 500; text-align: left; width: 100%;
  transition: all 0.13s; position: relative;
}
.sidebar-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.82); }
.sidebar-item.active { background: rgba(255,255,255,0.11); color: white; }
.si-icon { font-size: 14px; width: 17px; flex-shrink: 0; text-align: center; line-height: 1; }
.si-label { flex: 1; }
.si-badge {
  background: #BE6E44; color: white; font-size: 9.5px; font-weight: 700;
  padding: 1px 5px; border-radius: 99px; min-width: 16px; text-align: center; display: none;
}
.si-badge:not(:empty) { display: inline-block; }
.sidebar-footer {
  padding: 10px 8px 14px; border-top: 1px solid rgba(255,255,255,0.07);
  display: flex; flex-direction: column; gap: 2px;
}
.sidebar-status-row {
  display: flex; align-items: center; gap: 7px;
  padding: 4px 11px; font-size: 11px; color: rgba(255,255,255,0.32);
}
.sidebar-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.18); flex-shrink: 0; }
.sidebar-dot.ok  { background: #52c41a; }
.sidebar-dot.err { background: #BE6E44; }
.sidebar-dot.loading { background: rgba(255,255,255,0.18); animation: pulse 1.4s infinite; }
.sidebar-util-row { padding: 3px 11px; }
.sidebar-signout {
  font-size: 11px; color: rgba(255,255,255,0.28); text-decoration: none;
  transition: color 0.13s; display: block;
}
.sidebar-signout:hover { color: rgba(255,255,255,0.6); }
.sidebar-refresh-btn {
  background: none; border: none; cursor: pointer;
  font-size: 11px; color: rgba(255,255,255,0.28); font-family: var(--sans);
  padding: 0; text-align: left; transition: color 0.13s;
}
.sidebar-refresh-btn:hover { color: rgba(255,255,255,0.6); }

/* ── App body ── */
.app-body { flex: 1; display: flex; overflow: hidden; position: relative; background: #F0EDE5; }

/* ── View content ── */
.view-content { flex: 1; overflow-y: auto; min-width: 0; }

/* ── Right detail panel ── */
.rdp {
  width: 380px; flex-shrink: 0;
  background: white; border-left: 1px solid rgba(0,0,0,0.07);
  display: flex; flex-direction: column;
  transform: translateX(100%);
  margin-right: -380px;
  transition: transform 0.22s cubic-bezier(0.22,1,0.36,1), margin-right 0.22s cubic-bezier(0.22,1,0.36,1);
  overflow: hidden;
}
.rdp.is-open { transform: translateX(0); margin-right: 0; }
.rdp-header {
  padding: 14px 18px; border-bottom: 1px solid rgba(0,0,0,0.07);
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
}
.rdp-close {
  width: 24px; height: 24px; border-radius: 50%;
  border: none; background: rgba(0,0,0,0.06); cursor: pointer;
  font-size: 15px; display: flex; align-items: center; justify-content: center;
  color: #192E2A; flex-shrink: 0; transition: background 0.13s;
}
.rdp-close:hover { background: rgba(0,0,0,0.12); }
.rdp-title { font-size: 13.5px; font-weight: 600; color: #192E2A; flex: 1; }
.rdp-body { flex: 1; overflow-y: auto; padding: 22px 22px 30px; }

/* Detail panel content styles */
.rdp-client { font-size: 21px; font-weight: 700; color: #192E2A; margin-bottom: 3px; }
.rdp-date { font-size: 12.5px; color: #7A948F; margin-bottom: 22px; }
.rdp-action-zone {
  background: #F4F1EB; border-radius: 10px; padding: 16px; margin-bottom: 20px;
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
.rdp-section { border-top: 1px solid rgba(0,0,0,0.07); padding-top: 16px; margin-top: 4px; }
.rdp-section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #7A948F; margin-bottom: 10px; }
.rdp-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,0.04); font-size: 12.5px; }
.rdp-row:last-child { border-bottom: none; }
.rdp-row-label { color: #7A948F; }
.rdp-row-val { font-weight: 500; color: #192E2A; text-align: right; max-width: 60%; }
.rdp-status-chip {
  display: inline-block; font-size: 11px; font-weight: 600; padding: 4px 10px;
  border-radius: 99px; letter-spacing: 0.03em;
}
.rdp-status-chip.invoiced { background: rgba(39,174,96,0.12); color: #27ae60; }
.rdp-status-chip.paid     { background: rgba(0,0,0,0.06); color: #7A948F; }

/* ── Queue view ── */
.queue-view { padding: 26px 28px 60px; max-width: 820px; }
@media (max-width: 900px) { .queue-view { padding: 18px 16px 70px; } }

/* Home header */
.qhome-hd { margin-bottom: 22px; }
.qhome-greeting {
  font-family: var(--serif); font-size: 28px; font-weight: 300;
  color: #192E2A; line-height: 1.2; margin-bottom: 8px;
}
.qhome-greeting em { font-style: italic; color: var(--teal); font-weight: 300; }
.qhome-summary {
  font-size: 12px; color: #7A948F;
  display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
}
.qhome-summary-val { font-weight: 600; color: #192E2A; }
.qhome-sep { color: rgba(0,0,0,0.2); }
.qhome-alert {
  background: rgba(190,110,68,0.10); color: #BE6E44;
  font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 99px;
}

/* Stats row */
.q-stats { display: flex; gap: 10px; margin-bottom: 26px; flex-wrap: wrap; }
.q-stat {
  background: white; border-radius: 9px; padding: 14px 16px;
  flex: 1; min-width: 100px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.q-stat-val {
  font-family: var(--serif); font-size: 30px; font-weight: 300;
  color: #192E2A; line-height: 1; margin-bottom: 4px;
}
.q-stat-val.urgent { color: #BE6E44; }
.q-stat-label { font-size: 10px; font-weight: 600; color: #7A948F; text-transform: uppercase; letter-spacing: 0.06em; }

/* Queue sections */
.q-section { margin-bottom: 24px; }
.q-section-hd { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.q-section-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #7A948F; }
.q-section-count {
  font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 99px;
  background: rgba(42,88,80,0.15); color: #2A5850;
}
.q-section-count.urgent { background: rgba(190,110,68,0.15); color: #BE6E44; }
.q-section-toggle {
  background: none; border: none; cursor: pointer;
  font-size: 10px; color: #7A948F; padding: 0; font-family: var(--sans);
  margin-left: auto; transition: color 0.13s;
}
.q-section-toggle:hover { color: #2A5850; }

/* Queue item list */
.q-items { background: white; border-radius: 9px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.q-item {
  display: flex; align-items: stretch; cursor: pointer;
  border-bottom: 1px solid rgba(0,0,0,0.05); transition: background 0.1s;
}
.q-item:last-child { border-bottom: none; }
.q-item:hover { background: #FAFAFA; }
.q-item.is-active { background: #F0F7F6; }
.q-item-bar { width: 3px; flex-shrink: 0; }
.q-item-bar.pending  { background: #BE6E44; }
.q-item-bar.upcoming { background: #2A5850; }
.q-item-bar.invoiced { background: #27ae60; }
.q-item-bar.paid     { background: #bbb; }
.q-item-bar.new      { background: #BE6E44; }
.q-item-bar.awaiting { background: #7A948F; }
.q-item-bar.today    { background: #2A5850; }
.q-item-main { flex: 1; padding: 11px 13px; min-width: 0; }
.q-item-name { font-size: 14px; font-weight: 600; color: #192E2A; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.q-item-meta { font-size: 11.5px; color: #7A948F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.q-item-hint { font-size: 11px; color: #BE6E44; margin-top: 2px; font-weight: 500; }
.q-item-type { font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(122,148,143,0.8); margin-bottom: 1px; }
.q-item-right { padding: 11px 13px 11px 0; flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
.q-pill {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 99px; letter-spacing: 0.03em;
}
.q-pill.pending  { background: rgba(190,110,68,0.12); color: #BE6E44; }
.q-pill.upcoming { background: rgba(42,88,80,0.10); color: #2A5850; }
.q-pill.invoiced { background: rgba(39,174,96,0.12); color: #27ae60; }
.q-pill.paid     { background: rgba(0,0,0,0.06); color: #7A948F; }
.q-pill.new      { background: rgba(190,110,68,0.12); color: #BE6E44; }
.q-pill.awaiting { background: rgba(122,148,143,0.15); color: #7A948F; }
.q-arrow { font-size: 12px; color: rgba(0,0,0,0.18); }
.q-empty { padding: 16px 14px; font-size: 13px; color: #7A948F; font-style: italic; }

/* ── Clients view ── */
.clients-view { padding: 26px 28px 60px; }
@media (max-width: 900px) { .clients-view { padding: 18px 16px 70px; } }
.clients-view-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; flex-wrap: wrap; gap: 10px; }
.view-title { font-size: 18px; font-weight: 700; color: #192E2A; }
.clients-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
@media (max-width: 640px) { .clients-grid { grid-template-columns: 1fr; } }

/* ── Billing view ── */
.billing-view { padding: 26px 28px 60px; }
@media (max-width: 900px) { .billing-view { padding: 18px 16px 70px; } }
.billing-view-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; flex-wrap: wrap; gap: 10px; }

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

/* ── Mobile ── */
.bottom-nav { display: none; }
@media (max-width: 768px) {
  .sidebar { display: none; }
  .bottom-nav {
    display: flex; position: fixed; bottom: 0; left: 0; right: 0;
    height: 56px; background: #192E2A;
    border-top: 1px solid rgba(255,255,255,0.08); z-index: 200;
  }
  .bn-item {
    flex: 1; background: none; border: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px; padding: 6px 0; color: rgba(255,255,255,0.4);
    font-family: var(--sans); transition: color 0.13s;
  }
  .bn-item.active { color: white; }
  .bn-item:hover { color: rgba(255,255,255,0.75); }
  .bn-icon { font-size: 17px; line-height: 1; }
  .bn-label { font-size: 9px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
  .rdp {
    position: fixed; top: 0; left: 0; right: 0; bottom: 56px;
    width: auto; margin-right: 0; z-index: 150;
    transform: translateY(100%);
  }
  .rdp.is-open { transform: translateY(0); }
  .view-content { padding-bottom: 70px; }
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

/* User avatar chip in header */
.topbar-user {
  display: flex; align-items: center; gap: 8px;
}
.user-avatar {
  width: 26px; height: 26px;
  background: rgba(119,207,189,0.15);
  border: 1px solid rgba(119,207,189,0.25);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700;
  letter-spacing: 0.06em; color: ${C.mint};
}
.user-label {
  font-size: 11px; color: rgba(255,255,255,0.4);
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

<div class="app-shell" id="app-shell">

  <!-- ── Desktop sidebar ── -->
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <img src="/assets/logo.svg" class="sidebar-logo" alt="" width="26" height="26">
      <div>
        <span class="sidebar-brand-nm"><em>Cheree</em> McGarry</span>
        <span class="sidebar-brand-sub">Practice Admin</span>
      </div>
    </div>
    <div class="sidebar-nav">
      <button class="sidebar-item active" data-view="queue" onclick="navigateTo('queue')">
        <span class="si-icon">≡</span>
        <span class="si-label">Queue</span>
        <span class="si-badge" id="sib-queue"></span>
      </button>
      <button class="sidebar-item" data-view="clients" onclick="navigateTo('clients')">
        <span class="si-icon">◎</span>
        <span class="si-label">Clients</span>
      </button>
      <button class="sidebar-item" data-view="billing" onclick="navigateTo('billing')">
        <span class="si-icon">$</span>
        <span class="si-label">Billing</span>
      </button>
      <button class="sidebar-item" data-view="settings" onclick="navigateTo('settings')">
        <span class="si-icon">⚙</span>
        <span class="si-label">Settings</span>
      </button>
    </div>
    <div class="sidebar-footer">
      <div class="sidebar-status-row">
        <span class="sidebar-dot loading" id="sb-halaxy-dot"></span>
        <span id="sb-halaxy-label">Halaxy</span>
      </div>
      <div class="sidebar-status-row">
        <span class="sidebar-dot loading" id="sb-gcal-dot"></span>
        <span id="sb-gcal-label">Calendar</span>
      </div>
      <div class="sidebar-util-row">
        <button class="sidebar-refresh-btn" id="pl-refresh-btn" onclick="refreshPipeline()">↺ Refresh</button>
      </div>
      <div class="sidebar-util-row">
        <a class="sidebar-signout" href="/admin?logout=1">Sign out</a>
      </div>
    </div>
  </nav>

  <!-- ── App body ── -->
  <div class="app-body" id="app-body">

    <!-- Main view content area -->
    <div class="view-content" id="view-content">
      <div class="queue-view"><div class="q-stats">${[1,2,3].map(()=>'<div class="q-stat"><div class="q-stat-val" style="width:28px;height:22px;background:rgba(0,0,0,0.07);border-radius:4px"></div><div class="q-stat-label" style="width:70px;height:10px;background:rgba(0,0,0,0.06);border-radius:3px;margin-top:6px"></div></div>').join('')}</div><div class="pl-loading"><div class="pl-skeleton" style="height:56px"></div><div class="pl-skeleton" style="height:52px;margin-top:6px"></div><div class="pl-skeleton" style="height:52px;margin-top:6px"></div></div></div>
    </div>

    <!-- Right detail panel -->
    <div class="rdp" id="rdp">
      <div class="rdp-header">
        <button class="rdp-close" onclick="closeDetailPanel()">×</button>
        <div class="rdp-title" id="rdp-title">Detail</div>
      </div>
      <div class="rdp-body" id="rdp-body"></div>
    </div>

  </div><!-- /.app-body -->

  <!-- ── Mobile bottom nav ── -->
  <nav class="bottom-nav" id="bottom-nav">
    <button class="bn-item active" data-view="queue" onclick="navigateTo('queue')">
      <span class="bn-icon">≡</span>
      <span class="bn-label">Queue</span>
    </button>
    <button class="bn-item" data-view="clients" onclick="navigateTo('clients')">
      <span class="bn-icon">◎</span>
      <span class="bn-label">Clients</span>
    </button>
    <button class="bn-item" data-view="billing" onclick="navigateTo('billing')">
      <span class="bn-icon">$</span>
      <span class="bn-label">Billing</span>
    </button>
    <button class="bn-item" data-view="settings" onclick="navigateTo('settings')">
      <span class="bn-icon">⚙</span>
      <span class="bn-label">Settings</span>
    </button>
  </nav>

</div><!-- /.app-shell -->

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
      <button class="cl-mode-btn cl-mode-btn--active" id="cl-mode-search-btn" onclick="setClientModalMode('search')">Find in Halaxy</button>
      <button class="cl-mode-btn" id="cl-mode-new-btn" onclick="setClientModalMode('new')">New patient</button>
    </div>

    <!-- ── FIND MODE: search existing Halaxy patients ── -->
    <div id="cl-find-mode">
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
      <div class="cl-modal-field">
        <label for="cl-new-notes">Notes (optional)</label>
        <input class="cl-modal-input" id="cl-new-notes" type="text" placeholder="Any useful context…">
      </div>
    </div>

    <div id="cl-modal-error" style="display:none;color:var(--terra);font-size:12px;margin-top:8px"></div>
    <div class="cl-modal-actions">
      <button class="cl-modal-cancel" onclick="closeAddClient()">Cancel</button>
      <button class="cl-modal-save" id="cl-modal-save-btn" onclick="saveNewClient()">Add client</button>
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
<script src="/js/admin-ui.js?v=${Date.now()}"></script>
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
