// Retirement worker for the removed GRPGI browser-notification feature.
// Existing browsers may still have v1.0.91 registered; this update closes any
// displayed notices and unregisters itself. New clients do not register it.

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const notifications = await self.registration.getNotifications();
      notifications.forEach(notification => notification.close());
    } catch {}
    try { await self.registration.unregister(); } catch {}
  })());
});
