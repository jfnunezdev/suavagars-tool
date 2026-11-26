;(function () {
  "use strict"
  const authStatus = document.getElementById("auth-status")
  const loginPanel = document.getElementById("login-panel")
  const loginForm = document.getElementById("login-form")
  const loginStatus = document.getElementById("login-status")
  const loginButton = document.getElementById("login-button")
  const loginSpinner = document.getElementById("login-spinner")
  const logoutButton = document.getElementById("logout-button")
  const logoutSpinner = document.getElementById("logout-spinner")
  const authenticatedApp = document.getElementById("authenticated-app")
  const password = document.getElementById("manager-password")
  const passwordToggle = document.getElementById("manager-password-toggle")
  const passwordEye = document.getElementById("manager-password-eye")
  const passwordEyeOff = document.getElementById("manager-password-eye-off")

  function resetPasswordToggle () {
    password.type = "password"
    passwordToggle.setAttribute("aria-label", "Mostrar senha")
    passwordToggle.setAttribute("aria-pressed", "false")
    passwordEye.hidden = false
    passwordEyeOff.hidden = true
  }

  let permissionRequest = null

  function announce (authenticated) {
    window.dispatchEvent(new CustomEvent("svrs-auth", { detail: { authenticated } }))
  }

  async function readJsonResponse (response) {
    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) { return null }
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  function requestNotificationPermission () {
    if (!("Notification" in window) || Notification.permission !== "default") {
      return Promise.resolve("Notification" in window ? Notification.permission : "unsupported")
    }
    if (permissionRequest) { return permissionRequest }
    permissionRequest = Promise.resolve(Notification.requestPermission())
      .then(function (permission) {
        if (permission === "granted") {
          window.dispatchEvent(new CustomEvent("svrs-notifications-ready"))
        }
        return permission
      })
      .catch(function () {
        return "denied"
      })
    return permissionRequest
  }

  function showLogin (message) {
    authStatus.hidden = true
    loginPanel.hidden = false
    authenticatedApp.hidden = true
    resetPasswordToggle()
    loginStatus.textContent = message || ""
    password.focus()
    announce(false)
  }

  function showApp () {
    authStatus.hidden = true
    loginPanel.hidden = true
    authenticatedApp.hidden = false
    resetPasswordToggle()
    announce(true)
  }

  passwordToggle.addEventListener("click", function () {
    const visible = password.type === "password"
    password.type = visible ? "text" : "password"
    passwordToggle.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha")
    passwordToggle.setAttribute("aria-pressed", visible ? "true" : "false")
    passwordEye.hidden = visible
    passwordEyeOff.hidden = !visible
    password.focus()
  })

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault()
    window.dispatchEvent(new CustomEvent("svrs-user-gesture"))
    requestNotificationPermission()
    loginButton.disabled = true
    loginButton.setAttribute("aria-busy", "true")
    loginSpinner.hidden = false
    loginStatus.textContent = "Validando acesso..."
    try {
      const response = await fetch("/api/gestor-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ password: password.value })
      })
      if (response.status === 401) {
        loginStatus.textContent = "Senha incorreta"
        return
      }
      const result = await readJsonResponse(response)
      if (!response.ok) {
        loginStatus.textContent = result && result.error ? result.error : "Não foi possível entrar."
        return
      }
      loginForm.reset()
      loginStatus.textContent = ""
      showApp()
    } catch {
      loginStatus.textContent = "Não foi possível entrar."
    } finally {
      loginButton.disabled = false
      loginButton.setAttribute("aria-busy", "false")
      loginSpinner.hidden = true
    }
  })

  window.addEventListener("svrs-request-notifications", function () {
    requestNotificationPermission()
  })

  logoutButton.addEventListener("click", async function () {
    logoutButton.disabled = true
    logoutButton.setAttribute("aria-busy", "true")
    logoutSpinner.hidden = false
    await fetch("/api/gestor-auth", { method: "DELETE", cache: "no-store" })
    logoutButton.disabled = false
    logoutButton.setAttribute("aria-busy", "false")
    logoutSpinner.hidden = true
    loginStatus.textContent = ""
    showLogin("Você saiu do painel.")
  })

  window.addEventListener("svrs-auth-expired", function () {
    showLogin("Sua sessão expirou. Entre novamente.")
  })

  fetch("/api/gestor-auth", { cache: "no-store", headers: { Accept: "application/json" } })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Não foi possível verificar o acesso.")
      }
      return readJsonResponse(response)
    })
    .then(function (data) {
      if (data && data.authenticated) {
        showApp()
      } else {
        showLogin()
      }
    })
    .catch(function () {
      showLogin()
    })
})()
