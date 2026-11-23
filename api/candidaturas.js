"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")
const { randomUUID } = require("node:crypto")
const { isAdminRequest, sendUnauthorized } = require("../lib/admin-auth")
const { publishApplication } = require("./vagas")
const { isSameOriginRequest } = require("../lib/csrf")

const MAX_BODY_BYTES = 16 * 1024
const MAX_APPLICATIONS = 100
const PENDING_KEY = "suavagars:solicitacoes"
const LOCAL_STORAGE_PATH = path.join(__dirname, "..", "data", "solicitacoes.json")

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
    throw new ApiError(503, "Configure KV_REST_API_URL e KV_REST_API_TOKEN na Vercel para receber solicitações.")
  }
  return "local"
}

async function readJsonBody (request) {
  if (request.body !== undefined) {
    if (typeof request.body === "object" && request.body !== null && !Buffer.isBuffer(request.body)) {
      if (Buffer.byteLength(JSON.stringify(request.body)) > MAX_BODY_BYTES) {
        throw new ApiError(413, "Os dados enviados excedem o limite permitido.")
      }
      return request.body
    }
    if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
      const body = Buffer.isBuffer(request.body) ? request.body.toString("utf8") : request.body
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) { throw new ApiError(413, "Os dados enviados excedem o limite permitido.") }
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
    if (totalBytes > MAX_BODY_BYTES) { throw new ApiError(413, "Os dados enviados excedem o limite permitido.") }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new ApiError(400, "O corpo da requisição não contém JSON válido.")
  }
}

function boundedText (value, field, maxLength, fallback) {
  if (value == null || value === "") { return fallback }
  if (typeof value !== "string") { throw new ApiError(400, `O campo ${field} precisa ser texto.`) }
  const text = value.trim()
  if (text.length > maxLength) { throw new ApiError(400, `O campo ${field} excede o tamanho permitido.`) }
  return text || fallback
}

function requiredText (value, field, maxLength) {
  const text = boundedText(value, field, maxLength, "")
  if (!text) { throw new ApiError(400, `Informe ${field} para enviar a solicitação.`) }
  return text
}

function validateApplication (body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Envie os dados da vaga em formato JSON.")
  }

  let link
  try {
    const url = new URL(requiredText(body.link, "o link de candidatura", 2048))
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      throw new Error("invalid link")
    }
    link = url.href
  } catch {
    throw new ApiError(400, "Informe um link público HTTP ou HTTPS para candidatura.")
  }

  return {
    id: randomUUID(),
    role: requiredText(body.role, "o cargo", 160),
    company: requiredText(body.company, "o nome da empresa", 160),
    city: requiredText(body.city, "a cidade", 120),
    salary: boundedText(body.salary, "salário", 120, "A consultar"),
    model: boundedText(body.model, "modelo de trabalho", 100, ""),
    contractType: requiredText(body.contractType, "o tipo de contratação", 100),
    schedule: boundedText(body.schedule, "horário", 200, ""),
    activities: boundedText(body.activities, "atividades", 2000, ""),
    benefits: boundedText(body.benefits, "benefícios", 1000, ""),
    requirements: boundedText(body.requirements, "requisitos", 1000, ""),
    contactName: requiredText(body.contactName, "o nome de contato", 160),
    contactPhone: requiredText(body.contactPhone, "o WhatsApp de contato", 40),
    contactEmail: boundedText(body.contactEmail, "e-mail de contato", 254, ""),
    link,
    createdAt: new Date().toISOString()
  }
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
    throw new ApiError(502, "Não foi possível acessar o armazenamento de solicitações.")
  }

  let results
  try {
    results = await response.json()
  } catch {
    throw new ApiError(502, "O armazenamento retornou uma resposta inválida.")
  }
  if (!response.ok || !Array.isArray(results) || results.some((result) => result && result.error)) {
    throw new ApiError(502, "O armazenamento não conseguiu processar a operação.")
  }
  return results.map((result) => result && result.result)
}

async function readKvApplications () {
  const [values] = await kvPipeline([["LRANGE", PENDING_KEY, "0", String(MAX_APPLICATIONS - 1)]])
  if (!Array.isArray(values)) { return [] }
  return values.map((value) => {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }).filter(Boolean)
}

async function readLocalApplications () {
  try {
    const content = await fs.readFile(LOCAL_STORAGE_PATH, "utf8")
    const applications = JSON.parse(content)
    if (!Array.isArray(applications)) { throw new Error("Invalid application storage") }
    return applications.slice(0, MAX_APPLICATIONS)
  } catch (error) {
    if (error.code === "ENOENT") { return [] }
    throw new ApiError(500, "Não foi possível ler as solicitações locais.")
  }
}

