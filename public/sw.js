// Retire stale service-worker registrations left on this origin.
// The site does not register a service worker or cache pages for offline use.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration.unregister());
});
