/* =========================================================================
   sw.js — service worker: deixa o aplicativo 100% offline
   -------------------------------------------------------------------------
   Estrategia: cache-first para o "app shell" (o proprio codigo), com
   atualizacao em segundo plano. As musicas NAO passam por aqui: ficam no
   IndexedDB e sao lidas como blob, portanto ja funcionam offline.
   ========================================================================= */

const VERSION = 'ipod-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/ipod.css',
  './js/app.js',
  './js/nav.js',
  './js/audio.js',
  './js/library.js',
  './js/db.js',
  './js/tags.js',
  './js/wheel.js',
  './js/click.js',
  './js/util.js',
  './js/settings.js',
  './js/ui/list.js',
  './js/ui/nowplaying.js',
  './js/ui/coverflow.js',
  './js/ui/extras.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[sw] pre-cache parcial', err))
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  ev.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
