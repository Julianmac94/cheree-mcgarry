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
import { isAuthed, getSessionUser } from './_auth.js';
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
function wrap(innerHtml, preheader = '') {
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.cream};opacity:0;">${preheader}&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;&#8199;&zwnj;</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cheree McGarry Counselling &amp; Wellness</title>
</head>
<body style="margin:0;padding:0;background:${C.cream};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  ${preheaderHtml}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};padding:40px 20px 60px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:0 0 28px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:12px;vertical-align:middle;">
                  <img src="https://chereemcgarry.com/assets/email-logo.png" width="50" height="50" alt="Cheree McGarry" style="display:block;border:0;">
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
          when you complete your registration. You'll need these to claim your rebate through Medicare.
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
          please include your plan manager's contact details in your registration so invoices can be
          directed to them. If you're <strong style="font-weight:500;">self-managed</strong>, invoices will
          be sent directly to you for reimbursement.
        </p>
      </div>`;
  }
  return ''; // 'new' — no extra note
}

function subjectLine(clientType, firstName) {
  if (clientType === 'registration') return `Let's get you registered, ${firstName}`;
  if (clientType === 'personal') return `A few details before we begin, ${firstName}`;
  if (clientType === 'medicare') return `Let's get you registered — Medicare sessions with Cheree McGarry`;
  if (clientType === 'ndis')     return `Let's get you registered — NDIS sessions with Cheree McGarry`;
  return `Welcome, ${firstName} — let's get you registered`;
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
    <div style="height:4px;background:${C.teal};background:linear-gradient(90deg,${C.teal},${C.mint});border-radius:14px 14px 0 0;"></div>

    <div style="padding:36px 40px 32px;">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.terra};margin:0 0 18px;">${topLabel(clientType)}</p>
      <h1 style="font-size:28px;font-weight:400;color:${C.tealDeep};margin:0 0 22px;line-height:1.2;">
        Hi ${firstName} &#8212;<br>
        <span style="font-style:italic;">let&rsquo;s get you registered.</span>
      </h1>

      <p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 20px;">
        Cheree has reviewed your request and is looking forward to connecting with you.
        Before your first session, please complete a short registration form &#8212; it gets you
        set up so you can come straight into the conversation when we meet.
      </p>

      <p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 28px;">
        It only takes a few minutes.
      </p>

      ${fundingNote(clientType)}

      <!-- CTA button -->
      <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr>
          <td style="background:${C.teal};border-radius:10px;">
            <a href="${intakeUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:500;letter-spacing:0.04em;text-decoration:none;">
              Complete your registration &rarr;
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
          ${step('1', 'Complete your registration', 'Takes about 5 minutes &mdash; just your details. Confidential, and it gets you set up for your first session.')}
          ${step('2', 'Cheree confirms your appointment', 'Once you&rsquo;re registered, Cheree will be in touch to confirm the date, time, and joining details.')}
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

