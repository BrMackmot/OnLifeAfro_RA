/* Service worker: lets «La cifra y la voz» open without internet after one online visit.
   IMPORTANT: when you replace narracion.mp3, target.mind or any file, change VERSION (e.g. ra-v3). */
const VERSION = 'ra-v3';
const CORE = ['./', './index.html', './aframe-v1.5.0.min.js', './mindar-image-aframe.prod.js',
              './target.mind', './logo-onlife-afro.png', './RA_tarjeta_A6.png'];
const OPTIONAL = ['./narracion.mp3'];            // missing audio must not break the install
const BIG = /aframe-v1\.5\.0\.min\.js$|mindar-image-aframe\.prod\.js$|target\.mind$/;             // large, rarely changing -> cache first

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(CORE.map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => {})));  // a missing file must not block the install
    await Promise.all(OPTIONAL.map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function fromCacheRange(req) {              // audio needs byte-range replies (Safari)
  const hit = await caches.match(req.url, {ignoreSearch: true});
  if (!hit) return Response.error();
  const buf = await hit.arrayBuffer();
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get('range') || '');
  const start = m ? +m[1] : 0, end = m && m[2] ? +m[2] : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {status: 206, headers: {
    'Content-Type': hit.headers.get('Content-Type') || 'audio/mpeg',
    'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
    'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes'}});
}
async function networkFirst(req) {
  const c = await caches.open(VERSION);
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3500);  // weak connection -> use cache
    const r = await fetch(req, {signal: ctl.signal}); clearTimeout(t);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch (_) {
    return (await c.match(req, {ignoreSearch: true})) || (await c.match('./index.html')) || Response.error();
  }
}
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.headers.has('range')) {
    e.respondWith(fetch(req).catch(() => fromCacheRange(req))); return;
  }
  if (BIG.test(url.pathname)) {
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(h => h || networkFirst(req))); return;
  }
  e.respondWith(networkFirst(req));
});
