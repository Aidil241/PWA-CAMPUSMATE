/* CampusMate service worker
 *
 * - Shell aplikasi (HTML, JS, ikon) dan pustaka CDN di-cache saat instalasi, jadi app bisa dibuka tanpa internet.
 * - Halaman dan berkas statis: coba jaringan dulu, jatuh ke cache jika offline (perubahan kode langsung terlihat saat online).
 * - Foto/berkas bukti tugas (/uploads/): cache-first, dibatasi jumlahnya.
 * - Permintaan /api/ TIDAK disentuh di sini. Data disimpan dan disinkronkan oleh app.js (localStorage + antrean IndexedDB).
 *
 * Naikkan VERSION setiap kali daftar SHELL berubah agar cache lama dibersihkan.
 */
const VERSION = 'v1';
const SHELL_CACHE = `campusmate-shell-${VERSION}`;
const RUNTIME_CACHE = `campusmate-runtime-${VERSION}`;
const MAX_RUNTIME_ENTRIES = 80;
const NETWORK_TIMEOUT_MS = 4000;

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'assets/js/app.js',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
];

// Harus sama persis dengan URL di index.html
const TAILWIND = 'https://cdn.tailwindcss.com';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap';
const CDN_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);

      // Berkas milik sendiri: satu gagal tidak menggagalkan yang lain.
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));

      // Tailwind: respons "opaque" tidak bisa lewat cache.add(), jadi pakai put().
      await Promise.allSettled([
        fetch(TAILWIND, { mode: 'no-cors' }).then((res) => cache.put(TAILWIND, res)),
        precacheFonts(cache),
      ]);

      await self.skipWaiting();
    })()
  );
});

// Ambil CSS font lalu simpan berkas font (subset latin) supaya huruf tetap benar saat offline.
async function precacheFonts(cache) {
  const cssRes = await fetch(FONT_CSS);
  if (!cssRes.ok) return;
  const css = await cssRes.clone().text();
  await cache.put(FONT_CSS, cssRes);

  const urls = [];
  const blocks = css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g);
  for (const [, subset, body] of blocks) {
    if (subset !== 'latin' && subset !== 'latin-ext') continue;
    const match = body.match(/url\(([^)]+)\)/);
    if (match) urls.push(match[1].replace(/["']/g, ''));
  }
  await Promise.allSettled(urls.map((u) => fetch(u).then((res) => (res.ok ? cache.put(u, res) : null))));
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, RUNTIME_CACHE];
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('campusmate-') && !keep.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/api/')) return; // dikelola app.js
    if (url.pathname.includes('/uploads/')) {
      event.respondWith(cacheFirst(req, RUNTIME_CACHE, MAX_RUNTIME_ENTRIES));
      return;
    }
    event.respondWith(networkFirst(req));
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
  }
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = (await cache.match('index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    return Response.error();
  }
}

async function cacheFirst(req, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') {
      cache.put(req, res.clone());
      if (maxEntries) trim(cache, maxEntries);
    }
    return res;
  } catch (err) {
    return Response.error();
  }
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
