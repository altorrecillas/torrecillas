// Service worker de Torrecillas OS: deja el escritorio disponible sin conexión.
// Estrategia: red primero para el documento (así llegan las actualizaciones),
// caché como respaldo; el resto de GET se sirve de caché y se rellena al vuelo.
const CACHE = 'tos-v1';
const ASSETS = ['./', './index.html', './og.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // og/apple pueden faltar en despliegues parciales: se cachean los que existan
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // los proyectos enlazados van directos a la red

  if (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return r;
        })
        .catch(() =>
          caches.match(e.request)
            .then((r) => r || caches.match('./index.html'))
            .then((r) => r || caches.match('./'))
        )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(
      (r) =>
        r ||
        fetch(e.request).then((rr) => {
          if (rr.ok) {
            const copy = rr.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return rr;
        })
    )
  );
});
