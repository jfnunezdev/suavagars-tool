const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")

function readFile (relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8")
}

function readJson (relativePath) {
  return JSON.parse(readFile(relativePath))
}

function isInsideScope (url, scope) {
  return url === scope || url.startsWith(scope)
}

test("public manifest uses the root identity and the green theme", function () {
  const manifest = readJson("public/manifest.json")
  assert.equal(manifest.id, "/")
  assert.equal(manifest.start_url, "/")
  assert.equal(manifest.scope, "/")
  assert.equal(manifest.short_name, "SUA VAGA")
  assert.equal(manifest.theme_color, "#16a34a")
  assert.ok(isInsideScope(manifest.start_url, manifest.scope))
  assert.ok(!JSON.stringify(manifest).includes("?pwa="))
})

test("admin manifest uses its own /admin/ scope and the dark theme", function () {
  const manifest = readJson("admin/manifest.json")
  assert.equal(manifest.id, "/admin/")
  assert.equal(manifest.start_url, "/admin/")
  assert.equal(manifest.scope, "/admin/")
  assert.equal(manifest.short_name, "PAINEL")
  assert.equal(manifest.theme_color, "#0b1c3d")
  assert.ok(isInsideScope(manifest.start_url, manifest.scope))
  assert.ok(!JSON.stringify(manifest).includes("?pwa="))
})

test("the two apps have distinct short names, icons and theme colors", function () {
  const publicManifest = readJson("public/manifest.json")
  const adminManifest = readJson("admin/manifest.json")
  assert.notEqual(publicManifest.short_name, adminManifest.short_name)
  assert.notEqual(publicManifest.theme_color, adminManifest.theme_color)
  const publicIcons = publicManifest.icons.map(function (icon) {
    return icon.src
  })
  const adminIcons = adminManifest.icons.map(function (icon) {
    return icon.src
  })
  assert.deepEqual(publicIcons, ["/icon-192.png", "/icon-512.png"])
  assert.deepEqual(adminIcons, ["/admin/icon-192.png", "/admin/icon-512.png"])
  assert.ok(
    publicManifest.icons.every(function (icon) {
      return icon.purpose === "any"
    })
  )
  assert.ok(
    adminManifest.icons.every(function (icon) {
      return icon.purpose === "any maskable"
    })
  )
  for (const icon of publicIcons) {
    assert.ok(fs.existsSync(path.join(root, "public", icon.slice(1))), icon)
  }
  for (const icon of adminIcons) {
    assert.ok(fs.existsSync(path.join(root, icon.slice(1))), icon)
  }
})

test("public service worker never serves private pages or uses stale query flags", function () {
  const source = readFile("public/sw.js")
  assert.match(source, /svrs-public-v3/)
  assert.match(source, /PRIVATE_PATHS/)
  assert.match(source, /\/admin/)
  assert.match(source, /\/ferramenta/)
  assert.match(source, /\/gestor/)
  assert.match(source, /svrs-public-/)
  assert.ok(!source.includes("svrs-admin-"))
  assert.ok(!source.includes("?pwa="))
})

