# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Private practice management tool for Cheree McGarry (psychologist). Two users: Cheree and Julian. Deployed on Vercel Hobby plan at `chereemcgarry.com`.

**The live app is `/book`.** Everything under it is a from-scratch rewrite (Aug 2026) that replaced an older Halaxy-integrated admin dashboard. See `ARCHITECTURE.md` for the full data-flow picture and `CHANGELOG.md` for how it got here — this file is deliberately just conventions and gotchas.

## The one rule that governs everything here

**The dashboard never writes to Halaxy — no patient creation, no appointment booking, no invoice creation, ever, from any code path.** Cheree books sessions in Google Calendar; she creates the actual appointment + invoice in Halaxy herself, manually. This tool's job is to help her and Julian *track* that, not replace it.

This wasn't always true. An earlier iteration had at least seven independent code paths that created patients/appointments in Halaxy (a "Set up in Halaxy" wizard, a "New Appointment" modal, a few others) — all removed. If you're adding a feature and find yourself reaching for `halaxyPost('/Patient', ...)` or `halaxyPost('/Appointment/$book', ...)`, stop — that's very likely the wrong design. Halaxy access from this codebase should be **read-only** (`halaxyGet`) except in the two narrow, already-audited cases below.

**Known residual risk, not yet cleaned up:** `api/admin-enquiries.js` still has `?halaxy_appt_action=1` (record/reschedule/cancel — patches an *existing* Halaxy appointment, never creates one) and `?halaxy_coverage=1` POST (writes Coverage to an existing patient). As of this writing, **no frontend file calls either** — `/book` and `/book/qfes` don't touch them. They're not create-flows (they require an existing `halaxyApptId`/`patientId`), so they're lower-risk than what was removed, but they're dead code sitting on live write endpoints. Worth removing entirely once confirmed nothing needs them.

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

There is **no build step** — files are served directly by Vercel. Changes go live on the next `vercel --prod` or GitHub push (auto-deploy is connected).

**⚠ Always push to git.** `vercel --prod` deploys straight from your local working tree, bypassing git entirely — that's exactly how this app ended up with a week of undocumented production code that no `git log` could see, and why a routine `git push` silently reverted it. If you deploy with the CLI for a quick iteration, follow up with a commit + push in the same sitting. Don't let production and `main` diverge.

## Architecture

Vanilla JS + Vercel serverless. No framework, no bundler, no build step.

```
api/          Vercel serverless functions (Node ESM, .js) — 12 total, at the Hobby-plan cap
  admin.js            GET /book, /book/qfes (and /admin, /admin-new — both alias to /book now)
  admin-enquiries.js   Main data + mutation endpoint (see full list below)
  admin-intake.js      Registration/onboarding emails via Resend
  admin-login.js       Password auth, session cookie
  admin-tasks.js       Tasks CRUD + AI receptionist brief (POST ?brief=1)
  calendar-pending.js  Google Calendar read/write — the real system of record for sessions
  clients.js           Client CRUD (Supabase `clients` table)
  contact.js           Public "Reach Out" form handler
  google-auth.js       Google OAuth kickoff (Calendar + Gmail scopes)
  google-callback.js   Google OAuth callback, stores refresh tokens
  session.js           Public "Request a session" form handler
  sessions.js          Session CRUD (Supabase `sessions` table — legacy, see note below)

  _auth.js        HMAC cookie auth shared helper (leaf, not counted in the 12)
  _emails.js      Shared email templates (leaf)
  _gmail.js       Gmail search helpers — remittance, keyword, QFES submissions (leaf)
  _halaxy.js      Halaxy FHIR R4 API helper — OAuth + token cache (leaf)
  _push.js        Web Push subscription storage + notify() (leaf)
  _supabase.js    Supabase service-role client singleton (leaf)

js/
  cheree-book.js  The app. ~1500 lines. Home / Board / Book / Clients views, all client-side.
  cheree-qfes.js  QFES Individual Support Activity form staging tool, at /book/qfes.
  main.js         Public site (index.html etc.) interactivity — unrelated to /book.

css/
  admin-dashboard.css  NOT used by /book — its pages are fully self-contained, CSS inline
                        in api/admin.js's template strings. This file is legacy public-site
                        styling territory now; check before assuming a class here applies.
  styles.css           Public site styling.

sw.js           Service worker — cache-busting + push notification display for /book as a PWA.
manifest.json   PWA manifest.
vercel.json     Rewrites — see Routing below.
```

**Routing:** `/book` → `api/admin.js?cheree=1`, `/book/qfes` → `api/admin.js?cheree=1&qfes=1`. `/admin` and `/admin-new` also rewrite into `api/admin.js` but the handler ignores the distinction now — any authenticated hit on that function serves the `/book` page. Keep these old rewrites; a stale bookmark should land somewhere real, not 404.

