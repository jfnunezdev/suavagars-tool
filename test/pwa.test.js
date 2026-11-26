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
  assert.equal(manifest.description, "Vagas de emprego no Rio Grande do Sul no Sua Vaga RS.")
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
  assert.match(source, /svrs-public-v5/)
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
  assert.match(source, /svrs-admin-v6/)
  assert.match(source, /\/public\/logo-triangulo\.png/)
  assert.match(source, /"\/admin\/"/)
  assert.match(source, /caches\.match\("\/admin\/index\.html"\)/)
  assert.match(source, /addEventListener\("push"/)
  assert.match(source, /addEventListener\("notificationclick"/)
  assert.match(source, /showNotification/)
  assert.match(source, /postMessage\(\{ type: "svrs-new-application" \}\)/)
  assert.ok(!source.includes("caches.match(\"/index.html\")"))
  assert.ok(!source.includes("?pwa="))
})

test("the admin page has one login, one manifest and the two views", function () {
  const html = readFile("admin/index.html")
  const scripts = readFile("admin/index.js")
  assert.match(html, /href="\/admin\/manifest\.json"/)
  assert.match(html, /href="\/admin\/icon-192\.png"/)
  assert.match(html, /<img src="\/public\/logo-triangulo\.png" alt="" aria-hidden="true" \/>/)
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

test("public site copy covers Rio Grande do Sul instead of Caxias do Sul", function () {
  const index = readFile("index.html")
  assert.match(index, /<title>SUAVAGARS - Vagas de emprego no Rio Grande do Sul<\/title>/)
  assert.match(index, /content="Encontre vagas de emprego no Rio Grande do Sul no Sua Vaga RS\."/)
  const vagas = readFile("vagas.html")
  assert.match(vagas, /content="Encontre vagas de emprego no Rio Grande do Sul no SuaVaga RS\."/)
  for (const page of ["index.html", "vagas.html", "termos.html"]) {
    const html = readFile(page)
    assert.match(html, /<p class="location">Vagas de emprego no Rio Grande do Sul<\/p>/, page)
    assert.doesNotMatch(html, /Caxias do Sul/, page)
  }
})

test("public city field uses the custom select instead of a native datalist", function () {
  const drawer = readFile("site-drawer.js")
  assert.ok(drawer.includes("key: \"city\""))
  assert.ok(drawer.includes("name: \"city\""))
  assert.match(drawer, /data-custom-select="\$\{config\.key\}"/)
  assert.match(drawer, /searchPlaceholder: "Buscar cidade\.\.\."/)
  assert.doesNotMatch(drawer, /value="Caxias do Sul - RS"/)
  assert.ok(!drawer.includes("<datalist id=\"rs-cities\">"))
  assert.ok(!drawer.includes("<select"))
  const admin = readFile("admin/index.html")
  assert.match(admin, /id="city" type="text" list="rs-cities" autocomplete="address-level2" \/>/)
  assert.match(admin, /<datalist id="rs-cities">/)
  assert.doesNotMatch(admin, /id="city"[^>]*value=/)
  assert.ok(!readFile("admin/editor.js").includes("cityInput.value.trim() || \"Caxias do Sul - RS\""))
})

test("public pages load the shared drawer and expose the floating publish bubble", function () {
  for (const page of ["index.html", "vagas.html", "termos.html"]) {
    const html = readFile(page)
    assert.match(html, /src="\/site-drawer\.js"/, page)
    assert.match(html, /class="floating-publish-bubble" data-drawer-open="application"/, page)
    assert.match(html, /class="floating-publish-bubble__label">\+ Divulgue sua vaga</, page)
    assert.doesNotMatch(html, /floating-publish-bubble__tooltip/, page)
    assert.doesNotMatch(html, /class="fixed-publish-cta"/, page)
    assert.doesNotMatch(html, /class="header-cta"/, page)
  }
  const drawer = readFile("site-drawer.js")
  const css = readFile("public.css")
  assert.match(drawer, /id="company-form"/)
  assert.match(drawer, /SVRSDrawer/)
  assert.match(drawer, /api\/candidaturas/)
  assert.match(css, /@keyframes drawer-slide-up/)
  assert.match(css, /animation: drawer-slide-up \.45s ease both/)
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
  assert.match(css, /\.floating-publish-bubble/)
  assert.match(css, /\.floating-publish-bubble__label/)
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

test("public pages use the triangle logo as the brand mark", function () {
  for (const page of ["index.html", "vagas.html", "termos.html"]) {
    const html = readFile(page)
    assert.match(html, /src="\/public\/logo-triangulo\.png" alt="" class="brand-logo"/, page)
    assert.doesNotMatch(html, /src="\/public\/icone-app\.png"/, page)
    assert.doesNotMatch(html, /src="logo\.png"/, page)
  }
  const sw = readFile("public/sw.js")
  assert.match(sw, /\/public\/logo-triangulo\.png/)
  assert.doesNotMatch(sw, /\/public\/icone-app\.png/)
  assert.ok(fs.existsSync(path.join(root, "public/logo-triangulo.png")))
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

test("notifications are requested at login and the fallback button stays hidden", function () {
  const auth = readFile("admin/auth.js")
  const html = readFile("admin/index.html")
  const css = readFile("admin/admin.css")
  assert.match(auth, /loginForm\.addEventListener\("submit"/)
  assert.match(auth, /requestNotificationPermission\(\)/)
  assert.match(auth, /Notification\.requestPermission\(\)/)
  assert.match(auth, /svrs-notifications-ready/)
  assert.match(auth, /svrs-request-notifications/)
  assert.match(html, /id="notification-enable"/)
  assert.match(html, /notification-fallback/)
  assert.match(html, /hidden/)
  assert.ok(!html.includes("Ativar alertas de novas vagas"))
  assert.match(css, /\.notification-enable \{[^}]*background: transparent/)
})

test("the panel reports the real push result without success copy", function () {
  const panel = readFile("admin/aprovacao.js")
  const index = readFile("admin/index.js")
  assert.match(index, /svrs-push-result/)
  assert.match(index, /config\.storageReady === false/)
  assert.match(index, /KV_REST_API_URL e KV_REST_API_TOKEN/)
  assert.match(readFile("api/push-config.js"), /hasPushConfiguration\(\)/)
  assert.match(panel, /addEventListener\("svrs-push-result"/)
  assert.match(panel, /function needsNotificationFallback/)
  assert.match(panel, /pushReady = true/)
  assert.ok(!panel.includes("Alertas ativados"))
  assert.ok(!panel.includes("enableNotifications"))
  assert.ok(!panel.includes("showNotificationPrompt"))
  assert.ok(!panel.includes("Notification.requestPermission"))
})

test("new applications alert an open panel immediately without random chimes", function () {
  const panel = readFile("admin/aprovacao.js")
  const sw = readFile("admin/sw.js")
  assert.match(sw, /postMessage\(\{ type: "svrs-new-application" \}\)/)
  assert.match(panel, /addEventListener\("message"/)
  assert.match(panel, /event\.data\.type === "svrs-new-application"/)
  assert.match(panel, /loadManagerData\(true, true\)/)
  assert.match(panel, /async function loadManagerData \(silent, force\)/)
  assert.match(panel, /if \(!silent \|\| force\)/)
  assert.match(panel, /startPendingReminder\(hasNewApplications\)/)
  assert.ok(!panel.includes("startPendingReminder(isFirstPendingLoad || hasNewApplications)"))
  assert.ok(!panel.includes("300000"))
  assert.ok(!panel.includes("reminderTimer"))
})

test("a queued chime survives focus changes and reminder shutdown", function () {
  const source = readFile("admin/aprovacao.js")
  assert.match(source, /notificationSoundQueued = true[\s\S]*?unlockNotificationAudio\(\)/)
  assert.match(source, /audioUnlockPromise/)
  assert.match(source, /soundInFlight/)
  assert.match(source, /unlockNotificationAudio\(\)\s*\.then\(replayQueuedNotification\)\s*\.then\(stopTitleBlink\)/)
  const stopReminder = source.match(/function stopPendingReminder \(\) \{[\s\S]*?\n {2}\}/)
  assert.ok(stopReminder)
  assert.doesNotMatch(stopReminder[0], /notificationSoundQueued = false/)
})

test("the local server reads the private password from a gitignored .env.local", function () {
  const server = readFile("local-server.js")
  const ignore = readFile(".gitignore")
  assert.match(server, /function loadLocalEnv \(\)/)
  assert.match(server, /if \(process\.env\.GESTOR_PASSWORD\) \{ return \}/)
  assert.match(server, /path\.join\(root, "\.env\.local"\)/)
  assert.match(server, /key !== "GESTOR_PASSWORD"/)
  assert.match(ignore, /^\/\.env\.local$/m)
  assert.ok(!server.includes("console.log(process.env.GESTOR_PASSWORD)"))
})

test("login handles wrong passwords and malformed responses without JSON parser errors", function () {
  const auth = readFile("admin/auth.js")
  const api = readFile("api/gestor-auth.js")
  assert.match(auth, /async function readJsonResponse \(response\)/)
  assert.match(auth, /contentType\.includes\("application\/json"\)/)
  assert.match(auth, /response\.status === 401/)
  assert.match(auth, /loginStatus\.textContent = "Senha incorreta"/)
  assert.match(auth, /loginStatus\.textContent = result && result\.error \? result\.error : "Não foi possível entrar\."/)
  assert.match(auth, /return readJsonResponse\(response\)/)
  assert.match(api, /sendJson\(response, 401, \{ error: "Senha incorreta" \}\)/)
  assert.match(api, /\.env\.local \(local\) ou na Vercel/)
  assert.ok(!auth.includes("const result = await response.json()"))
  assert.ok(!auth.includes("error.message"))
  assert.ok(!auth.includes("Failed to execute"))
  assert.ok(!api.includes("Senha incorreta."))
})

test("custom selects toggle, filter and stay inside the application modal", function () {
  const drawer = readFile("site-drawer.js")
  const css = readFile("public.css")
  assert.ok(drawer.includes("key: \"model\""))
  assert.ok(drawer.includes("key: \"contractType\""))
  assert.ok(drawer.includes("name: \"model\""))
  assert.ok(drawer.includes("name: \"contractType\""))
  assert.match(drawer, /function toggleCustomSelect \(wrapper\)/)
  assert.match(drawer, /setAttribute\("aria-expanded", "true"\)/)
  assert.match(drawer, /setAttribute\("aria-expanded", "false"\)/)
  assert.match(drawer, /addEventListener\("pointerdown"/)
  assert.match(drawer, /event\.key === "Escape"/)
  assert.match(drawer, /event\.preventDefault\(\)/)
  assert.match(drawer, /normalizeSelectText/)
  assert.match(drawer, /option\.dataset\.value/)
  assert.match(drawer, /resetCustomSelects/)
  assert.match(drawer, /validateCustomSelects/)
  assert.match(css, /\.custom-select__panel/)
  assert.match(css, /max-height: var\(--custom-select-max, 260px\)/)
  assert.match(css, /overflow-y: auto/)
  assert.ok(!drawer.includes("<select"))
  assert.ok(!css.includes(".floating-publish-bubble__tooltip"))
})

test("custom selects open on touch without autofocusing the mobile search", function () {
  const drawer = readFile("site-drawer.js")
  const css = readFile("public.css")
  assert.ok(drawer.includes("key: \"city\""))
  assert.ok(drawer.includes("key: \"model\""))
  assert.ok(drawer.includes("key: \"contractType\""))
  assert.ok(drawer.includes("function isTouchPointer (event)"))
  assert.ok(drawer.includes("event.pointerType === \"touch\""))
  assert.ok(drawer.includes("trigger.addEventListener(\"pointerdown\""))
  assert.ok(drawer.includes("trigger.addEventListener(\"touchstart\""))
  assert.ok(drawer.includes("customSelectPointerToggleAt = Date.now()"))
  assert.ok(drawer.includes("event.detail === 0 || Date.now() - customSelectPointerToggleAt > 600"))
  assert.ok(drawer.includes("function shouldUseDesktopFocus ()"))
  assert.ok(drawer.includes("(hover: hover) and (pointer: fine)"))
  assert.ok(drawer.includes("if (shouldUseDesktopFocus()) { search.focus"))
  assert.ok(drawer.includes("customSelectIgnoreOutsideUntil = Date.now() + 250"))
  assert.ok(drawer.includes("Date.now() < customSelectIgnoreOutsideUntil"))
  assert.ok(!drawer.includes("drawerContent.addEventListener(\"scroll\", closeAllCustomSelects"))
  assert.ok(drawer.includes("positionCustomSelect(activeCustomSelect)"))
  assert.ok(css.includes(".application-form .custom-select.is-open { z-index: 60; }"))
  assert.ok(css.includes("z-index: 1000;"))
})

test("custom select search stays open when tapped on touch devices", function () {
  const drawer = readFile("site-drawer.js")
  const css = readFile("public.css")
  assert.ok(drawer.includes("key: \"city\""))
  assert.ok(drawer.includes("key: \"model\""))
  assert.ok(drawer.includes("key: \"contractType\""))
  assert.ok(drawer.includes("const panel = wrapper.querySelector(\".custom-select__panel\")"))
  assert.ok(drawer.includes("function stopCustomSelectPointerPropagation (event)"))
  assert.ok(drawer.includes("function focusCustomSelectSearchOnTouch (event)"))
  assert.ok(drawer.includes("event.stopPropagation()"))
  assert.ok(drawer.includes("event.type !== \"touchstart\" && !isTouchPointer(event)"))
  assert.ok(drawer.includes("panel.addEventListener(\"pointerdown\", stopCustomSelectPointerPropagation)"))
  assert.ok(drawer.includes("search.addEventListener(\"pointerdown\", focusCustomSelectSearchOnTouch)"))
  assert.ok(drawer.includes("panel.addEventListener(\"touchstart\", stopCustomSelectPointerPropagation"))
  assert.ok(drawer.includes("search.addEventListener(\"touchstart\", focusCustomSelectSearchOnTouch"))
  assert.ok(drawer.includes("activeCustomSelect.contains(event.target)"))
  assert.ok(!drawer.includes("target.closest(\".custom-select\")"))
  assert.ok(!drawer.includes("window.addEventListener(\"resize\", closeAllCustomSelects)"))
  assert.ok(drawer.includes("function handleCustomSelectViewportChange ()"))
  assert.ok(drawer.includes("window.visualViewport.addEventListener(\"resize\", handleCustomSelectViewportChange)"))
  assert.ok(!drawer.includes("addEventListener(\"blur\""))
  assert.ok(!drawer.includes("addEventListener(\"focusout\""))
  assert.ok(drawer.includes("if (shouldUseDesktopFocus()) { searchInput.focus({ preventScroll: true }) }"))
  assert.ok(drawer.includes("drawerApplicationView.querySelector(\"input\").focus({ preventScroll: true })"))
  assert.ok(css.includes("touch-action: manipulation;"))
  assert.ok(css.includes("overflow-y: auto;"))
})
