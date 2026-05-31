# Registration form → Halaxy (spec / exploration)

Goal: replace the link-laden registration email with **our own registration form** on
chereemcgarry.com that pushes the client straight into Halaxy (creates the Patient +
funding Coverage) and sends our own thank-you. The email then becomes a single clean
"Complete your registration →" link. This form is the client's biggest touchpoint with
the practice, so UX + trust matter.

Status: **exploration / not built.** Research done against developers.halaxy.com.

---

## 1. Flow

1. Cheree sends the registration email (one link → `chereemcgarry.com/register?t=<signed-token>`).
2. Client opens the form. The link token (HMAC over enquiry id + email, signed with `ADMIN_SECRET`)
   ties the submission to a known enquiry, pre-fills name/email, and gates the public endpoint
   against abuse.
3. Client picks **funding type** → form branches to the right fields.
4. Client fills details + consents → submit.
5. Server: verify token → create **Patient** in Halaxy → create **Coverage** (per funding) →
   (optional) attach consent **DocumentReference** → send thank-you email (Resend) →
   advance the enquiry (match by email) to `in_halaxy`/`registered`.
6. Client sees a thank-you page ("Cheree will be in touch to confirm a time").

> Register-only for now. **Booking a time is out of scope** (that's the Appointment resource +
> Cheree's confirmation email — see TODO). Keeps this build focused.

## 2. Form fields

**Always:**
- Funding type (Private / Medicare / NDIS / Bupa / QFES / WorkCover) — drives branching
- Legal name (family + given), preferred name, DOB, gender, pronouns (optional)
- Email, mobile, postal address
- Emergency contact (name, relationship, phone)
- GP name + clinic (needed for Medicare referrals; optional otherwise)
- **Consents** (checkboxes, required): consent to treatment, privacy & information handling,
  telehealth (if online), acknowledge 48-hr cancellation policy
- If client is a **minor**: parent/guardian details + guardian consent

**Funding-specific (the fiddly part):**
| Funding | Extra fields | Halaxy Coverage |
|---|---|---|
| Private / Self-funded | — | none (patient is payor) |
| Medicare (MHCP) | Medicare no., IRN, card expiry, GP referral details | `Coverage` code `MC`, `subscriberId`=number, `dependent`=IRN, `period.end`=expiry, `payor`→Medicare Org |
| NDIS | NDIS no., plan dates, management type (self / plan / agency), plan-manager contact | `Coverage` + `coverage_payer` billing direction; plan-managed → invoice to plan manager Org |
| Bupa / private health | fund, membership no. | `Coverage` generic; `payor`→fund Org |
| WorkCover | claim no., insurer, case manager | `Coverage` third-party `payor`→insurer Org |
| QFES | self-referred details | likely `payor`→QFES Org or patient-billed; **confirm with Cheree** |

> Medicare/DVA have clean FHIR codes (`MC` / `DVAU`). NDIS plan-management + WorkCover/QFES
> billing direction use Halaxy extensions (`coverage_payer`, `coverage_organisation`) and the
> funder **Organization IDs** — we already cache funders in `_halaxy.js`; map each type to its Org id.

## 3. Halaxy API (au-api.halaxy.com, existing OAuth in `_halaxy.js`)

- `POST /Patient` — FHIR Patient (name/gender/birthDate/telecom/address/contact). Returns `{"success":true}` (need to confirm it returns the new id, else look it up by email).
- `POST /Coverage` — per funding (see table). `subscriber`+`beneficiary`→`Patient/<id>`, `payor`→`Organization/<funderId>`.
- `POST /DocumentReference` — optional, store the signed consent text as a clinical note on the patient.

## 4. Security / privacy (important — this collects health identifiers)

- **Store as little as possible our side.** Push Patient + Coverage straight to Halaxy; do NOT
  persist Medicare/NDIS numbers in Supabase. On our side only set the enquiry → registered + timestamp.
- Public submit endpoint must be abuse-resistant: **require the signed link token**, validate it,
  rate-limit, and only allow creating a patient for an enquiry that exists + is in a sendable state.
- HTTPS only; never put identifiers in URLs/logs.
- Consents captured with timestamp + version; store the acknowledgement (not health data) for the record.

## 5. Constraints / decisions to make first

- **Vercel 12-function limit (currently 12/12).** A public submit endpoint = +1 → over the cap.
  Must either fold the handler into an existing public endpoint (`contact.js`/`session.js` with an
  `action`) or consolidate two functions (e.g. merge `google-auth`+`google-callback`) to free a slot.
- **Form page** = static `register.html` (no function); only the submit handler is a function.
- **Confirm Cheree's current Halaxy form parity** — exact fields + which consents are legally required,
  so we don't drop anything she relies on.

## 6. Suggested build phases

1. **Pipeline proof:** Private-only form (no Coverage) → create Patient + thank-you + advance enquiry. End-to-end.
2. **Funding branches + Coverage:** Medicare → NDIS → Bupa → WorkCover → QFES (map Org ids, handle billing direction).
3. **Consents (DocumentReference), minors/guardian, validation + error handling, polish.**
4. **Retire the link email** → single "Complete your registration →" link to the form.

## 7. Open questions for Cheree
- Exact fields + required consents on her current Halaxy registration form?
- Keep registration purely administrative (no presenting-concern), or capture a brief reason?
- Separate flows for couples / children, or one form with a "who is this for" branch?
- Register-only (Cheree books the time) confirmed? (vs. client self-booking — bigger build)