## `js/cheree-book.js` — how the app is put together

Everything renders into a single `#root` div, dispatched by `_cbRender()` based on `_cbView` (`'home' | 'board' | 'book' | 'clients'`). No routing library, no virtual DOM — each view function builds an HTML string and sets `.innerHTML`.

- **Home** — the daily landing view. Four modes (`_cbHomeMode`): `all` (flat needs-outcome/upcoming list, the default), `month`/`week`/`day` (an actual calendar). Sessions come entirely from `_cbEvents` (Google Calendar), never from Supabase. A session's state is derived *only* from parsing its own description — no external matching, no guessing from title text.
- **Board** — a kanban pipeline: `triage → booked → outcome → billing → remittance → closed`, computed per-event by `_cbEventStage()` purely from the `Status`/`Bill`/`Billing` fields in its description. `triage` also pulls in open Supabase enquiries. This is the actual answer to "who hasn't been invoiced yet" — that's the `billing` column.
- **Book** (`+` dock button) — new booking form. Picks an existing client (searched from Halaxy patients, read-only) or types a new name, sets modality/duration, and `POST /api/calendar-pending` creates the calendar event with a structured title/description. Never touches Halaxy.
- **Clients** — a merged read-only view built from Halaxy patients + Supabase enquiries (`_cbBuildClientRows`). Manual multi-funder tagging (a client can be NDIS for one service, Medicare for another) is stored separately in a settings-cache ledger (`client_funders_set`), not written to `clients.funder`, because that column has a single-value DB constraint.

### The calendar event format — this is the actual data model

Every session /book creates is a Google Calendar event with:
- **Title**: `<Name> — <Funder> — <Modality>`, later suffixed `— Attended` / `— Cancelled (Cheree)` / `— Cancelled (client)` once an outcome is recorded.
- **Description**: plain `Key: Value` lines — `Funder`, `Type`, `Duration`, `Note`, `Status`, `Bill`, `Billing`, `Invoice`. Parsed back out by `_cbParseDesc()` / built by `_cbBuildDesc()` (client-side) and duplicated server-side in `calendar-pending.js`'s `_parseDesc()` for push-notification text (server module, can't import the browser script).

This is intentional: the event reads correctly even opened directly in Google Calendar by Cheree, not just through this tool. **A calendar event with no `Status:` line at all is a legacy hand-typed entry** (or one from before this tool existed) — it's still surfaced on Home so it can be actioned, but it's excluded from the Board (which only shows events this tool explicitly created/logged).

### Recording an outcome

`_cbOpenOutcome()` → sets `Status: Attended` or `Status: Cancelled by <Cheree|client>` via `PATCH /api/calendar-pending`. The PATCH handler detects this specific pattern in the description (`/Status: (Attended|Cancelled by)/`) and fires a push notification to Julian — nothing else matches that regex, so it can't misfire on an unrelated rename or billing-stage edit.

### Invoice tracking

`cbSaveInvoice()` writes an `Invoice: <number>` line onto the event description — same PATCH endpoint, no Halaxy write. Once set, the Board card shows a one-tap deep link straight into that invoice in Halaxy (`_cbInvoiceUrl`, a plain URL, not an API call). This is the whole reconciliation mechanism — deliberately simple, no attempt at automated invoice↔session matching (Halaxy's API can't support that — see below).

## `api/admin-enquiries.js` — endpoint index

GET unless noted. Query-param-routed, one big handler function.

