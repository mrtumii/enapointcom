/* Enapoint service worker: shows ENA alerts sent from the marketing console. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "Enapoint", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Enapoint", {
    body: d.body || "",
    icon: "/icon-512.png",
    badge: "/favicon-32.png",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var target = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin);
  // Only ever open pages on this site.
  if (target.origin !== self.location.origin) target = new URL("/", self.location.origin);
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].url === target.href && "focus" in cs[i]) return cs[i].focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(target.href) : undefined;
  }));
});
