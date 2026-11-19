/*
  DUKAPULSE service worker.
  Offline application shell and Web Push notifications.
*/

const CACHE_NAME = "dukapulse-shell-v15";

const APP_FILES = [
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/launch.js",
  "js/pwa.js",
  "js/push.js",
  "js/excel-export.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "assets/images/dukapulse-retail-showcase.jpg",
];

const INDEX_URL = new URL("index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        const files = APP_FILES.map(
          (file) => new URL(file, self.registration.scope).href
        );
        return cache.addAll(files);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) =>
            key.startsWith("dukapulse-shell-") &&
            key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        return (await caches.match(INDEX_URL)) || Response.error();
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});

// Receive Web Push notifications.
self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      body: event.data ? event.data.text() : "You have a new alert."
    };
  }

  const title = data.title || "DUKAPULSE Alerts";

  const options = {
    body: data.body || "You have a new stock alert.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: data.tag || "dukapulse-alert",
    data: {
      url: data.url || "./"
    },
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Open DUKAPULSE when a notification is tapped.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    let target;

    try {
      target = new URL(
        event.notification.data?.url || "./",
        self.registration.scope
      );

      if (target.origin !== self.location.origin) {
        target = new URL("./", self.registration.scope);
      }
    } catch {
      target = new URL("./", self.registration.scope);
    }

    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();

        if (client.navigate) {
          await client.navigate(target.href);
        }

        return;
      }
    }

    await self.clients.openWindow(target.href);
  })());
});
