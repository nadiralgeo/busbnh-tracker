self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("bus-app-cache").then((cache) => {
      return cache.addAll([
        "/",
        "/index.html",
        "/styles.css", // adapte les noms à ton projet
        "/script.js",
        "/manifest.json",
        "/icon-192.png"
      ]);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
