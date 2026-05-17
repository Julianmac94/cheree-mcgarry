/**
 * api/admin-reminder.js
 * Sends 48hr appointment reminder emails via Resend.
 *
 * POST body:
 *   { appointmentDate, appointmentTime, clientEmail, clientName, locationType }
 *
 * Can also be called as a cron by Vercel:
 *   GET /api/admin-reminder?cron=1  — auto-scans Halaxy for appointments 48 hrs away
 *
 * Env vars:
 *   RESEND_API_KEY
 *   ADMIN_SECRET / ADMIN_PASS
 *   HALAXY_CLIENT_ID / HALAXY_CLIENT_SECRET  (for cron mode)
 */

import { Resend } from 'resend';
import { isAuthed } from './_auth.js';
import { halaxyGet } from './_halaxy.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const C = {
  cream:    '#F3EFE6',
  tealDeep: '#192E2A',
  teal:     '#2A5850',
  tealMid:  '#376B62',
  soft:     '#7A948F',
  mid:      '#3E5C56',
};

function reminderHtml({ clientName, dateLabel, timeLabel, locationLabel }) {
  const name = clientName || 'there';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your appointment reminder</title>
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
          <td style="background:#ffffff;border-radius:14px;border:1px solid rgba(42,88,80,0.10);overflow:hidden;padding:36px 40px 40px;">
            <p style="font-size:16px;font-weight:500;color:${C.tealDeep};margin:0 0 20px;">
              Hi ${escapeHtml(name)},
            </p>
            <p style="font-size:14px;color:${C.mid};line-height:1.7;margin:0 0 24px;">
              This is a friendly reminder that you have an appointment with Cheree coming up in
              <strong style="color:${C.tealDeep}">approximately 48 hours</strong>.
            </p>

            <!-- Appointment details box -->
            <div style="background:rgba(42,88,80,0.05);border-radius:10px;border:1px solid rgba(42,88,80,0.12);padding:18px 22px;margin:0 0 28px;">
              <table cellpadding="0" cellspacing="0" style="width:100%">
                <tr>
                  <td style="font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.teal};padding-bottom:12px;" colspan="2">
                    Appointment details
                  </td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:${C.soft};padding-bottom:6px;width:100px">Date</td>
                  <td style="font-size:13px;font-weight:500;color:${C.tealDeep};padding-bottom:6px">${escapeHtml(dateLabel)}</td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:${C.soft};padding-bottom:6px">Time</td>
                  <td style="font-size:13px;font-weight:500;color:${C.tealDeep};padding-bottom:6px">${escapeHtml(timeLabel)}</td>
                </tr>
                <tr>
                  <td style="font-size:12px;color:${C.soft}">Format</td>
                  <td style="font-size:13px;font-weight:500;color:${C.tealDeep}">${escapeHtml(locationLabel)}</td>
                </tr>
              </table>
            </div>

            <p style="font-size:13.5px;color:${C.mid};line-height:1.7;margin:0 0 16px;">
              If you need to reschedule or have any questions, please get in touch as soon as possible —
              ideally <strong>more than 24 hours before your appointment</strong> to avoid a late cancellation fee.
            </p>

            <p style="font-size:13.5px;color:${C.mid};line-height:1.7;margin:0 0 28px;">
              We look forward to seeing you soon.
            </p>

            <p style="font-size:13.5px;color:${C.mid};line-height:1.7;margin:0;">
              Warm regards,<br>
              <strong style="color:${C.tealDeep};font-weight:500;">Cheree McGarry</strong><br>
              <span style="color:${C.soft};font-size:12px;">Counselling &amp; Wellness</span>
            </p>
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

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane',
  });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'Australia/Brisbane',
  });
}

function locationLabel(type) {
  return { clinic: 'In-clinic (Mitchelton)', telehealth: 'Telehealth — video call', phone: 'Phone call', online: 'Online' }[type] || 'In-clinic';
}

