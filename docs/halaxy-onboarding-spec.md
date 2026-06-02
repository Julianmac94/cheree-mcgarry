# "Set up in Halaxy" — Cheree self-serve onboarding (DESIGN, not built yet)

> Companion to `docs/registration-form-spec.md`. That doc covers the **self-registration**
> front door (`/register` → Halaxy widget → Patient·Create webhook). **This doc covers the
> SECOND front door:** the manual, dashboard-driven path for clients who will NOT self-register.

## Why this exists (the workflow reality)

- **Cheree never touches Halaxy.** Her only tools are **Google Calendar** + the dashboard.
  She books a client by adding a GCal event.
- **Julian currently does all the "make this client billable in Halaxy" work.** The goal is to
  make that simple enough for **Cheree to do herself, fully self-serve, without ever opening Halaxy.**
- This means the docs' old principle — *"/register is the single front door; no patient is ever
  added to Halaxy manually"* — is **wrong in practice.** There are **two front doors**:
  1. **Self-register** (`/register` widget → webhook) — for new clients who fill the form.
  2. **Dashboard "Set up in Halaxy"** (this doc) — for clients Cheree books in GCal / known
     existing clients / contact-form enquiries we recognise.

## The key enabler: the dashboard can already do the whole billable chain via API

No Halaxy web UI is required — every write already exists:

| Step | Halaxy API call | Already wired as |
|---|---|---|
| Create patient | `POST /Patient` | Add Client modal "Create in Halaxy →"; `?halaxy_create_patient=1` |
| Link funder | `POST /Coverage` | create-client flow; `?halaxy_coverage=1` |
| Book appt **+ auto-create invoice, clinical note, reminder** | `POST /Appointment/$book` with a `feeId` | `dbBookHalaxyAppt()` → `?halaxy_appt_action=1` (`api/admin-enquiries.js` ~L743) |

`POST /Invoice` is blocked (405) — **but `$book` with a fee auto-creates the invoice**, so it
doesn't matter. The full chain (patient → coverage → booked+invoiced appointment) is reachable
from the dashboard today; it's just **two disconnected manual steps** and scattered UI.

> NOTE: the earlier "retire the manual Halaxy flow" change removed only the **redundant**
> enquiry-side UI (paste-a-Halaxy-URL + send-intake-email + manual status-flip). It did **NOT**
> remove any of the `Patient`/`Coverage`/`$book` billing plumbing above — that all stays and is
> the foundation for this feature.

## Decisions (locked with Julian, 2026-06-02)

- **Operator: Cheree, fully self-serve.** Max simplicity + guardrails. She must never see a raw
  Halaxy fee name/ID, never type a dollar amount, never open Halaxy.
- **Fees vary by session type within a funder** (e.g. Private Individual vs Couple/Family). So the
  flow needs a **session-type → fee map that Julian configures once**, and Cheree just picks a
  plain-English session type.

## Fee structure (ground truth — from Halaxy's CSV export, 2026-06-02)

**Key finding:** the FHIR API does NOT return a funder per fee (`ChargeItemDefinition` has no org
ref → dashboard keyword-guesses). But **Halaxy's CSV export (`Funder` column) DOES** have the real
funder↔fee link, plus `Status` (current/archived), `Duration`, `Appt Location Type`. So **seed the
`session_type_fee_map` from that CSV** (filter `Status=current`, drop junk), don't hand-build it.
Match CSV rows to API fees by **name+amount** (how the dashboard dedups) to recover the FHIR fee id.

### FINALISED bookable menu (Julian shaped it, 2026-06-02 — `docs/fee-menu-draft.md`)
Deliberately trimmed to a v1 — several items "parked pending review with Cheree" (see Parked below).
**No first/ongoing tiers** — every session is flat-priced; Cheree just picks per funder.

- **Private** — Individual · In person **$180** ("Face to Face") · Individual · Online **$180** ("Online")
  · Child / Parent intake ("Parent Intake / Child"). ⚠ **Child price open:** Julian wrote **$180** but
  the current Halaxy fee is **$160** — confirm (raise the Halaxy fee, or map child → $160, or → the
  $180 individual fee).
- **Medicare** *(valid GP referral / MHCP required)* — In person **$180** (MBS **80160**) · Video
  **$180** (**91176**) · Phone **$180** (**91188**). **Item number = modality, mandatory** (wrong one
  = rejected claim) → encoded, hidden from Cheree.
- **NDIS (plan-managed)** — all **$193.99**, line item `15_621_0128_1_3`, across **8 plan managers**
  (In Choice, NDSP, Plan Partners, Future By Design, Alliance, Purple Leopard, ICASAU, Freedom).
  **Cheree picks plan manager AND modality** (F2F/telehealth). Most PMs have a single fee row (modality
  is cosmetic → same id); In Choice has explicit F2F vs Telehealth rows.
