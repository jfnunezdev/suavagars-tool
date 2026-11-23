"use strict"

const dns = require("node:dns").promises
const http = require("node:http")
const https = require("node:https")
const net = require("node:net")

const REQUEST_TIMEOUT_MS = 9000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3

class HttpError extends Error {
  constructor (statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function isBlockedIpv4 (address) {
  const octets = address.split(".").map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }
  const [a, b] = octets
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
}

function ipv6Groups (address) {
  let value = address.toLowerCase()
  if (value.includes(".")) {
    const splitAt = value.lastIndexOf(":")
    const ipv4 = value.slice(splitAt + 1)
    if (net.isIP(ipv4) !== 4) { return null }
    const bytes = ipv4.split(".").map(Number)
    value = value.slice(0, splitAt) + ":" +
      ((bytes[0] << 8) | bytes[1]).toString(16) + ":" +
      ((bytes[2] << 8) | bytes[3]).toString(16)
  }
  const halves = value.split("::")
  if (halves.length > 2) { return null }
  const left = halves[0] ? halves[0].split(":") : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || missing < 0) { return null }
  const groups = left.concat(Array(missing).fill("0"), right).map((part) => parseInt(part || "0", 16))
  return groups.length === 8 && groups.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? groups
    : null
}

function isBlockedAddress (address) {
  const family = net.isIP(address)
  if (family === 4) { return isBlockedIpv4(address) }
  if (family !== 6) { return true }

  const groups = ipv6Groups(address)
  if (!groups) { return true }
  const first = groups[0]
  const second = groups[1]
  const isGlobalUnicast = first >= 0x2000 && first <= 0x3fff
  const isDocumentation = (first === 0x2001 && second <= 0x01ff) ||
    (first === 0x3fff && (second & 0xf000) === 0)
  return !isGlobalUnicast || isDocumentation || first === 0x2002
}

function normalizedHostname (hostname) {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase()
}

async function resolvePublicAddress (hostname) {
  const host = normalizedHostname(hostname)
  if (!host || host === "localhost" || /\.(?:localhost|local|internal|test|invalid|example)$/.test(host)) {
    throw new HttpError(400, "Só é possível consultar endereços públicos.")
  }

  const literalFamily = net.isIP(host)
  if (literalFamily) {
    if (isBlockedAddress(host)) { throw new HttpError(400, "Só é possível consultar endereços públicos.") }
    return { address: host, family: literalFamily }
  }

  let addresses
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new HttpError(502, "Não foi possível localizar o servidor do portal.")
  }
  if (!addresses.length || addresses.some((item) => isBlockedAddress(item.address))) {
    throw new HttpError(400, "O endereço informado não aponta somente para servidores públicos.")
  }
  return addresses[0]
}

function withTimeout (promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new HttpError(504, "O servidor do portal demorou demais para responder.")), timeoutMs)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

function requestPage (url, resolvedAddress, timeoutMs) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80))
    const options = {
      protocol: url.protocol,
      hostname: normalizedHostname(url.hostname),
      port,
      method: "GET",
      path: url.pathname + url.search,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "identity",
        Connection: "close"
      },
      lookup (host, lookupOptions, callback) {
        if (lookupOptions && lookupOptions.all) {
          callback(null, [{ address: resolvedAddress.address, family: resolvedAddress.family }])
          return
        }
        callback(null, resolvedAddress.address, resolvedAddress.family)
      }
    }

    const request = transport.request(url, options, (response) => {
      const statusCode = response.statusCode || 502
      const headers = response.headers
      if (statusCode >= 300 && statusCode < 400) {
        response.resume()
        resolve({ statusCode, headers, body: "" })
        return
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        resolve({ statusCode, headers, body: "" })
        return
      }

      const contentLength = Number(headers["content-length"] || 0)
      if (contentLength > MAX_RESPONSE_BYTES) {
        response.destroy()
        reject(new HttpError(502, "A página do portal é grande demais para ser processada."))
        return
      }

      const chunks = []
      let totalBytes = 0
      response.on("data", (chunk) => {
        totalBytes += chunk.length
        if (totalBytes > MAX_RESPONSE_BYTES) {
          response.destroy(new HttpError(502, "A página do portal é grande demais para ser processada."))
          return
        }
        chunks.push(chunk)
      })
      response.on("end", () => {
        resolve({ statusCode, headers, body: Buffer.concat(chunks).toString("utf8") })
      })
      response.on("error", reject)
    })

    const timer = setTimeout(() => request.destroy(new HttpError(504, "O servidor do portal demorou demais para responder.")), timeoutMs)
    request.on("close", () => clearTimeout(timer))
    request.setTimeout(timeoutMs, () => request.destroy(new HttpError(504, "O servidor do portal demorou demais para responder.")))
    request.on("error", reject)
    request.end()
  })
}

