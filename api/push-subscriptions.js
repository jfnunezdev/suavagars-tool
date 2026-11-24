"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")
const { randomUUID } = require("node:crypto")
const { isAdminRequest, sendUnauthorized } = require("../lib/admin-auth")
const { isSameOriginRequest } = require("../lib/csrf")

const STORAGE_KEY = "suavagars:push-subscriptions"
const LOCAL_STORAGE_PATH = path.join(__dirname, "..", "data", "push-subscriptions.json")
const MAX_SUBSCRIPTIONS = 100

class ApiError extends Error {
  constructor (statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function sendJson (response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store")
  response.end(JSON.stringify(payload))
}

function storageType () {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) { return "kv" }
  if (process.env.VERCEL === "1") {
    throw new ApiError(503, "Configure KV_REST_API_URL e KV_REST_API_TOKEN na Vercel para receber notificações.")
  }
  return "local"
}

async function readJsonBody (request) {
  if (request.body !== undefined) {
    if (typeof request.body === "object" && request.body !== null && !Buffer.isBuffer(request.body)) {
      const size = Buffer.byteLength(JSON.stringify(request.body))
      if (size > 16 * 1024) { throw new ApiError(413, "Os dados enviados excedem o limite permitido.") }
      return request.body
    }
    if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
      const body = Buffer.isBuffer(request.body) ? request.body.toString("utf8") : request.body
      if (Buffer.byteLength(body) > 16 * 1024) { throw new ApiError(413, "Os dados enviados excedem o limite permitido.") }
      try {
        return JSON.parse(body)
      } catch {
        throw new ApiError(400, "O corpo da requisição não contém JSON válido.")
      }
    }
  }

  const chunks = []
  let totalBytes = 0
  for await (const chunk of request) {
    totalBytes += chunk.length
    if (totalBytes > 16 * 1024) { throw new ApiError(413, "Os dados enviados excedem o limite permitido.") }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new ApiError(400, "O corpo da requisição não contém JSON válido.")
  }
}

function bounded (value, maxLength, field) {
  const text = String(value == null ? "" : value).trim()
  if (!text) { throw new ApiError(400, `O campo ${field} é obrigatório.`) }
  if (text.length > maxLength) { throw new ApiError(400, `O campo ${field} excede o tamanho permitido.`) }
  return text
}

function isSubscription (value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.endpoint === "string" &&
    value.keys &&
    typeof value.keys.p256dh === "string" &&
    typeof value.keys.auth === "string"
  )
}

async function kvPipeline (commands) {
  const baseUrl = process.env.KV_REST_API_URL.replace(/\/+$/, "")
  let response
  try {
    response = await fetch(`${baseUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commands)
    })
  } catch {
    throw new ApiError(502, "Não foi possível acessar o armazenamento de notificações.")
  }
  let results
  try {
    results = await response.json()
  } catch {
    throw new ApiError(502, "O armazenamento retornou uma resposta inválida.")
  }
  if (!response.ok || !Array.isArray(results)) {
    throw new ApiError(502, "O armazenamento não conseguiu processar a operação.")
  }
  const failure = results.find((result) => result && result.error)
  if (failure) { throw new ApiError(502, "O armazenamento não conseguiu processar a operação.") }
  return results.map((result) => result && result.result)
}

async function readKvSubscriptions () {
  const [values] = await kvPipeline([["LRANGE", STORAGE_KEY, "0", String(MAX_SUBSCRIPTIONS - 1)]])
  if (!Array.isArray(values)) { return [] }
  return values.map((value) => {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }).filter(isSubscription)
}

async function writeKvSubscriptions (subscriptions) {
  const commands = [["DEL", STORAGE_KEY]]
  subscriptions.slice(0, MAX_SUBSCRIPTIONS).forEach((subscription) => {
    commands.push(["RPUSH", STORAGE_KEY, JSON.stringify(subscription)])
  })
  await kvPipeline(commands)
}

async function readLocalSubscriptions () {
  try {
    const content = await fs.readFile(LOCAL_STORAGE_PATH, "utf8")
    const subscriptions = JSON.parse(content)
    if (!Array.isArray(subscriptions)) { throw new Error("Invalid subscription storage") }
    return subscriptions.filter(isSubscription).slice(0, MAX_SUBSCRIPTIONS)
  } catch (error) {
    if (error.code === "ENOENT") { return [] }
    throw new ApiError(500, "Não foi possível ler as notificações locais.")
  }
}

async function writeLocalSubscriptions (subscriptions) {
  const directory = path.dirname(LOCAL_STORAGE_PATH)
  await fs.mkdir(directory, { recursive: true })
  const temporaryPath = `${LOCAL_STORAGE_PATH}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(subscriptions.slice(0, MAX_SUBSCRIPTIONS), null, 2), "utf8")
    await fs.rename(temporaryPath, LOCAL_STORAGE_PATH)
  } catch {
    await fs.rm(temporaryPath, { force: true })
    throw new ApiError(500, "Não foi possível salvar a notificação localmente.")
  }
}

