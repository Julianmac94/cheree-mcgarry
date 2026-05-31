# Registration → Halaxy (DECIDED architecture + current state)

> Supersedes the earlier "custom form + Halaxy API" exploration. **We embed Halaxy's
> form widgets behind our own branded funding picker.** This is live (unlisted) at
> `/register` — Private + Medicare wired, the rest pending Cheree's forms.

## Why embed (not a custom form + API)
- **Card capture = PCI.** Collecting card details in our own form/server puts us at SAQ-D
  (full PCI-DSS). Letting Halaxy's iframe capture the card keeps us at SAQ-A (nothing
  sensitive touches us). Stripe "hosted fields" don't help — the card has to land in
  **Halaxy's** gateway so Halaxy can auto-bill.
- **Halaxy API is READ-ONLY for money.** `createPatient` / `createCoverage` /
  `createDocumentReference` exist, but **Invoice and PaymentTransaction are List/Get only**
  — you cannot mark an invoice paid, record an external payment, or fetch the rendered
  invoice PDF via the API. So a "charge in Stripe → mark paid in Halaxy" flow would be
  manual reconciliation forever.
- Embedding the full widget = Halaxy creates the patient + coverage, captures the card,
  then **auto-bills, marks its own invoices paid, and emails the compliant
  Medicare/NDIS/QFES invoices**. We write no backend and store no PII.
- The per-patient "card-only" form (the one that skips details for an existing patient) is
  a Halaxy-generated **emailed** instance (`/a/online/form/<id>/<token>`) we **cannot
  construct** — so a seamless inline card-only step isn't possible. Embedding the full
  `new-patient` widget (details + card together) is the workable path.

## The page — `register.html` (served at `/register`)
- **Unlisted:** `noindex`, not linked anywhere, `/register` rewrite in `vercel.json`. Reachable by URL only.
- Links **`css/styles.css`** so it inherits the site's real design (Cormorant + Raleway, cream organic glow, neumorphism). NOT a generic layout.
- **Funder picker** (neumorphic cards) → on select, embeds that funder's Halaxy widget.
  - `FUNDERS` array in the file: **Private** (`…/new-patient/1429515/…`) + **Medicare**
    (`…/new-patient/245011/…`) have real widget URLs; **NDIS / Bupa / QFES / WorkCover**
    have empty `url` → render as disabled "Available soon" cards.
  - Deep-link: `/register?funder=medicare` auto-selects (for the email's per-funder links).
- **Form view (full-viewport, single scroll):**
  - Iframe capped at **`max-width:680px`** → forces Halaxy's single-column layout (its step
    sidebar only appears at wide widths). Centered on cream.
  - **Desktop:** a "What you'll be asked to fill in" strip + scroll note sit above the iframe.
  - **Mobile:** picking a funder shows a "Before you start" **bottom-sheet pop-up** (checklist
    + Get started), then the form opens full-screen with the info strip **hidden** — a clean
    full iframe with native scrolling (no nested-scroll fiddliness).
- **No progress bar.** Cross-origin we can't read inside the iframe (no step/field access);
  a `load`-event counter "worked" going forward but mis-counted on the form's "Go Back", so
  it was dropped in favour of the static "what you'll fill in" summary.

## Halaxy facts (researched, developers.halaxy.com)
- **Webhooks:** Patient/Appointment/Invoice × Create/Update/Delete (set up in Halaxy
  Settings → Integrations → Webhooks). **Patient·Create** fires when someone completes the
  form → our signal for the thank-you + enquiry auto-advance.
- **Payment fees:** Halaxy ~1.5–1.9% (volume-tiered, +75c–$1 on lower bands); Stripe 1.7%+30c;
  Square 2.2%. Halaxy can pass the fee to the patient. Fees do not justify leaving Halaxy
  (you'd lose integrated claiming + face the read-only-API reconciliation problem).

## Remaining work
1. **Cheree:** create the other 4 funder forms in Halaxy (NDIS/Bupa/QFES/WorkCover) → send the
   widget URLs → drop into `FUNDERS` in `register.html` (they auto-go-live).
2. **Patient-Create webhook** → thank-you email (`wrap()` shell) + advance the enquiry; this is
   also the real "registration complete" signal.
3. Point the **registration email** CTA at `/register` (optionally per-funder deep-links
   `/register?funder=…`); the email's in-body funding picker can then be simplified/retired.
4. Confirm the "what you'll fill in" wording (and whether to make it funder-specific).
5. Mobile: confirm the full-iframe scroll feels good on a real device.

## Still parked (see TODO.md)
- Appointment **confirmation** email (+ combined "confirmation + registration" variant).
- Simplify the admin "send" flow to one button.
