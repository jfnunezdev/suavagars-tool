;(function () {
  "use strict"
  const tabEditor = document.getElementById("tab-editor")
  const tabAprovacao = document.getElementById("tab-aprovacao")
  const viewEditor = document.getElementById("view-editor")
  const viewAprovacao = document.getElementById("view-aprovacao")
  let authenticated = false
  let pushBusy = false

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

  async function subscribePush () {
    if (pushBusy || !authenticated) { return }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) { return }
    if (!("Notification" in window) || Notification.permission !== "granted") { return }
    pushBusy = true
    try {
      const configResponse = await fetch("/api/push-config", {
        cache: "no-store",
        headers: { Accept: "application/json" }
      })
      if (!configResponse.ok) { throw new Error("Configuração de notificações indisponível.") }
      const config = await configResponse.json()
      if (!config.publicKey) { return }
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
      if (!response.ok) { throw new Error("Não foi possível registrar as notificações.") }
    } catch (error) {
      console.error("Não foi possível ativar as notificações.", error)
    } finally {
      pushBusy = false
    }
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
    subscribePush()
  })

  window.addEventListener("svrs-notifications-ready", function () {
    if (authenticated) { subscribePush() }
  })

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/admin/sw.js", { scope: "/admin/" })
        .then(function () {
          if (authenticated) { subscribePush() }
        })
        .catch(function (error) {
          console.error("Não foi possível preparar o painel como aplicativo.", error)
        })
    })
  }
})()
