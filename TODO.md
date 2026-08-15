# TODO — parked work

Pruned 2026-08-15 — removed items describing the old admin-ui.js dashboard (deleted) and the "Set up in Halaxy" wizard (removed, see `CLAUDE.md`). See `CHANGELOG.md` for what happened to the things that used to be listed here as "done."

## Registration → Halaxy

Full detail in `docs/registration-form-spec.md` (still accurate). Live (unlisted) at `/register`. Private + Medicare wired.

Remaining:
1. **Cheree:** create the other 4 funder forms in Halaxy → send widget URLs → drop into the `FUNDERS` array in `register.html`.
2. Point the registration email CTA at `/register` (optionally per-funder deep-links `/register?funder=…`); the email's in-body `FUNDING_FORMS` picker can then be simplified/retired.

## Halaxy write-endpoint cleanup (new, 2026-08-15)

`?halaxy_appt_action=1` and `?halaxy_coverage=1` (POST) in `admin-enquiries.js` are confirmed unreachable from any current frontend (`/book`, `/book/qfes`) but still live, callable Halaxy-write endpoints. Given this project's history with exactly this category of risk, these should be removed outright rather than left as unreachable-but-present. Low effort, worth doing soon.

## `recon_report` — found, not wired up (new, 2026-08-15)

A read-only billing-reconciliation endpoint exists in `admin-enquiries.js`'s history (cross-references Halaxy appointments + invoices + Google Calendar to find genuinely unbilled past sessions) but isn't currently in the codebase and isn't called from any `/book` UI. Given the Board's `billing` column already covers this for sessions booked *through* `/book`, the remaining gap is sessions that predate `/book` or were never logged through it. Worth reviewing whether this is still needed given the Board, and if so, deciding where it surfaces (a Settings link? a Board sub-view?) before rebuilding it.

## Legacy billing-tracking audit (new, 2026-08-15)

Three older mechanisms may or may not still be load-bearing now that the Board's `Invoice:`/`Billing:` calendar fields are the current tracking method — not yet traced through to a confident answer:
- Supabase `sessions` table + `api/sessions.js` CRUD
- `session_billing_state` settings-cache ledger, `?session_bill=1` endpoint
- `sessions.invoice_ref` column

If genuinely unused, remove. If something still depends on them, document what and why in `ARCHITECTURE.md`.

## Emails

### Appointment confirmation email (not built)
Carries: date, time, location or video/phone joining info, what to bring, fee/funding reminder, cancellation policy. Needs a trigger point in `/book` (the old admin-ui.js enquiry panel this was scoped against no longer exists) — likely from the Board or the booking confirmation step in `_cbSubmitBooking`.
- **Combined variant:** if booked before registration, an alt email that's confirmation + a `/register` link in one.

## Docs cleanup (in progress, 2026-08-15)

`CLAUDE.md`, `ARCHITECTURE.md`, `CHANGELOG.md` rewritten/created to reflect `/book` as the current system. `docs/halaxy-onboarding-spec.md` marked superseded at the top (kept for history). `docs/fee-menu-draft.md` needs the same treatment — check whether `/book`'s fee handling (if any) still uses this concept before deciding to retire or update it. `docs/registration-form-spec.md` and `docs/audit-2026-06-22.md` are still accurate/historical, left alone.