async function fetchPage (startUrl) {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS
  let currentUrl = startUrl

  // Follow redirects hop by hop so every destination is validated before requesting it.
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) { throw new HttpError(504, "O servidor do portal demorou demais para responder.") }
    if (currentUrl.username || currentUrl.password) {
      throw new HttpError(400, "Links com credenciais embutidas não são aceitos.")
    }

    const expectedPort = currentUrl.protocol === "https:" ? 443 : 80
    if (currentUrl.port && Number(currentUrl.port) !== expectedPort) {
      throw new HttpError(400, "Só são aceitos links públicos nas portas padrão HTTP ou HTTPS.")
    }

    const address = await withTimeout(resolvePublicAddress(currentUrl.hostname), remaining)
    const response = await requestPage(currentUrl, address, Math.max(1, deadline - Date.now()))
    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers.location
      if (!location || redirects === MAX_REDIRECTS) {
        throw new HttpError(502, "O portal não concluiu o redirecionamento da página.")
      }
      currentUrl = new URL(location, currentUrl)
      if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
        throw new HttpError(400, "O portal redirecionou para um protocolo não permitido.")
      }
      continue
    }
    if (response.statusCode === 401 || response.statusCode === 403 || response.statusCode === 429) {
      throw new HttpError(502, `O portal limitou ou bloqueou a leitura automática (HTTP ${response.statusCode}).`)
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new HttpError(502, `O portal respondeu com HTTP ${response.statusCode}.`)
    }
    const encoding = String(response.headers["content-encoding"] || "").toLowerCase()
    if (encoding && encoding !== "identity") {
      throw new HttpError(502, "O portal retornou um formato de página que não pôde ser processado.")
    }
    const contentType = String(response.headers["content-type"] || "").toLowerCase()
    if (contentType && !/(?:text\/html|application\/xhtml\+xml|application\/xml)/.test(contentType)) {
      throw new HttpError(502, "O portal não retornou uma página HTML legível.")
    }
    return { html: response.body, source: currentUrl.href, finalUrl: currentUrl.href }
  }
  throw new HttpError(502, "Não foi possível acessar a página do portal.")
}

function decodeEntities (value) {
  const named = {
    aacute: "á",
    acirc: "â",
    agrave: "à",
    atilde: "ã",
    auml: "ä",
    ccedil: "ç",
    eacute: "é",
    ecirc: "ê",
    egrave: "è",
    euml: "ë",
    iacute: "í",
    icirc: "î",
    igrave: "ì",
    iuml: "ï",
    ntilde: "ñ",
    oacute: "ó",
    ocirc: "ô",
    ograve: "ò",
    otilde: "õ",
    ouml: "ö",
    uacute: "ú",
    ucirc: "û",
    ugrave: "ù",
    uuml: "ü",
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
    ndash: "–",
    mdash: "—",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“"
  }
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1].toLowerCase() === "x"
      const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
      try {
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
      } catch {
        return match
      }
    }
    const decoded = named[entity.toLowerCase()]
    if (!decoded) { return match }
    return /^[A-Z]/.test(entity) ? decoded.toUpperCase() : decoded
  })
}