export default async function handler(req, res) {
  // ── Cron mode: scan Halaxy for appointments ~48 hrs away ──────────────────
  if (req.method === 'GET' && (req.query?.cron === '1' || req.headers['x-vercel-cron'])) {
    if (!process.env.HALAXY_CLIENT_ID) {
      return res.status(200).json({ ok: false, reason: 'Halaxy not configured' });
    }
    if (!process.env.RESEND_API_KEY) {
      return res.status(200).json({ ok: false, reason: 'Resend not configured' });
    }

    try {
      const now      = new Date();
      const in48h    = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const in50h    = new Date(now.getTime() + 50 * 60 * 60 * 1000); // 2hr window
      const dateFrom = in48h.toISOString().slice(0, 10);
      const dateTo   = in50h.toISOString().slice(0, 10);

      const bundle = await halaxyGet('/Appointment', {
        date:    `ge${dateFrom}`,
        _sort:   'date',
        _count:  '50',
        _include: 'Appointment:patient',
      });

      const entries  = (bundle.entry || []).map(e => e.resource).filter(Boolean);
      const appts    = entries.filter(r => r.resourceType === 'Appointment'
        && r.status !== 'cancelled' && r.status !== 'entered-in-error' && r.status !== 'noshow');
      const patients = entries.filter(r => r.resourceType === 'Patient');

      // Build patient email map
      const patientEmail = {};
      const patientName  = {};
      patients.forEach(p => {
        if (!p.id) return;
        patientName[p.id] = ((p.name || []).find(n => n.use === 'official') || p.name?.[0] || {});
        const emailTelecom = (p.telecom || []).find(t => t.system === 'email' && t.value);
        if (emailTelecom) patientEmail[p.id] = emailTelecom.value;
      });

      let sent = 0, skipped = 0;
      for (const appt of appts) {
        if (!appt.start) { skipped++; continue; }
        const apptMs = new Date(appt.start).getTime();
        if (apptMs < in48h.getTime() || apptMs > in50h.getTime()) { skipped++; continue; }

        // Get patient ref
        const patRef = (appt.participant || []).find(p => p.actor?.type === 'Patient' || (p.actor?.reference || '').includes('Patient/'));
        const pid = patRef?.actor?.reference?.split('/').pop();
        if (!pid || !patientEmail[pid]) { skipped++; continue; }

        const nameObj  = patientName[pid] || {};
        const fullName = [(nameObj.given || []).join(' '), nameObj.family].filter(Boolean).join(' ') || 'there';
        const email    = patientEmail[pid];
        const locType  = (appt.appointmentType?.text || '').toLowerCase().includes('video') ? 'telehealth'
                       : (appt.appointmentType?.text || '').toLowerCase().includes('phone') ? 'phone'
                       : 'clinic';

        await resend.emails.send({
          from:    'Cheree McGarry <reachout@chereemcgarry.com>',
          to:      email,
          subject: 'Appointment reminder — ' + fmtDate(appt.start),
          html:    reminderHtml({
            clientName:    fullName,
            dateLabel:     fmtDate(appt.start),
            timeLabel:     fmtTime(appt.start),
            locationLabel: locationLabel(locType),
          }),
        });
        sent++;
      }

      return res.status(200).json({ ok: true, sent, skipped });
    } catch (err) {
      console.error('Reminder cron error:', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ── Manual send: POST with specific details ────────────────────────────────
  if (req.method === 'POST') {
    if (!isAuthed(req)) return res.status(401).json({ error: 'Unauthorised' });
    if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

    const { clientEmail, clientName, appointmentDate, appointmentTime, locationType } = req.body || {};
    if (!clientEmail) return res.status(400).json({ error: 'clientEmail is required' });
    if (!appointmentDate) return res.status(400).json({ error: 'appointmentDate is required' });

    try {
      const isoStr   = appointmentDate + (appointmentTime ? 'T' + appointmentTime + ':00' : '');
      const dateStr  = fmtDate(isoStr);
      const timeStr  = appointmentTime ? fmtTime(isoStr) : 'Time TBC';
      const locLabel = locationLabel(locationType || 'clinic');

      const { data, error } = await resend.emails.send({
        from:    'Cheree McGarry <reachout@chereemcgarry.com>',
        to:      clientEmail,
        subject: 'Appointment reminder — ' + dateStr,
        html:    reminderHtml({
          clientName:    clientName || 'there',
          dateLabel:     dateStr,
          timeLabel:     timeStr,
          locationLabel: locLabel,
        }),
      });

      if (error) throw new Error(error.message || 'Resend error');
      return res.status(200).json({ ok: true, emailId: data?.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