test("admin service worker uses the /admin/ scope and never falls back to the public index", function () {
  const source = readFile("admin/sw.js")
  assert.match(source, /svrs-admin-v3/)
  assert.match(source, /"\/admin\/"/)
  assert.match(source, /caches\.match\("\/admin\/index\.html"\)/)
  assert.match(source, /addEventListener\("push"/)
  assert.match(source, /addEventListener\("notificationclick"/)
  assert.match(source, /showNotification/)
  assert.ok(!source.includes("caches.match(\"/index.html\")"))
  assert.ok(!source.includes("?pwa="))
})

test("the admin page has one login, one manifest and the two views", function () {
  const html = readFile("admin/index.html")
  const scripts = readFile("admin/index.js")
  assert.match(html, /href="\/admin\/manifest\.json"/)
  assert.match(html, /href="\/admin\/icon-192\.png"/)
  assert.equal((html.match(/id="login-form"/g) || []).length, 1)
  assert.match(html, /id="view-editor"/)
  assert.match(html, /id="view-aprovacao"/)
  assert.match(html, /id="tab-editor"/)
  assert.match(html, /id="tab-aprovacao"/)
  assert.match(scripts, /register\("\/admin\/sw\.js", \{ scope: "\/admin\/" \}\)/)
  assert.ok(!html.includes("?pwa="))
})

test("legacy editor and manager pages no longer exist", function () {
  assert.ok(!fs.existsSync(path.join(root, "ferramenta.html")))
  assert.ok(!fs.existsSync(path.join(root, "gestor.html")))
  assert.ok(!fs.existsSync(path.join(root, "public/ferramenta-manifest.json")))
  assert.ok(!fs.existsSync(path.join(root, "public/gestor-manifest.json")))
})

test("Vercel redirects every legacy private URL to /admin/", function () {
  const config = readJson("vercel.json")
  const redirects = config.redirects.map(function (rule) {
    return rule.source
  })
  for (const source of ["/admin", "/ferramenta", "/ferramenta.html", "/gestor", "/gestor.html"]) {
    assert.ok(redirects.includes(source), source)
  }
  const adminRedirect = config.redirects.find(function (rule) {
    return rule.source === "/admin"
  })
  assert.equal(adminRedirect.destination, "/admin/")
  assert.ok(
    config.rewrites.some(function (rule) {
      return rule.source === "/sw.js" && rule.destination === "/public/sw.js"
    })
  )
  assert.ok(
    config.headers.some(function (rule) {
      return rule.source === "/admin/(.*)"
    })
  )
})

test("the local server mirrors the admin redirect and privacy headers", function () {
  const source = readFile("local-server.js")
  assert.match(source, /\["\/admin", "\/admin\/"\]/)
  assert.match(source, /"\/admin\/", path\.join\("admin", "index\.html"\)/)
  assert.match(source, /isPrivate/)
  assert.match(source, /X-Robots-Tag/)
  assert.match(source, /private, no-store, max-age=0/)
})

test("the public HTML points at the green theme and its own manifest", function () {
  const html = readFile("index.html")
  assert.match(html, /content="#16a34a"/)
  assert.match(html, /href="\/manifest\.json"/)
  assert.match(html, /href="\/icon-192\.png"/)
  assert.ok(!html.includes("?pwa="))
})

test("public pages load the shared drawer and expose the Divulgue CTA", function () {
  for (const page of ["index.html", "vagas.html", "termos.html"]) {
    const html = readFile(page)
    assert.match(html, /src="\/site-drawer\.js"/, page)
    assert.match(html, /data-drawer-open="application"/, page)
    assert.match(html, /class="cta-label">Divulgue</, page)
    assert.match(html, /aria-label="Divulgue sua vaga no Sua Vaga RS/, page)
  }
  const drawer = readFile("site-drawer.js")
  assert.match(drawer, /id="company-form"/)
  assert.match(drawer, /SVRSDrawer/)
  assert.match(drawer, /api\/candidaturas/)
  assert.ok(!readFile("index.html").includes("<dialog id=\"site-drawer\""))
})

test("public job cards include a WhatsApp share action and permalink handling", function () {
  for (const page of ["index.html", "vagas.html"]) {
    const html = readFile(page)
    assert.match(html, /src="\/lib\/share\.js"/, page)
    assert.match(html, /share-button/, page)
    assert.match(html, /COMPARTILHAR NO WHATSAPP/, page)
    assert.match(html, /buildShareUrl/, page)
    assert.match(html, /parseVagaId/, page)
    assert.match(html, /job-card--highlight/, page)
  }
  const css = readFile("public.css")
  assert.match(css, /\.job-actions/)
  assert.match(css, /\.share-button/)
  assert.match(css, /\.header-cta/)
})

test("the wordmark keeps RS orange at every viewport width", function () {
  for (const page of ["index.html", "vagas.html", "termos.html"]) {
    const html = readFile(page)
    assert.match(html, /SUAVAGA<span class="brand-suffix">RS<\/span>/, page)
  }
  const css = readFile("public.css")
  assert.match(css, /\.brand-suffix \{ color: var\(--orange\); \}/)
  assert.doesNotMatch(css, /\.brand-name \{[^}]*linear-gradient/)
})

test("web-push is optional at module load so candidaturas cannot crash", function () {
  const Module = require("node:module")
  const webPushPath = require.resolve("../lib/web-push")
  const candidaturasPath = require.resolve("../api/candidaturas")
  const originalLoad = Module._load
  delete require.cache[webPushPath]
  delete require.cache[candidaturasPath]
  Module._load = function (request, parent) {
    if (request === "web-push" && parent && parent.filename === webPushPath) {
      throw new Error("Cannot find module 'web-push'")
    }
    return originalLoad.call(this, request, parent, false)
  }
  try {
    const handler = require("../api/candidaturas")
    assert.equal(typeof handler, "function")
  } finally {
    Module._load = originalLoad
    delete require.cache[webPushPath]
    delete require.cache[candidaturasPath]
  }
})

test("approval panel renders published vacancies even if pending requests fail", function () {
  const source = readFile("admin/aprovacao.js")
  assert.match(source, /Promise\.allSettled/)
  assert.match(source, /readManagerResponse\("\/api\/candidaturas"/)
  assert.match(source, /readManagerResponse\("\/api\/vagas"/)
  assert.match(source, /renderPublished\(published\)/)
  assert.ok(!source.includes("renderPublished(results[1].vagas)"))
})

test("API errors are normalized instead of leaking object strings", function () {
  for (const file of ["site-drawer.js", "admin/aprovacao.js"]) {
    const source = readFile(file)
    assert.match(source, /function apiErrorMessage/, file)
    assert.ok(!source.includes("throw new Error(result && result.error ? result.error"), file)
  }
  const drawer = readFile("site-drawer.js")
  assert.match(drawer, /contentType\.includes\("application\/json"\)/)
})
