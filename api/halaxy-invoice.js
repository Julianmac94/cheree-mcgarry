/**
 * api/halaxy-invoice.js
 *
 * POST → create an Invoice in Halaxy (FHIR R4)
 *        Body: { patientId, date, amount, feeId?, notes?, funderOrgId? }
 *
 * Halaxy is the source of truth for all clinical billing.
 * This endpoint writes the invoice directly to Halaxy — nothing is stored
 * in Supabase except the client CRM link (halaxy_id on the clients table).
 */

import { isAuthed }   from './_auth.js';
import { halaxyPost } from './_halaxy.js';

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorised' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    patientId,   // Halaxy patient ID string, e.g. "12345"
    date,        // ISO date string "YYYY-MM-DD"
    amount,      // number or numeric string, e.g. 200.00
    feeId,       // ChargeItemDefinition Halaxy ID (optional — used for line item reference)
    feeName,     // human-readable fee name for CodeableConcept text fallback
    notes,       // free-text session notes
    funderOrgId, // Halaxy Organisation ID for the funder (optional — for payer reference)
  } = req.body || {};

  if (!patientId || !date || amount == null) {
    return res.status(400).json({ error: 'patientId, date, and amount are required' });
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  // ── Build FHIR R4 Invoice resource ────────────────────────────────────
  // Halaxy uses non-standard field names:
  //   "created"   instead of "date"
  //   "recipient" (array) instead of "subject" for the patient
  //   status "active" = outstanding (not FHIR-standard "issued")

  const lineItem = {
    sequence: 1,
    priceComponent: [{
      type:   'base',
      amount: { value: amountNum, currency: 'AUD' },
    }],
  };

  // Prefer a ChargeItemDefinition reference when we have the fee ID
  if (feeId) {
    lineItem.chargeItemReference = { reference: `ChargeItemDefinition/${feeId}` };
  } else {
    lineItem.chargeItemCodeableConcept = {
      text: feeName || notes || 'Psychology session',
    };
  }

  const invoiceResource = {
    resourceType: 'Invoice',
    status:       'active',                          // Halaxy active = outstanding
    subject:    { reference: `Patient/${patientId}` },
    recipient:  [{ reference: `Patient/${patientId}` }],
    created:    date,                                // Halaxy uses "created", not "date"
    lineItem:   [lineItem],
    totalNet:   { value: amountNum, currency: 'AUD' },
    totalGross: { value: amountNum, currency: 'AUD' },
  };

  // Optional: link invoice to the funding organisation (payer)
  if (funderOrgId) {
    invoiceResource.participant = [{
      role: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'PAYEE' }],
      },
      actor: { reference: `Organization/${funderOrgId}` },
    }];
  }

  if (notes) {
    invoiceResource.note = [{ text: notes }];
  }

  try {
    const created = await halaxyPost('/Invoice', invoiceResource);
    console.log('Halaxy Invoice created:', created.id, 'for patient', patientId, 'date', date, 'amount', amountNum);
    return res.status(201).json({
      id:     created.id,
      status: created.status,
      date:   created.created || date,
      amount: amountNum,
    });
  } catch (err) {
    console.error('Halaxy Invoice creation failed:', err.message);
    // Surface the full Halaxy error so the client can display it
    return res.status(502).json({ error: err.message });
  }
}
