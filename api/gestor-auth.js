"use strict"

const {
  constantTimeEqual,
  createSessionCookie,
  clearSessionCookie,
  isAdminRequest
} = require("../lib/admin-auth")
const { isSameOriginRequest } = require("../lib/csrf")

const MAX_BODY_BYTES = 4096

function sendJson (response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store")
  response.end(JSON.stringify(payload))
}

async function readJsonBody (request) {
  if (request.body !== undefined) {
    if (typeof request.body === "object" && request.body !== null && !Buffer.isBuffer(request.body)) {
      if (Buffer.byteLength(JSON.stringify(request.body)) > MAX_BODY_BYTES) {
        const error = new Error("Os dados enviados excedem o limite permitido.")
        error.statusCode = 413
        throw error
      }
      return request.body
    }
    if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
      const body = Buffer.isBuffer(request.body) ? request.body.toString("utf8") : request.body
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        const error = new Error("Os dados enviados excedem o limite permitido.")
        error.statusCode = 413
        throw error
      }
      try {
        return JSON.parse(body)
      } catch {
        const error = new Error("O corpo da requisição não contém JSON válido.")
        error.statusCode = 400
        throw error
      }
    }
  }

  const chunks = []
  let totalBytes = 0
  for await (const chunk of request) {
    totalBytes += chunk.length
    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error("Os dados enviados excedem o limite permitido.")
      error.statusCode = 413
      throw error
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    const error = new Error("O corpo da requisição não contém JSON válido.")
    error.statusCode = 400
    throw error
  }
}

async function handler (request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, { authenticated: isAdminRequest(request) })
    return
  }

  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", clearSessionCookie(request))
    sendJson(response, 200, { authenticated: false })
    return
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, DELETE")
    sendJson(response, 405, { error: "Este endpoint aceita somente GET, POST e DELETE." })
    return
  }

  if (!isSameOriginRequest(request)) {
    sendJson(response, 403, { error: "Requisição bloqueada por política de mesma origem." })
    return
  }

  const expectedPassword = process.env.GESTOR_PASSWORD
  if (!expectedPassword) {
    sendJson(response, 503, { error: "Configure GESTOR_PASSWORD no .env.local (local) ou na Vercel para habilitar o painel." })
    return
  }

  try {
    const body = await readJsonBody(request)
    if (!body || typeof body.password !== "string" ||
        !constantTimeEqual(body.password, expectedPassword)) {
      sendJson(response, 401, { error: "Senha incorreta" })
      return
    }
    response.setHeader("Set-Cookie", createSessionCookie(request, expectedPassword))
    sendJson(response, 200, { authenticated: true })
  } catch (error) {
    sendJson(response, error.statusCode || 500, { error: error.message || "Não foi possível entrar no painel." })
  }
}

module.exports = handler