| Param | Purpose |
|---|---|
| `reminder_cron=1` | Cron-only — 48h reminder emails |
| `halaxy_webhook` (POST) | Halaxy Patient·Create webhook — the only thing that creates a Supabase client record from a Halaxy event |
| `halaxy_sync` (POST) | Refresh cached funders/fees from Halaxy |
| `halaxy_appt_action` (POST) | **Dead code, see above** — record/reschedule/cancel an *existing* Halaxy appointment |
| `reminder=1` (POST) | Manually send one reminder email |
| `halaxy_fees`, `halaxy_fees_raw`, `halaxy_funders` | Read cached/raw Halaxy fee & funder config |
| `halaxy_appts_raw`, `halaxy_invoices_raw` | Raw Halaxy data dumps, diagnostic |
| `inv_probe`, `match_debug` | Diagnostics for the (impossible) invoice-matching problem — see below |
| `check_remittance` | Gmail search for a remittance email matching an invoice number |
| `halaxy_patient_name` | Search Halaxy patients by name (read-only) |
| `halaxy_patient_invoices` | Per-patient invoice list |
| `halaxy_coverage` (GET) | Read a patient's funder Coverage |
| `halaxy_coverage` (POST) | **Dead code, see above** — write Coverage to an existing patient |
| `settings_set` (POST) | Generic settings-cache key/value write |
| `cal_link` (POST) | Merge a calendar event onto an enquiry "contact card" — bookkeeping only |
| `push_subscribe` (POST) | Save a Web Push subscription |
| `client_funders_set` (POST) | Manual multi-funder tagging ledger |
| `qfes_profiles_all`, `qfes_profile`, `qfes_profile_save` (POST) | QFES ISA form staging (`qfes_client_profiles` table) |
| `qfes_invoice_compile=<invoiceNumber>` | Read-only join of calendar sessions tagged `Invoice: <number>`, their staged QFES profile, and Halaxy demographics — into one table for manual ISA submission. See `js/cheree-qfes.js`'s compile panel. |
| `session_bill=1` (POST) | Legacy funder-session reconciliation ledger — predates the Board, may be redundant with `Invoice:`/`Billing:` on the calendar event now. Not yet audited for removal. |
| (bare GET) | Main pipeline payload — enquiries + clients + Halaxy patients/appointments |
| PATCH | Update an enquiry's status/notes |

## Auth

HMAC-signed cookie (`ast`). Two named users from env: `JULIAN_PASS`, `CHEREE_PASS`. All API handlers call `isAuthed(req)` as first line. `getSessionUser(req)` returns `{ name, initials }`. Legacy `ADMIN_PASS` still works (logs in as Julian). Login and the Google OAuth callback both redirect to `/book`.

## Data Sources

### Google Calendar — the real system of record for sessions
OAuth token in `settings.google_refresh_token`. `calendar-pending.js` exports `createCalendarEvent`, `deleteCalendarEvent`, `fetchCalendarEvents(opts)`. The GET handler defaults to a wide `-180d/+91d` window (an explicit `?days=N` override is symmetric ±N) — the asymmetric default exists so a session from months back that was never logged still surfaces rather than silently aging out, which is exactly the bug that bit the old system before this rewrite. `fetchCalendarEvents` accepts `{ pastDays, futureDays, paginate }` — pass `paginate: true` for anything that might cross Google's 250-result page limit (a multi-month reconciliation pull, for instance).

`PATCH /api/calendar-pending?eventId=<id>` accepts any subset of `{ title, start, end, description }`. `start`/`end` reschedule (currently unused by any frontend — was for the old dashboard's duration-edit feature, kept because it's harmless and still correct). `description` is how /book records outcomes, billing stage, and invoice numbers, and triggers a push notification when it detects an outcome (`Status: Attended|Cancelled by...`).

### Supabase
Tables: `enquiries`, `clients`, `sessions`, `tasks`, `activity_log`, `settings`, `qfes_client_profiles`.

`sessions` is a **legacy table** — predates /book, which tracks sessions entirely via calendar events instead. Still has live CRUD (`api/sessions.js`) but check whether anything actually calls it before assuming it's load-bearing for current workflows.

The `settings` table doubles as a generic key-value cache — Halaxy tokens, funders/fees, and several small ledgers (`client_funders`, `calendar_event_links`, `gcal_halaxy_links` if reintroduced, `session_billing_state`) all live here via `readCache`/`writeCache` helpers in `admin-enquiries.js`.

### Halaxy FHIR R4 API (`au-api.halaxy.com`) — read-only from this app
Auth is OAuth2 client credentials, token cached in `settings` with a 2-minute expiry buffer. Helpers: `halaxyGet()`, `halaxyPost()`, `halaxyPatch()` in `_halaxy.js`. `halaxyPost`/`halaxyPatch` are only used by the two dead endpoints noted above — a genuinely new legitimate write use would be the first in a while and deserves real scrutiny given the project's history here.

**Per-session invoice attribution is impossible — don't try building it.** Halaxy's `/Invoice` ignores the `patient=` filter and exposes no line items by any route (`lineItem` null even when the web UI shows them; `_include=Invoice:item` → 422; `/ChargeItem` → 404). A funder bulk invoice (QFES/NDIS bill many sessions across dates onto one invoice) cannot be matched to a session via the API — confirmed via the `?match_debug=1`/`?inv_probe=<id>` diagnostics, kept around as evidence rather than something to build further on. This is *why* /book's invoice tracking is manual (`Invoice:` on the calendar event) instead of automated — it's not a missing feature, it's the correct response to a real API limitation.

### Gmail (remittance + QFES search)
Read-only. Same Google OAuth app as Calendar (`gmail.readonly` + `userinfo.email` scopes). Per-mailbox tokens in `settings.gmail_tokens` (`{ email → refresh_token }`) — admin@ and reachout@ are connected separately, each via Settings → Google → Reconnect while signed in as that account.