async function writeLocalApplications (applications) {
  await fs.mkdir(path.dirname(LOCAL_STORAGE_PATH), { recursive: true })
  const temporaryPath = `${LOCAL_STORAGE_PATH}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(applications.slice(0, MAX_APPLICATIONS), null, 2), "utf8")
    await fs.rename(temporaryPath, LOCAL_STORAGE_PATH)
  } catch {
    await fs.rm(temporaryPath, { force: true })
    throw new ApiError(500, "Não foi possível salvar as solicitações locais.")
  }
}

async function addApplication (application, storage) {
  if (storage === "kv") {
    const [length] = await kvPipeline([["LLEN", PENDING_KEY]])
    if (Number(length) >= MAX_APPLICATIONS) {
      throw new ApiError(429, "A fila de solicitações está cheia. Tente novamente mais tarde.")
    }
    await kvPipeline([
      ["LPUSH", PENDING_KEY, JSON.stringify(application)]
    ])
    return
  }
  const applications = await readLocalApplications()
  if (applications.length >= MAX_APPLICATIONS) {
    throw new ApiError(429, "A fila de solicitações está cheia. Tente novamente mais tarde.")
  }
  applications.unshift(application)
  await writeLocalApplications(applications)
}

async function removeApplication (id, storage) {
  if (storage === "kv") {
    const [values] = await kvPipeline([["LRANGE", PENDING_KEY, "0", String(MAX_APPLICATIONS - 1)]])
    if (!Array.isArray(values)) { return false }
    const storedValue = values.find((value) => {
      try {
        return JSON.parse(value).id === id
      } catch {
        return false
      }
    })
    if (!storedValue) { return false }
    const [removed] = await kvPipeline([["LREM", PENDING_KEY, "1", storedValue]])
    return Number(removed) > 0
  }

  const applications = await readLocalApplications()
  const index = applications.findIndex((application) => application.id === id)
  if (index === -1) { return false }
  applications.splice(index, 1)
  await writeLocalApplications(applications)
  return true
}

async function handler (request, response) {
  let storage
  try {
    storage = storageType()
  } catch (error) {
    sendJson(response, error.statusCode || 503, { error: error.message || "O armazenamento não está configurado." })
    return
  }

  if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST, PATCH, DELETE")
    sendJson(response, 405, { error: "Este endpoint aceita somente GET, POST, PATCH e DELETE." })
    return
  }

  if (request.method === "GET") {
    if (!isAdminRequest(request)) {
      sendUnauthorized(response)
      return
    }
    try {
      const solicitacoes = storage === "kv" ? await readKvApplications() : await readLocalApplications()
      sendJson(response, 200, { solicitacoes })
    } catch (error) {
      sendJson(response, error.statusCode || 500, { error: error.message || "Não foi possível listar as solicitações." })
    }
    return
  }

  if (request.method === "POST") {
    try {
      const application = validateApplication(await readJsonBody(request))
      await addApplication(application, storage)
      sendJson(response, 201, { solicitacao: { id: application.id, createdAt: application.createdAt } })
    } catch (error) {
      sendJson(response, error.statusCode || 500, { error: error.message || "Não foi possível enviar a solicitação." })
    }
    return
  }

  if (!isAdminRequest(request)) {
    sendUnauthorized(response)
    return
  }

  if (request.method === "PATCH") {
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { error: "Requisição bloqueada por política de mesma origem." })
      return
    }
    try {
      const body = await readJsonBody(request)
      const id = boundedText(body && body.id, "id", 128, "")
      if (!id) { throw new ApiError(400, "Informe a solicitação que deseja autorizar.") }
      const applications = storage === "kv" ? await readKvApplications() : await readLocalApplications()
      const application = applications.find((item) => item.id === id)
      if (!application) { throw new ApiError(404, "Esta solicitação não foi encontrada ou já foi processada.") }

      const vaga = await publishApplication(application)
      await removeApplication(id, storage)
      sendJson(response, 200, { publicada: true, vaga })
    } catch (error) {
      sendJson(response, error.statusCode || 500, { error: error.message || "Não foi possível publicar a vaga." })
    }
    return
  }

  if (request.method === "DELETE") {
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { error: "Requisição bloqueada por política de mesma origem." })
      return
    }
    try {
      const body = await readJsonBody(request)
      const id = boundedText(body && body.id, "id", 128, "")
      if (!id) { throw new ApiError(400, "Informe a solicitação que deseja recusar.") }
      const removed = await removeApplication(id, storage)
      if (!removed) { throw new ApiError(404, "Esta solicitação não foi encontrada ou já foi processada.") }
      sendJson(response, 200, { recusada: true, id })
    } catch (error) {
      sendJson(response, error.statusCode || 500, { error: error.message || "Não foi possível recusar a solicitação." })
    }
  }
}

module.exports = handler
module.exports.validateApplication = validateApplication
