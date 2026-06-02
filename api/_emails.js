/**
 * Shared, cross-handler email templates.
 *
 * Lives here (not in a route handler) so multiple endpoints can use the same
 * template without circular imports — e.g. the Settings "Email tests" picker
 * (admin-intake.js) AND the Halaxy Patient·Create webhook (admin-enquiries.js)
 * both render `registrationCompleteEmailHtml`.
 *
 * NOTE: this module must NOT import from any route handler (keep it a leaf).
 */

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

// Shared cream/teal shell (matches admin-intake.js / contact.js / session.js).
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

// ── Registration COMPLETE / thank-you ──
// Sent to the client once they finish the /register form (fired by the Halaxy
// Patient·Create webhook). Also reachable from the Settings "Email tests" picker.
export function registrationCompleteEmailHtml({ firstName }) {
  const fn = firstName || 'there';
  function step(title, sub) {
    return `
      <tr>
        <td style="width:28px;padding-right:16px;vertical-align:top;padding-bottom:20px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${C.mint};margin:7px auto 0;"></div>
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
      <p style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.terra};margin:0 0 18px;">Registration complete</p>
      <h1 style="font-size:28px;font-weight:400;color:${C.tealDeep};margin:0 0 22px;line-height:1.2;">
        Thank you, ${fn} &#8212;<br>
        <span style="font-style:italic;">you&rsquo;re all set.</span>
      </h1>

      <p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 20px;">
        Your registration has come through safely and you&rsquo;re now set up in Cheree&rsquo;s system &#8212;
        there&rsquo;s nothing more you need to do right now.
      </p>

      <p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 28px;">
        Cheree will be in touch soon to confirm the date, time, and joining details for your first session.
      </p>

      <!-- What happens next -->
      <div style="border-top:1px solid rgba(42,88,80,0.10);padding-top:26px;">
        <p style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.teal};margin:0 0 20px;">What happens next</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${step('Cheree confirms your appointment', 'She&rsquo;ll reach out shortly with the date, time, and joining details for your first session.')}
          ${step('Your first session', 'In person at Karalee (QLD) or online &mdash; whichever feels right for you.')}
        </table>
      </div>

      <p style="font-size:13px;color:${C.soft};line-height:1.7;margin:24px 0 0;">
        If anything comes up in the meantime, just reply to this email &mdash; Cheree will be glad to help.
      </p>
    </div>

    <!-- Sign-off -->
    <div style="background:rgba(42,88,80,0.04);border-top:1px solid rgba(42,88,80,0.08);padding:22px 40px;">
      <p style="font-size:14px;color:${C.tealDeep};margin:0 0 4px;font-weight:400;">Warm regards,</p>
      <p style="font-size:18px;color:${C.teal};font-style:italic;font-weight:400;margin:0 0 2px;">Cheree McGarry</p>
      <p style="font-size:11px;color:${C.soft};margin:0 0 14px;letter-spacing:0.06em;">Accredited Mental Health Social Worker</p>
      <a href="https://chereemcgarry.com/info.html" style="font-size:12px;color:${C.teal};text-decoration:underline;">Read the client information guide &rarr;</a>
    </div>
  `, `You're registered &mdash; Cheree will be in touch to confirm your first session.`);
}
