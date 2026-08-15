/**
 * api/_auth.js
 * Shared auth helpers for admin routes.
 *
 * Two named users — each has their own password env var.
 * Cookie value: `{hmac_hex}:{userName}` — HttpOnly, Secure, SameSite=Strict.
 *
 * Env vars required:
 *   ADMIN_SECRET  — long random string (signs all tokens)
 *   JULIAN_PASS   — Julian's passphrase
 *   CHEREE_PASS   — Cheree's passphrase
 *
 * Legacy fallback: ADMIN_PASS still works and logs in as Julian,
 * so nothing breaks before the env vars are updated on Vercel.
 */

import { createHmac } from 'crypto';

const COOKIE_NAME = 'ast';

export const USERS = [
  { name: 'Julian', passEnv: 'JULIAN_PASS', initials: 'JM' },
  { name: 'Cheree', passEnv: 'CHEREE_PASS', initials: 'CM' },
];

function userToken(user) {
  return createHmac('sha256', process.env.ADMIN_SECRET || 'fallback')
    .update(process.env[user.passEnv] || '')
    .digest('hex');
}

function parseCookies(req) {
  const cookies = {};
  (req.headers['cookie'] || '').split(';').forEach(part => {
    const eq = part.indexOf('=');
    if (eq > 0) cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  });
  return cookies;
}

function cookieUser(req) {
  const val = parseCookies(req)[COOKIE_NAME] || '';
  const sep  = val.lastIndexOf(':');
  if (sep < 0) return null;
  const token = val.slice(0, sep);
  const name  = val.slice(sep + 1);
  const user  = USERS.find(u => u.name === name);
  return (user && userToken(user) === token) ? user : null;
}

/** Check a submitted name + password and return the matching user (or null).
 * `name` is optional — if it matches a known user, the password is checked
 * only against that user (lets Safari/Keychain save a distinct credential
 * per person instead of one ambiguous password-only entry). If `name` is
 * blank or doesn't match, falls back to matching by password alone so old
 * saved-password-only autofills and the legacy ADMIN_PASS still work. */
export function validateUser(name, pass) {
  if (!pass) return null;
  const trimmed = (name || '').trim().toLowerCase();
  if (trimmed) {
    const named = USERS.find(u => u.name.toLowerCase() === trimmed);
    if (named) return (process.env[named.passEnv] || '') === pass ? named : null;
  }
  const user = USERS.find(u => (process.env[u.passEnv] || '') === pass);
  if (user) return user;
  // Legacy fallback — ADMIN_PASS logs in as Julian
  if (process.env.ADMIN_PASS && pass === process.env.ADMIN_PASS) return USERS[0];
  return null;
}

/** Returns true if the request carries a valid admin session cookie. */
export function isAuthed(req) {
  return !!cookieUser(req);
}

/** Returns the session user object { name, initials } or null. */
export function getSessionUser(req) {
  return cookieUser(req);
}

/** Sets the session cookie encoding the user's identity. */
export function setSessionCookie(res, userName, remember = false) {
  const user = USERS.find(u => u.name === userName);
  if (!user) throw new Error('Unknown user: ' + userName);
  const cookieVal   = `${userToken(user)}:${userName}`;
  const maxAgePart  = remember ? `; Max-Age=${60 * 60 * 24 * 30}` : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${cookieVal}; Path=/; HttpOnly; Secure; SameSite=Strict${maxAgePart}`
  );
}

/** Clears the session cookie. */
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
}