- **QFES (EAP)** — Cheree **picks duration**: 60min **$250** · 90 **$375** · 120 **$500** · 150 **$625**.
  ⚠ **The Halaxy appointment length sent to `$book` MUST equal the chosen band** (invoicing requires it).
- **DVA / Bupa / ADFHCS** — **US24 only, $246.44.** (US04/US30 exist but are NOT used.) NB **"Bupa" = DVA**
  here, not health insurance — see [[funder-terminology]].
- **WorkCover QLD** — Initial **$243** (1000241) · Subsequent **$243** (1000242). Cheree picks (no auto).

**Modality is always a Cheree pick in the wizard** — the Google Calendar event does NOT carry
in-person/video/phone, so she confirms it at map-to-Halaxy time (it then drives the Medicare item /
Private fee / Halaxy appointment location).

**Hidden / not in v1:** archived rows, "Other than client", cancellation, non-attendance, reports,
travel, case conference, NDIS extras (case conf/ECEI/carer training), set-up appointments,
**Ayurveda** (separate service), Test/Business Development.

**Parked pending Cheree review (NOT in v1):** Private **Couple** ($200 — Julian will do couples
manually in Halaxy for now) and **Group** ($400); cancellation/non-attendance handling per funder;
"NDIS Set up appointment". Revisit after v1.

## Building blocks

### 1. Session-type → fee config (Julian, one-time, in Settings) — BUILD FIRST
A grid in dashboard **Settings** (`renderSettingsView`, `js/admin-ui.js` ~L7307). For each
**funder × session type** (Individual / Couple / Family / … — a small editable list of friendly
labels) Julian picks the matching **Halaxy fee** (from the cached `_halaxyFees`, filtered per
funder via the existing `_filterFeesForFunder`). Set-and-forget; one place to update if Halaxy
fees change.
- **Persist** in the `settings` table, e.g. key `session_type_fee_map` =
  `{ private: { individual: <feeId>, couple: <feeId> }, medicare: { individual: <feeId> }, ndis: {…}, … }`
  (+ a `session_types` list for the labels).
- **Persistence mechanism:** add a `?settings_get`/`?settings_set` (or `?session_fee_map=1`)
  branch to `admin-enquiries.js` reusing `readCache`/`writeCache` — **no new serverless function**
  (Vercel is at 12/12). Auth via the normal `isAuthed` cookie (Julian-only config is fine; or gate
  to Julian by `getSessionUser`).

### 2. "Set up in Halaxy" wizard (Cheree) — BUILD SECOND
Launched from a Google Calendar event flagged "not in Halaxy yet". A single guided modal that
chains the existing API calls. Reuse `convertPendingPl(event)` (GCal→prefill bridge),
`_searchHalaxyPatientsModal` (email/name match), and `dbBookHalaxyAppt` ($book) internals.
Steps:
1. **Client** — name/email prefilled from the GCal event. Auto-search Halaxy by email then name:
   - Match → "Found <name> ✓", reuse that patient.
   - No match → "New client" → `POST /Patient` on confirm (prefilled name/email/phone).
