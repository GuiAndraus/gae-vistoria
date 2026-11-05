// Service worker: guarda o app no celular para abrir sem internet. Ao publicar mudanças, aumentar VERSAO.
const VERSAO = "gae-vistoria-1.0.0";
const ARQUIVOS = [
  "./", "index.html", "estilo.css", "app.js", "config.js", "manifest.webmanifest",
  "icones/icone-180.png", "icones/icone-192.png", "icones/icone-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Só os arquivos do próprio app; Google (login e Drive) vai direto para a rede
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