function cleanText (value) {
  return decodeEntities(String(value || "")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/ul|\/ol|\/section|\/article|\/dt|\/dd|\/tr|\/td|\/th)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " "))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function cleanPageText (html) {
  const chromeClass = /<(?:div|section|ul|ol)\b(?=[^>]*\b(?:class|id)\s*=\s*["'][^"']*(?:navigation|nav(?:igation|bar)?|menu|footer|login|register|sign-?in|sign-?up|cookie|modal|breadcrumb|toolbar)[^"']*["'])[^>]*>[\s\S]*?<\/(?:div|section|ul|ol)\s*>/gi
  const withoutChrome = String(html || "")
    .replace(/<(head|title|script|style|noscript|svg|iframe|nav|footer|aside|form|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(?:input|select|textarea|option)\b[^>]*\/?>/gi, " ")
    .replace(chromeClass, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/ul|\/ol|\/section|\/article|\/dt|\/dd|\/tr|\/td|\/th)\b[^>]*>/gi, "\n")
  return cleanText(withoutChrome)
    .split(/\n/)
    .map((line) => line
      .replace(/\b(?:faça login|faca login|entrar na sua conta|cadastre-se|criar (?:uma )?conta|login|log in|sign in|sign up|register)\b[^|·•]*/gi, " ")
      .trim())
    .filter((line) => line && !/^(?:início|inicio|home|buscar vagas|sobre nós|sobre nos|ajuda|menu)$/i.test(line))
    .join("\n")
}

function cleanSectionText (value) {
  return cleanText(value)
    .replace(/\b(?:candidate-se|candidatar-se|inscreva-se|aplique agora|apply now|veja mais vagas|criar conta|entrar na sua conta|faça login|faca login|cadastre-se|login|register|sign in|sign up)\b[\s\S]*$/i, "")
    .replace(/[\s,;:|•–—-]+$/g, "")
    .replace(/\s+(?:e|ou|de|da|do|das|dos|para|com|por|que|a|o|as|os)$/i, "")
    .trim()
}

function cleanBenefitsText (value) {
  const lines = cleanText(value).split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/:\s*$/.test(line))
  return cleanSectionText(lines.join("; "))
}

function extractHtmlCandidates (html) {
  const headings = []
  const headingPattern = /<h[12]\b[^>]*>([\s\S]*?)<\/h[12]\s*>/gi
  let headingMatch
  while ((headingMatch = headingPattern.exec(html))) {
    const heading = cleanText(headingMatch[1])
    if (heading && !isTokenLike(heading)) { headings.push(heading) }
  }

  const containers = []
  const containerPattern = /<(main|article)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
  let containerMatch
  while ((containerMatch = containerPattern.exec(html))) { containers.push(containerMatch[0]) }
  const contentHtml = containers.length ? containers.join("\n") : html
  const contentText = cleanPageText(contentHtml)
  const items = []
  const paragraphs = []
  const itemPattern = /<(p|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi
  let itemMatch
  while ((itemMatch = itemPattern.exec(contentHtml))) {
    const rawItem = cleanText(itemMatch[2])
    if (/:\s*$/.test(rawItem)) { continue }
    const item = cleanSectionText(rawItem)
    if (item.length >= 4 && !isTokenLike(item) && !isErrorTitle(item)) {
      items.push(item)
      if (itemMatch[1].toLowerCase() === "p") { paragraphs.push(item) }
    }
  }
  return { headings, contentText, items, paragraphs }
}

function findItems (items, pattern) {
  return items.filter((item) => pattern.test(item)).slice(0, 8).join("; ")
}

function removeDuplicateRequirementText (requirements, activities, benefits) {
  const normalize = (value) => String(value || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
  const existing = new Set([normalize(activities), normalize(benefits)].filter(Boolean))
  const requirement = normalize(requirements)
  if (!requirement || existing.has(requirement)) { return "" }
  const parts = String(requirements).split(/[;\n]+/).map((part) => part.trim())
    .filter((part) => part && !existing.has(normalize(part)))
  return parts.join("; ")
}

function extractSalaryFromText (text) {
  const labeled = labeledSection(text, "salary")
  if (/R\$\s*[\d.]+|a combinar|sal[aá]rio compat[ií]vel|negoci[aá]vel/i.test(labeled)) { return labeled }
  const value = String(text || "").match(/(?:a partir de\s+|sal[aá]rio(?:\s+de)?\s*)?R\$\s*[\d.]+(?:,\d{2})?(?:\s*(?:a|até|–|—|-)\s*(?:R\$\s*)?[\d.]+(?:,\d{2})?)?/i)
  return value ? value[0].trim() : ""
}

function isPlausibleSchedule (value) {
  const normalized = cleanText(value).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
  if (!normalized) { return false }
  if (/\b(?:horario\s+comercial|horario\s+(?:flexivel|variavel|a combinar)|flexibilidade\s+de\s+horarios?|diurno|noturno)\b/.test(normalized) ||
      /\bflexivel\s+conforme\s+(?:a\s+)?(?:demanda|necessidade)\b/.test(normalized) ||
      /\bconforme\s+(?:a\s+)?(?:demanda|necessidade)(?:\s+de\s+(?:visitas|atendimento))?\b/.test(normalized) ||
      /\bturno(?:\s+(?:da|de|do)\s+)?(?:manha|tarde|noite|madrugada)\b/.test(normalized) ||
      /\b\d{1,2}\s*x\s*\d{1,2}\b/.test(normalized) ||
      /\bescala\s+(?:de\s+)?(?:trabalho|revezamento|rotativa|alternada|flexivel|a\s+combinar)\b/.test(normalized) ||
      /\b(?:segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)\s+(?:a|ate|[-–—])\s*(?:segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)\b/.test(normalized)) {
    return true
  }

  const ranges = /\b(?:das?\s*)?((?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)?)\s*(?:as|[-–—])\s*((?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)?)\b/gi
  let match
  while ((match = ranges.exec(normalized))) {
    if (/[h:]/i.test(match[1]) || /[h:]/i.test(match[2]) ||
        (match[1].length === 2 && match[2].length === 2)) { return true }
  }
  return false
}

function normalizeSchedule (value) {
  const cleaned = cleanText(value).replace(/\s+/g, " ")
  if (!cleaned || cleaned.length > 180) { return "" }
  if (/^hor[aá]rio\s+(?:comercial|flex[ií]vel|vari[aá]vel|a\s+combinar)\b/i.test(cleaned) &&
      isPlausibleSchedule(cleaned)) { return cleaned }
  const withoutLabel = cleaned.replace(/^(?:hor[aá]rio(?:\s+de\s+trabalho)?(?:\s*\/\s*turno)?|turno|jornada|work\s*hours)\s*[:\-–]?\s*/i, "")
  if (/^(?:hor[aá]rio(?:\s+de\s+trabalho)?|work\s*hours)\s*[:\-–]\s*/i.test(cleaned) &&
      isPlausibleSchedule(withoutLabel)) { return withoutLabel }
  if (isPlausibleSchedule(withoutLabel)) { return withoutLabel }
  if (isPlausibleSchedule(cleaned)) { return cleaned }
  return ""
}

function parseAttributes (tag) {
  const attributes = {}
  const content = tag.replace(/^<\s*[\w:-]+/, "").replace(/\/?>$/, "")
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let match
  while ((match = pattern.exec(content))) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] || match[3] || match[4] || "")
  }
  return attributes
}

