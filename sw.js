// Central 26 — service worker: abre a app sem rede e mostra as notificações.
const VERSAO = "central26-v1.6.0";
const BASE = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/api.js", "js/crm.js", "js/chat.js", "js/agenda.js", "js/logistica.js", "js/geo.js", "js/mapa.js", "js/auditoria.js", "geo/portugal.json", "js/demo.js", "js/dados.js", "js/modelos.js", "js/config.js",
  "img/icone-192.png", "img/icone-512.png", "img/badge-96.png",
  "img/logo-twentysix.webp", "img/logo-barbearia.webp", "img/logo-academy.webp", "img/logo-tech.webp",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Ficheiros da app: primeiro a rede (para receber atualizações), depois a cópia guardada.
// Pedidos à base de dados e a outros sites passam diretamente.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corpo: e.data ? e.data.text() : "" }; }
  const titulo = d.titulo || "Central 26";
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.corpo || "",
    icon: "img/icone-192.png",
    badge: "img/badge-96.png",
    tag: d.id ? "n" + d.id : undefined,
    data: { link: d.link || "#notificacoes" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL("./" + (e.notification.data?.link || ""), self.registration.scope).href;
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const j of janelas) {
      if (j.url.startsWith(self.registration.scope)) { await j.focus(); j.navigate ? j.navigate(destino) : null; return; }
    }
    await self.clients.openWindow(destino);
  })());
});