async function readSubscriptions () {
  const storage = storageType()
  return storage === "kv" ? await readKvSubscriptions() : await readLocalSubscriptions()
}

async function addSubscription (subscription) {
  const storage = storageType()
  const current = storage === "kv" ? await readKvSubscriptions() : await readLocalSubscriptions()
  const next = [subscription].concat(current.filter((item) => item.endpoint !== subscription.endpoint))
  if (storage === "kv") { await writeKvSubscriptions(next) } else { await writeLocalSubscriptions(next) }
}

async function removeSubscription (endpoint) {
  const storage = storageType()
  const current = storage === "kv" ? await readKvSubscriptions() : await readLocalSubscriptions()
  const next = current.filter((item) => item.endpoint !== endpoint)
  if (next.length === current.length) { return false }
  if (storage === "kv") { await writeKvSubscriptions(next) } else { await writeLocalSubscriptions(next) }
  return true
}

function normalizeSubscription (body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Envie a assinatura em formato JSON.")
  }
  const endpoint = bounded(body.endpoint, 2048, "endpoint")
  let parsed
  try {
    parsed = new URL(endpoint)
  } catch {
    throw new ApiError(400, "Informe um endpoint de notificação válido.")
  }
  if (parsed.protocol !== "https:") {
    throw new ApiError(400, "Informe um endpoint de notificação HTTPS.")
  }
  const keys = body.keys && typeof body.keys === "object" ? body.keys : {}
  return {
    id: randomUUID(),
    endpoint,
    keys: {
      p256dh: bounded(keys.p256dh, 512, "p256dh"),
      auth: bounded(keys.auth, 256, "auth")
    },
    createdAt: new Date().toISOString()
  }
}

async function handler (request, response) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    response.setHeader("Allow", "POST, DELETE")
    sendJson(response, 405, { error: "Este endpoint aceita somente POST e DELETE." })
    return
  }
  if (!isAdminRequest(request)) {
    sendUnauthorized(response)
    return
  }
  if (!isSameOriginRequest(request)) {
    sendJson(response, 403, { error: "Requisição bloqueada por política de mesma origem." })
    return
  }
  try {
    const body = await readJsonBody(request)
    if (request.method === "POST") {
      const subscription = normalizeSubscription(body)
      await addSubscription(subscription)
      sendJson(response, 201, { subscribed: true, endpoint: subscription.endpoint })
      return
    }
    const endpoint = bounded(body && body.endpoint, 2048, "endpoint")
    await removeSubscription(endpoint)
    sendJson(response, 200, { unsubscribed: true })
  } catch (error) {
    sendJson(response, error.statusCode || 500, { error: error.message || "Não foi possível salvar a notificação." })
  }
}

module.exports = handler
module.exports.readSubscriptions = readSubscriptions
module.exports.removeSubscription = removeSubscription
