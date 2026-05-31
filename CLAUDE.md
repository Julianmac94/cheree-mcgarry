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

**`/register`** (`register.html`, rewrite in `vercel.json`) — **unlisted** (`noindex`, not linked) client registration page. Branded funding picker → embeds the chosen funder's **Halaxy new-patient form widget** in an iframe (capped at 680px so Halaxy hides its step sidebar). Desktop shows a "what you'll fill in" strip; mobile shows a "before you start" pop-up then a full-screen iframe. Card capture stays inside Halaxy (no PCI for us). **Full rationale + remaining work in `docs/registration-form-spec.md` and `TODO.md`.** Private + Medicare wired; other funders are "Available soon" until Cheree sends their widget URLs.

**Page load flow:**
1. `GET /admin` → `api/admin.js` renders the full HTML shell (inline CSS, meta tags, script tags)
2. Browser loads `js/admin-ui.js` and `css/admin-dashboard.css` as static assets
3. On load, `refreshPipeline()` calls `GET /api/admin-enquiries` which returns a combined payload: `{ enquiries, clients, halaxy: { appointments, patients, funders, fees, ... }, calendarEvents }`
4. All subsequent data mutations call individual API endpoints then re-call `refreshPipeline()` to re-render

**Mobile vs Desktop:** `admin-ui.js` renders both layouts. Mobile has a floating glass dock nav (`_mobRenderApp()` dispatcher). Desktop has a sidebar. The brief loads into `#dh-hd-meta` (desktop) or `#mob-brief-text` (mobile).

**⚠ Two-layer CSS — the dark theme is produced by TWO mechanisms, not one.** `api/admin.js` has a large inline `<style>` block whose `:root` and hardcoded colours are a leftover **light/cream** theme (`--bg: #F5F2EE`, `.modal-card: #F3EFE6`). The dashboard looks dark because of two things working together:
1. `css/admin-dashboard.css` loads *first* (in `<head>`) and overrides **colours/appearance** with `!important` (`--canvas: #080C18`, white text, ~320 `!important` decls).
2. A **dark `:root` re-declaration sits LAST inside the inline block** (`api/admin.js` ~L3263, commented) that re-points `--teal`/`--amber`/`--canvas` to dark values — so the inline block's `var(--*)` references resolve **dark**.

Practical consequences:
- The inline block is **mostly load-bearing** (~75%): it holds the only copy of **layout/positioning** for hundreds of selectors, plus token refs that resolve dark. Only the hardcoded *light hex* on selectors also defined in `admin-dashboard.css` is truly dead-overridden.
- So: editing inline **layout** (width/flex/position) **works**; editing inline **hardcoded colours** that `admin-dashboard.css` overrides with `!important` does **not** — change those in `admin-dashboard.css`. The detail-panel modal styling lives there at ~L1645–2240.
- When previewing in isolation you **must** load `admin-dashboard.css` or you'll see the cream fallback and think the app looks old.
- The detail panel (`#modal-overlay`/`.modal-card`, opened by `openDetailPanel()`) is a **right-docked drawer** on desktop / **full-screen drill-in** (back arrow) on mobile. Form modals that reuse these classes (e.g. Add Reminder) opt back into a centered dialog via the `modal-centered` class.

### 🚧 In progress: CSS consolidation — branch `refactor/css-consolidation` (NOT on main/prod yet)

Collapsing the two-layer CSS above into ONE clean dark stylesheet. On that branch the description above is partly superseded; on `main`/prod it still holds.

Done on the branch (each step verified **pixel-identical** via a computed-style diff — old `git HEAD` CSS vs working tree in a standalone harness, not just screenshots):
- **Foundation:** the ~3,070-line inline `<style>` was moved out of `api/admin.js` into `css/admin-dashboard.css`; the 3 `:root` blocks collapsed into one (net values preserved); `${C.color}` interpolations replaced with literals; stylesheet `<link>` cache-busted with `?v=${VERCEL_GIT_COMMIT_SHA}`. `api/admin.js` dropped 3,958 → 888 lines.
- **Slice 1** detail panel/modals, **Slice 2** sidebar (icon rail; dead 220px base deleted), **Slice 3** settings — all merged into `!important`-free rules. `!important`: 423 → 158.

Remaining: **app-shell slice** (`.app-shell`/`.app-main`/`.view-content`/`.app-topbar`/`.view-title`/`.home-view`, ~26 base-fight `!important`, structural — affects every page) + ~3 mobile `@media` settings stragglers. The other ~130 `!important` are **legit dark-native** (defensive/responsive) and are intentionally being LEFT — zero `!important` is NOT the goal.

Known quirk surfaced: the sidebar nav badge (`.si-badge`) renders as an 8×18 amber *stadium* on prod (latent bug — base overrode the dark layer's intended 8px **dot**); currently preserved as-is, could be flipped to the dot. When the branch merges, replace the two-layer note above with "single dark stylesheet".

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
From address: `reachout@chereemcgarry.com` (domain verified). Used for registration/onboarding emails (`admin-intake.js`) and 48h appointment reminders (cron in `admin-enquiries.js`).

**Email templates live in `api/admin-intake.js`** — all built as inline-styled HTML tables (no external CSS) and rendered through a shared `wrap(innerHtml, preheader)` shell:
- **Branding/shell:** light **cream + teal** theme (the `C` colour map). Logo at `/assets/email-logo.png` (transparent PNG, rasterized from `assets/logo.svg` via a browser canvas — `qlmanage` bakes a white bg, so use the canvas-download route). `wrap()` supports a hidden **preheader** (inbox-preview text).
- **Templates:** `registrationEmailHtml` (the PRIMARY — one email with an in-email **funding-form picker**; `FUNDING_FORMS` = Private/Medicare/NDIS/Bupa/QFES/WorkCover, each a fully-tappable card with its own Halaxy link — **URLs are PLACEHOLDERS** pending the real links). Legacy: `personalEmailHtml`, `intakeEmailHtml` (per-funding, single-link). `buildIntakeHtml(clientType, …)` dispatches; `clientType ∈ {registration, new, personal, medicare, ndis}`.
- **Terminology rule:** these are **"registration"** emails (administrative: get the client set up + booked), **never "intake"**. "Intake" is reserved for a future clinical questionnaire (couples/children intake). Don't reintroduce "intake" in client-facing copy.
- **Email design constraints:** NO frosted glass / `backdrop-filter` / CSS gradients-as-sole-bg / web fonts — none render reliably in email. Keep it light (dark designs break under clients' dark-mode inversion). Gradient accent bars need a solid-colour fallback for Outlook. Mobile relies on simple stacking, not media queries.
- **Test harness:** Settings → **"Email tests"** picker (`renderSettingsView` + `sendTestEmail()` in `admin-ui.js`) → `POST /api/admin-intake { test:1, clientType }` renders the chosen template with sample data and sends **only to `admin@chereemcgarry.com`** (no enquiry lookup, no DB writes). The registration email is currently reachable ONLY via this test picker — the real client-facing send still uses the old per-funding flow until the real links land.
- **Parked work is in `TODO.md`** (repo root): appointment **confirmation email** (+ a combined "confirmation + registration" variant), simplifying the admin "send" flow to one button, and wiring the registration email live.

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
| `CRON_SECRET` | Authenticates the reminder cron. Vercel auto-injects it as `Authorization: Bearer <CRON_SECRET>` on cron calls. **If unset, cron auth falls back to the spoofable `x-vercel-cron` header** — keep it set. See `_isCronAuthed` in `admin-enquiries.js`. |
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
