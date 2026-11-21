"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { isAdminRequest, sendUnauthorized } = require("../lib/admin-auth");

const MAX_BODY_BYTES = 16 * 1024;
const MAX_VACANCIES = 100;
const STORAGE_KEY = "suavagars:vagas";
const LOCAL_STORAGE_PATH = path.join(__dirname, "..", "data", "vagas.json");

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function usesVercel() {
  return process.env.VERCEL === "1";
}

function hasKvConfiguration() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function readJsonBody(request) {
  if (request.body !== undefined) {
    if (typeof request.body === "object" && request.body !== null && !Buffer.isBuffer(request.body)) {
      if (Buffer.byteLength(JSON.stringify(request.body)) > MAX_BODY_BYTES) {
        throw new ApiError(413, "Os dados enviados excedem o limite permitido.");
      }
      return request.body;
    }
    if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
      const body = Buffer.isBuffer(request.body) ? request.body.toString("utf8") : request.body;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new ApiError(413, "Os dados enviados excedem o limite permitido.");
      try {
        return JSON.parse(body);
      } catch {
        throw new ApiError(400, "O corpo da requisição não contém JSON válido.");
      }
    }
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) throw new ApiError(413, "Os dados enviados excedem o limite permitido.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "O corpo da requisição não contém JSON válido.");
  }
}

function boundedText(value, field, maxLength, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") throw new ApiError(400, `O campo ${field} precisa ser texto.`);
  const text = value.trim();
  if (text.length > maxLength) throw new ApiError(400, `O campo ${field} excede o tamanho permitido.`);
  return text || fallback;
}

function validateVacancy(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Envie os dados da vaga em formato JSON.");
  }
  const role = boundedText(body.role, "cargo", 160, "");
  if (!role) throw new ApiError(400, "Informe o cargo antes de adicionar a vaga.");

  const rawLink = boundedText(body.link, "link", 2048, "");
  let link;
  try {
    const url = new URL(rawLink);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      throw new Error("invalid link");
    }
    link = url.href;
  } catch {
    throw new ApiError(400, "Informe um link público HTTP ou HTTPS para a vaga.");
  }

  return {
    id: randomUUID(),
    role,
    company: boundedText(body.company, "empresa", 160, "A consultar"),
    city: boundedText(body.city, "cidade", 120, "A consultar"),
    salary: boundedText(body.salary, "salário", 120, "A consultar"),
    contractType: boundedText(body.contractType, "tipo", 100, "A consultar"),
    link,
    createdAt: new Date().toISOString()
  };
}

