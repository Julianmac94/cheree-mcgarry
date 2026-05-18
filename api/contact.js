/**
 * api/contact.js
 * Vercel serverless function — handles the "Reach Out" form
 * (both the modal on index.html and the inline footer form).
 *
 * Sends two emails via Resend:
 *   1. Auto-reply to the client (warm acknowledgement)
 *   2. Notification to Cheree (full form details)
 *
 * Env vars required:
 *   RESEND_API_KEY  — from resend.com/api-keys
 */

import { Resend } from 'resend';
import { supabase } from './_supabase.js';

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Brand colours (mirrored from css/styles.css) ─────────────────
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

// ── Shared email wrapper ─────────────────────────────────────────
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

// ── Client auto-reply ────────────────────────────────────────────
function clientReplyHtml({ firstName, reason }) {
  const reasonLine = reason && reason !== ''
    ? `<p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 16px;">I received your message about <strong style="color:${C.tealDeep};font-weight:500;">${reason.toLowerCase()}</strong> and I'll be in touch within 1–2 business days.</p>`
    : `<p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 16px;">I received your message and I'll be in touch within 1–2 business days.</p>`;

  return wrap(`
    <!-- Accent bar -->
    <div style="height:4px;background:linear-gradient(90deg,${C.teal},${C.mint});border-radius:14px 14px 0 0;"></div>

    <div style="padding:36px 40px 32px;">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.terra};margin:0 0 18px;">Message received</p>
      <h1 style="font-size:28px;font-weight:400;color:${C.tealDeep};margin:0 0 22px;line-height:1.2;">
        Hi ${firstName} <span style="font-style:italic;color:${C.terra};">&#8212;</span><br>
        <span style="font-style:italic;">thank you for reaching out.</span>
      </h1>

      ${reasonLine}

      <p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 28px;">
        Taking this first step can feel like a lot, and I want you to know there's no pressure here — just a conversation when you're ready.
      </p>

      <!-- Divider -->
      <div style="border-top:1px solid rgba(42,88,80,0.10);margin:0 0 28px;"></div>

      <p style="font-size:13px;color:${C.soft};line-height:1.7;margin:0 0 6px;">
        In the meantime, you might like to take a look at the
        <a href="https://chereemcgarry.com/info.html" style="color:${C.teal};text-decoration:underline;">Client Information page</a>
        — it covers what to expect, fees, and how sessions work.
      </p>
    </div>

    <!-- Sign-off -->
    <div style="background:rgba(42,88,80,0.04);border-top:1px solid rgba(42,88,80,0.08);padding:22px 40px;">
      <p style="font-size:14px;color:${C.tealDeep};margin:0 0 4px;font-weight:400;">Warm regards,</p>
      <p style="font-size:18px;color:${C.teal};font-style:italic;font-weight:400;margin:0 0 2px;">Cheree McGarry</p>
      <p style="font-size:11px;color:${C.soft};margin:0;letter-spacing:0.06em;">Accredited Mental Health Social Worker</p>
    </div>
  `);
}

// ── Cheree notification ──────────────────────────────────────────
function chereeNotificationHtml({ firstName, lastName, email, reason, message, source }) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const sourceLabel = source === 'home-page-inline' ? 'Home page (inline)' : 'Modal';

  function row(label, value) {
    return `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid rgba(42,88,80,0.07);vertical-align:top;width:130px;">
          <span style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.soft};">${label}</span>
        </td>
        <td style="padding:9px 0 9px 16px;border-bottom:1px solid rgba(42,88,80,0.07);vertical-align:top;">
          <span style="font-size:14px;color:${C.tealDeep};">${value || '<span style="color:' + C.soft + '">—</span>'}</span>
        </td>
      </tr>`;
  }

  return wrap(`
    <!-- Accent bar -->
    <div style="height:4px;background:${C.terra};border-radius:14px 14px 0 0;"></div>

    <div style="padding:28px 36px 24px;">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.terra};margin:0 0 10px;">New enquiry</p>
      <h2 style="font-size:22px;font-weight:400;color:${C.tealDeep};margin:0 0 24px;">
        <em style="font-style:italic;">Reach Out</em> from ${fullName || 'a visitor'}
      </h2>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(42,88,80,0.07);">
        ${row('Name', fullName)}
        ${row('Email', `<a href="mailto:${email}" style="color:${C.teal};text-decoration:underline;">${email}</a>`)}
        ${row('Reason', reason || '—')}
        ${row('Source', sourceLabel)}
      </table>
    </div>

    ${message ? `
    <div style="padding:0 36px 28px;">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.soft};margin:0 0 8px;">Message</p>
      <div style="background:rgba(42,88,80,0.04);border-radius:8px;border:1px solid rgba(42,88,80,0.08);padding:14px 16px;">
        <p style="font-size:14px;color:${C.tealDeep};line-height:1.7;margin:0;white-space:pre-wrap;">${message}</p>
      </div>
    </div>` : ''}

    <div style="background:rgba(42,88,80,0.04);border-top:1px solid rgba(42,88,80,0.08);padding:16px 36px;">
      <a href="mailto:${email}?subject=Re: Your enquiry" style="display:inline-block;padding:10px 22px;background:${C.teal};color:#ffffff;font-size:13px;font-weight:500;letter-spacing:0.04em;border-radius:8px;text-decoration:none;">
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

  const { name = '', email = '', reason = '', message = '', _source = '' } = req.body || {};

  // Basic validation
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!email.trim() || !emailRx.test(email)) return res.status(400).json({ error: 'Valid email is required.' });

  const [firstName, ...rest] = name.trim().split(' ');
  const lastName = rest.join(' ');

  try {
    await Promise.all([
      // 1 — Auto-reply to client
      resend.emails.send({
        from:    'Cheree McGarry <onboarding@resend.dev>',
        to:      [email],
        subject: 'Thanks for reaching out — Cheree McGarry Counselling',
        html:    clientReplyHtml({ firstName, reason }),
      }),

      // 2 — Notification to Cheree
      // TODO: update from address to admin@chereemcgarry.com once domain is verified on Resend
      resend.emails.send({
        from:    'Website <onboarding@resend.dev>',
        to:      ['reachout@chereemcgarry.com'],
        replyTo: email,
        subject: `New enquiry from ${name.trim()} — ${reason || 'Reach Out form'}`,
        html:    chereeNotificationHtml({ firstName, lastName, email, reason, message, source: _source }),
      }),
    ]);

    // 3 — Save to Supabase (non-blocking — don't fail the request if DB is down)
    const _db = supabase();
    _db.from('enquiries').insert({
      first_name: firstName,
      last_name:  lastName,
      email,
      reason,
      message,
      source:  _source || 'contact',
      status:  'new',
    }).then(({ error }) => {
      if (!error) return;
      // If insert failed (e.g. 'source' column doesn't exist yet — run migration 008),
      // fall back to inserting without the optional columns.
      console.error('[api/contact] Supabase insert error (attempting fallback):', error.message);
      _db.from('enquiries').insert({
        first_name: firstName,
        last_name:  lastName,
        email,
        reason,
        message,
        status:  'new',
      }).then(({ error: err2 }) => {
        if (err2) console.error('[api/contact] Supabase fallback insert also failed:', err2.message);
        else console.log('[api/contact] Supabase fallback insert succeeded (run migration 008 to fix source column)');
      });
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/contact] Resend error:', err);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
}
