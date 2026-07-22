// Service worker de Torrecillas OS: deja el escritorio disponible sin conexión.
//
// ACTUALIZACIONES: sube APP_VERSION en cada despliegue. Al cambiar estos bytes el
// navegador instala el nuevo worker, que se queda EN ESPERA; la página lo detecta y
// ofrece "Actualizar". No se activa solo (nada de skipWaiting automático) para no
// mezclar el JS viejo de una ventana abierta con los assets nuevos.
//
// Estrategia de red: red primero para el documento (index.html siempre fresco si hay
// conexión), y stale-while-revalidate para el resto (og.png, iconos... se refrescan
// solos al vuelo). Debe coincidir con APP_VERSION de index.html (un test lo verifica).
const APP_VERSION = '0.25.0';
const CACHE = 'tos-' + APP_VERSION;
const ASSETS = [
  './', './index.html', './og.png', './apple-touch-icon.png',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', (e) => {
  // Precachear lo que exista. NO se llama a skipWaiting: el nuevo worker espera a
  // que la página confirme la actualización (mensaje SKIP_WAITING).
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La página pide activar el worker en espera cuando el usuario pulsa "Actualizar".
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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