function isErrorTitle (value) {
  const title = String(value || "").trim()
  return !title || /\b(?:401|403|404|500)\b/i.test(title) ||
    /access\s*denied|google\s*search|just\s+a\s+moment|redirecting|page\s+not\s+found|forbidden|captcha|cloudflare|temporarily\s+unavailable/i.test(title) ||
    /^(?:error|an?\s+error\s+occurred|something\s+went\s+wrong)(?:\b.*)?$/i.test(title)
}

function isTokenLike (value) {
  const text = String(value || "").trim()
  if (!text) { return false }
  if (/^[a-z0-9_-]{24,}$/i.test(text) && /[a-z]/.test(text) && /[A-Z]/.test(text)) { return true }
  const compact = text.replace(/[^a-z0-9]/gi, "")
  const digitCount = (compact.match(/\d/g) || []).length
  if (/^[a-z0-9]{16,}$/i.test(text) && /[a-z]/.test(text) && /[A-Z]/.test(text) && digitCount >= 2) { return true }
  const words = text.match(/[a-zÀ-ÿ]+/gi) || []
  return words.some((word) => {
    const normalized = word.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const vowelRatio = (normalized.match(/[aeiou]/g) || []).length / normalized.length
    return (normalized.length >= 20 && vowelRatio < 0.31) ||
      (normalized.length >= 28 && vowelRatio < 0.38) ||
      normalized.length >= 36
  })
}

function isJobPosting (value) {
  const type = value && value["@type"]
  return (Array.isArray(type) ? type : [type]).some((item) => String(item || "").toLowerCase() === "jobposting")
}

function collectJobPostings (value, results) {
  if (!value) { return }
  if (Array.isArray(value)) {
    value.forEach((item) => collectJobPostings(item, results))
    return
  }
  if (typeof value !== "object") { return }
  if (isJobPosting(value)) { results.push(value) }
  Object.keys(value).forEach((key) => {
    if (key !== "@context") { collectJobPostings(value[key], results) }
  })
}

function valueText (value) {
  if (value == null) { return "" }
  if (typeof value === "string" || typeof value === "number") { return cleanText(String(value)) }
  if (Array.isArray(value)) { return value.map(valueText).filter(Boolean).join("; ") }
  if (typeof value === "object") {
    return valueText(value.name || value.value || value.text || "")
  }
  return ""
}

function locationText (jobLocation) {
  const locations = Array.isArray(jobLocation) ? jobLocation : [jobLocation]
  for (const location of locations) {
    const address = location && (location.address || location)
    if (!address) { continue }
    if (typeof address === "string") { return cleanText(address) }
    const country = valueText(address.addressCountry)
    return [
      valueText(address.addressLocality),
      valueText(address.addressRegion),
      /^(?:br|brasil|brazil)$/i.test(country) ? "" : country
    ].filter(Boolean).join(" - ")
  }
  return ""
}

function salaryText (salary) {
  if (!salary) { return "" }
  if (typeof salary === "string" || typeof salary === "number") { return valueText(salary) }
  const currency = /^brl$/i.test(salary.currency || "") ? "R$" : (salary.currency || "R$")
  const value = salary.value
  if (value && typeof value === "object") {
    const low = value.minValue || value.value
    const high = value.maxValue
    const units = { HOUR: "hora", DAY: "dia", WEEK: "semana", MONTH: "mês", YEAR: "ano" }
    const unit = value.unitText
      ? " / " + (units[String(value.unitText).toUpperCase()] || String(value.unitText).toLowerCase())
      : ""
    if (low && high) { return `${currency} ${low} a ${high}${unit}` }
    if (low) { return `${currency} ${low}${unit}` }
    if (high) { return `${currency} ${high}${unit}` }
  }
  return value == null ? "" : `${currency} ${value}`
}

