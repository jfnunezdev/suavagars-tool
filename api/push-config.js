"use strict"

const { hasPushConfiguration } = require("../lib/web-push")

function sendJson (response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store")
  response.end(JSON.stringify(payload))
}

function handler (request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET")
    sendJson(response, 405, { error: "Este endpoint aceita somente GET." })
    return
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY || ""
  const hasKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  const storageReady = hasKv || process.env.VERCEL !== "1"
  sendJson(response, 200, {
    publicKey,
    enabled: Boolean(hasPushConfiguration() && storageReady),
    storageReady
  })
}

module.exports = handler
