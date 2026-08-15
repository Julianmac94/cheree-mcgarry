/**
 * api/_push.js
 * Web Push + activity feed helper — leaf module, not a serverless function
 * (stays within the 12-function cap, same convention as _gmail.js/_halaxy.js).
 *
 * Subscriptions are stored in the `settings` table (key: push_subscriptions,
 * an array — one entry per device that's enabled notifications) via the
 * existing readCache/writeCache pattern already used throughout this app.
 *
 * The activity log (key: push_activity_log) records every notify() call
 * REGARDLESS of whether push actually delivered — the point of an activity
 * feed is "what did Cheree do", not "did the push survive the network", so
 * it exists even before a device is subscribed and even if a push fails.
 */

import webpush from 'web-push';
import { supabase } from './_supabase.js';

let _configured = false;
function _ensureConfigured() {
  if (_configured) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    throw new Error('VAPID keys not configured');
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  _configured = true;
}

async function _readSubs(db) {
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'push_subscriptions').single();
    return data?.value ? JSON.parse(data.value) : [];
  } catch (_) { return []; }
}

async function _writeSubs(db, subs) {
  await db.from('settings').upsert({
    key: 'push_subscriptions',
    value: JSON.stringify(subs),
    updated_at: new Date().toISOString(),
  });
}

export async function saveSubscription(subscription) {
  const db = supabase();
  let subs = await _readSubs(db);
  // De-dupe by endpoint (re-subscribing the same device replaces its entry)
  subs = subs.filter(s => s.endpoint !== subscription.endpoint);
  subs.push(subscription);
  await _writeSubs(db, subs);
  return subs.length;
}

const ACTIVITY_MAX = 50;

async function _logActivity(db, entry) {
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'push_activity_log').single();
    let log = [];
    try { log = data?.value ? JSON.parse(data.value) : []; } catch (_) { log = []; }
    log.unshift(entry); // newest first
    if (log.length > ACTIVITY_MAX) log = log.slice(0, ACTIVITY_MAX);
    await db.from('settings').upsert({
      key: 'push_activity_log', value: JSON.stringify(log), updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('activity log write failed:', err.message);
  }
}

/**
 * Records the event in the activity feed AND attempts to push it to every
 * saved subscription. Never throws — a push/log failure must not break the
 * booking or outcome flow that triggered it. Expired/invalid subscriptions
 * (410/404) are pruned automatically from future sends.
 *
 * `kind` distinguishes notification types for the Activity tab's icon/label
 * (e.g. 'booking' | 'outcome'); `detail` carries the extra structured bits
 * (funder, bill) the compact push body doesn't have room for.
 */
export async function notify({ title, body, url, tag, kind, detail }) {
  const db = supabase();

  await _logActivity(db, {
    at: new Date().toISOString(), title, body, kind: kind || 'other', detail: detail || null,
  });

  const subs = await _readSubs(db);
  if (!subs.length) return;

  try { _ensureConfigured(); } catch (err) {
    console.error('push not configured:', err.message);
    return;
  }

  const payload = JSON.stringify({ title, body, url, tag });
  const stillValid = [];
  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(sub, payload).then(() => sub))
  );
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { stillValid.push(subs[i]); return; }
    const code = r.reason?.statusCode;
    if (code === 404 || code === 410) return; // expired/unsubscribed — drop it
    stillValid.push(subs[i]); // transient error — keep it, don't punish for a network blip
    console.error('push send failed:', r.reason?.message || r.reason);
  });

  if (stillValid.length !== subs.length) {
    try { await _writeSubs(db, stillValid); } catch (_) {}
  }
}
