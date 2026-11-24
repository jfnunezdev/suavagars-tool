const test = require("node:test")
const assert = require("node:assert/strict")

const share = require("../lib/share")
const push = require("../lib/web-push")
const pushConfig = require("../api/push-config")

function fakeResponse () {
  return {
    statusCode: null,
    headers: {},
    setHeader (key, value) { this.headers[key] = value },
    end (body) { this.body = body }
  }
}

test("buildPermalink uses the site origin and encodes the vacancy id", function () {
  assert.equal(share.buildPermalink("https://suavagars.com.br/", "abc 123&"), "https://suavagars.com.br/vagas.html?vaga=abc%20123%26")
  assert.equal(share.buildPermalink("", "id"), "/vagas.html?vaga=id")
})

test("parseVagaId reads only the vaga query param", function () {
  assert.equal(share.parseVagaId("?foo=1&vaga=abc%20123"), "abc 123")
  assert.equal(share.parseVagaId("?vaga="), "")
  assert.equal(share.parseVagaId(""), "")
})

test("buildShareUrl opens the WhatsApp contact picker with the attribution", function () {
  const url = share.buildShareUrl({ id: "v1", role: "Analista", company: "Empresa & Filha", city: "Caxias do Sul - RS" }, "https://suavagars.com.br")
  assert.match(url, /^https:\/\/api\.whatsapp\.com\/send\?text=/)
  const text = decodeURIComponent(url.split("?text=")[1])
  assert.match(text, /Vaga: Analista/)
  assert.match(text, /Empresa: Empresa & Filha/)
  assert.match(text, /https:\/\/suavagars\.com\.br\/vagas\.html\?vaga=v1/)
  assert.match(text, /Divulgado por Sua Vaga RS - suavagars\.com\.br/)
  assert.ok(text.length <= 1200)
})

test("buildShareUrl falls back when vacancy data is missing", function () {
  const url = share.buildShareUrl(null, "https://suavagars.com.br")
  const text = decodeURIComponent(url.split("?text=")[1])
  assert.match(text, /Vaga: Vaga de emprego/)
  assert.match(text, /\/vagas\.html\?vaga=/)
})

test("push payload keeps the admin identity and bounded text", function () {
  const payload = JSON.parse(push.buildPayload({ role: "Cargo ".repeat(100), company: "Empresa", city: "Caxias do Sul - RS" }))
  assert.equal(payload.title, "NOVA VAGA!")
  assert.equal(payload.icon, "/admin/icon-192.png")
  assert.equal(payload.badge, "/admin/icon-192.png")
  assert.equal(payload.tag, "svrs-new-application")
  assert.deepEqual(payload.data, { url: "/admin/" })
  assert.deepEqual(payload.vibrate, [200, 100, 200])
  assert.ok(payload.body.length <= 3000)
  assert.match(payload.body, /Nova solicitação:/)
})

test("push config exposes only the public VAPID key", function () {
  const original = process.env.VAPID_PUBLIC_KEY
  process.env.VAPID_PUBLIC_KEY = "public-key"
  try {
    const response = fakeResponse()
    pushConfig({ method: "GET" }, response)
    assert.equal(response.statusCode, 200)
    assert.deepEqual(JSON.parse(response.body), { publicKey: "public-key", enabled: true })
    assert.equal(response.headers["Cache-Control"], "no-store")
    const rejected = fakeResponse()
    pushConfig({ method: "POST" }, rejected)
    assert.equal(rejected.statusCode, 405)
  } finally {
    if (original === undefined) { delete process.env.VAPID_PUBLIC_KEY } else { process.env.VAPID_PUBLIC_KEY = original }
  }
})
