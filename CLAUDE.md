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

**`/register`** (`register.html`, rewrite in `vercel.json`) — **unlisted** (`noindex`, not linked) client registration page. **Self-contained single file** (uses design *tokens* + fonts from `styles.css`, but its own inline layout — NOT the site nav/layout). A **single unified screen** (`.reg`, viewport-height, no page scroll): green header + a persistent **funder list** (left rail on desktop / bottom-sheet on mobile, each option carries its referral note) + a form panel that shows a dashed **placeholder** until a funder is picked, then loads that funder's **Halaxy new-patient widget** in an iframe **in place** (`selectFunder()` swaps `hx.src`, no navigation/reload). iframe `max-width:880px`, left-aligned (verified live: Halaxy single-columns ≤767px, multi-column ≥768, no step sidebar 760–1000). Card capture stays inside Halaxy (no PCI for us). Deep-link `?funder=medicare` pre-selects. Mobile header = two rows (logo+name / funder selector) + mint "what you'll fill in" pill + a secure/scroll info strip. Earlier two-step picker→form flow was **retired**. **Full rationale + remaining work in `docs/registration-form-spec.md` and `TODO.md`.** Private + Medicare wired; other funders hidden until Cheree sends their widget URLs. **Next: Patient·Create webhook → thank-you email + advance enquiry (fold into an existing API file; 12/12 functions).**

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

**Critical Halaxy invoice paid/unpaid logic — THE BALANCE IS THE SOURCE OF TRUTH.** Halaxy keeps standard invoices at `status='active'` whether paid or not (verified against a "PAID IN FULL" NDIS invoice that was still `active`), so **status is NOT a reliable paid signal** — only `totalBalance` is.
- `_invIsPaid(inv)` (`js/admin-ui.js`): `totalBalance <= 0` ⇒ **paid** (excludes only `cancelled`/`draft`). True whether the client paid by card, Medicare paid, or a funder (NDIS plan manager, WorkCover, DVA) sent remittance and the payment was recorded. **There is NO "paid but not yet reconciled" state** — recording the payment in Halaxy *is* the reconciliation, and that's what drives the balance to 0.
- **Outstanding = `totalBalance > 0`** (money still owed). That's the only thing the billing block counts.
- `_invIsAwaitingRemittance(inv)`: the *rare* case — a funder-billed invoice (`payorOrg` set) that is **still unpaid** (`balance > 0`), e.g. WorkCover (submit via Halaxy → wait for remittance → record payment → balance 0). It's a *flavour of outstanding* (money not in yet), shown amber "Submitted · awaiting remittance" — distinct from a private invoice the client owes (here we wait on the funder, don't chase a client). NOT a paid state.
- ⚠ **The old model was wrong** (and broke the billing block): it treated `active + payorOrg + balance=0` as "paid-but-unreconciled" and counted ~78 fully-paid NDIS plan-managed invoices as "outstanding/unpaid". The retired function was `_invIsPendingRecon`. Don't reintroduce a "paid but unreconciled" concept.
- Org-billed invoices (NDIS plan mgr / WorkCover / DVA) carry **no patient reference** in the bulk `/Invoice` fetch — `recipient` is the funder Org and `title` is just the funder name. Patient is resolved by the date-based fallback or a per-patient `/Invoice` fetch (`?halaxy_patient_invoices`). Unresolved → "Unknown" in the UI.
- Never add `status === 'active'` as a blanket "unpaid" rule — it will flag every invoice as unpaid.
- **Per-session invoice attribution is impossible — don't try.** Halaxy's `/Invoice` **ignores the `patient=` filter** (returns a global page regardless) and **exposes no `lineItem`** (no per-session service dates). So a funder bulk invoice (QFES/NDIS bill many sessions across dates onto one invoice, e.g. inv `1090256291` dated 05-May covering March sessions for two clients) **cannot** be matched to a specific session/patient via the API. Confirmed via `?match_debug=1`. The **billing block is the source of truth** (sums invoice balances directly). The **schedule** therefore tags org-billed clients (NDIS/QFES/WorkCover/DVA) neutrally as **`funder-billed`** — mapped via `appointment.patientId → dashboard client.funder` (`_guessFunderKey`) — instead of date-guessing paid/needs-invoice; private/Medicare keep date-matching. **Appointments DO carry `patientId`** via `participant[]` for most (the old "participant always omitted" note is wrong). Full detail: memory `halaxy-invoice-api-limits`.

