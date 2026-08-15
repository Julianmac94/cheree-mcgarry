# Architecture

A plain-language map of how this system fits together — for a human reading it fresh, not an AI agent mid-task. See `CLAUDE.md` for conventions/gotchas and `CHANGELOG.md` for how it got to this state.

## The shape of the problem

Two people, two roles, one shared calendar:

- **Cheree** is the practitioner. Her tools are Google Calendar and `/book` (this app). She never opens Halaxy.
- **Julian** does the admin — billing setup, reconciliation, Halaxy itself when something actually needs creating there.

Everything in this system exists to answer one question without anyone having to cross-reference three different places by hand: **which sessions have happened, and which of those still need something done about them (an outcome logged, an invoice raised, a payment confirmed)?**

## The three systems, and who owns which

```
┌─────────────────┐        ┌──────────────────┐        ┌─────────────────┐
│  Google Calendar │        │     Supabase      │        │      Halaxy      │
│                  │        │                    │        │                   │
│  Source of truth │        │  Enquiries, client  │        │  Actual invoices,  │
│  for SESSIONS.   │        │  list, QFES form    │        │  actual payments,  │
│  Cheree books    │        │  staging. The       │        │  the funder claim   │
│  here. /book     │        │  "who is this       │        │  system of record.  │
│  reads/writes    │        │  person" layer.     │        │  Cheree/Julian      │
│  here, and only  │        │                    │        │  operate this        │
│  here, for       │        │                    │        │  directly — this app │
│  session data.   │        │                    │        │  never writes to it. │
└─────────────────┘        └──────────────────┘        └─────────────────┘
```

**Why Calendar and not a database for sessions?** Because Cheree already lives in Google Calendar — asking her to also maintain a second record of the same information (in Halaxy, or in a dashboard) is exactly the kind of duplicate-entry problem this rewrite was built to get rid of. A calendar event's title and description *are* the session record. `/book` is a nicer way to read and write them than typing free text, not a separate database that could drift out of sync with what she sees on her phone.

**Why not have `/book` write to Halaxy directly?** Because it used to, and it went badly — see "History" below. Halaxy is where Cheree does the parts of her job that are actually about money (creating the appointment, raising the invoice), and this app deliberately stays out of that. It reads Halaxy (to look up an existing patient, to deep-link to an invoice once Julian has the number) and never writes to it.

## Where "is this session invoiced yet" actually lives

This has been rebuilt more than once, so it's worth being explicit about what's current:

| Mechanism | Where | Status |
|---|---|---|
| `Invoice: <number>` line on the calendar event description | Google Calendar | **Current.** Set via the Board's invoice field, becomes a deep link into Halaxy. |
| `Billing:` line (`Halaxy direct` / `Funder — awaiting remittance` / `Invoice sent` / etc.) | Google Calendar | **Current.** Drives which Board column a session sits in (`billing` → `remittance` → `closed`). |
| `session_billing_state` ledger (`{ halaxyApptId → 'invoiced'\|'paid' }`) | Supabase `settings` cache | Legacy — predates the Board. Endpoint (`?session_bill=1`) still exists; not yet confirmed dead or in use. |
| `sessions.invoice_ref` column | Supabase `sessions` table | Legacy — the `sessions` table itself predates /book and may not be written to by anything current. |

If you're trying to answer "what's actually owed / not yet invoiced" **today**, the answer is: open the Board, look at the `billing` column. Anything else describes history, not current state, until it's confirmed one way or the other and this table gets updated.

## Why Halaxy can't be trusted to answer this automatically

This isn't a missing feature — it's a real limitation of Halaxy's API, confirmed by direct testing (`?match_debug=1`, `?inv_probe=<id>` in `admin-enquiries.js`, kept as evidence):

- Halaxy's `/Invoice` endpoint **ignores the `patient=` filter** and **returns no line items** through any route tried.
- A funder (NDIS, QFES, WorkCover, DVA) often bills **many sessions across many dates onto one invoice**. Without line items or a patient filter, there is no way to work out via the API which sessions a given invoice actually covers.
- So per-session invoice matching is not a "not built yet" — it's not buildable against what Halaxy exposes. The manual `Invoice:`/`Billing:` tracking on the calendar event is the correct response to that, not a stopgap.

## Deployment

Vercel, Hobby plan, no build step — files served as-is. Two ways to ship a change, and **both promote straight to production**:

1. `git push` to `main` → GitHub integration auto-deploys.
2. `vercel --prod` from a local checkout → deploys whatever's on disk, whether or not it's committed.

Whichever one runs *last* wins the `chereemcgarry.com` alias — Vercel doesn't know or care which is "newer" in a human sense, only which deployment was most recently promoted. This is exactly what caused a week of real, working `/book` code to vanish from production without a trace in git: it was shipped via `vercel --prod` from an uncommitted checkout, and a later `git push` silently took its place. See `CHANGELOG.md` for the recovery. **The rule going forward: if you deploy with the CLI, commit and push in the same sitting — don't let git and production disagree about what's live.**

## Auth

One shared login mechanism (HMAC-signed cookie) for both Cheree and Julian, distinguished by which password was used (`JULIAN_PASS` / `CHEREE_PASS`). No per-user permission differences in the app itself — it's a two-person practice, not a multi-tenant system.

## What's genuinely dead vs what's legacy-but-maybe-live

Worth keeping this distinction sharp, since "old" and "unsafe" aren't the same thing:

- **Dead and safe to eventually delete:** `js/admin-ui.js` (already deleted), the old dashboard's inline-CSS approach, the `refactor/css-consolidation` branch (already deleted).
- **Dead but still a live write endpoint** (higher priority to clean up, since it's residual attack surface even though unreachable from any UI today): `?halaxy_appt_action=1`, `?halaxy_coverage=1` POST. See `CLAUDE.md`.
- **Legacy, unconfirmed:** the `sessions` table, `session_billing_state` ledger, `?session_bill=1`. These might still matter to something; they haven't been traced all the way through yet.
