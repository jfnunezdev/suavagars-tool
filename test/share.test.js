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

test("push config exposes only the public VAPID key and real availability", function () {
  const keys = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL"]
  const original = {}
  keys.forEach(function (key) { original[key] = process.env[key] })
  function restore () {
    keys.forEach(function (key) {
      if (original[key] === undefined) { delete process.env[key] } else { process.env[key] = original[key] }
    })
  }
  try {
    process.env.VAPID_PUBLIC_KEY = "public-key"
    process.env.VAPID_PRIVATE_KEY = "private-key"
    process.env.VAPID_SUBJECT = "https://suavagars.com.br"
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    delete process.env.VERCEL

    let response = fakeResponse()
    pushConfig({ method: "GET" }, response)
    assert.equal(response.statusCode, 200)
    assert.deepEqual(JSON.parse(response.body), { publicKey: "public-key", enabled: true, storageReady: true })
    assert.equal(response.headers["Cache-Control"], "no-store")

    process.env.VERCEL = "1"
    response = fakeResponse()
    pushConfig({ method: "GET" }, response)
    assert.deepEqual(JSON.parse(response.body), { publicKey: "public-key", enabled: false, storageReady: false })

    process.env.KV_REST_API_URL = "https://kv.example"
    process.env.KV_REST_API_TOKEN = "token"
    response = fakeResponse()
    pushConfig({ method: "GET" }, response)
    assert.deepEqual(JSON.parse(response.body), { publicKey: "public-key", enabled: true, storageReady: true })

    delete process.env.VAPID_PRIVATE_KEY
    response = fakeResponse()
    pushConfig({ method: "GET" }, response)
    assert.deepEqual(JSON.parse(response.body), { publicKey: "public-key", enabled: false, storageReady: true })

    const rejected = fakeResponse()
    pushConfig({ method: "POST" }, rejected)
    assert.equal(rejected.statusCode, 405)
  } finally {
    restore()
  }
})
