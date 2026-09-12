const CACHE_NAME = 'thogai-v1'

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg'
]

// Install: precache application shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS)
    }).then(() => self.skipWaiting())
  )
})

// Activate: clean up old versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch: network-first for navigation/API; never cache /api/*
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // 1. NEVER cache /api/ requests (Gemini AI must be network-only)
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return
  }

  // 2. Navigation requests: Network-first, fall back to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME)
        const cachedIndex = await cache.match('/index.html')
        return cachedIndex || fetch(event.request)
      })
    )
    return
  }

  // 3. Static assets: Stale-while-revalidate for instant updates
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache)
          })
        }
        return networkResponse
      }).catch(() => cachedResponse)

      return cachedResponse || fetchPromise
    })
  )
})
