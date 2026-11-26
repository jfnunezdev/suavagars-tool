;(function () {
  "use strict"

  if (document.getElementById("site-drawer")) { return }

  function apiErrorMessage (result, fallback) {
    const error = result && result.error ? result.error : result
    if (typeof error === "string" && error) { return error }
    if (error && typeof error.message === "string" && error.message) { return error.message }
    return fallback
  }

  const customSelectConfigs = [
    {
      key: "city",
      id: "job-city",
      name: "city",
      label: "Cidade",
      placeholder: "Selecione...",
      searchPlaceholder: "Buscar cidade...",
      required: true,
      options: [
        "Caxias do Sul", "Porto Alegre", "Santa Maria", "Novo Hamburgo", "São Leopoldo",
        "Rio Grande", "Passo Fundo", "Bento Gonçalves", "Santa Cruz do Sul", "Cachoeirinha",
        "Alvorada", "Gravataí", "Canoas", "Pelotas", "Erechim", "Lajeado", "Ijuí", "Bagé",
        "Farroupilha", "Sapiranga", "Esteio", "Santa Rosa", "Uruguaiana", "Cruz Alta",
        "Carazinho", "Vacaria", "Tramandaí", "Torres", "São Borja", "Venâncio Aires",
        "Guaíba", "Estância Velha", "Campo Bom", "Taquara", "Cachoeira do Sul",
        "Santo Ângelo", "Frederico Westphalen", "São José do Norte", "São Gabriel",
        "Três Passos", "Marau", "Capão da Canoa", "Charqueadas"
      ]
    },
    {
      key: "model",
      id: "job-model",
      name: "model",
      label: "Modelo de trabalho",
      placeholder: "Selecione...",
      searchPlaceholder: "Buscar modelo...",
      required: false,
      options: ["Presencial", "Híbrido", "Remoto"]
    },
    {
      key: "contractType",
      id: "job-type",
      name: "contractType",
      label: "Tipo de contratação",
      placeholder: "Selecione...",
      searchPlaceholder: "Buscar tipo de vaga...",
      required: true,
      options: [
        "CLT (Efetivo)", "Temporário", "Estágio", "PJ", "Autônomo", "Meio período",
        "Contrato", "A combinar"
      ]
    }
  ]

  function customSelectMarkup (config) {
    return `<div class="field">
      <label for="${config.id}">${config.label}</label>
      <div class="custom-select" data-custom-select="${config.key}" data-placeholder="${config.placeholder}">
        <input type="hidden" name="${config.name}" data-custom-select-input${config.required ? " required" : ""}>
        <button id="${config.id}" class="custom-select__trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="custom-select-${config.key}-panel">
          <span class="custom-select__value">${config.placeholder}</span>
          <svg class="custom-select__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
        </button>
        <div id="custom-select-${config.key}-panel" class="custom-select__panel" hidden>
          <input class="custom-select__search" type="search" placeholder="${config.searchPlaceholder}" aria-label="${config.searchPlaceholder}" autocomplete="off">
          <div class="custom-select__options" role="listbox"></div>
          <p class="custom-select__empty" hidden>Nenhuma opção encontrada</p>
        </div>
      </div>
    </div>`
  }

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
                ${customSelectMarkup(customSelectConfigs[0])}
                <div class="field">
                  <label for="job-salary">Salário</label>
                  <input id="job-salary" name="salary" type="text" maxlength="120" placeholder="Ex.: R$ 2.500,00 ou a combinar">
                </div>
                ${customSelectMarkup(customSelectConfigs[1])}
                ${customSelectMarkup(customSelectConfigs[2])}
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
  let activeCustomSelect = null
  let customSelectIgnoreOutsideUntil = 0
  let customSelectPointerToggleAt = 0

  function isTouchPointer (event) {
    return Boolean(event && (event.pointerType === "touch" || event.pointerType === "pen"))
  }

  function shouldFocusCustomSelectSearch () {
    return !window.matchMedia || window.matchMedia("(hover: hover) and (pointer: fine)").matches
  }

  function normalizeSelectText (value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  }

  function filterCustomSelect (wrapper) {
    const query = normalizeSelectText(wrapper.querySelector(".custom-select__search").value.trim())
    let visible = 0
    wrapper.querySelectorAll(".custom-select__option").forEach(function (option) {
      const matches = !query || normalizeSelectText(option.dataset.value).includes(query)
      option.hidden = !matches
      if (matches) { visible += 1 }
    })
    const empty = wrapper.querySelector(".custom-select__empty")
    if (empty) { empty.hidden = visible !== 0 }
  }

  function closeCustomSelect (wrapper, restoreFocus) {
    if (!wrapper) { return }
    const panel = wrapper.querySelector(".custom-select__panel")
    const trigger = wrapper.querySelector(".custom-select__trigger")
    panel.hidden = true
    trigger.setAttribute("aria-expanded", "false")
    wrapper.classList.remove("is-open")
    wrapper.querySelector(".custom-select__search").value = ""
    filterCustomSelect(wrapper)
    if (activeCustomSelect === wrapper) { activeCustomSelect = null }
    customSelectIgnoreOutsideUntil = 0
    if (restoreFocus) { trigger.focus({ preventScroll: true }) }
  }

  function closeAllCustomSelects () {
    document.querySelectorAll(".custom-select.is-open").forEach(function (wrapper) {
      closeCustomSelect(wrapper)
    })
  }

  function positionCustomSelect (wrapper) {
    const panel = wrapper.querySelector(".custom-select__panel")
    const options = wrapper.querySelector(".custom-select__options")
    const trigger = wrapper.querySelector(".custom-select__trigger")
    const drawerRect = drawerContent.getBoundingClientRect()
    const triggerRect = trigger.getBoundingClientRect()
    const spaceBelow = drawerRect.bottom - triggerRect.bottom - 10
    const spaceAbove = triggerRect.top - drawerRect.top - 10
    const openBelow = spaceBelow >= 150 || spaceBelow >= spaceAbove
    const available = Math.max(spaceBelow, spaceAbove)
    const maxHeight = Math.max(96, Math.min(260, available))
    panel.classList.toggle("is-above", !openBelow)
    panel.style.top = openBelow ? "calc(100% + 6px)" : "auto"
    panel.style.bottom = openBelow ? "auto" : "calc(100% + 6px)"
    panel.style.setProperty("--custom-select-max", `${maxHeight}px`)
    options.style.maxHeight = `${Math.max(64, maxHeight - 58)}px`
  }

  function openCustomSelect (wrapper) {
    closeAllCustomSelects()
    const panel = wrapper.querySelector(".custom-select__panel")
    const trigger = wrapper.querySelector(".custom-select__trigger")
    const search = wrapper.querySelector(".custom-select__search")
    panel.hidden = false
    trigger.setAttribute("aria-expanded", "true")
    wrapper.classList.add("is-open")
    activeCustomSelect = wrapper
    customSelectIgnoreOutsideUntil = Date.now() + 250
    positionCustomSelect(wrapper)
    search.value = ""
    filterCustomSelect(wrapper)
    if (shouldFocusCustomSelectSearch()) { search.focus({ preventScroll: true }) }
  }

  function toggleCustomSelect (wrapper) {
    if (activeCustomSelect === wrapper) {
      closeCustomSelect(wrapper, true)
    } else {
      openCustomSelect(wrapper)
    }
  }

  function selectCustomOption (wrapper, option) {
    const input = wrapper.querySelector("[data-custom-select-input]")
    const trigger = wrapper.querySelector(".custom-select__trigger")
    input.value = option.dataset.value
    wrapper.querySelector(".custom-select__value").textContent = option.dataset.value
    wrapper.querySelectorAll(".custom-select__option").forEach(function (item) {
      item.setAttribute("aria-selected", String(item === option))
    })
    trigger.removeAttribute("aria-invalid")
    closeCustomSelect(wrapper, true)
  }

  function resetCustomSelects () {
    document.querySelectorAll(".custom-select").forEach(function (wrapper) {
      const input = wrapper.querySelector("[data-custom-select-input]")
      input.value = ""
      wrapper.querySelector(".custom-select__value").textContent = wrapper.dataset.placeholder
      wrapper.querySelector(".custom-select__trigger").removeAttribute("aria-invalid")
      wrapper.querySelectorAll(".custom-select__option").forEach(function (option) {
        option.setAttribute("aria-selected", "false")
      })
    })
    closeAllCustomSelects()
  }

  function validateCustomSelects () {
    let firstInvalid = null
    document.querySelectorAll(".custom-select").forEach(function (wrapper) {
      const input = wrapper.querySelector("[data-custom-select-input]")
      const trigger = wrapper.querySelector(".custom-select__trigger")
      if (input.hasAttribute("required") && !input.value) {
        trigger.setAttribute("aria-invalid", "true")
        if (!firstInvalid) { firstInvalid = trigger }
      } else {
        trigger.removeAttribute("aria-invalid")
      }
    })
    if (firstInvalid) { firstInvalid.focus({ preventScroll: true }) }
    return !firstInvalid
  }

  function setupCustomSelects () {
    document.querySelectorAll(".custom-select").forEach(function (wrapper) {
      const config = customSelectConfigs.find(function (item) {
        return item.key === wrapper.dataset.customSelect
      })
      const options = wrapper.querySelector(".custom-select__options")
      const trigger = wrapper.querySelector(".custom-select__trigger")
      const search = wrapper.querySelector(".custom-select__search")
      config.options.forEach(function (value) {
        const option = document.createElement("button")
        option.type = "button"
        option.className = "custom-select__option"
        option.setAttribute("role", "option")
        option.setAttribute("aria-selected", "false")
        option.dataset.value = value
        option.textContent = value
        options.appendChild(option)
      })
      trigger.addEventListener("pointerdown", function (event) {
        if (!isTouchPointer(event)) { return }
        customSelectPointerToggleAt = Date.now()
        event.preventDefault()
        toggleCustomSelect(wrapper)
      })
      if (typeof PointerEvent === "undefined") {
        trigger.addEventListener("touchstart", function (event) {
          const now = Date.now()
          if (now - customSelectPointerToggleAt < 300) { return }
          customSelectPointerToggleAt = now
          event.preventDefault()
          toggleCustomSelect(wrapper)
        }, { passive: false })
      }
      trigger.addEventListener("click", function (event) {
        if (event.detail === 0 || Date.now() - customSelectPointerToggleAt > 600) {
          toggleCustomSelect(wrapper)
        }
      })
      search.addEventListener("input", function () { filterCustomSelect(wrapper) })
      wrapper.addEventListener("click", function (event) {
        const option = event.target.closest(".custom-select__option")
        if (option) { selectCustomOption(wrapper, option) }
      })
    })
    function handleCustomSelectOutsidePointer (event) {
      if (!activeCustomSelect) { return }
      if (Date.now() < customSelectIgnoreOutsideUntil) { return }
      const target = event.target
      if (target && typeof target.closest === "function" && target.closest(".custom-select")) { return }
      closeAllCustomSelects()
    }
    document.addEventListener("pointerdown", handleCustomSelectOutsidePointer)
    if (typeof PointerEvent === "undefined") {
      document.addEventListener("touchstart", handleCustomSelectOutsidePointer, { passive: true })
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && activeCustomSelect) {
        event.preventDefault()
        closeCustomSelect(activeCustomSelect, true)
      }
    }, true)
    window.addEventListener("resize", closeAllCustomSelects)
    drawerContent.addEventListener("scroll", function () {
      if (activeCustomSelect) { positionCustomSelect(activeCustomSelect) }
    }, { passive: true })
  }

  setupCustomSelects()

  if (!includeSearch && !existingSearchInput && searchTrigger) { searchTrigger.hidden = true }

  function resetDrawer () {
    closeAllCustomSelects()
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

  companyForm.addEventListener("reset", resetCustomSelects)

  companyForm.addEventListener("submit", async function (event) {
    event.preventDefault()
    if (!validateCustomSelects()) {
      applicationStatus.textContent = "Preencha os campos obrigatórios."
      return
    }
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
      const contentType = response.headers.get("content-type") || ""
      const result = contentType.includes("application/json") ? await response.json() : null
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, "Não foi possível enviar a vaga. Tente novamente."))
      }
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
