const CACHE_NAME = 'perth-trip-planner-v9';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './app.js',
  './manifest.webmanifest',
  './perth-trip-planner.svg',
  './perth-icon-180.png',
  './perth-icon-192.png',
  './perth-icon-512.png',
  './perth-coast.jpg',
  './dm-sans.ttf',
  './manrope.ttf'
];
const SHELL_URLS = APP_SHELL.map((path) => new URL(path, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) =>
    cache.addAll(SHELL_URLS.map((url) => new Request(url, { cache: 'reload' })))
  ));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('perth-trip-planner-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  url.search = '';
  const isAppNavigation = request.mode === 'navigate' && SHELL_URLS.slice(0, 2).includes(url.href);
  if (!isAppNavigation && !SHELL_URLS.includes(url.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(isAppNavigation ? SHELL_URLS[1] : url.href);
    return cached || fetch(request);
  })());
});