const FIELD_LABELS = {
  role: /^(?:cargo|vaga|título|titulo|posição|posicao)\s*[:\-–]?\s*(.*)$/i,
  company: /^(?:empresa|contratante|hiring organization)\s*[:\-–]?\s*(.*)$/i,
  city: /^(?:cidade|local|localidade|localização|localizacao)\s*[:\-–]?\s*(.*)$/i,
  salary: /^(?:salário|salario|faixa salarial|remuneração|remuneracao)\s*[:\-–]?\s*(.*)$/i,
  contractType: /^(?:tipo(?:\s+de\s+(?:contratação|contrato))?|regime|contratação|contratacao)\s*[:\-–]?\s*(.*)$/i,
  schedule: /^(?:horário(?:\s+de\s+trabalho)?(?:\s*\/\s*turno)?|horario(?:\s+de\s+trabalho)?(?:\s*\/\s*turno)?|turno|jornada|work hours)\s*[:\-–]?\s*(.*)$/i,
  activities: /^(?:atividades|responsabilidades|o que vai fazer|o que você fará|o que voce fara|principais atividades|descrição da vaga|descricao da vaga|descrição da oportunidade|descricao da oportunidade|job description)\s*[:\-–]?\s*(.*)$/i,
  benefits: /^(?:benef[ií]cios?(?:(?:\s+(?:e\s+vantagens|que\s+fazem\s+a\s+diferen[cç]a))|(?:\s+[^:]{1,60}:))?|o que voc[eê] recebe|o que oferecemos|benefits|job benefits)\s*[:\-–]?\s*(.*)$/i,
  requirements: /^(?:requisitos|pr[eé]-requisitos|qualifica[cç][oõ]es|o que precisa|o que buscamos|perfil(?:\s+desejado)?|perfil\s+[^:]{1,40}:|requirements|qualifications)\??\s*[:\-–]?\s*(.*)$/i
}

function labeledSection (text, field) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.replace(/^\s*[•✔✅\-–—]+\s*/, "").trim())
  const pattern = FIELD_LABELS[field]
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern)
    if (!match) { continue }
    const values = match[1] && !(field === "benefits" && /:\s*$/.test(match[1]))
      ? [match[1].trim()]
      : []
    const multiLine = ["activities", "benefits", "requirements"].includes(field)
    if (!multiLine && values.length) {
      return field === "schedule" ? normalizeSchedule(lines[index]) : values[0]
    }
    for (let next = index + 1; next < lines.length; next += 1) {
      if (/^(?:como se candidatar|candidate-se|candidatar-se|inscreva-se|aplique agora|apply now|sobre a empresa|etapas do processo|mais informa[cç][oõ]es|cadastre-se|fa[cç]a login|entrar na sua conta)\b/i.test(lines[next])) { break }
      if (field === "benefits" && /:\s*$/.test(lines[next])) { continue }
      const sameField = lines[next].match(pattern)
      if (sameField) {
        if (field === "schedule" && sameField[1]) { values.push(lines[next]) }
        if (multiLine && field !== "schedule" && sameField[1] && !(field === "benefits" && /:\s*$/.test(sameField[1]))) {
          values.push(sameField[1].trim())
        }
        if (multiLine && field !== "schedule") { continue }
        break
      }
      if (Object.values(FIELD_LABELS).some((label) => label.test(lines[next]))) { break }
      if (lines[next]) { values.push(lines[next]) }
    }
    const section = cleanSectionText(values.join("; "))
    return field === "schedule"
      ? normalizeSchedule([lines[index], section].filter(Boolean).join(" "))
      : section
  }
  return ""
}

