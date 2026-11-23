/* Service worker: guarda o app no aparelho para funcionar sem internet. */
const VERSAO = 'reforma-facil-v2';
const ARQUIVOS = [
  './', './index.html', './app.js', './motor.js', './dados.js', './manifest.webmanifest',
  './conta.js', './nuvem.js', './firebase-config.js',
  './icones/icone-192.png', './icones/icone-512.png', './icones/icone-maskable-512.png',
  './icones/apple-touch-icon.png', './icones/favicon-32.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Rede primeiro (pega atualizações); sem internet, usa a cópia guardada.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // guarda o próprio app e as bibliotecas do Firebase (gstatic); chamadas de login/banco vão direto à rede
  const proprio = url.origin === location.origin;
  const sdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (e.request.method !== 'GET' || !(proprio || sdk)) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copia = r.clone();
      caches.open(VERSAO).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
