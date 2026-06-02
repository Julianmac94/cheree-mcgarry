# Fee menu draft — SHAPE THIS (Julian)

> Source: Halaxy CSV export, `Status=current` only (archived rows dropped). This becomes the seed
> for the `session_type_fee_map` config. **Edit freely** — move rows between "Bookable" and "Hidden",
> fix labels/mappings, answer the `❓` prompts. I'll turn whatever you leave here into the config.
>
> Legend: **Bookable** = appears in Cheree's "Set up in Halaxy" pick-list. **Hidden** = exists in
> Halaxy but never shown in the booking flow (admin/edge/duplicate/other-service).

---

## Private
**Bookable**
- [ ] Individual · In person — first **$180** ("Face to Face") / ongoing **$160** ("Face to Face | Ongoing Session")
- [ ] Individual · Online — first **$180** ("Online") / ongoing **$160** ("Online | Ongoing Session")
- [ ] Couple — **$200** ("couple session")  ❓ does couple have an ongoing/lower rate, or always $200?
- [ ] Child / Parent intake — **$160** ("Parent Intake / Child")  ❓ is this first-only, or also ongoing?
- [ ] Group — **$400**, 120 min ("Group Session")

**Hidden** (admin/edge)
- Set-up Appointment Only ($0) · Cancelled <24h ($180) · Client non-attendance <24h ($1)
- Letter/report writing ($240, item) · Test Fee ($1)
- Ayurveda initial $200 / ongoing $180 — confirmed separate service, hidden
- ❓ "NDIS Set up appointment" $193.99 (filed under Private) — keep hidden, or is this a real bookable NDIS setup step?

## Medicare  *(needs a valid GP referral / MHCP on file)*
**Bookable**
- [ ] In person — **$180** · MBS item **80160** ("In Person Consultation")
- [ ] Video — **$180** · MBS **91176** ("Video Telehealth Consultation")
- [ ] Phone — **$180** · MBS **91188** ("Phone Telehealth Consultation") / ongoing **$160**
  ❓ in-person & video also have ongoing rates? (CSV only shows phone ongoing as current)

**Hidden** (edge)
- "Other than Client" Face-to-Face $82.30 (80162) / Telehealth $82.30 (91197) — parent/carer sessions
  ❓ should Cheree ever book these, or stays your job?

## NDIS (plan-managed) — all **$193.99**, line item `15_621_0128_1_3`
Cheree **picks the plan manager** each booking (rate identical; just routes the invoice). Plan managers:
- [ ] In Choice Plan Management   (has F2F + Telehealth + "Other Professional" `01_741` variants)
- [ ] NDSP
- [ ] Plan Partners
- [ ] Future By Design
- [ ] Alliance Plan Management
- [ ] Purple Leopard Plan Management
- [ ] ICASAU
- [ ] Freedom Plan Management   (also has an Early Childhood Intervention variant)

❓ Any plan managers to ADD or REMOVE from this list?
❓ Modality (F2F vs telehealth) — same $193.99, so does Cheree need to pick it for NDIS, or just plan manager?

**Hidden** (edge): Case Conference $160 · Provider travel $1 · Training for Carers/Parents $77 · ECEI variant

## QFES (EAP) — priced by **duration**
**Bookable**
- [ ] 60 min — **$250**
- [ ] 90 min — **$375**
- [ ] 120 min — **$500**
- [ ] 150 min — **$625**

**Hidden**: Cancellation 30min $125 · "Business Development" $250
❓ does Cheree choose the duration, or is it auto from the calendar event length?

## DVA / BUPA ADF Health Services  — ⚠ NEED YOUR RULE
Three current rates — I can't infer when each applies:
- US04 (CP-02) — **$226.25** — "50–90 minutes"
- US30 — **$232.29** — "Video Conference by a Social Worker" (this one is clearly *video*)
- US24 — **$246.44** — "50+ mins"

❓ When does Cheree pick US04 vs US24? (US30 = video.) e.g. is it in-person duration bands, or
   initial vs subsequent, or something else?

## WorkCover QLD
**Bookable**
- [ ] Initial Consultation — **$243** (item 1000241)
- [ ] Subsequent Consultation — **$243** (item 1000242)   ❓ auto-pick initial vs subsequent from client history?

**Hidden** (edge): Standard Report $184 (×2 item numbers) · Case conference $223 · Communication 11–20min $75

---

## Cross-cutting questions
- ❓ **First vs ongoing** — OK for me to auto-detect from "does this client have a prior session with us?" (so Cheree never picks)?
- ❓ **Modality** (in-person / video / phone) — OK to auto-read from the Google Calendar event's location, with Cheree able to override?
- ❓ Any funder **entirely missing** from this list that Cheree books? (Bupa health insurance, RTWSA/ReturnToWorkSA appeared only as archived/seed — not current here.)
