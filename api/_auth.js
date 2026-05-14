/**
 * api/_auth.js
 * Shared auth helpers for admin routes.
 *
 * Session token = HMAC-SHA256(ADMIN_PASS, ADMIN_SECRET)
 * Fixed value — token rotates only when you change the env vars.
 *
 * Env vars required:
 *   ADMIN_PASS    — the password you set
 *   ADMIN_SECRET  — any long random string (signs the cookie)
 */

import { createHmac } from 'crypto';

const COOKIE_NAME = 'ast'; // admin session token

export function sessionToken() {
  return createHmac('sha256', process.env.ADMIN_SECRET || 'fallback')
    .update(process.env.ADMIN_PASS || '')
    .digest('hex');
}

/** Returns true if the request carries a valid admin session cookie. */
export function isAuthed(req) {
  const raw = req.headers['cookie'] || '';
  // Use indexOf('=') so cookie values containing '=' (e.g. JWTs, base64) are handled correctly.
  const cookies = {};
  raw.split(';').forEach(part => {
    const eq = part.indexOf('=');
    if (eq > 0) {
      const key = part.slice(0, eq).trim();
      const val = part.slice(eq + 1).trim();
      cookies[key] = val;
    }
  });
  return cookies[COOKIE_NAME] === sessionToken();
}

/** Sets the session cookie on the response. */
export function setSessionCookie(res, remember = false) {
  const maxAge = remember ? 60 * 60 * 24 * 30 : 0; // 30 days or session
  const maxAgePart = remember ? `; Max-Age=${maxAge}` : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${sessionToken()}; Path=/; HttpOnly; Secure; SameSite=Strict${maxAgePart}`
  );
}

/** Clears the session cookie. */
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
}
