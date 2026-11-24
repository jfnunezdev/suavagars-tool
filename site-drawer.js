;(function () {
  "use strict"

  if (document.getElementById("site-drawer")) { return }

  const includeSearch = document.body.dataset.drawerSearch === "true"
  const searchView = includeSearch
    ? `<section id="drawer-search-view" aria-label="Buscar vagas" hidden>
        <form id="job-search" class="search-box drawer-search" role="search">
          <label for="search-input" class="sr-only">Buscar vaga por cargo</label>
          <input id="search-input" type="search" placeholder="Buscar por cargo" autocomplete="off">
          <button type="submit" aria-label="Buscar vagas">BUSCAR</button>
        </form>
      </section>`
    : ""

  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="site-drawer" class="site-drawer" aria-labelledby="drawer-title">
      <div class="drawer-header">
        <h2 id="drawer-title">Menu</h2>
        <button id="drawer-close" class="drawer-close" type="button" aria-label="Fechar menu">×</button>
      </div>
      <nav id="site-navigation" class="site-sidebar" aria-label="Navegação do site">
        <button type="button" data-drawer-view="application">Para empresas</button>
        <button type="button" data-drawer-view="jobs">Vagas abertas</button>
        <button type="button" data-drawer-view="search">Buscar</button>
        <a href="https://wa.me/5554996077805?text=Ol%C3%A1%2C%20sou%20empresa%20e%20quero%20publicar%20uma%20vaga%20no%20Sua%20Vaga%20RS" target="_blank" rel="noopener noreferrer">Falar com atendente</a>
      </nav>
      <div id="drawer-content" class="drawer-content" hidden>
        ${searchView}
        <section id="drawer-application-view" hidden>
          <section id="application-form" class="application-section" aria-labelledby="application-title">
            <h2 id="application-title">Envie uma vaga para análise</h2>
            <p class="application-intro">Preencha os dados da oportunidade. A vaga só será publicada depois da revisão e autorização da equipe.</p>
            <form id="company-form" class="application-form">
              <div class="form-grid">
                <div class="field">
                  <label for="company-name">Empresa</label>
                  <input id="company-name" name="company" type="text" maxlength="160" autocomplete="organization" required>
                </div>
                <div class="field">
                  <label for="job-role">Cargo</label>
                  <input id="job-role" name="role" type="text" maxlength="160" required>
                </div>
                <div class="field">
                  <label for="job-city">Cidade</label>
                  <input id="job-city" name="city" type="text" maxlength="120" value="Caxias do Sul - RS" required>
                </div>
                <div class="field">
                  <label for="job-salary">Salário</label>
                  <input id="job-salary" name="salary" type="text" maxlength="120" placeholder="Ex.: R$ 2.500,00 ou a combinar">
                </div>
                <div class="field">
                  <label for="job-model">Modelo de trabalho</label>
                  <input id="job-model" name="model" type="text" maxlength="100" placeholder="Presencial, híbrido ou remoto">
                </div>
                <div class="field">
                  <label for="job-type">Tipo de contratação</label>
                  <select id="job-type" name="contractType" required>
                    <option value="">Selecione...</option>
                    <option>CLT (Efetivo)</option>
                    <option>Temporário</option>
                    <option>Estágio</option>
                    <option>PJ</option>
                    <option>Autônomo</option>
                    <option>Meio período</option>
                    <option>Contrato</option>
                    <option>A combinar</option>
                  </select>
                </div>
                <div class="field">
                  <label for="job-schedule">Horário / turno</label>
                  <input id="job-schedule" name="schedule" type="text" maxlength="200">
                </div>
                <div class="field">
                  <label for="job-link">Link para candidatura</label>
                  <input id="job-link" name="link" type="url" inputmode="url" maxlength="2048" placeholder="https://..." required>
                </div>
                <div class="field">
                  <label for="contact-name">Seu nome</label>
                  <input id="contact-name" name="contactName" type="text" maxlength="160" autocomplete="name" required>
                </div>
                <div class="field">
                  <label for="contact-phone">WhatsApp para contato</label>
                  <input id="contact-phone" name="contactPhone" type="tel" maxlength="40" autocomplete="tel" required>
                </div>
                <div class="field">
                  <label for="contact-email">E-mail para contato</label>
                  <input id="contact-email" name="contactEmail" type="email" maxlength="254" autocomplete="email">
                </div>
                <div class="field field-wide">
                  <label for="job-activities">Atividades</label>
                  <textarea id="job-activities" name="activities" maxlength="2000" rows="4"></textarea>
                </div>
                <div class="field">
                  <label for="job-benefits">Benefícios</label>
                  <textarea id="job-benefits" name="benefits" maxlength="1000" rows="3"></textarea>
                </div>
                <div class="field">
                  <label for="job-requirements">Requisitos</label>
                  <textarea id="job-requirements" name="requirements" maxlength="1000" rows="3"></textarea>
                </div>
              </div>
              <button id="submit-application" type="submit">ENVIAR PARA ANÁLISE</button>
              <p id="application-status" class="application-status" role="status" aria-live="polite"></p>
            </form>
          </section>
        </section>
      </div>
    </dialog>
  `)

  const siteDrawer = document.getElementById("site-drawer")
  const siteNavigation = document.getElementById("site-navigation")
  const drawerClose = document.getElementById("drawer-close")
  const drawerTitle = document.getElementById("drawer-title")
  const drawerContent = document.getElementById("drawer-content")
  const drawerSearchView = document.getElementById("drawer-search-view")
  const drawerApplicationView = document.getElementById("drawer-application-view")
  const searchForm = document.getElementById("job-search")
  const searchInput = document.getElementById("search-input")
  const existingSearchInput = document.getElementById("search-input")
  const companyForm = document.getElementById("company-form")
  const applicationStatus = document.getElementById("application-status")
  const submitApplicationButton = document.getElementById("submit-application")
  const menuToggle = document.getElementById("mobile-menu-toggle")
  const searchTrigger = siteNavigation.querySelector("[data-drawer-view=search]")
  let drawerScrollY = 0

  if (!includeSearch && !existingSearchInput && searchTrigger) { searchTrigger.hidden = true }

  function resetDrawer () {
    siteDrawer.dataset.state = "menu"
    delete siteDrawer.dataset.view
    drawerTitle.textContent = "Menu"
    siteNavigation.hidden = false
    drawerContent.hidden = true
    if (drawerSearchView) { drawerSearchView.hidden = true }
    drawerApplicationView.hidden = true
  }

  function closeDrawer () {
    if (siteDrawer.open) { siteDrawer.close() }
  }

  function openDrawer (view) {
    drawerScrollY = window.scrollY
    resetDrawer()
    siteDrawer.showModal()
    if (menuToggle) {
      menuToggle.setAttribute("aria-expanded", "true")
      menuToggle.setAttribute("aria-label", "Fechar menu de navegação")
    }
    if (view === "application") { showApplicationView() }
    if (view === "search" && includeSearch) { showSearchView() }
  }

  function showApplicationView () {
    siteNavigation.hidden = true
    drawerContent.hidden = false
    siteDrawer.dataset.state = "content"
    siteDrawer.dataset.view = "application"
    drawerTitle.textContent = "Envie uma vaga para análise"
    if (drawerSearchView) { drawerSearchView.hidden = true }
    drawerApplicationView.hidden = false
    drawerApplicationView.querySelector("input").focus({ preventScroll: true })
  }

  function showSearchView () {
    if (!drawerSearchView) { return }
    siteNavigation.hidden = true
    drawerContent.hidden = false
    siteDrawer.dataset.state = "content"
    siteDrawer.dataset.view = "search"
    drawerTitle.textContent = "Buscar"
    drawerSearchView.hidden = false
    drawerApplicationView.hidden = true
    searchInput.focus({ preventScroll: true })
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", function () {
      if (siteDrawer.open) { closeDrawer() } else { openDrawer() }
    })
  }

  document.querySelectorAll("[data-drawer-open]").forEach(function (button) {
    button.addEventListener("click", function () {
      openDrawer(button.getAttribute("data-drawer-open") || "menu")
    })
  })

  siteNavigation.addEventListener("click", function (event) {
    const trigger = event.target.closest("[data-drawer-view]")
    if (!trigger) { return }
    const view = trigger.getAttribute("data-drawer-view")
    if (view === "jobs") {
      closeDrawer()
      return
    }
    if (view === "search" && !includeSearch) {
      closeDrawer()
      if (existingSearchInput) { existingSearchInput.focus({ preventScroll: true }) }
      return
    }
    if (view === "search") { showSearchView(); return }
    showApplicationView()
  })

  drawerClose.addEventListener("click", closeDrawer)
  siteDrawer.addEventListener("click", function (event) {
    if (event.target === siteDrawer) { closeDrawer() }
  })
  siteDrawer.addEventListener("close", function () {
    resetDrawer()
    if (menuToggle) {
      menuToggle.setAttribute("aria-expanded", "false")
      menuToggle.setAttribute("aria-label", "Abrir menu de navegação")
      menuToggle.focus({ preventScroll: true })
    }
    if (window.scrollY !== drawerScrollY) { window.scrollTo(0, drawerScrollY) }
  })

  if (searchForm) {
    searchForm.addEventListener("submit", function (event) {
      event.preventDefault()
      window.dispatchEvent(new CustomEvent("svrs-search", { detail: { query: searchInput.value } }))
      closeDrawer()
    })
    searchInput.addEventListener("input", function () {
      window.dispatchEvent(new CustomEvent("svrs-search", { detail: { query: searchInput.value } }))
    })
  }

  companyForm.addEventListener("submit", async function (event) {
    event.preventDefault()
    submitApplicationButton.disabled = true
    applicationStatus.textContent = "Enviando solicitação..."
    try {
      const formData = new FormData(companyForm)
      const payload = {}
      formData.forEach(function (value, key) {
        payload[key] = value
      })
      const response = await fetch("/api/candidaturas", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      })
      const result = await response.json()
      if (!response.ok) { throw new Error(result && result.error ? result.error : "Não foi possível enviar a vaga.") }
      companyForm.reset()
      applicationStatus.textContent = "Solicitação enviada. A equipe vai revisar os dados antes de publicar a vaga."
    } catch (error) {
      applicationStatus.textContent = error.message || "Não foi possível enviar a vaga. Tente novamente."
    } finally {
      submitApplicationButton.disabled = false
    }
  })

  window.SVRSDrawer = { open: openDrawer, close: closeDrawer }
})()
