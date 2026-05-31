# TODO — parked work

## Registration → Halaxy  (DECIDED: embed Halaxy widgets behind our picker)
Full detail in **`docs/registration-form-spec.md`**. Built & live (unlisted) at **`/register`**
(`register.html`). Private + Medicare wired; NDIS/Bupa/QFES/WorkCover are "Available soon" placeholders.

Remaining:
1. **Cheree:** create the other 4 funder forms in Halaxy → send widget URLs → drop into the
   `FUNDERS` array in `register.html` (auto-go-live).
2. **Patient-Create webhook** → thank-you email (`wrap()` shell from `admin-intake.js`) + advance
   the enquiry. Halaxy webhooks fire Patient·Create when the form completes; match to the pending
   enquiry by **email**; use the webhook's optional auth header (no signature verification documented).
   ⚠ Vercel is at 12/12 functions — fold the webhook into an existing endpoint or free a slot first.
3. Point the **registration email** CTA at `/register` (optionally per-funder deep-links
   `/register?funder=…`); the email's in-body `FUNDING_FORMS` picker can then be simplified/retired.
4. Confirm the "what you'll fill in" wording (funder-specific?) + the mobile full-iframe scroll feel.

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

## CSS consolidation (separate branch)
`refactor/css-consolidation` — foundation + 3 slices done & verified; app-shell slice + mobile
stragglers remain. See CLAUDE.md.
