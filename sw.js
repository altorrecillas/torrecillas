// Service worker de Torrecillas OS: deja el escritorio disponible sin conexión.
// Estrategia: red primero para el documento (así llegan las actualizaciones),
// caché como respaldo; el resto de GET se sirve de caché y se revalida en segundo
// plano (stale-while-revalidate), así og.png o los iconos se actualizan solos
// sin tener que acordarse de subir la versión de CACHE en cada despliegue.
const CACHE = 'tos-v3';
const ASSETS = [
  './', './index.html', './og.png', './apple-touch-icon.png',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // og/apple/iconos pueden faltar en despliegues parciales: se cachean los que existan
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

  // Stale-while-revalidate: respuesta inmediata desde caché y refresco al vuelo.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fresh = fetch(e.request)
        .then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return r;
        })
        .catch(() => cached); // sin conexión nos quedamos con lo cacheado
      if (cached) {
        e.waitUntil(fresh); // el refresco sigue aunque ya hayamos respondido
        return cached;
      }
      return fresh;
    })
  );
});
