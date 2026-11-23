;(function () {
  "use strict"
  const tabEditor = document.getElementById("tab-editor")
  const tabAprovacao = document.getElementById("tab-aprovacao")
  const viewEditor = document.getElementById("view-editor")
  const viewAprovacao = document.getElementById("view-aprovacao")

  function selectTab (tab) {
    const isEditor = tab === "editor"
    viewEditor.hidden = !isEditor
    viewAprovacao.hidden = isEditor
    tabEditor.setAttribute("aria-current", isEditor ? "page" : "false")
    tabAprovacao.setAttribute("aria-current", isEditor ? "false" : "page")
  }

  tabEditor.addEventListener("click", function () {
    selectTab("editor")
  })

  tabAprovacao.addEventListener("click", function () {
    selectTab("aprovacao")
  })

  window.addEventListener("svrs-auth", function (event) {
    if (!event.detail || !event.detail.authenticated) {
      selectTab("editor")
    }
  })

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/admin/sw.js", { scope: "/admin/" })
        .catch(function (error) {
          console.error("Não foi possível preparar o painel como aplicativo.", error)
        })
    })
  }
})()