**⚠ Calendar-token clobber (fixed, don't reintroduce):** the OAuth callback used to overwrite `google_refresh_token` on *every* consent, so a Gmail-only reconnect could repoint the Calendar token and blank the schedule. Fixed in `google-callback.js`: only updates `google_refresh_token` when the consenting account can actually read the shared calendar. Never make that write unconditional again.

`_gmail.js` exports `searchRemittance(invoiceNumber)` (used by `check_remittance`), plus `searchKeyword(query)` and `searchQfesSubmissions()` — both currently unused by any endpoint (added in the /book rewrite, never wired up; fine to build on, not dead-in-a-bad-way).

### Resend (email)
From address: `reachout@chereemcgarry.com`. Templates live in `api/admin-intake.js` and `api/_emails.js` — see those files' own comments for the shell/template pattern. The Settings "Email tests" picker this was built for lived in the old `/admin` dashboard and doesn't exist in `/book` yet — `admin-intake.js`'s test path is kept as plumbing, currently unreachable from any UI.

### Web Push (`api/_push.js`, `sw.js`)
`saveSubscription()` stores a browser's PushSubscription; `notify({ title, body, url, tag, kind, detail })` sends to all saved subscriptions. Fires on a new booking and on an outcome being recorded (see `calendar-pending.js`). **iOS Safari only allows push subscription once the page has been added to the Home Screen** — an Apple platform restriction, not a bug if it silently doesn't work in a normal browser tab on iOS.

### QFES ISA form (`/book/qfes`, `js/cheree-qfes.js`)
Staging tool for the QFES "Individual Support Activity" form — Cheree fills in the fields that can't be auto-collected (area, role, concern type) ahead of time, one row per client (`qfes_client_profiles`, upserted by `client_halaxy_id`). **Deliberately does not submit to the real Microsoft form** — Julian or Cheree copies the saved answers across manually, combined with appointment-specific fields (date/mode/duration/attended) from the Board and demographic fields from the Halaxy patient record. Same no-external-write principle as the rest of /book.

## Vercel / Deployment Gotchas

- **Hobby plan: max 12 serverless functions** (leaf modules under `api/_*.js` don't count). Currently at the cap — adding a new endpoint means adding a query param to an existing handler, not a new file, unless you first fold something in or remove one.
- Streaming responses are buffered — use plain JSON responses, not `res.write()` streaming.
- `vercel logs` defaults to current git branch. Use `--no-branch --environment production` for production logs.
- Env var updates require a redeploy to take effect.
- **GitHub auto-deploy is connected** — every `git push` to `main` triggers a production deploy and promotes it live, same as `vercel --prod`. Whichever deployment was promoted *last* — CLI or git push — wins the `chereemcgarry.com` alias, regardless of which one is "newer" in a human sense. Keep git and production in sync (see the warning under Deploy Commands above).
- Assets are cache-busted per-deploy via `?v=${process.env.VERCEL_GIT_COMMIT_SHA}` in the script tags `api/admin.js` emits.

## Cron

`GET /api/admin-enquiries?reminder_cron=1` runs at 22:00 UTC daily (08:00 AEST) — sends 48h appointment reminder emails via Resend.

## Registration (`/register`, unrelated to /book)

Separate, unlisted (`noindex`) client self-registration page — embeds Halaxy's own new-patient widget in an iframe so card capture never touches this app (keeps PCI scope at SAQ-A). Full detail in `docs/registration-form-spec.md`, which is still accurate. Completing it fires Halaxy's Patient·Create webhook (`?halaxy_webhook=1` above), which is the one legitimate place a Halaxy event drives a Supabase write — not the other direction.

## Retired / historical, don't resurrect

- **`js/admin-ui.js`** — the old dashboard's ~10k-line client app. Deleted. If you see it referenced in an old doc or comment, that doc is describing the pre-rewrite system.
- **The "two-layer CSS" problem** (an inline light theme in `api/admin.js` fighting `admin-dashboard.css`'s dark overrides) — was a real, documented mess in the old dashboard. Doesn't exist in `/book`'s pages (fully self-contained inline CSS per page). `admin-dashboard.css` may still carry old-dashboard-era rules nobody's cleaned up; don't assume it applies to anything /book renders.
- **`refactor/css-consolidation`** branch — was mid-flight cleanup of the above problem in the old dashboard. Abandoned and deleted once /book made it moot.
- **The "Set up in Halaxy" wizard / two-front-doors model** — see the rule at the top of this file. `docs/halaxy-onboarding-spec.md` documents the old design; marked superseded at the top of that file.
