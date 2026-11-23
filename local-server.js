"use strict"

const fs = require("node:fs")
const http = require("node:http")
const path = require("node:path")
const vagaHandler = require("./api/vaga")
const vagasHandler = require("./api/vagas")
const candidaturasHandler = require("./api/candidaturas")
const gestorAuthHandler = require("./api/gestor-auth")

const root = __dirname

const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 60
const rateLimitMap = new Map()

function getClientIp (request) {
  const forwarded = request.headers["x-forwarded-for"]
  if (forwarded) { return forwarded.split(",")[0].trim() }
  const socket = request.socket
  return (socket && socket.remoteAddress) || "unknown"
}

function isRateLimited (ip) {
  const now = Date.now()
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
  if (now > record.resetAt) {
    record.count = 0
    record.resetAt = now + RATE_LIMIT_WINDOW_MS
  }
  record.count += 1
  rateLimitMap.set(ip, record)
  return record.count > RATE_LIMIT_MAX_REQUESTS
}

function setSecurityHeaders (response, isApi = false) {
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("X-Frame-Options", "DENY")
  response.setHeader("Referrer-Policy", "no-referrer")
  if (isApi) {
    response.setHeader("Content-Security-Policy", "default-src 'none'")
  } else {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    )
  }
}
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/manifest+json; charset=utf-8",
  ".png": "image/png"
}
const publicAssets = new Map([
  ["/manifest.json", path.join("public", "manifest.json")],
  ["/gestor-manifest.json", path.join("public", "gestor-manifest.json")],
  ["/ferramenta-manifest.json", path.join("public", "ferramenta-manifest.json")],
  ["/sw.js", path.join("public", "sw.js")],
  ["/icon-192.png", path.join("public", "icon-192.png")],
  ["/icon-512.png", path.join("public", "icon-512.png")]
])
const server = http.createServer((request, response) => {
  const ip = getClientIp(request)
  if (isRateLimited(ip)) {
    response.writeHead(429, { "Content-Type": "application/json; charset=utf-8", "Retry-After": "60" })
    response.end(JSON.stringify({ error: "Muitas requisições. Tente novamente em um minuto." }))
    return
  }

  const requestUrl = new URL(request.url, "http://127.0.0.1")
  const isApi = requestUrl.pathname.startsWith("/api/")

  const originalWriteHead = response.writeHead.bind(response)
  response.writeHead = (statusCode, headers) => {
    const mergedHeaders = { ...(headers || {}) }
    setSecurityHeaders(response, isApi)
    Object.entries(mergedHeaders).forEach(([key, value]) => {
      response.setHeader(key, value)
    })
    originalWriteHead(statusCode, mergedHeaders)
  }

  if (requestUrl.pathname === "/api/vaga") {
    vagaHandler(request, response)
    return
  }
  if (requestUrl.pathname === "/api/vagas") {
    vagasHandler(request, response)
    return
  }
  if (requestUrl.pathname === "/api/candidaturas") {
    candidaturasHandler(request, response)
    return
  }
  if (requestUrl.pathname === "/api/gestor-auth") {
    gestorAuthHandler(request, response)
    return
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" })
    response.end("Method not allowed")
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(requestUrl.pathname)
  } catch {
    response.writeHead(400)
    response.end("Invalid path")
    return
  }
  const relativePath = publicAssets.get(pathname) || (pathname === "/" ? "index.html" : pathname.slice(1))
  const filePath = path.resolve(root, relativePath)
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    response.writeHead(403)
    response.end("Forbidden")
    return
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500)
      response.end(error.code === "ENOENT" ? "Not found" : "Could not read file")
      return
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    })
    response.end(request.method === "HEAD" ? undefined : contents)
  })
})

const port = Number(process.env.PORT) || 3000
server.listen(port, "127.0.0.1", () => {
  console.log(`Sua Vaga RS disponível em http://127.0.0.1:${port}`)
})
