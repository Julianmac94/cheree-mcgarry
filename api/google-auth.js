/**
 * api/google-auth.js
 * GET → redirects to Google OAuth consent screen
 * Must be visited while logged into the admin dashboard.
 */

import { isAuthed } from './_auth.js';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

export default function handler(req, res) {
  if (!isAuthed(req)) {
    res.writeHead(302, { Location: '/admin-login' });
    return res.end();
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/google-callback`
      : 'http://localhost:3000/api/google-callback'
  );

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  res.writeHead(302, { Location: url });
  res.end();
}