async function kvPipeline(commands) {
  const baseUrl = process.env.KV_REST_API_URL.replace(/\/+$/, "");
  let response;
  try {
    response = await fetch(`${baseUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commands)
    });
  } catch {
    throw new ApiError(502, "Não foi possível acessar o armazenamento de vagas.");
  }

  let results;
  try {
    results = await response.json();
  } catch {
    throw new ApiError(502, "O armazenamento retornou uma resposta inválida.");
  }
  if (!response.ok || !Array.isArray(results)) {
    throw new ApiError(502, "O armazenamento não conseguiu processar a operação.");
  }
  const failure = results.find((result) => result && result.error);
  if (failure) throw new ApiError(502, "O armazenamento não conseguiu processar a operação.");
  return results.map((result) => result && result.result);
}

async function readKvVacancies() {
  const [values] = await kvPipeline([["LRANGE", STORAGE_KEY, "0", String(MAX_VACANCIES - 1)]]);
  if (!Array.isArray(values)) return [];
  return values.map((value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

async function writeKvVacancy(vacancy) {
  await kvPipeline([
    ["LPUSH", STORAGE_KEY, JSON.stringify(vacancy)],
    ["LTRIM", STORAGE_KEY, "0", String(MAX_VACANCIES - 1)]
  ]);
}

async function deleteKvVacancy(id) {
  const [values] = await kvPipeline([["LRANGE", STORAGE_KEY, "0", String(MAX_VACANCIES - 1)]]);
  if (!Array.isArray(values)) return false;
  const storedValue = values.find((value) => {
    try {
      return JSON.parse(value).id === id;
    } catch {
      return false;
    }
  });
  if (!storedValue) return false;
  const [removed] = await kvPipeline([["LREM", STORAGE_KEY, "1", storedValue]]);
  return Number(removed) > 0;
}

function assertStorageAvailable() {
  if (hasKvConfiguration()) return "kv";
  if (usesVercel()) {
    throw new ApiError(503, "Configure KV_REST_API_URL e KV_REST_API_TOKEN na Vercel para habilitar o armazenamento persistente.");
  }
  return "local";
}

async function readLocalVacancies() {
  try {
    const content = await fs.readFile(LOCAL_STORAGE_PATH, "utf8");
    const vacancies = JSON.parse(content);
    if (!Array.isArray(vacancies)) throw new Error("Invalid vacancy storage");
    return vacancies.slice(0, MAX_VACANCIES);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new ApiError(500, "Não foi possível ler o arquivo local de vagas.");
  }
}

async function writeLocalVacancies(vacancies) {
  const directory = path.dirname(LOCAL_STORAGE_PATH);
  await fs.mkdir(directory, { recursive: true });
  const temporaryPath = `${LOCAL_STORAGE_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(vacancies.slice(0, MAX_VACANCIES), null, 2), "utf8");
    await fs.rename(temporaryPath, LOCAL_STORAGE_PATH);
  } catch {
    await fs.rm(temporaryPath, { force: true });
    throw new ApiError(500, "Não foi possível salvar a vaga localmente.");
  }
}

async function writeLocalVacancy(vacancy) {
  const vacancies = await readLocalVacancies();
  vacancies.unshift(vacancy);
  await writeLocalVacancies(vacancies);
}

async function deleteLocalVacancy(id) {
  const vacancies = await readLocalVacancies();
  const index = vacancies.findIndex((vacancy) => vacancy.id === id);
  if (index === -1) return false;
  vacancies.splice(index, 1);
  await writeLocalVacancies(vacancies);
  return true;
}

async function publishApplication(application) {
  const storage = assertStorageAvailable();
  const vacancy = validateVacancy(application);
  vacancy.applicationId = boundedText(application.id, "solicitação", 128, "");
  if (!vacancy.applicationId) throw new ApiError(400, "A solicitação não tem um identificador válido.");

  const existing = storage === "kv" ? await readKvVacancies() : await readLocalVacancies();
  const alreadyPublished = existing.find((item) => item.applicationId === vacancy.applicationId);
  if (alreadyPublished) return alreadyPublished;

  if (storage === "kv") await writeKvVacancy(vacancy);
  else await writeLocalVacancy(vacancy);
  return vacancy;
}

async function handler(request, response) {
  let storage;
  try {
    storage = assertStorageAvailable();
  } catch (error) {
    sendJson(response, error.statusCode || 503, { error: error.message || "O armazenamento de vagas não está configurado." });
    return;
  }
  if (request.method === "GET") {
    try {
      const vagas = storage === "kv" ? await readKvVacancies() : await readLocalVacancies();
      sendJson(response, 200, { vagas });
    } catch (error) {
      sendJson(response, error.statusCode || 500, { error: error.message || "Não foi possível listar as vagas." });
    }
    return;
  }

  if (request.method !== "DELETE" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, DELETE");
    sendJson(response, 405, { error: "Este endpoint aceita somente GET, POST e DELETE." });
    return;
  }
  if (!isAdminRequest(request)) {
    sendUnauthorized(response);
    return;
  }

  if (request.method === "DELETE") {
    try {
      const body = await readJsonBody(request);
      const id = boundedText(body && body.id, "id", 128, "");
      if (!id) throw new ApiError(400, "Informe o identificador da vaga.");
      const deleted = storage === "kv" ? await deleteKvVacancy(id) : await deleteLocalVacancy(id);
      if (!deleted) throw new ApiError(404, "Esta vaga não foi encontrada ou já foi apagada.");
      sendJson(response, 200, { deleted: true, id });
    } catch (error) {
      sendJson(response, error.statusCode || 500, { error: error.message || "Não foi possível apagar a vaga." });
    }
    return;
  }

  try {
    const vacancy = validateVacancy(await readJsonBody(request));
    if (storage === "kv") await writeKvVacancy(vacancy);
    else await writeLocalVacancy(vacancy);
    sendJson(response, 201, { vaga: vacancy });
  } catch (error) {
    sendJson(response, error.statusCode || 500, { error: error.message || "Não foi possível salvar a vaga." });
  }
}

module.exports = handler;
module.exports.validateVacancy = validateVacancy;
module.exports.publishApplication = publishApplication;
