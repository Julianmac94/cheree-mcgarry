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

## CSS consolidation (separate branch)
`refactor/css-consolidation` — foundation + 3 slices done & verified; app-shell slice + mobile stragglers remain. See CLAUDE.md.
