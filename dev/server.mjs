/**
 * dev/server.mjs — local dev harness for /book.
 *
 * There is no build step in this project and the real app is a Vercel
 * serverless function (api/admin.js) plus static files, so this is a small
 * Node server that does the same two jobs Vercel does:
 *
 *   1. applies the vercel.json rewrites (/book → api/admin.js?cheree=1 …)
 *      and serves everything else from the repo root as a static file;
 *   2. answers the data endpoints from dev/fixtures.mjs instead of Supabase,
 *      Google Calendar, Halaxy, Gmail and Resend.
 *
 * That means no credentials are needed on the machine and nothing here can
 * touch real patient data or the real calendar — writes are accepted, logged
 * to the console and kept in memory only, so the UI advances exactly as it
 * would in production and the fixtures reset on restart.
 *
 * Auth: api/_auth.js checks an HMAC cookie built from ADMIN_SECRET +
 * JULIAN_PASS. Both are set to dev values below and the matching cookie is
 * injected into every request, so there is no login step locally.
 *
 *   node dev/server.mjs [--port 3000]
 */

import http from 'node:http';
import { createHmac } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as fixtures from './fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 3000;

// Dev credentials — only ever used to satisfy the local auth check.
process.env.ADMIN_SECRET = 'dev-secret';
process.env.JULIAN_PASS = 'dev';
process.env.CHEREE_PASS = 'dev';

const DEV_COOKIE = 'ast=' +
  createHmac('sha256', process.env.ADMIN_SECRET).update(process.env.JULIAN_PASS).digest('hex') +
  ':Julian';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Same rewrites as vercel.json, as [pathname, handlerFile, extraQuery].
const REWRITES = [
  ['/book', 'admin.js', { cheree: '1' }],
  ['/book/qfes', 'admin.js', { cheree: '1', qfes: '1' }],
  ['/admin', 'admin.js', {}],
  ['/admin-new', 'admin.js', { v2: '1' }],
  ['/admin-login', 'admin-login.js', {}],
  ['/register', null, {}], // served as register.html below
];

/** In-memory copies so local edits (outcomes, invoices) stick until restart. */
const events = fixtures.events.map(e => ({ ...e }));
let seq = 1000;

function log(method, what) {
  console.log(`  ${method.padEnd(6)} ${what}`);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

/* ── The fixture API ───────────────────────────────────────────────────
   Only the endpoints js/cheree-book.js actually calls. Anything that would
   write to Google/Supabase/Halaxy in production mutates the in-memory copy
   and reports success, so the UI behaves but nothing leaves this process. */
async function fixtureApi(req, res, url) {
  const q = url.searchParams;
  const body = req.method === 'GET' ? {} : await readBody(req);
  const route = url.pathname;

  if (route === '/api/calendar-pending') {
    if (req.method === 'GET') return sendJson(res, 200, { connected: true, events });
    if (req.method === 'POST') {
      const created = { id: 'dev-evt-' + (++seq), title: body.title, description: body.description, start: body.start, end: body.end };
      events.push(created);
      log('POST', `calendar-pending — created "${created.title}"`);
      return sendJson(res, 200, { id: created.id, ...created });
    }
    if (req.method === 'PATCH') {
      const ev = events.find(e => e.id === q.get('eventId'));
      if (!ev) return sendJson(res, 404, { error: 'No such event' });
      ['title', 'description', 'start', 'end'].forEach(k => { if (body[k] !== undefined) ev[k] = body[k]; });
      log('PATCH', `calendar-pending — updated "${ev.title}"`);
      return sendJson(res, 200, { ok: true, id: ev.id });
    }
    if (req.method === 'DELETE') {
      const i = events.findIndex(e => e.id === q.get('eventId'));
      if (i >= 0) { log('DELETE', `calendar-pending — removed "${events[i].title}"`); events.splice(i, 1); }
      return sendJson(res, 200, { ok: true });
    }
  }

  if (route === '/api/admin-enquiries') {
    if (q.has('qfes_profile')) return sendJson(res, 200, { profile: fixtures.qfesProfile });
    if (q.has('check_remittance')) {
      log('GET', `check_remittance=${q.get('check_remittance')} — fixture says nothing found`);
      return sendJson(res, 200, { found: false, messages: [] });
    }
    if (req.method === 'GET' && ![...q.keys()].length) return sendJson(res, 200, fixtures.pipeline);
    if (req.method === 'GET') return sendJson(res, 200, {});
    log(req.method, `admin-enquiries ${url.search || '(no params)'} — accepted, not persisted`);
    return sendJson(res, 200, { ok: true });
  }

  if (route === '/api/admin-tasks') {
    if (q.has('brief')) return sendJson(res, 200, { brief: 'Local dev brief — 8 sessions waiting to be billed, 4 awaiting payment, 2 enquiries in triage.' });
    return sendJson(res, 200, { tasks: [] });
  }

  if (route.startsWith('/api/')) {
    log(req.method, `${route} — stubbed empty`);
    return sendJson(res, 200, {});
  }
  return false;
}

/** Minimal Vercel-style req/res shim over Node's http objects. */
function vercelify(req, res, url, extraQuery) {
  req.query = { ...extraQuery };
  url.searchParams.forEach((v, k) => { req.query[k] = v; });
  req.cookies = { ast: DEV_COOKIE.slice('ast='.length) };
  req.headers.cookie = DEV_COOKIE;
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); return res; };
  res.send = payload => { res.end(payload); return res; };
  return { req, res };
}

async function serveStatic(res, pathname) {
  const rel = pathname.replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const info = await stat(file);
    const target = info.isDirectory() ? path.join(file, 'index.html') : file;
    const buf = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store', // always serve the file you just edited
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found: ' + pathname);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    const handled = await fixtureApi(req, res, url);
    if (handled !== false) return;
  }

  const rewrite = REWRITES.find(r => r[0] === url.pathname);
  if (rewrite && rewrite[1]) {
    // Cache-bust the page's asset URLs on every load, so an edit to
    // js/cheree-book.js shows up on refresh without a hard reload.
    process.env.VERCEL_GIT_COMMIT_SHA = 'dev-' + Date.now();
    const mod = await import('../api/' + rewrite[1] + '?t=' + Date.now());
    vercelify(req, res, url, rewrite[2]);
    try {
      return await mod.default(req, res);
    } catch (err) {
      console.error(`  ERROR  ${url.pathname} — ${err.stack || err.message}`);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Handler error: ' + err.message);
    }
  }
  if (rewrite) return serveStatic(res, '/register.html');

  return serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`\n  /book dev harness — fixtures only, no credentials, no real data`);
  console.log(`  http://localhost:${PORT}/book`);
  console.log(`  ${events.length} fake sessions · ${fixtures.enquiries.length} enquiries · signed in as Julian\n`);
});