2. **Funding** — pick funder (friendly `FUNDER_LABELS`). New patient + non-private → `POST /Coverage`.
3. **Session type** — pick Individual / Couple / Family → fee resolves silently from the config map.
4. **Confirm & book** — show plain-English summary ("Couple session · Private · $X · Tue 18 Jun
   10:00am", date/time/duration from the GCal event) → **"Book & create invoice"** → `$book`.
- **Guardrails:** if no fee is configured for the chosen funder × session type, STOP with
  "Ask Julian to set this fee up" (never mis-bill / never let her type an amount). Idempotent —
  don't double-`$book` an event already set up (track the Halaxy appt id against the GCal event id).

### 3. "Not in Halaxy yet" surfacing — BUILD THIRD
A badge + "Set up in Halaxy" button on GCal events/appointments that have no linked Halaxy
appointment. The inbox already computes unlinked appointments (`_recomputeInboxBuckets`,
`_calEventMap`) — surface a clear call-to-action there and on the appointments panel.

### 4. Docs — BUILD LAST
Update `CLAUDE.md` + `docs/registration-form-spec.md` to describe the **two front doors** and drop
the "no patient is ever added to Halaxy manually" wording.

## Open questions / to resolve at build time
- **⚠ Child / Parent intake price** — Julian wrote $180; Halaxy fee is $160. Resolve before booking
  child sessions (raise Halaxy fee → $180, or map to the $160 fee, or to the $180 individual fee).
- **Session-type model is per-funder** (see finalised menu): Private = Individual in-person/online;
  Medicare = modality→MBS item; NDIS = plan-manager (+modality); QFES = duration band; DVA = single
  US24; WorkCover = initial/subsequent. The config models each funder's own pick-list.
- **NDIS Coverage:** does `?halaxy_coverage=1` need the chosen plan-manager org id at setup so the
  per-booking PM pick bills correctly? (PM picked per booking — confirm the Coverage vs fee-id
  relationship so the invoice routes to the right PM.)
- **QFES duration ↔ appointment length:** the `$book` apptEnd must = apptStart + chosen band (60/90/
  120/150) for invoicing. Wizard sets duration from the QFES pick, not the GCal event length.
- **Who may configure** the fee map — Julian only, or Cheree too? (Recommend Julian-only.)

### Resolved (2026-06-02)
- **No first/ongoing tiers** — all flat-priced; Cheree picks per funder (no auto-detect).
- **Modality is a Cheree pick in the wizard** (GCal lacks it) — drives Medicare item / Private fee /
  Halaxy location. NDIS: Cheree picks PM + modality.
- **DVA = US24 only ($246.44)**; "Bupa" = DVA/ADFHCS (not health insurance) — see [[funder-terminology]].
- **Couple/Group parked** pending Cheree review (couples done manually in Halaxy for now).

## Status
Design agreed + fee menu finalised (v1).
**Step 1 BUILT (2026-06-03, uncommitted):**
- Server: `GET /api/admin-enquiries` payload now includes `session_fee_map`; new authed
  `POST ?settings_set=1` writes the whitelisted `session_fee_map` key (`api/admin-enquiries.js`).
- Client: `BOOKABLE_MENU` constant + `_bookableFeeMatch()` (auto-match by name+amount) +
  Settings → **"Booking fees"** section (`_renderBookingFeesSection` / `saveBookingFees`) +
  `FUNDER_LABELS.dva` relabelled "DVA / Bupa / ADFHCS" (`js/admin-ui.js`).
- Verified: both files `node --check` clean; auto-match resolves **all 14 menu items** against the
  real (deduped) CSV fee names. **NOT yet verified in a live browser** (auth-gated dashboard) — needs
  a deploy/preview check that the "Booking fees" grid renders + Save round-trips.

**Step 2 BUILT (2026-06-03, uncommitted):**
- `openSetupInHalaxy(prefill)` modal (`js/admin-ui.js`) — match-or-create patient → (coverage for
  non-private) → `$book` (Halaxy auto-creates the invoice). Reuses `?halaxy_create_patient` /
  `?halaxy_coverage` / `?halaxy_appt_action` (action `book`). Funder → session-type picks come from
  `BOOKABLE_MENU`; fee resolved via `_bookableResolveFee` (saved `session_fee_map`, else auto-match);
  NDIS shows plan-manager picker (routes via Coverage payor); modality fixed for Private/Medicare,
  picked otherwise; QFES duration locked to the band. `window.confirm` summary before any write.
- Entry point: **"⚕ Set up in Halaxy"** button on the appointments panel header (step 3 will add the
  per-GCal-event CTA + "not in Halaxy yet" badge).
- Verified: `node --check` clean; Brisbane TZ end-time math correct (incl. day-boundary).
- ⚠️ **NOT tested against live Halaxy** — this performs IRREVERSIBLE production writes (real patient +
  appointment + invoice; no API undo). **Must be tested first** with a throwaway patient using the
  **$0 "Set-up Appointment Only"** or **$1 "Test Fee"** before real client use.

**Step 3 BUILT (2026-06-03, uncommitted):**
- `_sihFromCalEvent(eventId)` prefills the wizard from a Google Calendar event (name split from
  title, date/time sliced from the ISO start, duration from end−start).
- Desktop: "⚕ Set up in Halaxy →" action on **upcoming unlinked cal events** (list + card via
  `_actionBtn`) + a "Not in Halaxy" badge in the list row.
- Mobile: "⚕ Set up in Halaxy &amp; book →" as the primary action in `_calUnlinkedActionHtml`
  (above the existing "link to an existing Halaxy appointment" merge list).
- Verified `node --check` + prefill parsing on sample events.

**Child price RESOLVED: $180** (`private_child` match set to $180). ⚠ The Halaxy "Parent Intake /
Child" fee is still $160 in the export — raise it to $180 in Halaxy (then auto-match works), or map
child → the $180 "Face to Face" fee in Settings → Booking fees.

Build order: ~~1~~ → ~~2~~ → ~~3~~ → 4 (docs — update CLAUDE.md/registration-form-spec.md re: the
two front doors). Remaining open: whether matched-existing patients need a coverage re-write;
**live test required before real use** (irreversible Halaxy writes).
