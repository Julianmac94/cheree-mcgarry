# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Private practice management dashboard for Cheree McGarry (psychologist). Two users: Cheree and Julian. Deployed on Vercel Hobby plan at `chereemcgarry.com`.

## Deploy & Dev Commands

```bash
# Deploy to production
vercel --prod

# Deploy preview
vercel

# Check recent logs (production)
vercel logs --no-branch --environment production --since 10m --json

# Update an env var via CLI (more reliable than dashboard UI)
vercel env rm VAR_NAME production --yes
vercel env add VAR_NAME production

# Pull dev env vars locally
vercel env pull .env.local
```

There is **no build step** — files are served directly by Vercel. `package.json` has no scripts. Changes go live on the next `vercel --prod` or GitHub push (auto-deploy is connected).

## Architecture

This is a **vanilla JS + Vercel serverless** app — no framework, no bundler.

```
api/          Vercel serverless functions (Node ESM, .js)
  _auth.js        HMAC cookie auth shared helper
  _supabase.js    Supabase service-role client singleton
  _halaxy.js      Halaxy FHIR R4 API helper (OAuth + token cache)
  admin.js        GET /admin — server-renders the full dashboard HTML page
  admin-enquiries.js  Main data endpoint — aggregates Supabase + Halaxy + GCal
  admin-intake.js     Sends onboarding email via Resend
  admin-tasks.js      Tasks CRUD + AI receptionist brief (POST ?brief=1)
  calendar-pending.js Google Calendar integration
  clients.js      Client CRUD
  sessions.js     Session CRUD (links to Halaxy appointments)

js/
  admin-ui.js   ~10k line client-side app — all dashboard interactivity
css/
  admin-dashboard.css  Dashboard styles
assets/         Static images including logo.svg, pwa-icon.svg
manifest.json   PWA manifest
vercel.json     Rewrites /admin→/api/admin, /admin-login→/api/admin-login + cron
```

**Routing:** `/admin` and `/admin-login` are rewritten to serverless functions via `vercel.json`. All other HTML files are static.

**Page load flow:**
1. `GET /admin` → `api/admin.js` renders the full HTML shell (inline CSS, meta tags, script tags)
2. Browser loads `js/admin-ui.js` and `css/admin-dashboard.css` as static assets
3. On load, `refreshPipeline()` calls `GET /api/admin-enquiries` which returns a combined payload: `{ enquiries, clients, halaxy: { appointments, patients, funders, fees, ... }, calendarEvents }`
4. All subsequent data mutations call individual API endpoints then re-call `refreshPipeline()` to re-render

**Mobile vs Desktop:** `admin-ui.js` renders both layouts. Mobile has a floating glass dock nav (`_mobRenderApp()` dispatcher). Desktop has a sidebar. The brief loads into `#dh-hd-meta` (desktop) or `#mob-brief-text` (mobile).

## Auth

HMAC-signed cookie (`ast`). Two named users from env: `JULIAN_PASS`, `CHEREE_PASS`. All API handlers call `isAuthed(req)` as first line. `getSessionUser(req)` returns `{ name, initials }`. Legacy `ADMIN_PASS` still works (logs in as Julian).

## Data Sources

### Supabase (primary store)
Tables: `enquiries`, `clients`, `sessions`, `tasks`, `activity_log`, `settings`

The `settings` table is used as a key-value cache — Halaxy OAuth tokens and funders/fees config are stored here to avoid hitting the Halaxy API on every request.

### Halaxy FHIR R4 API (`au-api.halaxy.com`)
Practice management system. Used for appointments, patients, invoices, funders, fees. Auth is OAuth2 client credentials — token is cached in `settings` table with 2-minute expiry buffer. Helpers: `halaxyGet()`, `halaxyPost()`, `halaxyPatch()`.

**Critical Halaxy invoice status quirk:** Halaxy uses `status='active'` for ALL standard paid invoices (not the FHIR spec meaning). The correct paid/pending logic:
- `_invIsPaid(inv)`: returns false for `status='issued'` and for funder invoices (`inv.payorOrg` set) with `status='active'` + balance=0 (awaiting reconciliation). Returns true for `status='balanced'` or `status='paid'`.
- `_invIsPendingRecon(inv)`: funder invoices where payment received but not yet reconciled in Halaxy — amber "Submitted · Awaiting reconciliation" state (no tick, action still needed).
- Never add `status === 'active'` as a blanket "unpaid" rule — it will flag every invoice as unpaid.

### Google Calendar
OAuth tokens stored in `settings` table (`google_refresh_token`). Used for "pending clients" calendar and session events. `calendar-pending.js` exports `createCalendarEvent` / `deleteCalendarEvent` used by other handlers.

### Resend (email)
From address: `reachout@chereemcgarry.com` (domain verified). Used for onboarding emails (`admin-intake.js`) and 48h appointment reminders (cron in `admin-enquiries.js`). **Important:** Supabase client does not support `.catch()` chained on query builders — use `try/catch` instead.

### Anthropic API (AI brief)
`POST /api/admin-tasks?brief=1` — calls `claude-haiku-4-5-20251001`. API key from `platform.claude.com` workspace (not console.anthropic.com — these are different key pools). Brief is cached client-side in `sessionStorage` keyed by target element + ISO hour. Passes `currentTime` + per-session `done: true/false` flags so the brief is time-aware.

## Key Env Vars

| Variable | Purpose |
|---|---|
| `ADMIN_SECRET` | Signs HMAC auth cookies |
| `JULIAN_PASS` / `CHEREE_PASS` | Login passwords |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase (server-side only) |
| `HALAXY_CLIENT_ID` / `HALAXY_CLIENT_SECRET` | Halaxy OAuth |
| `ANTHROPIC_API_KEY` | AI brief — must be from `platform.claude.com` |
| `RESEND_API_KEY` | Outbound email |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Calendar OAuth |

## Cron

`GET /api/admin-enquiries?reminder_cron=1` runs at 22:00 UTC daily (08:00 AEST) — sends 48h appointment reminder emails via Resend.

## PWA

`manifest.json` + `assets/pwa-icon.svg` (logo on cream background). Apple touch icon and theme colour configured in the `<head>` of `api/admin.js`.