function findCityInText (text) {
  const cities = [
    "aparecida de goiania", "goiania", "anapolis",
    "caxias do sul", "porto alegre", "santa maria", "novo hamburgo", "sao leopoldo",
    "rio grande", "passo fundo", "bento goncalves", "santa cruz do sul", "cachoeirinha",
    "alvorada", "gravatai", "canoas", "pelotas", "erechim", "lajeado", "ijui", "bage",
    "farroupilha", "sapiranga", "esteio", "santa rosa", "uruguaiana", "cruz alta",
    "carazinho", "vacaria", "tramandai", "torres", "sao borja", "venancio aires",
    "guaiba", "estancia velha", "campo bom", "taquara", "cachoeira do sul", "santo angelo",
    "frederico westphalen", "sao jose do norte", "sao gabriel", "tres passos", "marau",
    "capao da canoa", "charqueadas"
  ]
  const normalized = String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  for (const city of cities) {
    if (new RegExp(`\\b${city.replace(/ /g, "\\s+")}\\b`).test(normalized)) {
      const name = city === "goiania"
        ? "Goiânia"
        : city === "anapolis"
          ? "Anápolis"
          : city === "aparecida de goiania"
            ? "Aparecida de Goiânia"
            : city.split(" ").map((word, index) => {
              const smallWords = ["da", "de", "do", "das", "dos"]
              return index > 0 && smallWords.includes(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
            }).join(" ")
      return name + (["goiania", "anapolis", "aparecida de goiania"].includes(city) ? " - GO" : " - RS")
    }
  }
  return ""
}

function normalizeCityValue (value) {
  const city = cleanText(value)
  if (!city) { return "" }
  const normalized = city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const specific = findCityInText(city)
  if (specific) { return specific }
  const states = {
    go: "GO",
    goias: "GO",
    rs: "RS",
    "rio grande do sul": "RS",
    sp: "SP",
    "sao paulo": "SP",
    rj: "RJ",
    "rio de janeiro": "RJ",
    mg: "MG",
    "minas gerais": "MG",
    df: "DF",
    "distrito federal": "DF",
    pr: "PR",
    parana: "PR",
    sc: "SC",
    "santa catarina": "SC",
    ba: "BA",
    bahia: "BA",
    pe: "PE",
    pernambuco: "PE",
    ce: "CE",
    ceara: "CE",
    es: "ES",
    "espirito santo": "ES",
    ma: "MA",
    maranhao: "MA",
    mt: "MT",
    "mato grosso": "MT",
    ms: "MS",
    "mato grosso do sul": "MS",
    pa: "PA",
    para: "PA",
    pb: "PB",
    paraiba: "PB",
    pi: "PI",
    piaui: "PI",
    rn: "RN",
    "rio grande do norte": "RN",
    ro: "RO",
    rondonia: "RO",
    rr: "RR",
    roraima: "RR",
    ac: "AC",
    acre: "AC",
    al: "AL",
    alagoas: "AL",
    ap: "AP",
    amapa: "AP",
    am: "AM",
    amazonas: "AM",
    se: "SE",
    sergipe: "SE",
    to: "TO",
    tocantins: "TO"
  }
  const parts = normalized.split(/\s*[-,/]\s*/)
  if (parts.length > 1 && states[parts[parts.length - 1]]) {
    return `${titleLocation(city.split(/\s*[-,/]\s*/)[0])} - ${states[parts[parts.length - 1]]}`
  }
  if (states[normalized]) { return city }
  return city
}

function titleLocation (value) {
  return value.split(/\s+/).map((word, index) => {
    const lower = word.toLowerCase()
    return index > 0 && ["da", "de", "do", "das", "dos", "e"].includes(lower)
      ? lower
      : lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1)
  }).join(" ")
}

function isStateOnlyLocation (value) {
  const normalized = cleanText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return /^(?:goias(?:\s*-\s*go)?|go|rio grande do sul(?:\s*-\s*rs)?|rs|sao paulo(?:\s*-\s*sp)?|sp|rio de janeiro(?:\s*-\s*rj)?|rj|minas gerais(?:\s*-\s*mg)?|mg|distrito federal(?:\s*-\s*df)?|df)$/.test(normalized)
}

function normalizeContractType (value) {
  const type = String(value || "").toLowerCase()
  if (/tempor/.test(type)) { return "Temporário" }
  if (/estágio|estagio|internship/.test(type)) { return "Estágio" }
  if (/aut[oô]nom[oa]|self.?employed|freelancer/.test(type)) { return "Autônomo" }
  if (/\bpj\b/.test(type)) { return "PJ" }
  if (/diarista|per diem/.test(type)) { return "Diarista" }
  if (/full.?time/.test(type)) { return "Tempo integral" }
  if (/part.?time/.test(type)) { return "Meio período" }
  if (/contractor/.test(type)) { return "Contrato" }
  if (/volunteer/.test(type)) { return "Voluntário" }
  if (/clt|efetivo/.test(type)) { return "CLT (Efetivo)" }
  if (/a combinar|unspecified/.test(type)) { return "A combinar" }
  return valueText(value)
}

function titleIsUsable (value) {
  const title = cleanText(value)
  if (isErrorTitle(title) || isTokenLike(title)) { return false }
  const normalized = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return !/^(?:vaga|vagas|emprego|empregos|job|jobs|career|careers|oportunidade|oportunidades|google search|linkedin|catho|indeed|gupy|infojobs|resultados da busca|busca de vagas|vagas de emprego|sobre a vaga|sobre a empresa|descri[cç][aã]o da vaga|atividades|benef[ií]cios?|requisitos|qualifica[cç][oõ]es?|candidate-se|como se candidatar)$/i.test(normalized)
}

