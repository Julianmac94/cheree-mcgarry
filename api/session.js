/**
 * api/session.js
 * Vercel serverless function — handles the session request form
 * on request-session.html.
 *
 * Sends two emails via Resend:
 *   1. Confirmation to the client (warm, with "what happens next")
 *   2. Detailed notification to Cheree (service, funding, all fields)
 *
 * Env vars required:
 *   RESEND_API_KEY  — from resend.com/api-keys
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Brand colours ────────────────────────────────────────────────
const C = {
  cream:     '#F3EFE6',
  tealDeep:  '#192E2A',
  teal:      '#2A5850',
  tealMid:   '#376B62',
  mint:      '#77CFBD',
  terra:     '#BE6E44',
  soft:      '#7A948F',
  mid:       '#3E5C56',
};

// ── Shared email wrapper (same as contact.js) ────────────────────
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

// ── Client confirmation ──────────────────────────────────────────
function clientConfirmationHtml({ firstName, service, coverage }) {
  const serviceStr  = service  && service  !== '(not specified)' ? service  : null;
  const coverageStr = coverage && coverage !== '(not specified)' ? coverage : null;

  const contextLine = serviceStr
    ? `<p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 16px;">
        Your request for <strong style="color:${C.tealDeep};font-weight:500;">${serviceStr}</strong>${coverageStr ? ` (${coverageStr})` : ''} has been received.
       </p>`
    : `<p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 16px;">
        Your session request has been received.
       </p>`;

  function step(num, title, sub) {
    return `
      <tr>
        <td style="width:28px;padding-right:16px;vertical-align:top;padding-bottom:22px;">
          <div style="width:26px;height:26px;border-radius:50%;background:rgba(42,88,80,0.08);border:1.5px solid ${C.teal};display:flex;align-items:center;justify-content:center;text-align:center;line-height:26px;">
            <span style="font-size:11px;font-weight:600;color:${C.teal};">${num}</span>
          </div>
        </td>
        <td style="padding-bottom:22px;vertical-align:top;border-bottom:1px dashed rgba(42,88,80,0.10);">
          <p style="font-size:14px;font-weight:500;color:${C.tealDeep};margin:0 0 4px;">${title}</p>
          <p style="font-size:13px;color:${C.mid};line-height:1.6;margin:0;">${sub}</p>
        </td>
      </tr>`;
  }

  return wrap(`
    <!-- Accent bar -->
    <div style="height:4px;background:linear-gradient(90deg,${C.teal},${C.mint});border-radius:14px 14px 0 0;"></div>

    <div style="padding:36px 40px 32px;">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.terra};margin:0 0 18px;">Request received</p>
      <h1 style="font-size:28px;font-weight:400;color:${C.tealDeep};margin:0 0 22px;line-height:1.2;">
        Hi ${firstName} &#8212;<br>
        <span style="font-style:italic;">your request is in safe hands.</span>
      </h1>

      ${contextLine}

      <p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 30px;">
        Reaching out takes courage. Cheree will review your request and be in touch within one business day to confirm your spot and talk through next steps.
      </p>

      <!-- What happens next -->
      <div style="border-top:1px solid rgba(42,88,80,0.10);padding-top:26px;margin-bottom:8px;">
        <p style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.teal};margin:0 0 20px;">What happens next</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${step('1', 'Cheree reviews your request', 'She\'ll check availability and confirm your spot is a good fit &mdash; usually within one business day.')}
          ${step('2', 'You receive an intake form &amp; booking link', 'A short intake form helps Cheree prepare. Complete it before your first session &mdash; there\'s no rush.')}
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

// ── Cheree notification ──────────────────────────────────────────
function chereeNotificationHtml({ firstName, lastName, email, phone, service, coverage, clientType, preferredTimes, note }) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  function row(label, value, highlight = false) {
    return `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid rgba(42,88,80,0.07);vertical-align:top;width:140px;">
          <span style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.soft};">${label}</span>
        </td>
        <td style="padding:9px 0 9px 16px;border-bottom:1px solid rgba(42,88,80,0.07);vertical-align:top;">
          <span style="font-size:14px;color:${highlight ? C.terra : C.tealDeep};font-weight:${highlight ? '500' : '400'};">
            ${value || `<span style="color:${C.soft}">—</span>`}
          </span>
        </td>
      </tr>`;
  }

  return wrap(`
    <!-- Accent bar -->
    <div style="height:4px;background:${C.terra};border-radius:14px 14px 0 0;"></div>

    <div style="padding:28px 36px 24px;">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.terra};margin:0 0 10px;">New session request</p>
      <h2 style="font-size:22px;font-weight:400;color:${C.tealDeep};margin:0 0 24px;">
        <em style="font-style:italic;">Session request</em> from ${fullName || 'a visitor'}
      </h2>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(42,88,80,0.07);">
        ${row('Name', fullName)}
        ${row('Email', `<a href="mailto:${email}" style="color:${C.teal};text-decoration:underline;">${email}</a>`)}
        ${row('Phone', phone && phone !== '(not provided)' ? phone : null)}
        ${row('Service', service, true)}
        ${row('Coverage', coverage, true)}
        ${row('Client type', clientType)}
        ${row('Preferred times', preferredTimes && preferredTimes !== '(not specified)' ? preferredTimes : null)}
      </table>
    </div>

    ${note && note !== '(no additional notes)' ? `
    <div style="padding:0 36px 28px;">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.soft};margin:0 0 8px;">Additional notes</p>
      <div style="background:rgba(42,88,80,0.04);border-radius:8px;border:1px solid rgba(42,88,80,0.08);padding:14px 16px;">
        <p style="font-size:14px;color:${C.tealDeep};line-height:1.7;margin:0;white-space:pre-wrap;">${note}</p>
      </div>
    </div>` : ''}

    <div style="background:rgba(42,88,80,0.04);border-top:1px solid rgba(42,88,80,0.08);padding:16px 36px;display:flex;gap:10px;">
      <a href="mailto:${email}?subject=Your session request — Cheree McGarry Counselling" style="display:inline-block;padding:10px 22px;background:${C.teal};color:#ffffff;font-size:13px;font-weight:500;letter-spacing:0.04em;border-radius:8px;text-decoration:none;margin-right:10px;">
        Reply to ${firstName || 'client'}
      </a>
    </div>
  `);
}

// ── Handler ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    name          = '',
    email         = '',
    phone         = '',
    service       = '',
    coverage      = '',
    client_type   = '',
    preferred_times = '',
    message       = '',
  } = req.body || {};

  // Basic validation
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name.trim())  return res.status(400).json({ error: 'Name is required.' });
  if (!email.trim() || !emailRx.test(email)) return res.status(400).json({ error: 'Valid email is required.' });

  const [firstName, ...rest] = name.trim().split(' ');
  const lastName = rest.join(' ');

  try {
    await Promise.all([
      // 1 — Confirmation to client
      resend.emails.send({
        from:    'Cheree McGarry <onboarding@resend.dev>',
        to:      [email],
        subject: 'Your session request — Cheree McGarry Counselling',
        html:    clientConfirmationHtml({
          firstName,
          service,
          coverage,
        }),
      }),

      // 2 — Detailed notification to Cheree
      // TODO: update from address to notifications@chereemcgarry.com once domain is verified on Resend
      resend.emails.send({
        from:    'Website <onboarding@resend.dev>',
        to:      ['reachout@chereemcgarry.com'],
        replyTo: email,
        subject: `Session request from ${name.trim()} — ${service || 'General'}${coverage ? ' · ' + coverage : ''}`,
        html:    chereeNotificationHtml({
          firstName,
          lastName,
          email,
          phone,
          service,
          coverage,
          clientType:     client_type,
          preferredTimes: preferred_times,
          note:           message,
        }),
      }),
    ]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/session] Resend error:', err);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
}
