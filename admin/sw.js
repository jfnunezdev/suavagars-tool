"use strict"

const CACHE_NAME = "svrs-admin-v2"
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

self.addEventListener("push", event => {
  let payload = {
    title: "NOVA VAGA!",
    body: "Há uma nova solicitação de vaga. Abra o painel para revisar.",
    icon: "/admin/icon-192.png",
    badge: "/admin/icon-192.png",
    tag: "svrs-new-application",
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: "/admin/" }
  }
  if (event.data) {
    try {
      payload = Object.assign({}, payload, event.data.json())
    } catch (error) {
      payload.body = event.data.text()
    }
  }
  event.waitUntil(self.registration.showNotification(payload.title, payload))
})

self.addEventListener("notificationclick", event => {
  event.notification.close()
  const data = event.notification.data || {}
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/admin/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      const existing = clients.find(client => client.url.includes(url) && "focus" in client)
      if (existing) { return existing.focus() }
      if (self.clients.openWindow) { return self.clients.openWindow(url) }
      return undefined
    })
  )
})