// ── Personal / private appointment email (v2 — Cheree's first-person voice) ──
function personalEmailHtml({ firstName, intakeUrl }) {
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
    <div style="height:4px;background:${C.teal};background:linear-gradient(90deg,${C.teal},${C.mint});border-radius:14px 14px 0 0;"></div>
    <div style="padding:36px 40px 32px;">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.terra};margin:0 0 18px;">You&rsquo;re in the right place</p>
      <h1 style="font-size:28px;font-weight:400;color:${C.tealDeep};margin:0 0 22px;line-height:1.25;">
        Hi ${firstName} &#8212;<br>
        <span style="font-style:italic;">I&rsquo;m really glad you reached out.</span>
      </h1>

      <p style="font-size:14px;color:${C.mid};line-height:1.75;margin:0 0 20px;">
        Taking this first step isn&rsquo;t always easy, and it&rsquo;s not lost on me that you have. Before we meet,
        I&rsquo;ll ask you to complete a short registration form &#8212; nothing formal, just a few details so I can
        get you set up and book you in.
      </p>
      <p style="font-size:14px;color:${C.mid};line-height:1.75;margin:0 0 28px;">
        It only takes a few minutes, and it means our first session can be about <em>you</em>, not paperwork.
      </p>

      <table cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
        <tr><td style="background:${C.teal};border-radius:10px;">
          <a href="${intakeUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:500;letter-spacing:0.04em;text-decoration:none;">
            Complete your registration &rarr;
          </a>
        </td></tr>
      </table>
      <p style="font-size:12px;color:${C.soft};margin:0 0 30px;">
        Or copy this link: <a href="${intakeUrl}" style="color:${C.teal};text-decoration:underline;word-break:break-all;">${intakeUrl}</a>
      </p>

      <div style="background:rgba(42,88,80,0.04);border-radius:10px;border:1px solid rgba(42,88,80,0.10);padding:14px 20px;margin:0 0 30px;">
        <p style="font-size:13px;color:${C.mid};line-height:1.7;margin:0;">
          These are private sessions, so there&rsquo;s no referral to chase and no paperwork to sort &#8212; just you and the work.
          If you have any questions before we begin, simply reply to this email.
        </p>
      </div>

      <div style="border-top:1px solid rgba(42,88,80,0.10);padding-top:26px;">
        <p style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.teal};margin:0 0 20px;">What happens next</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${step('1','Complete your registration','A few quick details &#8212; completely confidential. It&rsquo;s just how I get you set up, ready for your first session.')}
          ${step('2','We&rsquo;ll find a time that suits you','Once you&rsquo;re registered, I&rsquo;ll be in touch to confirm a day and time &#8212; in person at Karalee, or online, wherever feels right for you.')}
          ${step('3','Your first session','Sixty minutes, just for you. No judgement, no pressure &#8212; just a real conversation.')}
        </table>
      </div>
    </div>

    <div style="background:rgba(42,88,80,0.04);border-top:1px solid rgba(42,88,80,0.08);padding:22px 40px;">
      <p style="font-size:14px;color:${C.tealDeep};margin:0 0 4px;font-weight:400;">I&rsquo;m looking forward to meeting you.</p>
      <p style="font-size:18px;color:${C.teal};font-style:italic;font-weight:400;margin:14px 0 2px;">Cheree</p>
      <p style="font-size:11px;color:${C.soft};margin:0 0 14px;letter-spacing:0.06em;">Accredited Mental Health Social Worker</p>
      <a href="https://chereemcgarry.com/info.html" style="font-size:12px;color:${C.teal};text-decoration:underline;">Read the client information guide &rarr;</a>
    </div>
  `);
}

// ── Registration email (v3) — client picks their funding form inside the email ──
const SITE = 'https://chereemcgarry.com';

// TODO: replace each `url` with the real Halaxy registration form link for that funding type.
const FUNDING_FORMS = [
  { label: 'Private / Self-funded',                   note: 'No referral needed.',                                     url: 'https://au.halaxy.com/profile/cheree-mcgarry?form=private' },
  { label: 'Medicare (Mental Health Care Plan)',      note: 'GP referral required prior to attendance at appointment.', url: 'https://au.halaxy.com/profile/cheree-mcgarry?form=medicare' },
  { label: 'NDIS',                                    note: 'Plan managed.',                                           url: 'https://au.halaxy.com/profile/cheree-mcgarry?form=ndis' },
  { label: 'Bupa',                                    note: 'Via your Bupa cover.',                                    url: 'https://au.halaxy.com/profile/cheree-mcgarry?form=bupa' },
  { label: 'Queensland Fire &amp; Emergency Service', note: 'Self referred.',                                          url: 'https://au.halaxy.com/profile/cheree-mcgarry?form=qfes' },
  { label: 'WorkCover',                               note: 'Referral required.',                                      url: 'https://au.halaxy.com/profile/cheree-mcgarry?form=workcover' },
];

function fundingPicker() {
  // Whole card is the link (bigger tap target, shorter on mobile — no separate button)
  return FUNDING_FORMS.map(f => `
    <a href="${f.url}" style="display:block;text-decoration:none;background:#ffffff;border:1px solid rgba(42,88,80,0.16);border-radius:9px;margin:0 0 6px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:11px 6px 11px 16px;vertical-align:middle;">
            <p style="font-size:13.5px;font-weight:600;color:${C.tealDeep};margin:0 0 1px;">${f.label}</p>
            <p style="font-size:11.5px;color:#5C746E;margin:0;line-height:1.45;">${f.note}</p>
          </td>
          <td style="padding:11px 16px 11px 6px;text-align:right;white-space:nowrap;vertical-align:middle;width:1%;">
            <span style="font-size:12px;font-weight:600;color:${C.teal};">Register &rarr;</span>
          </td>
        </tr>
      </table>
    </a>`).join('');
}

function registrationEmailHtml({ firstName }) {
  return wrap(`
    <div style="height:4px;background:${C.teal};background:linear-gradient(90deg,${C.teal},${C.mint});border-radius:14px 14px 0 0;"></div>
    <div style="padding:36px 40px 32px;">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.terra};margin:0 0 18px;">You&rsquo;re in the right place</p>
      <h1 style="font-size:28px;font-weight:400;color:${C.tealDeep};margin:0 0 20px;line-height:1.25;">
        Hi ${firstName} &#8212;<br><span style="font-style:italic;">Thank you for reaching out.</span>
      </h1>
      <p style="font-size:14px;color:${C.mid};line-height:1.75;margin:0 0 24px;">
        Please choose your preferred funding &amp; complete your registration.
      </p>

      <p style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.teal};margin:0 0 14px;">Choose your registration form</p>
      ${fundingPicker()}

      <p style="font-size:12.5px;color:#5C746E;line-height:1.6;margin:12px 0 28px;">
        Please feel free to contact me if you need further information about your funding options.
      </p>

      <div style="background:rgba(42,88,80,0.04);border-radius:10px;border:1px solid rgba(42,88,80,0.10);padding:16px 20px;margin:0 0 18px;">
        <p style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.teal};margin:0 0 10px;">Good to know</p>
        <p style="font-size:13px;color:${C.mid};line-height:1.7;margin:0 0 6px;"><strong style="color:${C.tealDeep};font-weight:500;">Where</strong> &#8212; in person at Karalee QLD, or by video or phone anywhere in Australia.</p>
        <p style="font-size:13px;color:${C.mid};line-height:1.7;margin:0 0 6px;"><strong style="color:${C.tealDeep};font-weight:500;">Sessions</strong> &#8212; 60 minutes for individual, intake sessions may take longer. Session duration for couples, families &amp; groups will be negotiated.</p>
        <p style="font-size:13px;color:${C.mid};line-height:1.7;margin:0 0 6px;"><strong style="color:${C.tealDeep};font-weight:500;">Cancellations</strong> &#8212; 48 hours&rsquo; notice for cancellation without a fee. <a href="${SITE}/info.html#ci-appointments" style="color:${C.teal};text-decoration:underline;">Our cancellation policy &rarr;</a></p>
        <p style="font-size:13px;color:${C.mid};line-height:1.7;margin:0;"><strong style="color:${C.tealDeep};font-weight:500;">Your privacy</strong> &#8212; your information is kept private and securely stored. <a href="${SITE}/info.html#ci-privacy" style="color:${C.teal};text-decoration:underline;">How your information is handled &rarr;</a></p>
      </div>

      <div style="background:rgba(52,211,153,0.07);border-radius:10px;border:1px solid rgba(42,88,80,0.10);border-left:3px solid ${C.teal};padding:16px 20px;margin:0;">
        <p style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.teal};margin:0 0 10px;">What&rsquo;s next</p>
        <p style="font-size:13px;color:${C.mid};line-height:1.7;margin:0;">
          Once you&rsquo;re registered, when you&rsquo;re ready to book an appointment (if you haven&rsquo;t already) just message Cheree on
          <a href="tel:+61418742087" style="color:${C.teal};text-decoration:underline;white-space:nowrap;">0418&nbsp;742&nbsp;087</a>
          or email <a href="mailto:reachout@chereemcgarry.com" style="color:${C.teal};text-decoration:underline;">reachout@chereemcgarry.com</a>.
        </p>
      </div>
    </div>

    <div style="background:rgba(42,88,80,0.04);border-top:1px solid rgba(42,88,80,0.08);padding:22px 40px;">
      <p style="font-size:14px;color:${C.tealDeep};margin:0 0 4px;font-weight:400;">Thank you for reaching out.</p>
      <p style="font-size:18px;color:${C.teal};font-style:italic;font-weight:400;margin:14px 0 2px;">Cheree</p>
      <p style="font-size:11px;color:${C.soft};margin:0;letter-spacing:0.04em;">Accredited Mental Health Social Worker</p>
      <p style="font-size:11px;color:${C.soft};margin:2px 0 0;letter-spacing:0.04em;">(AMHSW) &middot; 25+ years</p>
    </div>
  `, `A few quick details and we'll get you booked in.`);
}

