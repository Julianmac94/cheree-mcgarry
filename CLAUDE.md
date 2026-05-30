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

**⚠ Two-layer CSS — the dark theme lives in `admin-dashboard.css`, NOT the inline styles.** `api/admin.js` has a large inline `<style>` block that is a leftover **light/cream** theme (`--bg: #F5F2EE`, `.modal-card: #F3EFE6`, etc.). `css/admin-dashboard.css` loads *first* (in `<head>`) and repaints the entire dashboard **dark glass** (`--canvas: #080C18`, white text) by overriding with `!important`. So:
- The inline light styles are almost entirely **dead** — visible only if `admin-dashboard.css` fails to load. Editing them usually has **no effect** on the live (dark) site.
- To change the live appearance, edit `css/admin-dashboard.css` (and match its `!important` pattern). The detail-panel modal lives there at ~L1645–2212.
- When previewing in isolation, you **must** load `admin-dashboard.css` or you'll see the cream fallback and think the app looks old.
- The detail panel (`#modal-overlay`/`.modal-card`, opened by `openDetailPanel()`) is a **right-docked drawer** on desktop / **full-screen drill-in** (back arrow) on mobile. Form modals that reuse these classes (e.g. Add Reminder) opt back into a centered dialog via the `modal-centered` class.

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
From address: `reachout@chereemcgarry.com` (domain verified). Used for onboarding emails (`admin-intake.js`) and 48h appointment reminders (cron in `admin-enquiries.js`).

**Important:** Supabase query builders do not support `.catch()` chained directly — always use `try/catch` with `await`. Using `.catch(() => {})` throws `TypeError: .catch is not a function` at runtime, which surfaces to the user as a failed request even if the main operation (e.g. sending an email) already succeeded.

### Anthropic API (AI brief)
`POST /api/admin-tasks?brief=1` — calls `claude-haiku-4-5-20251001`. API key from `platform.claude.com` workspace (not `console.anthropic.com` — these are different key pools with different available models). The `platform.claude.com` workspace only has Claude 4.x models — Claude 3.x model IDs return 404. If the model 404s, check available models via `GET https://api.anthropic.com/v1/models` with the key.

**If the API key stops working:** Always update via CLI (`vercel env rm` / `vercel env add`) not the Vercel dashboard UI — the dashboard edit form has shown issues where the old value persists. Confirm the key is active by checking "Last Used" in the Claude Console after a page load.

Brief is cached client-side in `sessionStorage` keyed by target element + ISO hour. Passes `currentTime` + per-session `done: true/false` flags so the brief is time-aware. The brief handler **must** appear before the `title` guard in the POST block of `admin-tasks.js`, otherwise it returns 400 "Title required" before reaching the brief code.

The brief response is rendered as paragraph chunks split on `\n\n` — each chunk gets `.ai-brief-para` class with a subtle teal divider between them. Fades in via `ai-brief-pulse-in` CSS animation (no typewriter).

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

## Mobile UI

The mobile layout lives entirely in `api/admin.js` (inline CSS) and `js/admin-ui.js`. Key pieces:

- **Dock:** Floating glass pill (`mob-dock-pill`) with `backdrop-filter: blur(32px) saturate(180%)`. No text labels. Center `+` button rotates to `×` via `sheet-open` class. Active icon gets `dock-icon-pop` keyframe animation.
- **`_mobRenderApp(app)`** dispatches to view renderers. `'reminders'` is aliased to `_mobRenderInbox()`.
- **`_mobRenderHome()`** shows the AI brief card + today's sessions. After 4pm (or if no sessions remain today) it switches to show tomorrow's sessions with label "Tomorrow".
- **Brief card** (`mob-home-brief-card`): teal-tinted background, brief text in `.mob-home-brief-text`, therapy quote as `.mob-home-brief-signoff` below a divider. Quote rotates daily by day-of-year index from `_MOB_QUOTES` array (10 quotes, not AI-generated).
- **Bottom padding:** `mob-home-wrap` has 100px bottom padding to clear the floating dock.

## Vercel / Deployment Gotchas

- **Hobby plan:** Max 12 serverless functions. Streaming responses are buffered — use plain JSON responses, not `res.write()` streaming.
- **Log access:** `vercel logs` defaults to current git branch. Always use `--no-branch --environment production` for production logs. Pipe through `--json` and Python to see untruncated messages.
- **Env var updates** require a redeploy to take effect in serverless functions.
- **GitHub auto-deploy** is connected — every `git push` to `main` triggers a production deploy. Running `vercel --prod` from the CLI also works and is faster for iteration.

## Cron

`GET /api/admin-enquiries?reminder_cron=1` runs at 22:00 UTC daily (08:00 AEST) — sends 48h appointment reminder emails via Resend.

## PWA

`manifest.json` + `assets/pwa-icon.svg` (logo on cream background). Apple touch icon and theme colour configured in the `<head>` of `api/admin.js`.
