"use strict"

const CACHE_NAME = "svrs-admin-v1"
const APP_SHELL = [
  "/admin/",
  "/admin/index.html",
  "/admin/manifest.json",
  "/admin/admin.css",
  "/admin/icon-192.png",
  "/admin/icon-512.png",
  "/styles.css",
  "/logo.png"
]

const SHARED_ASSETS = ["/styles.css", "/logo.png"]

function isAdminRequest (pathname) {
  return pathname.startsWith("/admin/") || SHARED_ASSETS.includes(pathname)
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("sua-vaga-rs-pwa-") || key.startsWith("svrs-admin-"))
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", event => {
  const request = event.request
  const requestUrl = new URL(request.url)
  if (
    request.method !== "GET" ||
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.startsWith("/api/") ||
    !isAdminRequest(requestUrl.pathname)
  ) {
    return
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(request, response.clone())
        }
        return response
      } catch (error) {
        const cachedResponse = await caches.match(request)
        if (cachedResponse) {
          return cachedResponse
        }
        if (request.mode === "navigate") {
          return caches.match("/admin/index.html")
        }
        throw error
      }
    })()
  )
})
