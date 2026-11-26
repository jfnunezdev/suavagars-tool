"use strict"

const CACHE_NAME = "svrs-public-v5"
const APP_SHELL = [
  "/",
  "/index.html",
  "/public.css",
  "/public/logo-triangulo.png",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
]

const PRIVATE_PATHS = ["/admin", "/ferramenta", "/gestor"]

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
            .filter(key => key.startsWith("sua-vaga-rs-pwa-") || key.startsWith("svrs-public-"))
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
    PRIVATE_PATHS.some(prefix => requestUrl.pathname.startsWith(prefix))
  )
    return

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
        if (cachedResponse) return cachedResponse
        if (request.mode === "navigate") return caches.match("/index.html")
        throw error
      }
    })()
  )
})
