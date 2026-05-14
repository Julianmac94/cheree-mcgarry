/**
 * api/admin-intake.js
 * Protected endpoint — sends the intake email to a client.
 * Called from the admin dashboard enquiry cards.
 *
 * POST body: { enquiryId, clientType, intakeUrl }
 *   clientType: 'new' | 'medicare' | 'ndis'
 *   intakeUrl:  Halaxy intake form URL to embed as CTA
 *
 * Env vars required:
 *   RESEND_API_KEY
 *   ADMIN_SECRET / ADMIN_PASS  (auth check)
 */

import { Resend } from 'resend';
import { isAuthed } from './_auth.js';
import { supabase } from './_supabase.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const C = {
  cream:    '#F3EFE6',
  tealDeep: '#192E2A',
  teal:     '#2A5850',
  tealMid:  '#376B62',
  mint:     '#77CFBD',
  terra:    '#BE6E44',
  soft:     '#7A948F',
  mid:      '#3E5C56',
};

// ── Shared wrapper (matches contact.js / session.js) ─────────────
function wrap(innerHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cheree McGarry Counselling &amp; Wellness</title>
</head>
<body style="margin:0;padding:0;background:${C.cream};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};padding:40px 20px 60px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:0 0 28px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:14px;vertical-align:middle;">
                  <div style="width:38px;height:38px;background:${C.teal};border-radius:50%;"></div>
                </td>
                <td style="vertical-align:middle;">
                  <span style="display:block;font-size:17px;font-weight:500;color:${C.teal};letter-spacing:0.01em;">Cheree McGarry</span>
                  <span style="display:block;font-size:9px;font-weight:400;letter-spacing:0.14em;text-transform:uppercase;color:${C.soft};margin-top:2px;">Counselling &amp; Wellness</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border-radius:14px;border:1px solid rgba(42,88,80,0.10);overflow:hidden;">
            ${innerHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:28px 0 0;text-align:center;">
            <p style="font-size:11px;color:${C.soft};margin:0 0 6px;">Cheree McGarry Counselling &amp; Wellness</p>
            <p style="font-size:11px;color:${C.soft};margin:0;">
              <a href="https://chereemcgarry.com" style="color:${C.soft};text-decoration:underline;">chereemcgarry.com</a>
              &nbsp;&middot;&nbsp;
              <a href="mailto:reachout@chereemcgarry.com" style="color:${C.soft};text-decoration:underline;">reachout@chereemcgarry.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Funding-specific copy blocks ─────────────────────────────────
function fundingNote(clientType) {
  if (clientType === 'medicare') {
    return `
      <div style="background:rgba(42,88,80,0.04);border-radius:10px;border:1px solid rgba(42,88,80,0.10);padding:16px 20px;margin:0 0 26px;">
        <p style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.teal};margin:0 0 8px;">Medicare (Mental Health Care Plan)</p>
        <p style="font-size:13.5px;color:${C.mid};line-height:1.7;margin:0;">
          As you're accessing sessions under a Mental Health Care Plan, please have your
          <strong style="color:${C.tealDeep};font-weight:500;">GP referral and Medicare card</strong> handy
          when completing your intake form. You'll need these to claim your rebate through Medicare.
          If you haven't received your referral yet, no rush — just bring it to your first session.
        </p>
      </div>`;
  }
  if (clientType === 'ndis') {
    return `
      <div style="background:rgba(42,88,80,0.04);border-radius:10px;border:1px solid rgba(42,88,80,0.10);padding:16px 20px;margin:0 0 26px;">
        <p style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.teal};margin:0 0 8px;">NDIS Funding</p>
        <p style="font-size:13.5px;color:${C.mid};line-height:1.7;margin:0;">
          Cheree will send a <strong style="color:${C.tealDeep};font-weight:500;">Service Agreement</strong>
          before your first session. If your plan is <strong style="font-weight:500;">plan-managed</strong>,
          please include your plan manager's contact details in the intake form so invoices can be
          directed to them. If you're <strong style="font-weight:500;">self-managed</strong>, invoices will
          be sent directly to you for reimbursement.
        </p>
      </div>`;
  }
  return ''; // 'new' — no extra note
}

function subjectLine(clientType, firstName) {
  if (clientType === 'medicare') return `Your intake form is ready — Medicare sessions with Cheree McGarry`;
  if (clientType === 'ndis')     return `Your intake form is ready — NDIS sessions with Cheree McGarry`;
  return `Welcome, ${firstName} — your intake form is ready`;
}

function topLabel(clientType) {
  if (clientType === 'medicare') return 'Medicare — next step';
  if (clientType === 'ndis')     return 'NDIS — next step';
  return 'Welcome';
}

// ── Intake email HTML ────────────────────────────────────────────
function intakeEmailHtml({ firstName, clientType, intakeUrl }) {
  function step(num, title, sub) {
    return `
      <tr>
        <td style="width:28px;padding-right:16px;vertical-align:top;padding-bottom:20px;">
          <div style="width:26px;height:26px;border-radius:50%;background:rgba(42,88,80,0.08);border:1.5px solid ${C.teal};text-align:center;line-height:26px;">
            <span style="font-size:11px;font-weight:600;color:${C.teal};">${num}</span>
          </div>
        </td>
        <td style="padding-bottom:20px;vertical-align:top;border-bottom:1px dashed rgba(42,88,80,0.10);">
          <p style="font-size:14px;font-weight:500;color:${C.tealDeep};margin:0 0 4px;">${title}</p>
          <p style="font-size:13px;color:${C.mid};line-height:1.6;margin:0;">${sub}</p>
        </td>
      </tr>`;
  }

  return wrap(`
    <!-- Accent bar -->
    <div style="height:4px;background:linear-gradient(90deg,${C.teal},${C.mint});border-radius:14px 14px 0 0;"></div>

    <div style="padding:36px 40px 32px;">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.terra};margin:0 0 18px;">${topLabel(clientType)}</p>
      <h1 style="font-size:28px;font-weight:400;color:${C.tealDeep};margin:0 0 22px;line-height:1.2;">
        Hi ${firstName} &#8212;<br>
        <span style="font-style:italic;">your intake form is ready.</span>
      </h1>

      <p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 20px;">
        Cheree has reviewed your request and is looking forward to connecting with you.
        Before your first session, please complete a short intake form &#8212; it helps Cheree
        prepare and means you can get straight into the conversation.
      </p>

      <p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 28px;">
        It only takes a few minutes and there are no right or wrong answers.
      </p>

      ${fundingNote(clientType)}

      <!-- CTA button -->
      <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr>
          <td style="background:${C.teal};border-radius:10px;">
            <a href="${intakeUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:500;letter-spacing:0.04em;text-decoration:none;">
              Complete your intake form &rarr;
            </a>
          </td>
        </tr>
      </table>

      <p style="font-size:12px;color:${C.soft};margin:0 0 32px;">
        Or copy this link: <a href="${intakeUrl}" style="color:${C.teal};text-decoration:underline;word-break:break-all;">${intakeUrl}</a>
      </p>

      <!-- What happens next -->
      <div style="border-top:1px solid rgba(42,88,80,0.10);padding-top:26px;">
        <p style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.teal};margin:0 0 20px;">What happens next</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${step('1', 'Complete your intake form', 'Takes about 5 minutes. Your answers are confidential and help Cheree prepare for your first session.')}
          ${step('2', 'Cheree confirms your appointment', 'Once your intake is complete, Cheree will be in touch to confirm the date, time, and joining details.')}
          ${step('3', 'Your first session', 'In person at Karalee (QLD) or online &mdash; wherever works best for you.')}
        </table>
      </div>
    </div>

    <!-- Sign-off -->
    <div style="background:rgba(42,88,80,0.04);border-top:1px solid rgba(42,88,80,0.08);padding:22px 40px;">
      <p style="font-size:14px;color:${C.tealDeep};margin:0 0 4px;font-weight:400;">Warm regards,</p>
      <p style="font-size:18px;color:${C.teal};font-style:italic;font-weight:400;margin:0 0 2px;">Cheree McGarry</p>
      <p style="font-size:11px;color:${C.soft};margin:0 0 14px;letter-spacing:0.06em;">Accredited Mental Health Social Worker</p>
      <a href="https://chereemcgarry.com/info.html" style="font-size:12px;color:${C.teal};text-decoration:underline;">Read the client information guide &rarr;</a>
    </div>
  `);
}

// ── Handler ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorised' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { enquiryId, clientType = 'new', intakeUrl = '' } = req.body || {};

  if (!enquiryId) return res.status(400).json({ error: 'enquiryId is required.' });
  if (!intakeUrl.trim()) return res.status(400).json({ error: 'intakeUrl is required.' });
  if (!['new', 'medicare', 'ndis'].includes(clientType)) {
    return res.status(400).json({ error: 'clientType must be new, medicare, or ndis.' });
  }

  // Fetch enquiry from Supabase
  const db = supabase();
  const { data: enquiry, error: fetchErr } = await db
    .from('enquiries')
    .select('first_name, last_name, email')
    .eq('id', enquiryId)
    .single();

  if (fetchErr || !enquiry) {
    return res.status(404).json({ error: 'Enquiry not found.' });
  }

  const firstName = enquiry.first_name || 'there';
  const email = enquiry.email;

  try {
    await resend.emails.send({
      // TODO: update to notifications@chereemcgarry.com once domain is verified on Resend
      from:    'Cheree McGarry <onboarding@resend.dev>',
      to:      [email],
      subject: subjectLine(clientType, firstName),
      html:    intakeEmailHtml({ firstName, clientType, intakeUrl }),
    });

    // Mark enquiry as in_halaxy
    await db
      .from('enquiries')
      .update({ status: 'in_halaxy' })
      .eq('id', enquiryId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/admin-intake] Resend error:', err);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
}
