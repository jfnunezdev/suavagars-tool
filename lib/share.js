;(function (root) {
  "use strict"

  function bounded (value, maxLength, fallback) {
    const text = String(value == null ? "" : value).trim()
    return text ? text.slice(0, maxLength) : fallback
  }

  function parseVagaId (search) {
    const value = new URLSearchParams(String(search || "")).get("vaga")
    return value && value.trim() ? value.trim().slice(0, 128) : ""
  }

  function buildPermalink (origin, id) {
    const base = String(origin || "").replace(/\/+$/, "")
    return `${base}/vagas.html?vaga=${encodeURIComponent(String(id || ""))}`
  }

  function buildShareUrl (vacancy, origin) {
    const item = vacancy && typeof vacancy === "object" ? vacancy : {}
    const role = bounded(item.role, 120, "Vaga de emprego")
    const company = bounded(item.company, 120, "")
    const city = bounded(item.city, 80, "")
    const lines = [`Vaga: ${role}`]
    if (company) { lines.push(`Empresa: ${company}`) }
    if (city) { lines.push(`Cidade: ${city}`) }
    lines.push(buildPermalink(origin, item.id))
    lines.push("Divulgado por Sua Vaga RS - suavagars.com.br")
    const message = lines.join("\n").slice(0, 1200)
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`
  }

  const api = { buildPermalink, buildShareUrl, parseVagaId }

  if (typeof module === "object" && module.exports) { module.exports = api }
  if (root) { root.SVRSShare = api }
})(typeof globalThis !== "undefined" ? globalThis : this)
