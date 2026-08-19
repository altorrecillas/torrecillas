// Service worker de Torrecillas OS: deja el escritorio disponible sin conexión.
//
// ACTUALIZACIONES: sube APP_VERSION en cada despliegue. Al cambiar estos bytes el
// navegador instala el nuevo worker, que se queda EN ESPERA; la página lo detecta y
// ofrece "Actualizar". No se activa solo (nada de skipWaiting automático) para no
// mezclar el JS viejo de una ventana abierta con los assets nuevos.
//
// Estrategia de red: stale-while-revalidate para TODO, documento incluido. La copia
// guardada se sirve al instante y la descarga sigue por detrás; cuando hay versión
// nueva es este worker quien lo anuncia (la página enseña el banner "Actualizar"), así
// que la app no tiene por qué esperar a la red para pintar. Debe coincidir con
// APP_VERSION de index.html (un test lo verifica).
const APP_VERSION = '0.65.0';
const CACHE = 'tos-' + APP_VERSION;
const DOC = './index.html';          // el documento, con su alias './'
const ASSETS = [
  './og.png', './apple-touch-icon.png',
  './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './fonts/orbitron-700-900.woff2', './fonts/rajdhani-400.woff2',
  './fonts/rajdhani-600.woff2', './fonts/rajdhani-700.woff2'
];
// Los que no cambian nunca dentro de una versión (ver el fetch de más abajo). El
// manifest queda fuera a propósito: se retoca más a menudo que las fuentes.
const INMUTABLE = /\/(fonts\/[\w.-]+\.woff2|icon-\d+\.png|apple-touch-icon\.png|og\.png)$/;

// El documento se guarda bajo sus dos claves ('./' e './index.html') a partir de UNA
// sola descarga: con c.add() de las dos entradas se bajaba 1,7 MB por duplicado en
// cada instalación.
async function cacheDoc(c) {
  const r = await fetch(DOC, { cache: 'reload' });
  if (!r.ok) throw new Error('doc ' + r.status);
  await Promise.all([c.put(DOC, r.clone()), c.put('./', r)]);
}

self.addEventListener('install', (e) => {
  // Precachear lo que exista. NO se llama a skipWaiting: el nuevo worker espera a
  // que la página confirme la actualización (mensaje SKIP_WAITING).
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(
      [cacheDoc(c)].concat(ASSETS.map((a) => c.add(a)))
    ))
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
  const url = new URL(e.request.url);

  // Share target: el sistema comparte algo CON la app instalada (POST). Puede venir
  // un ARCHIVO (imagen, EPUB, PDF) o solo TEXTO/ENLACE, que es lo que más se comparte
  // en el móvil. Se guarda en la caché y se redirige a la app, que lo recoge al
  // cargar: ?shared=1 para el archivo, ?shared=text para el texto.
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      let destino = './?shared=1';
      try {
        const form = await e.request.formData();
        const file = form.get('file') || form.get('image') || form.getAll('file')[0] || form.getAll('image')[0];
        const c = await caches.open(CACHE);
        if (file && file.size) {
          await c.put('shared-file', new Response(file, {
            headers: { 'Content-Type': file.type || 'image/png', 'X-Share-Name': encodeURIComponent(file.name || 'compartido') }
          }));
        } else {
          const texto = String(form.get('text') || '');
          const enlace = String(form.get('url') || '');
          const titulo = String(form.get('title') || '');
          if (texto || enlace || titulo) {
            await c.put('shared-text', new Response(JSON.stringify({ text: texto, url: enlace, title: titulo }), {
              headers: { 'Content-Type': 'application/json' }
            }));
            destino = './?shared=text';
          }
        }
      } catch (err) { /* si algo falla, se abre la app igualmente */ }
      return Response.redirect(destino, 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return; // los proyectos enlazados van directos a la red

  if (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith((async () => {
      // El documento pesa ~1,7 MB: esperar a la red para pintarlo dejaba la pantalla
      // en blanco en cada arranque de la app instalada, teniendo una copia buena
      // guardada. Ahora se sirve la caché y el refresco va por detrás; de avisar de la
      // versión nueva ya se encarga el banner "Actualizar" (lo dispara el worker nuevo,
      // que al activarse vuelve a precachear el documento).
      const cached = (await caches.match(DOC)) || (await caches.match('./'));
      const net = fetch(e.request).then((r) => {
        // Solo se guarda la entrada limpia: los atajos del icono y el "compartir con"
        // llegan como ./?app=tareas o ./?shared=text y llenarían la caché de copias
        // del mismo documento (y de una URL que al reabrirla haría cosas raras).
        if (!url.search) {
          // ...y solo si la respuesta es buena: ahora que manda la caché, un 500 o una
          // página de error del hosting guardada ahí se serviría para siempre.
          if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(DOC, copy)); }
        }
        return r;
      });
      if (!cached) return net; // primera visita: no hay más remedio que esperar a la red
      e.waitUntil(net.catch(() => {}));
      return cached;
    })());
    return;
  }

  // Assets inmutables (fuentes e iconos): de la caché y punto, sin revalidar. Su
  // contenido no cambia nunca dentro de una versión, así que preguntar por ellos en cada
  // carga era gastar peticiones (y datos del móvil) para que el servidor conteste 304.
  // Lo suyo sería un Cache-Control: immutable, pero esto se sirve desde GitHub Pages,
  // que manda max-age=600 a todo y no deja tocar cabeceras: la política se aplica aquí.
  // Al subir APP_VERSION cambia el nombre de la caché y se vuelven a bajar, que es
  // exactamente lo que hace immutable.
  if (INMUTABLE.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    })));
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
