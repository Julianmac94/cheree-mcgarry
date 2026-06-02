# Registration → Halaxy (DECIDED architecture + current state)

> Supersedes the earlier "custom form + Halaxy API" exploration. **We embed Halaxy's
> form widgets inside our own branded single-page screen.** Live (unlisted) at
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

**Self-contained, single-file.** Does NOT use the site nav or `styles.css` layout — it
pulls only design **tokens** (`--teal-deep`, `--cream`, `--mint`, `--terra`, `--serif`,
`--sans`, neumorphic vars) + the Cormorant/Raleway fonts from `css/styles.css`, then styles
everything in its own inline `<style>`. **Unlisted:** `noindex`, not linked anywhere,
`/register` rewrite in `vercel.json`. Reachable by URL only.

### One unified screen (no picker→form page jump, no back/forward)
The earlier two-step model (a picker *page* that hid and swapped to a fixed-overlay form
*page*) was **retired**. It's now ONE viewport-height screen (`.reg`, `height:100dvh`, no
page scroll — the iframe scrolls internally):

- **Green header banner** (`.form-head`, `--teal-deep`, sessions-style): brand
  (logo + "Cheree McGarry", links `/`) + `Secure · via Halaxy` + terra eyebrow rule +
  big serif **"Let's get you registered."** + sub + the botanical sprig art on the right.
  The heading is constant (doesn't change once a form loads).
- **Left rail** (`.form-side`, desktop): always shows the **funding list**
  (`#rail-funders`, each option with its note), the **"What you'll be asked to fill in"**
  checklist, the "form scrolls / Save and Continue" tip, the "not sure? reach out" help,
  and the "details & payment handled securely by Halaxy" note.
- **Form panel** (`.iframe-box`): a dashed **outline placeholder** (`#form-ph`,
  "Choose your funding to begin") until a funder is picked, then the Halaxy `#hx` iframe
  fills the same slot. Toggled by a `.has-form` class on `.reg`.

**Selecting / switching funder = `selectFunder(key)`** — sets `hx.src`, adds `.has-form`,
highlights the rail item, updates the mobile selector, updates the `?funder=` deep-link.
**No navigation, no reload** — just swaps the iframe in place. Switching funders mid-form
loads the other form (entered data is dropped, which is expected for a different funder).

### Mobile
Rail is hidden; the header restructures to **two rows + an info strip**:
- Row 1: site **logo + "Cheree McGarry"** (left) · **"What you'll fill in"** mint pill (right).
- Row 2: the **"Your funding · Change / [funder]"** selector (`.fh-mobar`), full-width, chevron.
- **Info strip** (`.m-info`, cream): "details & payment handled securely by Halaxy" +
  "the form scrolls — Save and Continue" (these live in the desktop rail instead).
- The funder selector and the placeholder's "Choose your funding" button both open a
  **bottom-sheet** (`#rg-modal`, content injected by JS) — either the **funder list**
  (`openFunderSheet`, carries each option's note + the help line) or the **checklist**
  (`openChecklistSheet`, the "what you'll fill in" sheet). Same modal element, swapped content.

### iframe width — VERIFIED live (Chrome on the real Halaxy form)
- Capped at **`max-width:880px`**, **left-aligned** beside the rail (not floating centre).
- Halaxy flips layout at **~768px**: **≤767 → single-column** (calm, one field per row);
  **≥768 → multi-column** (denser, fills width). It does **NOT** show its step sidebar in
  the 760–1000px range (the old "sidebar at wide widths" fear was overblown). 880 gives the
  fuller multi-column look on desktop and falls back to single-column on narrower windows.
- **Right-hand space:** a faint **trailing vine** (`.form-deco`, behind the form at
  `z-index:0`, so it only shows where the form doesn't reach — wide screens). It uses the
  **same teardrop leaf** as the header sprig and is anchored to the same right-edge offset
  (~220px) so it reads as continuing down from the header's leaves. Hidden on mobile.
- **No progress bar** — cross-origin we can't read inside the iframe.

## Halaxy facts (researched, developers.halaxy.com)
- **Webhooks:** Patient/Appointment/Invoice × Create/Update/Delete (set up in Halaxy
  Settings → Integrations → Webhooks). **Patient·Create** fires when someone completes the
  form → our signal for the thank-you + enquiry auto-advance. **(BUILT & LIVE — see below.)**
  Payload = a FHIR **SubscriptionStatus** bundle carrying only a `Patient/<id>` reference (no
  detail), so we `halaxyGet` the patient for name+email. Auth = a single "Authentication Header"
  field that Halaxy **forces** into `Authorization: Bearer {token}` format (no HMAC/signature).
- **Form internals are untouchable.** The Halaxy form is a cross-origin iframe — no CSS/JS
  of ours can reach inside it (the blue headings, fonts, fields are all Halaxy's). The only
  lever on the *inside* is Halaxy's own form-builder branding (Cheree's account) — accent
  colour / logo / intro text, if her plan exposes them.
- **Payment fees:** Halaxy ~1.5–1.9% (volume-tiered, +75c–$1 on lower bands); Stripe 1.7%+30c;
  Square 2.2%. Halaxy can pass the fee to the patient. Fees do not justify leaving Halaxy
  (you'd lose integrated claiming + face the read-only-API reconciliation problem).

## The completion webhook — `POST /api/admin-enquiries?halaxy_webhook=1` (LIVE)
Folded into the existing `admin-enquiries.js` handler (Vercel is 12/12 functions — no new route).
Branch sits **before** the `isAuthed` check (Halaxy has no cookie); it verifies the shared secret
instead. Flow:
1. **Auth** — `HALAXY_WEBHOOK_SECRET` must appear in **any** request header
   (`Object.values(req.headers).some(v => String(v).includes(secret))`) — robust to Halaxy's forced
   `Authorization: Bearer {token}` format. Wrong/absent → 401.
2. **Extract** the patient id via `JSON.stringify(body).match(/Patient\/(\d+)/)` (shape-agnostic).
3. **Idempotency** — skip if the id is already in the `halaxy_registered_patients` settings-cache ledger.
4. **Fetch** `halaxyGet('/Patient/<id>')` → name (`official`/`[0]` → given/family) + email (`telecom`
   `system==='email'`). **No email → bail** (no ledger mark, retry-safe) so a malformed fetch never
   creates a blank enquiry.
5. **Sync** — match an enquiry by email (prefer non-closed/converted) → `status='in_halaxy'` +
   `halaxy_client_url` = the FHIR ref + `activity_log`. No match → **insert** a `self-registered`
   enquiry at `in_halaxy` (`reason: 'Self-registered via /register'`).
6. **Email** the thank-you (`registrationCompleteEmailHtml` from `api/_emails.js`), mark the ledger,
   return 200 (always 200, even on error, so Halaxy doesn't retry-storm).

**Halaxy setup (done):** Settings → Integrations → Webhooks → Patient Created → target the URL above,
Authentication Header `Authorization: Bearer <HALAXY_WEBHOOK_SECRET>`, contact email `admin@`.

## Remaining work
1. **Cheree:** create the other 4 funder forms in Halaxy (NDIS/Bupa/QFES/WorkCover) → send the
   widget URLs → drop into `FUNDERS` in `register.html` (empty `url` = hidden; they auto-appear).
2. **DONE ✅ — Retired the manual flow** (`admin-ui.js`, +18/−507). The webhook auto-advances
   `contacted → in_halaxy`, so the pipeline "Add to Halaxy →" auto-advance (`ENQ_ADVANCE.contacted`),
   the pipeline "Send intake" panel, the detail panel's "Send onboarding / pick funding + paste
   Halaxy URL" section, and the manual "Add to Halaxy" patient search/create/mark panel were all
   removed (plus dead `_intakeEnquiryCard`/`renderIntakePanel`/`sendIntake` remnants). The
   `in_halaxy` **status** is untouched; only the manual *transition UI* is gone. The non-test
   `api/admin-intake.js` send path is kept as plumbing for item 3's "Send registration email" button.
3. Point the **registration email** CTA at `/register` (optionally per-funder deep-links
   `/register?funder=…`); the email's in-body funding picker can then be simplified/retired.

## Done (this build, all deployed)
- Single-page unified screen (above), replacing the two-step picker→form flow.
- Sessions-matched green header; clickable rail funder list with notes; in-place form swap.
- iframe width verified live (880, multi-column, no sidebar); left-aligned to the rail.
- Header sprig + right-hand trailing vine linked (same leaf, same right-edge anchor).
- Mobile: two-row header (logo+name / funder selector) + mint "what you'll fill in" pill +
  secure & scroll info strip; bottom-sheet funder list / checklist.
- **Completion webhook (above) — built, deployed, secret set, Halaxy webhook configured & live.**
- **Email test harness** now covers every live client email via `renderTestEmail()` in
  `admin-intake.js`; thank-you template shared via `api/_emails.js`.

## Still parked (see TODO.md)
- Appointment **confirmation** email (+ combined "confirmation + registration" variant).
- Simplify the admin "send" flow to one button.