### Google Calendar
OAuth tokens stored in `settings` table (`google_refresh_token`). Used for "pending clients" calendar and session events. `calendar-pending.js` exports `createCalendarEvent` / `deleteCalendarEvent` used by other handlers.

### Gmail (remittance search)
Read-only inbox search to confirm a funder's remittance has actually landed. Reuses the **same Google OAuth app** as Calendar — `api/google-auth.js` requests `gmail.readonly` + `userinfo.email` alongside `calendar.events` (`prompt:consent` + `access_type:offline`, so re-consent mints a fresh refresh token with the new scope). **There is no service-account key** — the org policy `iam.disableServiceAccountKeyCreation` blocks those; a user refresh token is the unblocked path.
- **Per-mailbox tokens:** `google-callback.js` decodes the `id_token` to learn which account consented and stores a **map** in `settings.gmail_tokens` (`{ "<email>": "<refresh_token>" }`) — merge, not clobber, so **admin@ and reachout@ are each connected by hitting Settings → Google → Reconnect and signing in as that account in turn**. `google_refresh_token` is still kept for Calendar back-compat (and used as a single-mailbox fallback by `_gmail.js` before any mailbox is explicitly connected).
- **`api/_gmail.js`** (leaf module, not a serverless function — stays within the 12-function cap) exports `searchRemittance(invoiceNumber)`: fans out across every connected mailbox via the Gmail API (`Promise.allSettled` so one bad mailbox can't sink the check), query = the invoice number **AND** a remittance term (`remittance OR remitted OR "payment advice" OR "remittance advice"`) to drop noise (client threads, the invoice we sent). Never throws — per-mailbox failures land in `errors`.
- **Endpoint:** `GET /api/admin-enquiries?check_remittance=<invoiceNumber>` (read-only). Wired to the **"🔍 Check inbox for remittance"** button shown only on **awaiting-remittance** invoices in the invoice modal (`_checkRemittance()` in `js/admin-ui.js`). A hit means the funder's money has arrived even though Halaxy still shows the invoice unpaid → go reconcile in Halaxy. **Searches `inv.ref`** (the real invoice number funders quote), not the URL-derived `invNumericId`.
- **Deep link gotcha:** the result row links into Gmail via **`?authuser=<email>#search/<invoiceNumber>`**. The `/u/<email>/` email-in-path form throws Gmail's "Temporary Error (404)", and the `rfc822msgid:` fragment opened the right account but didn't surface the message (finicky encoding). A plain `#search/<invoiceNumber>` is the reliable choice — the server found the email by that number, so the same UI search hits the same index. It lands on **search results** (may include the invoice you sent for that number), not the message itself — accepted trade-off for reliability.

### Resend (email)
From address: `reachout@chereemcgarry.com` (domain verified). Used for registration/onboarding emails (`admin-intake.js`) and 48h appointment reminders (cron in `admin-enquiries.js`).

**Email templates live in `api/admin-intake.js`** — all built as inline-styled HTML tables (no external CSS) and rendered through a shared `wrap(innerHtml, preheader)` shell:
- **Branding/shell:** light **cream + teal** theme (the `C` colour map). Logo at `/assets/email-logo.png` (transparent PNG, rasterized from `assets/logo.svg` via a browser canvas — `qlmanage` bakes a white bg, so use the canvas-download route). `wrap()` supports a hidden **preheader** (inbox-preview text).
- **Templates:** `registrationEmailHtml` (the PRIMARY — one email with an in-email **funding-form picker**; `FUNDING_FORMS` = Private/Medicare/NDIS/Bupa/QFES/WorkCover, each a fully-tappable card with its own Halaxy link — **URLs are PLACEHOLDERS** pending the real links). Legacy: `personalEmailHtml`, `intakeEmailHtml` (per-funding, single-link). `buildIntakeHtml(clientType, …)` dispatches; `clientType ∈ {registration, complete, new, personal, medicare, ndis}`.
- **Shared module `api/_emails.js`** holds the cross-handler `registrationCompleteEmailHtml` (the "thank-you / you're all set" email fired by the registration webhook) + its own `wrap`/`C`. It lives there (not in a handler) so both `admin-intake.js` (test picker) and `admin-enquiries.js` (webhook) import it **without a circular dependency**. Keep `_emails.js` a leaf — it must not import a route handler.
- **Other live client emails** live in their own handlers and are **exported** so the test picker can render them: `clientReplyHtml` (contact.js — "thanks for reaching out"), `clientConfirmationHtml` (session.js — "your session request"), `_reminderHtml` (admin-enquiries.js — 48h appointment reminder).
- **Terminology rule:** these are **"registration"** emails (administrative: get the client set up + booked), **never "intake"**. "Intake" is reserved for a future clinical questionnaire (couples/children intake). Don't reintroduce "intake" in client-facing copy.
- **Email design constraints:** NO frosted glass / `backdrop-filter` / CSS gradients-as-sole-bg / web fonts — none render reliably in email. Keep it light (dark designs break under clients' dark-mode inversion). Gradient accent bars need a solid-colour fallback for Outlook. Mobile relies on simple stacking, not media queries.
- **Test harness:** Settings → **"Email tests"** picker (`renderSettingsView` + `sendTestEmail()` in `admin-ui.js`) → `POST /api/admin-intake { test:1, clientType }` renders the chosen template with sample data and sends **only to `admin@chereemcgarry.com`** (no enquiry lookup, no DB writes). **`renderTestEmail(type)` in `admin-intake.js` is the single registry of testable emails** — it covers **every** live client email (enquiry thanks, session confirmation, registration, registration-complete, 48h reminder, + per-funder variants). **RULE: any new client email must get a `case` in `renderTestEmail()` + an `<option>` in `renderSettingsView`** so it stays test-sendable.
- **Registration-complete webhook (LIVE):** `POST /api/admin-enquiries?halaxy_webhook=1` — Halaxy Patient·Create fires when a client finishes `/register`. The handler verifies `HALAXY_WEBHOOK_SECRET` (Bearer, in any header), extracts the `Patient/<id>` from the FHIR SubscriptionStatus payload, `halaxyGet`s the patient for name+email, then **matches the enquiry by email → advances it to `in_halaxy`** (+ stores the Halaxy ref, logs it) **or creates a `self-registered` enquiry** if none, and sends `registrationCompleteEmailHtml`. Idempotent via a `halaxy_registered_patients` settings-cache ledger; always returns 200.

- **Two front doors to Halaxy** (the earlier "single front door, no manual entry" principle is superseded — Cheree only uses Google Calendar and never opens Halaxy; Julian does the billing setup):
  1. **Self-register** — `/register` widget → Patient·Create webhook (above) auto-advances the enquiry.
  2. **Dashboard "Set up in Halaxy"** — the `openSetupInHalaxy()` wizard (`js/admin-ui.js`) for clients who won't self-register (booked in Google Calendar / known existing). It match-or-creates the Halaxy patient → writes Coverage (non-private; NDIS routes via the chosen plan manager) → `POST /Appointment/$book` with the configured fee (Halaxy then auto-creates the invoice + clinical note + reminder). Entry points: a button on the Appointments panel + a "⚕ Set up in Halaxy" CTA on upcoming unlinked Google Calendar events. The funder×session-type→fee mapping is configured in **Settings → "Booking fees"** (`session_fee_map`, `BOOKABLE_MENU`). **Full design + the live-test-before-real-use caveat: `docs/halaxy-onboarding-spec.md`.** Critical non-obvious facts for this flow:
  - **`$book` only accepts `location-type: 'clinic'` when *creating* an appointment** — online/phone → HTTP 422 "too-costly". So the wizard always sends `clinic`; the **modality is carried by the chosen fee** (e.g. the "Online — $180" fee), so the invoice is correct even though the appointment's location flag is clinic.
  - **NDIS routing is via Coverage, not the fee.** The FHIR fee list is deduped by name+amount, collapsing the 8 plan managers' identical $193.99 fees; the plan manager Cheree picks sets the **Coverage payor org** (`?halaxy_coverage=1`), which is what routes the invoice.
  - **"Bupa" = DVA / ADFHCS** in this practice (not health insurance); DVA fee is **US24 $246.44** only.
  - Confirm is an **arm-the-button** pattern (no native `window.confirm`); existing patients are found by **email auto-search + name search** inside the modal (avoids duplicates), shown as a "hero" card.
- **Optimistic UI pattern** — mutating actions update local `_pipelineData` + re-render via `renderPipeline()` (reads local data, **no re-fetch, no flash**), with a `revert()` on failure. See `_optimisticEnquiry()` (advanceEnquiryStatus, _submitCloseEnquiry) and `dhToggleTask`. `refreshPipeline()` (full re-fetch) is reserved for **manual refresh + actions that genuinely change server-side data** (convert-to-client, `$book`). There is **no "Pipeline refreshed" toast** — a background sync must be silent.
- **Inbox = TWO issue buckets** (was three): **⚠ No Invoice** (Halaxy appts lacking an invoice) + **⚕ Not in Halaxy** (all calendar appts with no Halaxy patient, past+future, via `_dhNotInHalaxy()`). The old "Unlinked Events" / "Needs Action" split was merged since both resolve via "Set up in Halaxy".
- **Parked work is in `TODO.md`** (repo root): appointment **confirmation email** (+ a combined "confirmation + registration" variant), simplifying the admin "send" flow to one button, and wiring the registration email live. **The manual "Add to Halaxy" flow has now been retired** (`admin-ui.js`): the pipeline "Add to Halaxy →" auto-advance, the "Send intake"/"Send onboarding" paste-Halaxy-URL UI, and the manual patient search/create/mark panel are gone — the Patient·Create webhook auto-advances `contacted → in_halaxy`. The non-test `admin-intake.js` send path is kept as plumbing for the future single "Send registration email" button.

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
| `HALAXY_WEBHOOK_SECRET` | Shared secret for the Halaxy Patient·Create webhook (`POST /api/admin-enquiries?halaxy_webhook=1`). Halaxy sends it as `Authorization: Bearer <secret>`; the handler accepts the secret in **any** request header (`Object.values(req.headers).some(...)`) since Halaxy's "Authentication Header" field forces the Bearer format. Set in Vercel + in the Halaxy webhook config (must match). |

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
- **Asset cache-busting:** `api/admin.js` serves the `/admin` HTML with `Cache-Control: no-store` (always fresh) and links `admin-ui.js` + `admin-dashboard.css` with `?v=${process.env.VERCEL_GIT_COMMIT_SHA || Date.now()}` — assets cache *within* a deploy but bust *on* every deploy, so a **normal reload after a deploy gets the new code** (no hard-refresh). Caveat: a tab left **open** across a deploy keeps running old code until reloaded (no SW; an auto-update check would fix that — parked in `TODO.md`).
- **Two-layer CSS hazard (light leftovers):** some `.xyz` rules in `api/admin.js`'s inline `<style>` use the old cream theme but are dead-overridden by `css/admin-dashboard.css` (`!important`) → they render dark. The genuinely-light ones are selectors **only** in the inline block (not in admin-dashboard.css) — fix those inline. The known live offenders (`.mm-*` mini-modal, `openNewSessionModal`, `.pl-link-input`) were dark-themed 2026-06; if you find another, check it's not just an overridden-dead rule before "fixing".

## Cron

`GET /api/admin-enquiries?reminder_cron=1` runs at 22:00 UTC daily (08:00 AEST) — sends 48h appointment reminder emails via Resend.

## PWA

`manifest.json` + `assets/pwa-icon.svg` (logo on cream background). Apple touch icon and theme colour configured in the `<head>` of `api/admin.js`.