function extractPage (html, source) {
  const result = {
    title: "",
    company: "",
    city: "",
    model: "",
    salary: "",
    contractType: "",
    schedule: "",
    activities: "",
    benefits: "",
    requirements: "",
    source
  }
  const postings = []
  const scriptPattern = /<script\b(?=[^>]*\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json))[^>]*>([\s\S]*?)<\/script\s*>/gi
  let scriptMatch
  while ((scriptMatch = scriptPattern.exec(html))) {
    try {
      collectJobPostings(JSON.parse(scriptMatch[1]), postings)
    } catch {
      // Other structured data and visible text are still parsed below.
    }
  }
  const job = postings[0]
  const jobDescription = job ? cleanPageText(job.description) : ""
  if (job) {
    result.title = valueText(job.title)
    result.company = valueText(job.hiringOrganization && job.hiringOrganization.name)
    result.city = locationText(job.jobLocation || job.applicantLocationRequirements)
    result.model = /telecommute/i.test(valueText(job.jobLocationType)) ? "Remoto" : ""
    result.salary = salaryText(job.baseSalary)
    result.contractType = normalizeContractType(job.employmentType)
    result.schedule = valueText(job.workHours)
    result.activities = valueText(job.responsibilities) ||
      labeledSection(jobDescription, "activities")
    result.benefits = valueText(job.jobBenefits) || labeledSection(jobDescription, "benefits")
    result.requirements = [
      job.qualifications, job.skills, job.educationRequirements, job.experienceRequirements
    ].map(valueText).filter(Boolean).join("; ") || labeledSection(jobDescription, "requirements")
  }

  const meta = {}
  const metaPattern = /<meta\b[^>]*>/gi
  let metaMatch
  while ((metaMatch = metaPattern.exec(html))) {
    const attributes = parseAttributes(metaMatch[0])
    const key = String(attributes.name || attributes.property || "").toLowerCase()
    if (key && attributes.content) { meta[key] = attributes.content }
  }
  const pageTitleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)
  const titleMeta = meta["job:title"] || meta["og:title"] || meta["twitter:title"] ||
    (pageTitleMatch && cleanText(pageTitleMatch[1])) || ""
  const htmlCandidates = extractHtmlCandidates(html)
  if (!titleIsUsable(result.title)) {
    const titleCandidate = [titleMeta].concat(htmlCandidates.headings)
      .find((candidate) => titleIsUsable(candidate))
    if (titleCandidate) { result.title = cleanText(titleCandidate) }
  }

  const metaFields = {
    "job:company": "company",
    company: "company",
    "job:location": "city",
    location: "city",
    "job:location_type": "model",
    workstyle: "model",
    "job:salary": "salary",
    salary: "salary",
    "job:employment_type": "contractType",
    employmenttype: "contractType",
    "job:work_hours": "schedule",
    workhours: "schedule",
    "job:responsibilities": "activities",
    responsibilities: "activities",
    "job:benefits": "benefits",
    benefits: "benefits",
    "job:qualifications": "requirements",
    qualifications: "requirements"
  }
  Object.keys(metaFields).forEach((key) => {
    const field = metaFields[key]
    if (!result[field] && meta[key]) { result[field] = cleanText(meta[key]) }
  })

  const description = [meta.description, meta["og:description"], meta["twitter:description"]]
    .filter(Boolean).map(cleanPageText).join("\n")
  const visible = cleanPageText(html)
  const text = `${description}\n${htmlCandidates.contentText}\n${visible}`

  Object.keys(FIELD_LABELS).forEach((field) => {
    if (!result[field]) { result[field] = labeledSection(text, field) }
  })
  if (!result.company && result.title) {
    const titleParts = result.title.split(/\s+[|–—-]\s+/).map((part) => part.trim()).filter(Boolean)
    const companyCandidate = titleParts.slice(1).join(" - ")
      .replace(/\s*[|–—-]\s*(?:Catho|Indeed|Gupy|InfoJobs|LinkedIn|Google Jobs).*$/i, "").trim()
    if (titleParts.length > 1 && titleIsUsable(titleParts[0]) &&
        !findCityInText(companyCandidate) && !isTokenLike(companyCandidate) &&
        !/^(?:catho|indeed|gupy|infojobs|linkedin|google(?: jobs)?|instagram)$/i.test(companyCandidate)) {
      result.company = companyCandidate
    }
  }
  if (!result.activities) {
    const activityItems = (htmlCandidates.paragraphs.length
      ? htmlCandidates.paragraphs
      : htmlCandidates.items).filter((item) =>
      !Object.values(FIELD_LABELS).some((label) => label.test(item)) &&
        !/\b(?:benef[ií]cios?|requisitos|qualifica[cç][oõ]es|sal[aá]rio|R\$|vale[- ]refei[cç][aã]o|plano de sa[uú]de)\b/i.test(item))
    result.activities = labeledSection(htmlCandidates.contentText, "activities") ||
      labeledSection(jobDescription, "activities") ||
      cleanSectionText(jobDescription) ||
      cleanSectionText(activityItems.slice(0, 8).join("; "))
  }
  if (!result.benefits) {
    result.benefits = findItems(htmlCandidates.items,
      /\b(?:benef[ií]cios?|vale[- ](?:refei[cç][aã]o|alimenta[cç][aã]o|transporte)|plano de sa[uú]de|assist[eê]ncia m[eé]dica|seguro de vida|comiss[aã]o|b[oô]nus|aux[ií]lio)\b/i)
  }
  if (!result.requirements) {
    result.requirements = findItems(htmlCandidates.items,
      /\b(?:requisitos?|qualifica[cç][oõ]es?|experi[eê]ncia|ensino (?:m[eé]dio|superior)|CNH|disponibilidade|conhecimento)\b/i)
  }
  if (!result.model) {
    const modelMatch = text.match(/\b(remoto|híbrido|hibrido|presencial)\b/i)
    if (modelMatch) { result.model = modelMatch[1].charAt(0).toUpperCase() + modelMatch[1].slice(1).toLowerCase() }
  }
  const salaryFromText = extractSalaryFromText(text)
  if (salaryFromText) { result.salary = salaryFromText }
  if (!result.contractType) {
    result.contractType = normalizeContractType((text.match(/\b(?:CLT|efetivo|aut[oô]nomo|aut[oô]noma|temporário|estágio|PJ|diarista|full.?time|part.?time)\b/i) || [""])[0])
  } else {
    result.contractType = normalizeContractType(result.contractType)
  }
  if (!result.schedule) {
    const scheduleMatch = text.match(/(?:horário|turno|jornada)\s*[:-]?\s*([^.;\n]+)/i)
    result.schedule = scheduleMatch ? normalizeSchedule(scheduleMatch[0]) : ""
  }
  result.schedule = normalizeSchedule(result.schedule)
  if (!result.city) {
    const cityMatch = text.match(/(?:cidade|local|localidade)\s*[:\-–]\s*([^.\n;]+)/i)
    if (cityMatch) { result.city = cityMatch[1].trim() }
  }
  const cityFromText = findCityInText(`${text}\n${jobDescription}`)
  if (cityFromText && (!result.city || isStateOnlyLocation(result.city))) { result.city = cityFromText }
  result.city = normalizeCityValue(result.city)
  result.benefits = cleanBenefitsText(result.benefits)
  result.requirements = removeDuplicateRequirementText(result.requirements, result.activities, result.benefits)

  if (!titleIsUsable(result.title)) { result.title = "" }

  for (const field of ["title", "company", "city", "model", "salary", "contractType", "schedule", "activities", "benefits", "requirements"]) {
    const value = cleanText(result[field])
    result[field] = isTokenLike(value)
      ? ""
      : value.slice(0, field === "activities" || field === "requirements" || field === "benefits" ? 5000 : 500)
  }
  result.descriptionText = cleanSectionText(htmlCandidates.contentText || description).slice(0, 5000)
  result.source = source
  return result
}

