/**
 * api/admin.js
 * Serves /book (Cheree's booking tool + Julian's billing board) and
 * /book/qfes. The old /admin and /admin-new dashboards were retired —
 * /book is the only client of this handler now, behind the same
 * /admin-login session auth.
 */

import { isAuthed, clearSessionCookie, getSessionUser } from './_auth.js';

const C = {
  mint: '#77CFBD',
};

function escHtmlAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Cheree's booking tool — served at /book. The shared daily-use "app" for
 * both Cheree (book a client, record an outcome) and Julian (flip to the
 * billing pipeline board) — deliberately separate from the old dashboard.
 * Google Calendar is the real system of record; this just writes clean,
 * consistent entries into it. Own minimal shell; logic lives in
 * js/cheree-book.js. No Halaxy writes, no patient/invoice creation.
 */
function cbBookPage({ currentUser = null }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Cheree McGarry</title>
<link rel="icon" href="/assets/pwa-icon.svg">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta name="theme-color" content="#0B1210">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="McGarry">
<style>
  :root {
    --bg: #0B1210; --card: #121C19; --border: rgba(255,255,255,0.08);
    --t1: #EDF3F1; --t2: #9FB3AE; --t3: #6E827D;
    --teal: ${C.mint}; --amber: #E0A339; --red: #E0714A; --green: #3FBF8F;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--t1); -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 520px; margin: 0 auto; padding: max(20px, env(safe-area-inset-top)) 18px calc(112px + env(safe-area-inset-bottom)); }
  input, select, textarea, button { font-family: inherit; }

  /* ── Top bar + brand — icons are right-aligned only, with real breathing
     room above them. In standalone iOS PWA mode (black-translucent status
     bar) content draws under the notch, so anything hugging the very top
     edge sits behind it and can't be tapped; the .wrap padding above
     already pushes past env(safe-area-inset-top), this adds a bit more. ── */
  .app-top { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 4px; margin-bottom: 18px; }
  .icon-btn { position: relative; background: var(--card); border: 1px solid var(--border); color: var(--t2); width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .icon-btn:hover { border-color: var(--teal); color: var(--teal); }
  .icon-btn--on { color: var(--teal); border-color: var(--teal); }
  .icon-btn.spinning svg { animation: cb-spin 0.7s linear infinite; }
  @keyframes cb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .icon-dot { position: absolute; top: -3px; right: -3px; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--bg); display: none; }
  .icon-dot-amber { background: var(--amber); }
  .icon-dot-red { background: var(--red); }
  .app-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .app-logo { width: 46px; height: 46px; border-radius: 50%; background: var(--teal); padding: 8px; box-sizing: border-box; box-shadow: 0 4px 18px rgba(119,207,189,0.25); }
  .app-name { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
  .app-who { font-size: 12px; color: var(--t3); margin-top: 1px; }

  /* ── Section headings on the Home view ── */
  .sec-hd { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--t3); margin: 22px 0 8px; }
  .sec-hd:first-child { margin-top: 0; }
  .sec-hd .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--t3); flex-shrink: 0; }
  .sec-hd--attention .dot { background: var(--amber); }
  .sec-hd--upcoming .dot { background: var(--teal); }
  .sec-hd .count-bubble { margin-left: auto; background: var(--card); border: 1px solid var(--border); color: var(--t2); font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; text-transform: none; letter-spacing: 0; }

  /* ── Funder chips — same colour language everywhere a funder shows up ── */
  .fchip { display: inline-block; flex-shrink: 0; font-size: 9.5px; font-weight: 700; letter-spacing: 0.03em; padding: 3px 8px; border-radius: 7px; white-space: nowrap; }
  .fchip-NDIS { background: rgba(96,165,250,0.15); color: #60a5fa; }
  .fchip-Medicare { background: rgba(63,191,143,0.15); color: var(--green); }
  .fchip-QFES { background: rgba(224,163,57,0.15); color: var(--amber); }
  .fchip-WorkCover { background: rgba(224,113,74,0.15); color: var(--red); }
  .fchip-DVA { background: rgba(167,139,250,0.15); color: #a78bfa; }
  .fchip-Private { background: rgba(255,255,255,0.1); color: var(--t1); }
  .fchip-Other { background: rgba(255,255,255,0.05); color: var(--t3); }
  .fchip-Lead { background: rgba(224,163,57,0.12); color: var(--amber); }
  .fchip-Unknown { background: rgba(255,255,255,0.05); color: var(--t3); }
  .legacy-tag { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--t3); border: 1px dashed var(--border); padding: 1px 6px; border-radius: 6px; flex-shrink: 0; }
  .stage-badge { font-size: 9px; font-weight: 700; letter-spacing: 0.02em; color: var(--teal); background: rgba(119,207,189,0.12); border: 1px solid rgba(119,207,189,0.3); padding: 2px 7px; border-radius: 6px; flex-shrink: 0; cursor: pointer; }
  .stage-badge:hover { background: rgba(119,207,189,0.2); }
  .sdot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 7px; flex-shrink: 0; }
  .sdot-green { background: var(--green); }
  .sdot-red { background: var(--red); }

  .field { margin-bottom: 16px; }
  .field label { display: block; font-size: 12px; font-weight: 600; color: var(--t2); margin-bottom: 6px; }
  .field input, .field select, .field textarea {
    width: 100%; box-sizing: border-box; padding: 13px 14px; border-radius: 10px;
    background: var(--card); border: 1px solid var(--border); color: var(--t1); font-size: 16px;
  }
  .field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: var(--teal); }
  .field select {
    appearance: none; -webkit-appearance: none; cursor: pointer; min-height: 46px;
    padding-right: 38px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%237A948F' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 14px center;
  }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .btn-primary { width: 100%; padding: 14px; border-radius: 12px; background: var(--teal); border: none; color: #08120F; font-size: 15px; font-weight: 700; cursor: pointer; }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }
  .btn-ghost { width: 100%; padding: 12px; border-radius: 10px; background: var(--card); border: 1px solid var(--border); color: var(--t2); font-size: 13px; cursor: pointer; margin-top: 8px; }
  .pick-row { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; border: 1px solid var(--border); cursor: pointer; margin-bottom: 8px; }
  .pick-row:hover { border-color: var(--teal); }
  .pick-row .av { width: 32px; height: 32px; border-radius: 50%; background: rgba(119,207,189,0.15); color: var(--teal); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
  .pick-row .nm { font-size: 14px; font-weight: 600; }
  .pick-row .mt { font-size: 12px; color: var(--t3); }
  .pick-row.static { cursor: default; }
  .pick-row.static:hover { border-color: var(--border); }
  .pick-row .pick-body { flex: 1; min-width: 0; }
  .search { width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 10px; background: var(--card); border: 1px solid var(--border); color: var(--t1); font-size: 14px; margin-bottom: 16px; }
  .search:focus { outline: none; border-color: var(--teal); }
  .cl-funders { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; justify-content: flex-end; cursor: pointer; max-width: 170px; flex-shrink: 0; }
  .cl-edit-icon { color: var(--t3); flex-shrink: 0; }
  .cl-funders:hover .cl-edit-icon { color: var(--teal); }
  .cl-id-btn { display: inline-flex; align-items: center; margin-top: 5px; font-size: 10.5px; font-family: ui-monospace, monospace; color: var(--t3); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; cursor: pointer; }
  .cl-id-btn:hover { border-color: var(--teal); color: var(--teal); }
  .funder-check { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid var(--border); font-size: 14px; cursor: pointer; }
  .funder-check:last-of-type { border-bottom: none; }
  .funder-check input { width: 18px; height: 18px; accent-color: var(--teal); flex-shrink: 0; }
  .modality { display: flex; gap: 8px; }
  .modality button { flex: 1; padding: 10px; border-radius: 10px; background: var(--card); border: 1px solid var(--border); color: var(--t2); font-size: 13px; cursor: pointer; }
  .modality button.sel { background: rgba(119,207,189,0.14); border-color: var(--teal); color: var(--teal); }
  .card { background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--border); border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; }
  .card-attention { border-left-color: var(--amber); }
  .card-upcoming { border-left-color: var(--teal); }
  .card-attended { border-left-color: var(--green); }
  .card-cancelled { border-left-color: var(--red); }
  .card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .card .nm { font-size: 14px; font-weight: 600; }
  .card .mt { font-size: 12px; color: var(--t3); margin-top: 4px; display: flex; align-items: center; gap: 6px; }
  .empty { text-align: center; padding: 50px 20px; color: var(--t3); font-size: 13px; }

  /* ── Home: AI brief card ── */
  .brief-card { background: rgba(119,207,189,0.06); border: 1px solid rgba(119,207,189,0.16); border-radius: 14px; padding: 16px 18px 14px; margin-bottom: 18px; }
  .brief-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--teal); opacity: 0.75; margin-bottom: 8px; }
  .brief-text { font-size: 14px; line-height: 1.7; color: var(--t1); min-height: 18px; }
  .brief-text.ai-brief-streaming { min-height: 40px; }
  .brief-text.ai-brief-pulse-in { animation: ai-brief-pulse-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
  .brief-text .ai-brief-para { margin: 0; padding: 0; }
  .brief-text .ai-brief-para + .ai-brief-para { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(119,207,189,0.12); }
  @keyframes ai-brief-pulse-in { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }
  .ai-brief-loading { display: inline-block; width: 160px; height: 13px; background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%); background-size: 200% 100%; animation: ai-brief-shimmer 1.6s ease-in-out infinite; border-radius: 6px; vertical-align: middle; }
  @keyframes ai-brief-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* ── Home view-mode switch + calendar (Month/Week/Day) ── */
  .cal-modes { display: flex; gap: 6px; margin-bottom: 16px; }
  .cal-mode-btn { flex: 1; padding: 8px; border-radius: 9px; background: var(--card); border: 1px solid var(--border); color: var(--t2); font-size: 12px; font-weight: 600; cursor: pointer; }
  .cal-mode-btn.active { background: rgba(119,207,189,0.14); border-color: var(--teal); color: var(--teal); }
  .cal-nav { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .cal-arrow { background: var(--card); border: 1px solid var(--border); color: var(--t2); width: 32px; height: 32px; border-radius: 9px; cursor: pointer; font-size: 15px; line-height: 1; flex-shrink: 0; }
  .cal-arrow:hover { border-color: var(--teal); color: var(--teal); }
  .cal-nav-label { flex: 1; text-align: center; font-size: 13px; font-weight: 700; }
  .cal-today-btn { background: var(--card); border: 1px solid var(--border); color: var(--teal); font-size: 11px; font-weight: 700; padding: 0 10px; height: 32px; border-radius: 9px; cursor: pointer; flex-shrink: 0; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
  .cal-dow { text-align: center; font-size: 10px; font-weight: 700; color: var(--t3); padding-bottom: 4px; }
  .cal-cell { aspect-ratio: 1; border-radius: 9px; background: var(--card); border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; }
  .cal-cell:hover { border-color: var(--teal); }
  .cal-cell--out { opacity: 0.35; }
  .cal-cell--today { border-color: var(--teal); box-shadow: 0 0 0 1px var(--teal) inset; }
  .cal-daynum { font-size: 12px; font-weight: 600; color: var(--t1); }
  .cal-dots { display: flex; gap: 2px; }
  .cal-dot { width: 5px; height: 5px; border-radius: 50%; }
  .cal-dot-attention { background: var(--amber); }
  .cal-dot-upcoming { background: var(--teal); }
  .cal-dot-attended { background: var(--green); }
  .cal-dot-cancelled { background: var(--red); }
  .cal-day-hd { margin-top: 22px; }
  .cal-day-hd:first-of-type { margin-top: 0; }
  .cal-week-day { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 10px; }
  .cal-week-day .cal-day-hd:first-of-type { margin-top: 0; }
  .cal-week-day--today { border-color: var(--teal); }
  .loading { text-align: center; padding: 50px 20px; color: var(--t3); font-size: 13px; }
  .toast { position: fixed; bottom: calc(100px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); background: var(--card); border: 1px solid var(--teal); color: var(--t1); padding: 12px 20px; border-radius: 10px; font-size: 13px; z-index: 90; }

  /* ── Board (flip view) — each column carries its own accent colour so the
     pipeline reads left-to-right without needing to read every label ── */
  .board { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 12px; margin: 0 -18px; padding-left: 18px; padding-right: 18px; }
  .col { flex: 0 0 220px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-top: 3px solid var(--col-c, var(--border)); border-radius: 12px; padding: 10px; }
  .col[data-stage="triage"]     { --col-c: var(--amber); }
  .col[data-stage="booked"]     { --col-c: #60a5fa; }
  .col[data-stage="outcome"]    { --col-c: var(--red); }
  .col[data-stage="billing"]    { --col-c: #a78bfa; }
  .col[data-stage="remittance"] { --col-c: #60a5fa; }
  .col[data-stage="closed"]     { --col-c: var(--green); }
  .col-hd { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--t3); padding: 4px 4px 10px; display: flex; justify-content: space-between; }
  .col-hd .n { color: var(--col-c, var(--t2)); font-weight: 700; }
  .card2 { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 10px 11px; margin-bottom: 8px; }
  .card2-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .card2 .nm { font-size: 13px; font-weight: 600; color: var(--t1); display: flex; align-items: center; }
  .card2 .mt { font-size: 11px; color: var(--t3); margin-top: 2px; }
  .card2 .act { display: flex; gap: 6px; margin-top: 8px; }
  .card2 .act button { flex: 1; font-size: 10.5px; padding: 6px; border-radius: 7px; background: rgba(119,207,189,0.1); border: 1px solid var(--border); color: var(--teal); cursor: pointer; }
  .card2 .act button:disabled { opacity: 0.6; cursor: default; }
  .card2 .act.act-inv .inv-input { flex: 1; min-width: 0; font-size: 10.5px; padding: 6px 8px; border-radius: 7px; background: var(--bg); border: 1px solid var(--border); color: var(--t1); }
  .card2 .act.act-inv .inv-input:focus { outline: none; border-color: var(--teal); }
  .card2 .act.act-inv .inv-input:disabled { opacity: 0.6; }
  .card2 .act.act-inv button { flex: 0 0 auto; padding: 6px 10px; }
  .inv-link { display: block; width: 100%; box-sizing: border-box; font-size: 10.5px; padding: 6px; border-radius: 7px; background: rgba(119,207,189,0.1); border: 1px solid var(--border); color: var(--teal); text-align: center; text-decoration: none; margin-top: 8px; }

  /* ── Remittance inbox check (Board, Awaiting payment column) ── */
  .remit-btn { display: block; width: 100%; box-sizing: border-box; font-size: 10.5px; padding: 6px; border-radius: 7px; margin-top: 8px; cursor: pointer; font-family: inherit; background: rgba(224,163,57,0.12); border: 1px solid rgba(224,163,57,0.3); color: var(--amber); }
  .remit-btn:disabled { opacity: 0.6; cursor: default; }
  .remit-result { margin-top: 6px; }
  .remit-hit { display: flex; align-items: center; gap: 8px; text-decoration: none; margin-top: 5px; padding: 7px 9px; border-radius: 7px; background: rgba(63,191,143,0.08); border: 1px solid rgba(63,191,143,0.22); }
  .remit-hit-check { font-size: 12px; color: var(--green); flex: none; }
  .remit-hit-body { flex: 1; min-width: 0; }
  .remit-hit-who { display: block; font-size: 11px; color: var(--t1); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .remit-hit-sub { display: block; font-size: 10px; color: var(--t3); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .remit-msg { font-size: 11px; padding: 5px 2px; }
  .remit-msg--found { color: var(--green); font-weight: 600; margin-bottom: 2px; }
  .remit-msg--amber { color: var(--amber); }
  .remit-msg--dim { color: var(--t3); }
  .col-empty { font-size: 11px; color: var(--t3); padding: 10px 4px; }

  /* ── Activity sheet ── */
  .sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 70; }
  .sheet-backdrop.open { opacity: 1; pointer-events: auto; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; max-width: 520px; margin: 0 auto; background: var(--bg); border: 1px solid var(--border); border-bottom: none; border-radius: 18px 18px 0 0; max-height: 78vh; overflow-y: auto; transform: translateY(100%); transition: transform 0.24s ease; z-index: 71; padding-bottom: env(safe-area-inset-bottom); }
  .sheet.open { transform: translateY(0); }
  .sheet-hd { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--border); font-size: 14px; font-weight: 700; position: sticky; top: 0; background: var(--bg); }
  .sheet-hd button { background: none; border: none; color: var(--t3); font-size: 18px; cursor: pointer; padding: 4px 8px; }
  .sheet-body { padding: 8px 18px 18px; }

  /* ── Settings V2 ── */
  .stg-section { margin-bottom: 22px; }
  .stg-section-title { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--t3); margin-bottom: 4px; }
  .stg-row { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .stg-row:last-child { border-bottom: none; }
  .stg-row-main { flex: 1; min-width: 0; }
  .stg-row-label { font-size: 13.5px; font-weight: 600; color: var(--t1); }
  .stg-row-sub { font-size: 11.5px; color: var(--t3); margin-top: 2px; }
  .stg-row-val { font-size: 12px; font-weight: 600; flex-shrink: 0; }
  .stg-row-val--ok { color: var(--green); }
  .stg-row-val--off { color: var(--t3); }
  .stg-row-action { flex-shrink: 0; }
  .stg-row-action a, .stg-row-action button { font-size: 12px; font-weight: 600; color: var(--teal); background: rgba(119,207,189,0.1); border: 1px solid var(--border); border-radius: 8px; padding: 6px 11px; cursor: pointer; text-decoration: none; font-family: inherit; display: inline-block; }
  .stg-row-action a:hover, .stg-row-action button:hover { border-color: var(--teal); }
  .stg-row-action button:disabled { opacity: 0.6; cursor: default; }
  .stg-signout { color: var(--red) !important; background: rgba(224,113,74,0.1) !important; }
  .act-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .act-item:last-child { border-bottom: none; }
  .act-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
  .act-dot.booking { background: #60a5fa; }
  .act-dot.outcome-attended { background: var(--green); }
  .act-dot.outcome-cancelled { background: var(--red); }
  .act-title { font-size: 13.5px; font-weight: 600; color: var(--t1); }
  .act-body { font-size: 12.5px; color: var(--t2); margin-top: 1px; }
  .act-when { font-size: 11px; color: var(--t3); margin-top: 3px; }

  /* ── Forms sheet — reference-only link picker, no Halaxy calls ── */
  .frm-type-toggle { display: flex; gap: 6px; margin-bottom: 4px; }
  .frm-type-btn { flex: 1; padding: 8px 6px; border-radius: 9px; border: 1px solid var(--border); background: var(--card); color: var(--t2); font-size: 12px; font-weight: 600; cursor: pointer; }
  .frm-type-btn.active { border-color: var(--teal); color: var(--teal); background: rgba(119,207,189,0.1); }
  .frm-section-lbl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--t3); margin: 16px 0 6px; }
  .frm-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .frm-row:last-child { border-bottom: none; }
  .frm-row .fchip { min-width: 78px; text-align: center; }
  .frm-row-lbl { font-size: 12.5px; font-weight: 600; color: var(--t1); }
  .frm-copy-btn { font-size: 11px; padding: 5px 11px; border-radius: 7px; background: rgba(119,207,189,0.1); border: 1px solid var(--border); color: var(--teal); cursor: pointer; }
  .frm-copy-btn:hover { border-color: var(--teal); }
  .frm-none { font-size: 11px; color: var(--t3); font-style: italic; }
  .frm-note { font-size: 11px; color: var(--t3); margin-top: 16px; line-height: 1.5; }

  /* ── Bottom dock: Home / + / Board ── */
  .dock { position: fixed; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; padding: 14px 18px calc(14px + env(safe-area-inset-bottom)); pointer-events: none; z-index: 50; }
  .dock-pill { pointer-events: auto; display: flex; align-items: center; gap: 6px; background: rgba(18,28,25,0.92); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid var(--border); border-radius: 20px; padding: 8px; box-shadow: 0 8px 28px rgba(0,0,0,0.35); }
  .dock-btn { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; background: none; border: none; color: var(--t3); width: 60px; padding: 6px 4px; border-radius: 13px; cursor: pointer; font-size: 10px; font-weight: 600; }
  .dock-btn.active { color: var(--teal); background: rgba(119,207,189,0.12); }
  .dock-badge { position: absolute; top: 2px; right: 10px; background: var(--amber); color: #241a05; font-size: 9px; font-weight: 800; min-width: 15px; height: 15px; border-radius: 8px; display: none; align-items: center; justify-content: center; padding: 0 3px; }
  .dock-add { width: 52px; height: 52px; border-radius: 50%; background: var(--teal); border: none; color: #08120F; display: flex; align-items: center; justify-content: center; cursor: pointer; margin: 0 4px; box-shadow: 0 4px 16px rgba(119,207,189,0.4); flex-shrink: 0; }
  .dock-add:active { transform: scale(0.95); }
  .dock-add.active { box-shadow: 0 0 0 3px rgba(119,207,189,0.35), 0 4px 16px rgba(119,207,189,0.4); }
</style>
</head>
<body>
  <div class="wrap">
    <div class="app-top">
      <button class="icon-btn" onclick="cbOpenActivity()" aria-label="Activity" title="Activity">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </button>
      <button class="icon-btn" onclick="cbOpenForms()" aria-label="Forms" title="Registration &amp; intake forms">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
      </button>
      <button class="icon-btn" id="cb-notif-btn" onclick="cbNotifTap()" aria-label="Notifications" title="Notifications">
        <span class="icon-dot" id="cb-notif-dot"></span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
      </button>
      <button class="icon-btn" id="cb-refresh-btn" onclick="cbRefresh()" aria-label="Refresh" title="Refresh">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
      </button>
      <button class="icon-btn" onclick="cbOpenSettings()" aria-label="Settings" title="Settings">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      </button>
    </div>
    <div class="app-brand">
      <img src="/assets/logo.svg" class="app-logo" alt="">
      <div>
        <div class="app-name">Cheree McGarry</div>
        <div class="app-who">${currentUser ? escHtmlAttr(currentUser.name) : ''}</div>
      </div>
    </div>
    <input class="search" id="cb-client-search" placeholder="Search clients by name…" autocomplete="off" style="display:none">
    <div id="root"><div class="loading">Loading…</div></div>
  </div>
  <div id="toast"></div>

  <div class="sheet-backdrop" id="cb-activity-backdrop" onclick="cbCloseActivity()"></div>
  <div class="sheet" id="cb-activity-sheet">
    <div class="sheet-hd"><span>Activity</span><button onclick="cbCloseActivity()" aria-label="Close">✕</button></div>
    <div class="sheet-body" id="cb-activity-body"></div>
  </div>

  <div class="sheet-backdrop" id="cb-funder-backdrop" onclick="cbCloseFunderEdit()"></div>
  <div class="sheet" id="cb-funder-sheet">
    <div class="sheet-hd"><span>Funders</span><button onclick="cbCloseFunderEdit()" aria-label="Close">✕</button></div>
    <div class="sheet-body" id="cb-funder-body"></div>
  </div>

  <div class="sheet-backdrop" id="cb-forms-backdrop" onclick="cbCloseForms()"></div>
  <div class="sheet" id="cb-forms-sheet">
    <div class="sheet-hd"><span>Registration &amp; intake forms</span><button onclick="cbCloseForms()" aria-label="Close">✕</button></div>
    <div class="sheet-body" id="cb-forms-body"></div>
  </div>

  <div class="sheet-backdrop" id="cb-settings-backdrop" onclick="cbCloseSettings()"></div>
  <div class="sheet" id="cb-settings-sheet">
    <div class="sheet-hd"><span>Settings</span><button onclick="cbCloseSettings()" aria-label="Close">✕</button></div>
    <div class="sheet-body" id="cb-settings-body"></div>
  </div>

  <div class="sheet-backdrop" id="cb-history-backdrop" onclick="cbCloseHistory()"></div>
  <div class="sheet" id="cb-history-sheet">
    <div class="sheet-hd"><span id="cb-history-title">History</span><button onclick="cbCloseHistory()" aria-label="Close">✕</button></div>
    <div class="sheet-body" id="cb-history-body"></div>
  </div>

  <div class="sheet-backdrop" id="cb-edit-backdrop" onclick="cbCloseEdit()"></div>
  <div class="sheet" id="cb-edit-sheet">
    <div class="sheet-hd"><span id="cb-edit-title">Edit session</span><button onclick="cbCloseEdit()" aria-label="Close">✕</button></div>
    <div class="sheet-body" id="cb-edit-body"></div>
  </div>

  <div class="sheet-backdrop" id="cb-qfes-backdrop" onclick="cbCloseQfesDetails()"></div>
  <div class="sheet" id="cb-qfes-sheet">
    <div class="sheet-hd"><span id="cb-qfes-title">QFES form details</span><button onclick="cbCloseQfesDetails()" aria-label="Close">✕</button></div>
    <div class="sheet-body" id="cb-qfes-body"></div>
  </div>

  <nav class="dock">
    <div class="dock-pill">
      <button class="dock-btn active" id="dock-home" onclick="cbSetView('home')" aria-label="Home">
        <span class="dock-badge" id="dock-home-badge"></span>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>Home</span>
      </button>
      <button class="dock-add" id="dock-add" onclick="cbSetView('book')" aria-label="New booking">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="dock-btn" id="dock-board" onclick="cbSetView('board')" aria-label="Board">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="10" rx="1.5"/></svg>
        <span>Board</span>
      </button>
      <button class="dock-btn" id="dock-clients" onclick="cbSetView('clients')" aria-label="Clients">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        <span>Clients</span>
      </button>
    </div>
  </nav>

  <script src="/js/cheree-book.js?v=${process.env.VERCEL_GIT_COMMIT_SHA || Date.now()}"></script>
</body>
</html>`;
}

/**
 * QFES "Individual Support Activity" (ISA) form staging tool — served at
 * /book/qfes. Lets Cheree pick a client and save her answers to the real
 * ISA form ahead of time (stored in Supabase `qfes_submissions`). Same
 * principle as the rest of /book: no Halaxy writes, and this deliberately
 * does NOT submit to forms.cloud.microsoft — Julian still does that
 * manually (or via the live co-pilot flow), copying these saved answers
 * across. Field list + options: Cheree's business/qfes-isa-form-schema.md.
 */
function cbQfesPage({ currentUser = null }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>QFES Forms — Cheree McGarry</title>
<link rel="icon" href="/assets/pwa-icon.svg">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta name="theme-color" content="#0B1210">
<style>
  :root {
    --bg: #0B1210; --card: #121C19; --border: rgba(255,255,255,0.08);
    --t1: #EDF3F1; --t2: #9FB3AE; --t3: #6E827D;
    --teal: ${C.mint}; --amber: #E0A339; --red: #E0714A; --green: #3FBF8F;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--t1); -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 640px; margin: 0 auto; padding: max(20px, env(safe-area-inset-top)) 18px 60px; }
  input, select, textarea, button { font-family: inherit; }

  .top-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .back-link { color: var(--t3); text-decoration: none; font-size: 13px; display: flex; align-items: center; gap: 4px; }
  .back-link:hover { color: var(--teal); }
  .top-bar h1 { font-size: 19px; font-weight: 700; margin: 0; }
  .top-sub { font-size: 12.5px; color: var(--t3); margin: 4px 0 20px; }

  .qf-toolbar { display: flex; gap: 8px; margin-bottom: 18px; }
  .search { flex: 1; box-sizing: border-box; padding: 12px 14px; border-radius: 10px; background: var(--card); border: 1px solid var(--border); color: var(--t1); font-size: 14px; }
  .search:focus { outline: none; border-color: var(--teal); }
  .qf-add-btn { flex-shrink: 0; padding: 12px 16px; border-radius: 10px; background: rgba(119,207,189,0.12); border: 1px solid var(--teal); color: var(--teal); font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .qf-add-btn:hover { background: rgba(119,207,189,0.2); }
  .qf-add-hint { font-size: 12px; color: var(--teal); background: rgba(119,207,189,0.08); border: 1px solid rgba(119,207,189,0.25); border-radius: 8px; padding: 9px 12px; margin: -8px 0 16px; }

  .sec-hd { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--t3); margin: 18px 0 10px; }
  .sec-hd:first-of-type { margin-top: 0; }
  .qf-row { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 12px; border: 1px solid var(--border); cursor: pointer; margin-bottom: 9px; transition: border-color 0.12s; }
  .qf-row:hover { border-color: var(--teal); }
  .qf-row .av { width: 38px; height: 38px; border-radius: 50%; background: rgba(119,207,189,0.15); color: var(--teal); display: flex; align-items: center; justify-content: center; font-size: 12.5px; font-weight: 700; flex-shrink: 0; }
  .qf-row .nm { font-size: 15px; font-weight: 600; }
  .qf-row .mt { font-size: 12px; color: var(--t3); margin-top: 1px; }
  .qf-status { margin-left: auto; flex-shrink: 0; font-size: 10.5px; font-weight: 700; padding: 4px 10px; border-radius: 20px; white-space: nowrap; }
  .qf-status-done { background: rgba(63,191,143,0.14); color: var(--green); }
  .qf-status-todo { background: rgba(224,163,57,0.14); color: var(--amber); }
  .qf-status-partial { background: rgba(255,255,255,0.06); color: var(--t2); }
  .fchip { display: inline-block; font-size: 9.5px; font-weight: 700; letter-spacing: 0.03em; padding: 3px 8px; border-radius: 7px; white-space: nowrap; }
  .fchip-QFES { background: rgba(224,163,57,0.15); color: var(--amber); }
  .fchip-Other { background: rgba(255,255,255,0.06); color: var(--t3); }
  .empty { text-align: center; padding: 30px 20px; color: var(--t3); font-size: 13px; line-height: 1.5; }
  .loading { text-align: center; padding: 50px 20px; color: var(--t3); font-size: 13px; }

  /* ── Form sheet ── */
  .sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 70; }
  .sheet-backdrop.open { opacity: 1; pointer-events: auto; }
  .sheet { position: fixed; top: 0; right: 0; bottom: 0; width: 100%; max-width: 460px; background: var(--bg); border-left: 1px solid var(--border); overflow-y: auto; transform: translateX(100%); transition: transform 0.24s ease; z-index: 71; }
  .sheet.open { transform: translateX(0); }
  .sheet-hd { display: flex; align-items: center; gap: 14px; padding: 20px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); z-index: 1; }
  .sheet-hd .ttl { font-size: 17px; font-weight: 700; }
  .sheet-hd .sub { font-size: 11.5px; color: var(--t3); margin-top: 3px; }
  .sheet-hd button { background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 9px; color: var(--t1); font-size: 17px; line-height: 1; cursor: pointer; padding: 8px 11px; flex-shrink: 0; }
  .sheet-hd button:hover { border-color: var(--teal); color: var(--teal); }
  .sheet-body { padding: 6px 20px 50px; }

  .qf-section { margin-bottom: 26px; padding-bottom: 22px; border-bottom: 1px solid var(--border); }
  .qf-section:last-of-type { border-bottom: none; }
  .qf-section-lbl { display: flex; align-items: center; font-size: 12.5px; font-weight: 700; color: var(--t1); margin-bottom: 12px; }
  .qf-step { display: inline-flex; align-items: center; justify-content: center; width: 19px; height: 19px; border-radius: 50%; background: rgba(119,207,189,0.15); color: var(--teal); font-size: 10.5px; font-weight: 800; margin-right: 9px; flex-shrink: 0; }
  .qf-field { margin-bottom: 14px; }
  .qf-field:last-child { margin-bottom: 0; }
  .qf-label { display: block; font-size: 12px; font-weight: 600; color: var(--t2); margin-bottom: 6px; }
  .qf-input, .qf-select { width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 9px; background: var(--card); border: 1px solid var(--border); color: var(--t1); font-size: 13.5px; }
  .qf-input:focus, .qf-select:focus { outline: none; border-color: var(--teal); }
  .qf-toggle-row { display: flex; gap: 8px; margin-bottom: 14px; }
  .qf-toggle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
  .qf-toggle-opt { flex: 1; text-align: center; padding: 12px 8px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); color: var(--t2); font-size: 13px; font-weight: 600; cursor: pointer; }
  .qf-toggle-opt.sel { border-color: var(--teal); color: var(--teal); background: rgba(119,207,189,0.1); }
  .qf-ct-list { display: flex; flex-direction: column; gap: 8px; }
  .qf-ct-opt { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); color: var(--t2); cursor: pointer; }
  .qf-ct-opt.sel { border-color: var(--teal); color: var(--t1); background: rgba(119,207,189,0.1); }
  .qf-ct-key { flex-shrink: 0; width: 24px; height: 24px; margin-top: 1px; border-radius: 50%; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 800; color: var(--t2); }
  .qf-ct-opt.sel .qf-ct-key { background: var(--teal); color: #08120F; }
  .qf-ct-desc { font-size: 13px; line-height: 1.45; padding-top: 3px; }
  .qf-notes { font-size: 12.5px; }
  .qf-notes .qf-input { font-size: 12.5px; color: var(--t2); }
  .qf-savebar { font-size: 11.5px; color: var(--t3); text-align: center; margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--border); }
  .qf-savebar.saving { color: var(--amber); }
  .qf-hint { font-size: 12px; color: var(--t3); line-height: 1.5; padding: 2px 0 4px; }

  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--card); border: 1px solid var(--teal); color: var(--t1); padding: 12px 20px; border-radius: 10px; font-size: 13px; z-index: 90; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="top-bar">
      <a href="/book" class="back-link">&larr; Back</a>
      <h1>QFES Forms</h1>
    </div>
    <div class="top-sub">What Cheree needs to give us for the ISA form — everything else comes from Halaxy or the appointment itself. Answers save automatically as you go.</div>
    <div class="qf-toolbar">
      <input class="search" id="qf-search" placeholder="Search clients by name&hellip;" autocomplete="off">
      <button class="qf-add-btn" id="qf-add-btn">+ Add QFES client</button>
    </div>
    <div id="qf-root"><div class="loading">Loading&hellip;</div></div>
  </div>
  <div id="toast"></div>

  <div class="sheet-backdrop" id="qf-form-backdrop"></div>
  <div class="sheet" id="qf-form-sheet">
    <div class="sheet-hd">
      <button id="qf-form-close" aria-label="Back — everything here saves automatically">&larr;</button>
      <div><div class="ttl" id="qf-form-name"></div><div class="sub">QFES Individual Support Activity</div></div>
    </div>
    <div class="sheet-body" id="qf-form-body"></div>
  </div>

  <script src="/js/cheree-qfes.js?v=${process.env.VERCEL_GIT_COMMIT_SHA || Date.now()}"></script>
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

  // QFES ISA form staging tool — served at /book/qfes (rewritten with
  // ?cheree=1&qfes=1). Checked before the plain /book branch below.
  if (req.query?.cheree && req.query?.qfes) {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(cbQfesPage({ currentUser }));
  }

  // Cheree's booking tool — served at /book (rewritten with ?cheree=1).
  // Everything else this function used to serve (/admin, /admin-new) has
  // been retired — /book is the only dashboard now. Any other authed
  // request here (a stale bookmark, a direct hit on /api/admin) just lands
  // on /book instead of a dead page.
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(cbBookPage({ currentUser }));
}