// Choose the right template for a funding type
function buildIntakeHtml(clientType, firstName, intakeUrl) {
  if (clientType === 'registration') return registrationEmailHtml({ firstName });
  if (clientType === 'personal')     return personalEmailHtml({ firstName, intakeUrl });
  return intakeEmailHtml({ firstName, clientType, intakeUrl });
}

// ── Handler ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorised' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const actor = getSessionUser(req)?.name || 'Admin';

  const { enquiryId, clientType = 'new', intakeUrl = '', test = false } = req.body || {};

  const VALID_TYPES = ['registration', 'new', 'personal', 'medicare', 'ndis'];
  if (!VALID_TYPES.includes(clientType)) {
    return res.status(400).json({ error: 'clientType must be one of: ' + VALID_TYPES.join(', ') });
  }

  // ── Test mode: render the chosen template with sample data, send ONLY to admin@ ──
  // No enquiry lookup, no DB writes, no client email. Used by the Settings "Email test" picker.
  if (test) {
    const sampleUrl = (intakeUrl && intakeUrl.trim()) || 'https://au.halaxy.com/profile/cheree-mcgarry/intake-form/example';
    try {
      await resend.emails.send({
        from:    'Cheree McGarry <reachout@chereemcgarry.com>',
        to:      ['admin@chereemcgarry.com'],
        subject: '[TEST] ' + subjectLine(clientType, 'Cheree'),
        html:    buildIntakeHtml(clientType, 'Cheree', sampleUrl),
      });
      return res.status(200).json({ ok: true, test: true });
    } catch (err) {
      console.error('[api/admin-intake] test send error:', err);
      return res.status(500).json({ error: 'Failed to send test email.' });
    }
  }

  if (!enquiryId) return res.status(400).json({ error: 'enquiryId is required.' });
  if (!intakeUrl.trim()) return res.status(400).json({ error: 'intakeUrl is required.' });

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
    const sentAt = new Date().toISOString();

    await resend.emails.send({
      from:    'Cheree McGarry <reachout@chereemcgarry.com>',
      to:      [email],
      bcc:     ['admin@chereemcgarry.com'],
      subject: subjectLine(clientType, firstName),
      html:    buildIntakeHtml(clientType, firstName, intakeUrl),
    });

    // Mark enquiry as in_halaxy and record when the intake was sent
    await db
      .from('enquiries')
      .update({ status: 'in_halaxy', intake_sent_at: sentAt })
      .eq('id', enquiryId);

    // Log activity (silent fail — don't let a log error surface to the user)
    try {
      await db.from('activity_log').insert({
        enquiry_id: enquiryId,
        actor,
        action: 'intake_sent',
        detail: clientType,
      });
    } catch (_) {}

    return res.status(200).json({ ok: true, sentAt });
  } catch (err) {
    console.error('[api/admin-intake] Resend error:', err);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
}
