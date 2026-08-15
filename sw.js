/**
 * sw.js — minimal Service Worker, root scope, for Web Push only.
 *
 * iOS Safari only allows Push/Notification APIs on a page that's been added
 * to the Home Screen (Share → Add to Home Screen) and opened from there —
 * a plain Safari tab, even with this SW registered, cannot receive pushes.
 * That's an Apple platform restriction, not something fixable here.
 *
 * Deliberately does nothing else (no caching, no offline support) — this
 * project has no build step and serves files directly; adding a caching SW
 * would risk staleness bugs (see CLAUDE.md's cache-busting notes) for a
 * problem nobody asked to solve. Push only.
 */

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}

  var title = data.title || 'Cheree McGarry';
  var options = {
    body: data.body || '',
    icon: '/assets/pwa-icon.svg',
    badge: '/assets/pwa-icon.svg',
    data: { url: data.url || '/admin-new' },
    tag: data.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/admin-new';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(url) !== -1 && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
