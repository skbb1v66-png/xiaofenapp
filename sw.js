// Service Worker — 小粉日历 v2.6.1
// 缓存策略：Cache First，离线回退到首页

const CACHE = 'xfrl-v6';
const FILES = [
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/data.js',
  './js/cycle.js',
  './js/auth.js',
  './js/ui.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  e.respondWith(
    caches.match(e.request).then(function (r) {
      return r || fetch(e.request).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});

// 提醒通知点击 → 打开应用
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(clients.openWindow('./index.html'));
});
