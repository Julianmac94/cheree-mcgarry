/**
 * api/admin-login.js
 * GET  → serve the login page
 * POST → validate password, set session cookie, redirect to /admin
 */

import { setSessionCookie, isAuthed } from './_auth.js';

const C = {
  cream:    '#F3EFE6',
  tealDeep: '#192E2A',
  teal:     '#2A5850',
  mint:     '#77CFBD',
  terra:    '#BE6E44',
  soft:     '#7A948F',
  mid:      '#3E5C56',
};

function loginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin · Cheree McGarry</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Raleway:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100svh;
    display: flex; align-items: center; justify-content: center;
    background: ${C.cream};
    font-family: 'Raleway', sans-serif;
    padding: 24px;
  }
  body::before {
    content: '';
    position: fixed; inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23grain)' opacity='1'/%3E%3C/svg%3E");
    background-size: 200px 200px;
    opacity: 0.028; pointer-events: none; z-index: 0;
    mix-blend-mode: multiply;
  }
  .card {
    position: relative; z-index: 1;
    background: white;
    border-radius: 20px;
    border: 1px solid rgba(42,88,80,0.10);
    box-shadow: 0 20px 60px rgba(25,46,42,0.10), 0 4px 16px rgba(25,46,42,0.06);
    width: 100%; max-width: 400px;
    overflow: hidden;
    animation: cardIn 0.6s cubic-bezier(0.25,0.46,0.45,0.94) both;
  }
  @keyframes cardIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: none; }
  }
  .card-top {
    padding: 36px 36px 28px;
    border-bottom: 1px solid rgba(42,88,80,0.07);
  }
  .brand {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 28px;
  }
  .brand-dot {
    width: 32px; height: 32px;
    background: ${C.teal};
    border-radius: 50%;
    flex-shrink: 0;
  }
  .brand-name {
    font-size: 14px; font-weight: 500;
    color: ${C.teal}; letter-spacing: 0.01em;
  }
  .brand-sub {
    font-size: 9px; font-weight: 400;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: ${C.soft}; margin-top: 2px; display: block;
  }
  h1 {
    font-family: 'Cormorant Garamond', serif;
    font-size: 28px; font-weight: 300;
    color: ${C.tealDeep}; line-height: 1.2;
    margin-bottom: 6px;
  }
  h1 em { font-style: italic; color: ${C.terra}; }
  .sub {
    font-size: 12px; color: ${C.soft}; font-weight: 300;
    letter-spacing: 0.02em;
  }
  .card-body { padding: 28px 36px 32px; }
  .field { margin-bottom: 16px; }
  label {
    display: block;
    font-size: 10px; font-weight: 500;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: ${C.soft}; margin-bottom: 7px;
  }
  input[type="password"] {
    display: block; width: 100%;
    padding: 11px 14px;
    border: 1.5px solid rgba(42,88,80,0.18);
    border-radius: 10px;
    font-family: 'Raleway', sans-serif;
    font-size: 14px; color: ${C.tealDeep};
    background: white;
    outline: none;
    transition: border-color 0.2s;
  }
  input[type="password"]:focus { border-color: ${C.teal}; }
  .remember {
    display: flex; align-items: center; gap: 9px;
    margin-bottom: 22px; cursor: pointer;
  }
  .remember input[type="checkbox"] { accent-color: ${C.teal}; width: 15px; height: 15px; cursor: pointer; }
  .remember span { font-size: 12px; color: ${C.mid}; font-weight: 300; }
  .btn-login {
    display: block; width: 100%;
    padding: 13px;
    background: ${C.teal};
    color: white;
    border: none; border-radius: 10px;
    font-family: 'Raleway', sans-serif;
    font-size: 13px; font-weight: 500;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: background 0.2s, transform 0.15s;
  }
  .btn-login:hover { background: ${C.mid}; transform: translateY(-1px); }
  .btn-login:active { transform: translateY(0); }
  .error {
    background: rgba(190,110,68,0.08);
    border: 1px solid rgba(190,110,68,0.2);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 12px; color: ${C.terra};
    margin-bottom: 16px;
  }
  .back {
    display: block; text-align: center;
    margin-top: 20px;
    font-size: 11px; color: ${C.soft};
    text-decoration: none;
    letter-spacing: 0.04em;
    transition: color 0.2s;
  }
  .back:hover { color: ${C.teal}; }
</style>
</head>
<body>
<div class="card">
  <div class="card-top">
    <div class="brand">
      <div class="brand-dot"></div>
      <div>
        <span class="brand-name">Cheree McGarry</span>
        <span class="brand-sub">Counselling &amp; Wellness</span>
      </div>
    </div>
    <h1>Admin <em>access</em></h1>
    <p class="sub">Private workspace &mdash; authorised access only</p>
  </div>
  <div class="card-body">
    <form method="POST" action="/admin-login">
      ${error ? `<div class="error">${error}</div>` : ''}
      <div class="field">
        <label for="pass">Passphrase</label>
        <input type="password" id="pass" name="pass" autocomplete="current-password" autofocus>
      </div>
      <label class="remember">
        <input type="checkbox" name="remember" value="1">
        <span>Keep me signed in for 30 days</span>
      </label>
      <button class="btn-login" type="submit">Sign in</button>
    </form>
    <a class="back" href="/">← Back to site</a>
  </div>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  // Already authed — skip straight to admin
  if (isAuthed(req)) {
    res.writeHead(302, { Location: '/admin' });
    return res.end();
  }

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(loginPage());
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const pass     = (body.pass     || '').trim();
    const remember = body.remember === '1';

    if (!pass || pass !== process.env.ADMIN_PASS) {
      res.setHeader('Content-Type', 'text/html');
      return res.status(401).send(loginPage('Incorrect passphrase. Please try again.'));
    }

    setSessionCookie(res, remember);
    res.writeHead(302, { Location: '/admin' });
    return res.end();
  }

  res.status(405).json({ error: 'Method not allowed' });
}
