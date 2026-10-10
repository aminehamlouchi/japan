// Keeps a copy of the trip page on the phone so it opens without signal.
// C holds the page and changes with every deploy. S holds photos, icons, fonts, the map library and
// map tiles, and is kept across deploys so nothing has to be downloaded again.
const C = "j26-v40";
const S = "j26-static";
const SHELL = ["./icon.png", "./icon-192.png", "./icon-512.png", "./manifest.webmanifest"];
const WAIT = 4000; // on weak signal, show the saved copy after this long and update it in the background

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    // All or nothing: if the new page can't be downloaded whole, the install fails and the old copy stays.
    const res = await fetch("./index.html", {cache: "reload"});
    if (!res.ok) throw new Error("page " + res.status);
    const c = await caches.open(C);
    await c.put("./index.html", res);
    const s = await caches.open(S);
    await Promise.all(SHELL.map(u => fetch(u, {cache: "reload"}).then(r => r.ok ? s.put(u, r) : null).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k.startsWith("j26-v") && k !== C).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isStatic = url =>
  (url.origin === location.origin && (url.pathname.includes("/img/") || /\/(icon(-\d+)?\.png|manifest\.webmanifest|og\.jpg)$/.test(url.pathname)))
  || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"
  || url.hostname === "cdnjs.cloudflare.com" || url.hostname === "server.arcgisonline.com";

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url);
  const isPage = r.mode === "navigate" || (url.origin === location.origin && (url.pathname.endsWith("/") || url.pathname.endsWith(".html")));
  if (isPage) e.respondWith(page(e, r));
  else if (isStatic(url)) e.respondWith(saved(r));
});

async function page(e, r) {
  const c = await caches.open(C);
  // Only a good answer replaces the saved page; an error page is never saved over it.
  const net = fetch(r).then(async res => { if (res.ok) await c.put("./index.html", res.clone()); return res; });
  const first = await Promise.race([net.catch(() => null), new Promise(ok => setTimeout(ok, WAIT, null))]);
  if (first && first.ok) return first;
  const kept = await c.match("./index.html");
  if (kept) { e.waitUntil(net.catch(() => null)); return kept; }
  if (first) return first;
  try { return await net; } catch (_) { return Response.error(); }
}

async function saved(r) {
  const s = await caches.open(S);
  const hit = await s.match(r, {ignoreVary: true});
  if (hit) return hit;
  const res = await fetch(r);
  if (res.ok || res.type === "opaque") s.put(r, res.clone()).catch(() => {});
  return res;
}

// The page sends the list of every photo once it is open, so all of them are on the phone before the trip.
self.addEventListener("message", e => {
  const list = e.data && e.data.warm;
  if (Array.isArray(list)) e.waitUntil(warm(list));
});
async function warm(list) {
  const s = await caches.open(S);
  for (const u of list) {
    if (await s.match(u)) continue;
    try { const res = await fetch(u); if (res.ok) await s.put(u, res); } catch (_) { return; }
  }
}
