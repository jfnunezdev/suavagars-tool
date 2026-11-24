;(function () {
  "use strict"
  const tabEditor = document.getElementById("tab-editor")
  const tabAprovacao = document.getElementById("tab-aprovacao")
  const viewEditor = document.getElementById("view-editor")
  const viewAprovacao = document.getElementById("view-aprovacao")
  let authenticated = false
  let pushInFlight = null

  function selectTab (tab) {
    const isEditor = tab === "editor"
    viewEditor.hidden = !isEditor
    viewAprovacao.hidden = isEditor
    tabEditor.setAttribute("aria-current", isEditor ? "page" : "false")
    tabAprovacao.setAttribute("aria-current", isEditor ? "false" : "page")
  }

  function urlBase64ToUint8Array (base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
    const rawData = window.atob(base64)
    return Uint8Array.from(rawData, character => character.charCodeAt(0))
  }

  function subscribePush () {
    if (pushInFlight) { return pushInFlight }
    pushInFlight = runSubscribePush().then(function (result) {
      pushInFlight = null
      return result
    })
    return pushInFlight
  }

  async function runSubscribePush () {
    if (!authenticated) { return { ok: false, silent: true } }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return { ok: false, message: "Este navegador não suporta notificações push." }
    }
    if (!("Notification" in window)) {
      return { ok: false, message: "Este navegador não mostra notificações." }
    }
    if (Notification.permission === "default") {
      return { ok: false, message: "Permissão de notificação pendente." }
    }
    if (Notification.permission === "denied") {
      return { ok: false, message: "Permissão negada. Ative as notificações nas configurações do navegador." }
    }
    try {
      const configResponse = await fetch("/api/push-config", {
        cache: "no-store",
        headers: { Accept: "application/json" }
      })
      const config = await configResponse.json().catch(function () { return {} })
      if (!configResponse.ok) {
        throw new Error(config.error || "Configuração de notificações indisponível.")
      }
      if (!config.enabled || !config.publicKey) {
        if (config.storageReady === false) {
          throw new Error("Configure KV_REST_API_URL e KV_REST_API_TOKEN na Vercel para receber notificações.")
        }
        throw new Error("Notificações push indisponíveis neste ambiente.")
      }
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey)
        })
      }
      const response = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(subscription)
      })
      const result = await response.json().catch(function () { return {} })
      if (!response.ok) {
        throw new Error(result.error || "Não foi possível registrar as notificações.")
      }
      return { ok: true }
    } catch (error) {
      console.error("Não foi possível ativar as notificações.", error)
      return { ok: false, message: error.message || "Não foi possível ativar as notificações." }
    }
  }

  function requestSubscribe () {
    subscribePush().then(function (result) {
      if (!result.silent) {
        window.dispatchEvent(new CustomEvent("svrs-push-result", { detail: result }))
      }
    })
  }

  async function unsubscribePush () {
    try {
      if (!("serviceWorker" in navigator)) { return }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) { return }
      await fetch("/api/push-subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      })
      await subscription.unsubscribe()
    } catch (error) {
      console.warn("Não foi possível remover as notificações.", error)
    }
  }

  tabEditor.addEventListener("click", function () {
    selectTab("editor")
  })

  tabAprovacao.addEventListener("click", function () {
    selectTab("aprovacao")
  })

  window.addEventListener("svrs-auth", function (event) {
    authenticated = Boolean(event.detail && event.detail.authenticated)
    if (!authenticated) {
      selectTab("editor")
      unsubscribePush()
      return
    }
    requestSubscribe()
  })

  window.addEventListener("svrs-notifications-ready", function () {
    if (authenticated) { requestSubscribe() }
  })

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/admin/sw.js", { scope: "/admin/" })
        .then(function () {
          if (authenticated) { requestSubscribe() }
        })
        .catch(function (error) {
          console.error("Não foi possível preparar o painel como aplicativo.", error)
        })
    })
  }
})()