function sendJson (response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store")
  response.end(JSON.stringify(payload))
}

async function handler (request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET")
    sendJson(response, 405, { error: "Este endpoint aceita somente GET." })
    return
  }

  let targetUrl
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`)
    const rawUrl = requestUrl.searchParams.get("url")
    if (!rawUrl || rawUrl.length > 2048) {
      sendJson(response, 400, { error: "Informe um link público de vaga válido no parâmetro url." })
      return
    }
    targetUrl = new URL(rawUrl)
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      sendJson(response, 400, { error: "O link da vaga precisa começar com http:// ou https://." })
      return
    }
    if (targetUrl.username || targetUrl.password) {
      sendJson(response, 400, { error: "Links com credenciais embutidas não são aceitos." })
      return
    }
  } catch {
    sendJson(response, 400, { error: "O link da vaga informado não é válido." })
    return
  }

  try {
    const page = await fetchPage(targetUrl)
    const data = extractPage(page.html, page.finalUrl)
    data.finalUrl = page.finalUrl
    sendJson(response, 200, data)
  } catch (error) {
    const statusCode = error.statusCode || 502
    sendJson(response, statusCode, {
      error: error.message || "Não foi possível ler a página do portal.",
      source: targetUrl.href
    })
  }
}

module.exports = handler
module.exports.extractPage = extractPage
