// Service worker mínimo: no cachea nada a propósito (la app siempre necesita
// datos en vivo de Firestore y la última versión del código), solo existe
// para que el navegador considere la app "instalable" en la pantalla de inicio.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
