# TODO — parked work

## Emails

### Appointment confirmation email (NEW — not built yet)
Triggered from the admin enquiry page when Cheree books a time **after** the client has registered.
Carries the appointment details: **date, time, location (Karalee address) or video/phone joining info, what to bring, fee/funding reminder, cancellation policy**.
- **Combined variant:** if Cheree books a time **before** the registration email is sent, send an *alt* email that is **appointment confirmation + registration** in one (so they get the booking details AND the funding-form picker together).
- Both should be triggerable as buttons on the admin enquiry detail panel.
- Reuse the `wrap()` shell + branding from `api/admin-intake.js`.

### Simplify the admin "send" flow for the registration email
Now that funding is chosen *inside* the registration email (the funding-form picker), the enquiry detail panel's
"pick a funding type + paste a Halaxy URL" UI is obsolete. Collapse it to a single **"Send registration email"**
button (no funding dropdown, no URL paste). Removes wrong-link risk.

### Registration email — still pending
- Real Halaxy form links for: Private, Medicare, NDIS, Bupa, QFES, WorkCover (currently placeholders in `FUNDING_FORMS`).
- Confirm the **Bupa** note wording with Cheree (placeholder: "Via your Bupa cover.").
- Wire the registration email into the real client-facing send (replacing the old per-funding `new`/`medicare`/`ndis` templates) once links are in.

## Halaxy API — registration & thank-you (researched, not built)
Halaxy FHIR API supports both. Auth = existing OAuth in `_halaxy.js`. Docs: developers.halaxy.com.

**Option A — thank-you email via webhook (small):**
- Halaxy webhooks: events are Patient Create/Update, Appointment C/U/D, Invoice C/U/D (set up in Halaxy Settings > Integrations > Webhooks). No "form completed" event, but completing a Halaxy registration form creates a patient → **Patient · Create** fires.
- Add a webhook handler endpoint → match patient to pending enquiry by **email** → send thank-you + auto-advance enquiry status.
- Caveats: Patient Create fires for ANY new patient (incl. manual adds) so must match by email; no documented signature verification → use the webhook's optional auth header + the email match.

**Option B — our own registration form → push to Halaxy directly (preferred; bigger):**
- Kills the link-laden email. Email becomes one clean "Complete your registration →" link to OUR form; we push to Halaxy and send the thank-you ourselves.
- API: `POST /Patient` (createpatient — name/DOB/gender/email/phone/address/contact), `POST /Coverage` (createcoverage — funding/health-fund; separate call, recipe for Medicare card details), `DocumentReference` (consent docs). 
- Build cost: branching form (funding-specific fields), Patient+Coverage calls, validation, error handling. **Coverage mapping per funding type (Private/Medicare/NDIS/Bupa/QFES/WorkCover) is the fiddly part** — docs thin; nail during build.
- **Privacy/security:** form collects Medicare numbers / DOB / health info → push straight to Halaxy, store ~nothing sensitive our side (just a "registered" flag). Keep compliance surface minimal.
- Open question before committing: does Cheree's current Halaxy registration form capture special consents/validation we'd need to replicate?

## CSS consolidation (separate branch)
`refactor/css-consolidation` — foundation + 3 slices done & verified; app-shell slice + mobile stragglers remain. See CLAUDE.md.
