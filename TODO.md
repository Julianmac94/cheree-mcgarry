# TODO — parked work

## Registration → Halaxy  (DECIDED: embed Halaxy widgets in our own single-page screen)
Full detail in **`docs/registration-form-spec.md`**. Built & live (unlisted) at **`/register`**
(`register.html`). Now a **single unified screen** (no picker→form page jump, no back/forward):
green header + persistent funder list (rail desktop / sheet mobile) + a form panel that shows a
dashed placeholder until a funder is picked, then loads the Halaxy iframe in place. Private +
Medicare wired; NDIS/Bupa/QFES/WorkCover hidden until their `url` is added.

**DONE ✅ — Patient-Create webhook** (`POST /api/admin-enquiries?halaxy_webhook=1`, folded into the
existing handler; `HALAXY_WEBHOOK_SECRET` set; Halaxy webhook configured). Client completes `/register`
→ Halaxy Patient·Create → match enquiry by email → advance to `in_halaxy` (or create `self-registered`)
→ thank-you email (`registrationCompleteEmailHtml` in `api/_emails.js`). Idempotent. **Principle:
`/register` is the single front door to Halaxy — no manual patient entry, ever.** Full detail in spec.

Remaining:
1. **Cheree:** create the other 4 funder forms in Halaxy → send widget URLs → drop into the
   `FUNDERS` array in `register.html` (empty `url` = hidden; they auto-appear in the list).
2. **DONE ✅ — Retired the manual flow** (`js/admin-ui.js`, +18/−507): removed the pipeline's
   **"Add to Halaxy →"** auto-advance (`ENQ_ADVANCE.contacted`), the pipeline card's "Send intake"
   panel, the enquiry detail panel's **"Send onboarding / pick funding + paste Halaxy URL"** section,
   the manual **"Add to Halaxy"** patient search/create/mark panel (`_openAddToHalaxyPanel` & friends),
   and the dead `_intakeEnquiryCard`/`renderIntakePanel`/`sendIntake` remnants. The webhook now
   auto-advances `contacted → in_halaxy` on `/register` completion, so no manual transition is needed.
   **Note:** the non-test send path in `api/admin-intake.js` is intentionally KEPT (no UI calls it now)
   — it's the email plumbing the planned "Send registration email" button (item 3 / Emails below) reuses.
   The home-view `openIntakePicker` "copy Halaxy intake link" chip + `HALAXY_URLS` map were left as-is
   (separate utility, out of scope) — candidates for a later cleanup once item 3 lands.
3. Point the **registration email** CTA at `/register` (optionally per-funder deep-links
   `/register?funder=…`); the email's in-body `FUNDING_FORMS` picker can then be simplified/retired.

## "Set up in Halaxy" — Cheree self-serve onboarding (DESIGNED, not built)
The **second front door** (the first being `/register`). For clients Cheree books in Google
Calendar / known existing clients who won't self-register. Cheree's only tools are GCal + the
dashboard — she must get a client **billable in Halaxy without ever opening Halaxy**, fully
self-serve. The dashboard API already does the whole chain (`POST /Patient` + `POST /Coverage`
+ `POST /Appointment/$book` → auto-invoice); this packages it into one guided flow.
**Full design + decisions in `docs/halaxy-onboarding-spec.md`.** Build status:
1. ✅ **Session-type → fee config** — Settings → "Booking fees" (`session_fee_map`, `BOOKABLE_MENU`,
   auto-match by name+amount); persisted via `POST ?settings_set=1` in `admin-enquiries.js`.
2. ✅ **"Set up in Halaxy" wizard** (`openSetupInHalaxy`) — match/create patient → coverage → `$book`.
3. ✅ **GCal CTA** — "⚕ Set up in Halaxy" on upcoming unlinked calendar events (desktop list/card +
   mobile) + "Not in Halaxy" badge; prefills from the event.
4. ✅ Docs — CLAUDE.md updated to the **two front doors**; spec/this file updated.

**⚠ Remaining: LIVE TEST before real use** — the wizard does irreversible Halaxy writes (patient +
appt + invoice). Test once with a throwaway name + $0/$1 fee. Also: raise the Halaxy "Parent Intake /
Child" fee to $180 (or map child → the $180 Face-to-Face fee in Settings → Booking fees).

## Emails

### Appointment confirmation email (NEW — not built yet)
Triggered from the admin enquiry page when Cheree books a time **after** the client has registered.
Carries: **date, time, location (Karalee) or video/phone joining info, what to bring, fee/funding
reminder, cancellation policy**.
- **Combined variant:** if Cheree books a time **before** registration, send an *alt* email that is
  **appointment confirmation + a `/register` link** in one.
- Both triggerable from the admin enquiry detail panel. Reuse the `wrap()` shell in `api/admin-intake.js`.

### Simplify the admin "send" flow
With registration handled on `/register`, the enquiry detail panel's "pick funding + paste Halaxy URL"
UI is obsolete → collapse to a single **"Send registration email"** button.

## Schedule: funder review queue (RESOLVED — manual, API can't attribute)
Per-session invoice attribution is impossible (Halaxy exposes no line items by any
route — lineItem null, Invoice:item 422, /ChargeItem 404; patient filter ignored).
Final model: every past funder session → `pending-invoice` (inbox, wide window)
unless manually reconciled via `session_billing_state` ledger (Invoiced→billing /
Paid→done), set from the "Funder billing" section on the session detail panel.
Funder per patient comes from a bulk `/Coverage` fetch (`patientFunderMap`).
Shipped 1131616. Possible cleanup: remove the `?match_debug` / `?inv_probe`
diagnostics; group the review queue by client; fix `?halaxy_patient_invoices`
(uses the broken `patient=` filter). Earlier-history below for context.

## (history) Schedule: funder-billed tagging — patient-level matching impossible
The schedule tagged each appointment Paid / Invoiced / Needs-invoice by matching
appointment→invoice **by date**, which breaks for **funder bulk invoices**: QFES
/ NDIS bill many sessions across dates onto ONE invoice (e.g. 1090256291 dated
05-May covered Kaegan + Blair for March sessions) → false "Needs invoice" / "Paid".
- **Investigated** patient-level matching via `?match_debug=1`: **impossible** —
  Halaxy's `/Invoice` ignores the `patient` filter AND exposes no line items
  (no per-session dates). See memory `halaxy-invoice-api-limits`. Appts DO carry
  patientId, though.
- **Shipped:** (a) duplicate-appt collapse + no false "Paid" from ambiguous days
  (d8ee76f); (b) neutral **"funder-billed"** status for org-billed clients
  (NDIS/QFES/WorkCover/DVA), mapped via appt.patientId → client.funder, deferring
  to the billing block (ae2619d).
- **Residual:** relies on the client existing in the dashboard with a funder set
  (matched by halaxy_id); a funder client missing from the client list falls back
  to date-guessing. Possible follow-up: fix `?halaxy_patient_invoices` (uses the
  broken `patient=` filter — try `subject=`) for the client-detail invoice list.
- The `?match_debug=1` diagnostic endpoint is still live (read-only) — can be removed.

## CSS consolidation (separate branch)
`refactor/css-consolidation` — foundation + 3 slices done & verified; app-shell slice + mobile
stragglers remain. See CLAUDE.md.
