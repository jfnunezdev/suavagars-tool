;(function () {
  "use strict"
  const pendingList = document.getElementById("pending-list")
  const pendingStatus = document.getElementById("pending-status")
  const pendingCount = document.getElementById("pending-count")
  const publishedList = document.getElementById("published-list")
  const publishedStatus = document.getElementById("published-status")
  let refreshTimer = null
  let isLoadingManagerData = false
  let reloadAfterCurrentLoad = false
  let trackedPendingIds = null
  let notificationAudioContext = null
  let audioUnlockPromise = null
  let soundInFlight = null
  let notificationSoundQueued = false
  let titleBlinkTimer = null
  let pendingAlertActive = false
  let pushReady = false
  const notificationEnableButton = document.getElementById("notification-enable")
  const notificationStatus = document.getElementById("notification-status")
  const originalPageTitle = document.title

  function apiErrorMessage (value, fallback) {
    const error = value && value.error ? value.error : value
    if (typeof error === "string" && error) { return error }
    if (error && typeof error.message === "string" && error.message) { return error.message }
    return fallback
  }

  function showManager () {
    loadManagerData()
    if (!refreshTimer) {
      refreshTimer = window.setInterval(function () {
        loadManagerData(true)
      }, 15000)
    }
  }

  function hideManager () {
    if (refreshTimer) {
      window.clearInterval(refreshTimer)
      refreshTimer = null
    }
    stopPendingReminder()
    trackedPendingIds = null
    pendingStatus.textContent = ""
    publishedStatus.textContent = ""
    clearListLoading(pendingList)
    clearListLoading(publishedList)
    pendingList.replaceChildren()
    publishedList.replaceChildren()
  }

  function clearNotificationStatus () {
    if (notificationStatus) {
      notificationStatus.textContent = ""
      notificationStatus.hidden = true
    }
  }

  function showNotificationError (message) {
    if (message && notificationStatus) {
      notificationStatus.textContent = message
      notificationStatus.hidden = false
    }
  }

  function showFallbackButton () {
    if (notificationEnableButton) { notificationEnableButton.hidden = false }
  }

  function hideFallbackButton () {
    if (notificationEnableButton) { notificationEnableButton.hidden = true }
  }

  function needsNotificationFallback () {
    return !pushReady && "Notification" in window && Notification.permission === "default"
  }

  function unlockNotificationAudio () {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextConstructor) { return Promise.resolve(false) }
    try {
      if (!notificationAudioContext) {
        notificationAudioContext = new AudioContextConstructor()
      }
      if (notificationAudioContext.state === "running") { return Promise.resolve(true) }
      if (!audioUnlockPromise) {
        audioUnlockPromise = Promise.resolve(notificationAudioContext.resume())
          .then(function () {
            return notificationAudioContext.state === "running"
          })
          .catch(function (error) {
            console.warn("Não foi possível habilitar o som de novas solicitações.", error)
            return false
          })
          .then(function (ready) {
            audioUnlockPromise = null
            return ready
          })
      }
      return audioUnlockPromise
    } catch (error) {
      console.warn("Não foi possível habilitar o som de novas solicitações.", error)
      return Promise.resolve(false)
    }
  }

  function playChime () {
    for (let repetition = 0; repetition < 3; repetition += 1) {
      const startTime = notificationAudioContext.currentTime + 0.08 + repetition * 1.5
      scheduleChimeTone(784, startTime, 0.42)
      scheduleChimeTone(659.25, startTime + 0.48, 0.46)
    }
  }

  function playNotificationSound () {
    if (!notificationAudioContext) {
      notificationSoundQueued = true
      showNotificationError("Toque no painel para habilitar o som do alerta.")
      return Promise.resolve(false)
    }
    notificationSoundQueued = true
    if (soundInFlight) { return soundInFlight }
    soundInFlight = (async function () {
      const ready = await unlockNotificationAudio()
      if (!ready) {
        showNotificationError("Toque novamente para habilitar o som de novas solicitações.")
        return false
      }
      if (!pendingAlertActive) {
        notificationSoundQueued = false
        return false
      }
      notificationSoundQueued = false
      playChime()
      return true
    })()
    soundInFlight.then(
      function () { soundInFlight = null },
      function () { soundInFlight = null }
    )
    return soundInFlight
  }

  function replayQueuedNotification () {
    if (!notificationSoundQueued || !pendingAlertActive) { return }
    playNotificationSound()
  }

  function scheduleChimeTone (frequency, startTime, duration) {
    const oscillator = notificationAudioContext.createOscillator()
    const volume = notificationAudioContext.createGain()
    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(frequency, startTime)
    volume.gain.setValueAtTime(0.0001, startTime)
    volume.gain.exponentialRampToValueAtTime(0.62, startTime + 0.04)
    volume.gain.setValueAtTime(0.62, startTime + duration - 0.1)
    volume.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
    oscillator.connect(volume)
    volume.connect(notificationAudioContext.destination)
    oscillator.start(startTime)
    oscillator.stop(startTime + duration + 0.02)
  }

  function startTitleBlink () {
    if (titleBlinkTimer) {
      return
    }
    let showAlertTitle = true
    document.title = "(1) NOVA VAGA!"
    titleBlinkTimer = window.setInterval(function () {
      document.title = showAlertTitle ? "(1) NOVA VAGA!" : originalPageTitle
      showAlertTitle = !showAlertTitle
    }, 600)
  }

  function stopTitleBlink () {
    if (titleBlinkTimer) {
      window.clearInterval(titleBlinkTimer)
      titleBlinkTimer = null
    }
    document.title = originalPageTitle
  }

  function startPendingReminder (notifyImmediately) {
    pendingAlertActive = true
    if (notifyImmediately) {
      startTitleBlink()
      playNotificationSound()
    }
  }

  function stopPendingReminder () {
    pendingAlertActive = false
    stopTitleBlink()
  }

  function handlePanelFocus () {
    unlockNotificationAudio()
      .then(replayQueuedNotification)
      .then(stopTitleBlink)
  }

  document.addEventListener("pointerdown", function () {
    unlockNotificationAudio().then(replayQueuedNotification)
  })
  document.addEventListener("keydown", function () {
    unlockNotificationAudio().then(replayQueuedNotification)
  })
  window.addEventListener("svrs-user-gesture", function () {
    unlockNotificationAudio().then(replayQueuedNotification)
  })
  if (notificationEnableButton) {
    notificationEnableButton.addEventListener("click", function () {
      window.dispatchEvent(new CustomEvent("svrs-user-gesture"))
      window.dispatchEvent(new CustomEvent("svrs-request-notifications"))
    })
  }
  window.addEventListener("svrs-auth", function (event) {
    if (!event.detail || !event.detail.authenticated) {
      pushReady = false
      hideFallbackButton()
      clearNotificationStatus()
      return
    }
    if (needsNotificationFallback()) {
      showFallbackButton()
    } else {
      hideFallbackButton()
    }
    if ("Notification" in window && Notification.permission === "denied") {
      showNotificationError("Permissão negada. Ative as notificações nas configurações do navegador.")
    }
  })
  window.addEventListener("svrs-push-result", function (event) {
    const result = event.detail || {}
    if (result.ok) {
      pushReady = true
      hideFallbackButton()
      clearNotificationStatus()
      return
    }
    pushReady = false
    if (needsNotificationFallback()) { showFallbackButton() }
    showNotificationError(result.message || "Não foi possível ativar as notificações.")
  })
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { handlePanelFocus() }
  })
  window.addEventListener("focus", handlePanelFocus)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (event) {
      if (event.data && event.data.type === "svrs-new-application") {
        loadManagerData(true, true)
      }
    })
  }

  function addDetail (list, label, value) {
    const row = document.createElement("div")
    const term = document.createElement("dt")
    term.textContent = label
    const description = document.createElement("dd")
    description.textContent = value || "A consultar"
    row.appendChild(term)
    row.appendChild(description)
    list.appendChild(row)
  }

  function createEmptyState (message) {
    const wrapper = document.createElement("div")
    wrapper.className = "empty-state"
    const paragraph = document.createElement("p")
    paragraph.textContent = message
    wrapper.appendChild(paragraph)
    return wrapper
  }

  function clearListLoading (list) {
    list.removeAttribute("aria-busy")
  }

  function showListLoading (list, count) {
    list.replaceChildren()
    for (let index = 0; index < count; index += 1) {
      const card = document.createElement("div")
      card.className = "skeleton-card"
      card.setAttribute("aria-hidden", "true")
      ;[
        "skeleton skeleton-line long",
        "skeleton skeleton-line short",
        "skeleton skeleton-line short"
      ].forEach(function (lineClass) {
        const line = document.createElement("div")
        line.className = lineClass
        card.appendChild(line)
      })
      list.appendChild(card)
    }
    list.setAttribute("aria-busy", "true")
  }

  function addActionButton (container, label, className, handler) {
    const button = document.createElement("button")
    button.type = "button"
    button.setAttribute("aria-busy", "false")
    const spinner = document.createElement("span")
    spinner.className = "spinner"
    spinner.hidden = true
    button.appendChild(spinner)
    button.appendChild(document.createTextNode(" " + label))
    if (className) {
      button.className = className
    }
    button.addEventListener("click", handler)
    container.appendChild(button)
    return button
  }

  function renderPending (applications) {
    clearListLoading(pendingList)
    pendingList.replaceChildren()
    pendingCount.textContent = String(applications.length)
    if (!applications.length) {
      pendingStatus.textContent = "Não há vagas aguardando revisão."
      pendingList.appendChild(createEmptyState("Nenhuma solicitação pendente no momento."))
      return
    }
    pendingStatus.textContent =
      "Revise os dados e autorize apenas as vagas que devem aparecer no site."
    applications.forEach(function (application) {
      const card = document.createElement("article")
      card.className = "card manager-card"
      const title = document.createElement("h3")
      title.textContent = application.role || "Cargo a consultar"
      card.appendChild(title)

      const details = document.createElement("dl")
      details.className = "manager-details"
      ;[
        ["Empresa", application.company],
        ["Cidade", application.city],
        ["Salário", application.salary],
        ["Modelo", application.model],
        ["Tipo", application.contractType],
        ["Horário", application.schedule],
        ["Contato", application.contactName],
        ["WhatsApp", application.contactPhone],
        ["E-mail", application.contactEmail],
        ["Link de candidatura", application.link],
        ["Atividades", application.activities],
        ["Benefícios", application.benefits],
        ["Requisitos", application.requirements]
      ].forEach(function (detail) {
        if (detail[1]) {
          addDetail(details, detail[0], detail[1])
        }
      })
      card.appendChild(details)

      const actions = document.createElement("div")
      actions.className = "manager-card-actions"
      addActionButton(actions, "AUTORIZAR / PUBLICAR VAGA", "", function (event) {
        processApplication(application.id, "approve", event.currentTarget)
      })
      addActionButton(actions, "RECUSAR SOLICITAÇÃO", "reject-button", function (event) {
        if (
          window.confirm("Recusar e remover a solicitação de " + (application.role || "vaga") + "?")
        ) {
          processApplication(application.id, "reject", event.currentTarget)
        }
      })
      card.appendChild(actions)
      pendingList.appendChild(card)
    })
  }

  function renderPublished (vacancies) {
    clearListLoading(publishedList)
    publishedList.replaceChildren()
    if (!vacancies.length) {
      publishedStatus.textContent = "Não há vagas publicadas."
      publishedList.appendChild(createEmptyState("Nenhuma vaga publicada no momento."))
      return
    }
    publishedStatus.textContent = "Estas vagas aparecem na página pública."
    vacancies.forEach(function (vacancy) {
      const card = document.createElement("article")
      card.className = "card manager-card"
      const title = document.createElement("h3")
      title.textContent = vacancy.role || "Cargo a consultar"
      card.appendChild(title)
      const details = document.createElement("dl")
      details.className = "manager-details"
      ;[
        ["Empresa", vacancy.company],
        ["Cidade", vacancy.city],
        ["Salário", vacancy.salary],
        ["Tipo", vacancy.contractType]
      ].forEach(function (detail) {
        addDetail(details, detail[0], detail[1])
      })
      card.appendChild(details)
      addActionButton(card, "EXCLUIR VAGA PUBLICADA", "reject-button", function (event) {
        if (window.confirm("Excluir a vaga de " + (vacancy.role || "cargo") + " do site?")) {
          deleteVacancy(vacancy.id, event.currentTarget)
        }
      })
      publishedList.appendChild(card)
    })
  }

  async function readManagerResponse (url, fallbackMessage) {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } })
    if (response.status === 401) { return { unauthorized: true } }
    const contentType = response.headers.get("content-type") || ""
    const data = contentType.includes("application/json") ? await response.json() : null
    if (!response.ok) { throw new Error(apiErrorMessage(data, fallbackMessage)) }
    return { data }
  }

  async function loadManagerData (silent, force) {
    if (isLoadingManagerData) {
      if (!silent || force) {
        reloadAfterCurrentLoad = true
      }
      return
    }
    isLoadingManagerData = true
    const showLoadingState = !silent
    if (showLoadingState) {
      pendingStatus.textContent = "Carregando solicitações..."
      publishedStatus.textContent = "Carregando vagas..."
      showListLoading(pendingList, 2)
      showListLoading(publishedList, 2)
    }
    try {
      const [pendingResult, publishedResult] = await Promise.allSettled([
        readManagerResponse("/api/candidaturas", "Não foi possível carregar as solicitações."),
        readManagerResponse("/api/vagas", "Não foi possível carregar as vagas publicadas.")
      ])
      const unauthorized = [pendingResult, publishedResult].some(function (result) {
        return result.status === "fulfilled" && result.value && result.value.unauthorized
      })
      if (unauthorized) {
        window.dispatchEvent(new CustomEvent("svrs-auth-expired"))
        return
      }

      const pendingData = pendingResult.status === "fulfilled" ? pendingResult.value.data : null
      const publishedData = publishedResult.status === "fulfilled" ? publishedResult.value.data : null
      const applications = pendingData && Array.isArray(pendingData.solicitacoes) ? pendingData.solicitacoes : null
      const published = publishedData && Array.isArray(publishedData.vagas) ? publishedData.vagas : null

      if (applications) {
        const currentPendingIds = new Set(
          applications.map(function (application) {
            return application.id
          })
        )
        const isFirstPendingLoad = trackedPendingIds === null
        const pendingListChanged =
          trackedPendingIds === null ||
          currentPendingIds.size !== trackedPendingIds.size ||
          Array.from(currentPendingIds).some(function (id) {
            return !trackedPendingIds.has(id)
          })
        const hasNewApplications =
          !isFirstPendingLoad &&
          Array.from(currentPendingIds).some(function (id) {
            return !trackedPendingIds.has(id)
          })
        trackedPendingIds = currentPendingIds
        if (pendingListChanged || showLoadingState) {
          renderPending(applications)
        }
        if (!applications.length) {
          stopPendingReminder()
        } else {
          startPendingReminder(hasNewApplications)
        }
      } else {
        const pendingMessage = apiErrorMessage(pendingResult.reason, "Não foi possível carregar as solicitações.")
        pendingStatus.textContent = pendingMessage
        clearListLoading(pendingList)
        pendingList.replaceChildren(createEmptyState(pendingMessage))
        stopPendingReminder()
      }

      if (published) {
        renderPublished(published)
      } else {
        const publishedMessage = apiErrorMessage(publishedResult.reason, "Não foi possível carregar as vagas publicadas.")
        publishedStatus.textContent = publishedMessage
        clearListLoading(publishedList)
        publishedList.replaceChildren(createEmptyState(publishedMessage))
      }
    } catch (error) {
      const pendingMessage = apiErrorMessage(error, "Não foi possível carregar as solicitações.")
      pendingStatus.textContent = pendingMessage
      publishedStatus.textContent = "Atualize a página para tentar novamente."
      clearListLoading(pendingList)
      clearListLoading(publishedList)
      pendingList.replaceChildren(createEmptyState(pendingMessage))
      publishedList.replaceChildren(createEmptyState("Atualize a página para tentar novamente."))
    } finally {
      isLoadingManagerData = false
      if (reloadAfterCurrentLoad) {
        reloadAfterCurrentLoad = false
        loadManagerData(true)
      }
    }
  }

  async function processApplication (id, action, button) {
    button.disabled = true
    button.setAttribute("aria-busy", "true")
    const spinner = button.querySelector(".spinner")
    if (spinner) {
      spinner.hidden = false
    }
    pendingStatus.textContent =
      action === "approve" ? "Publicando vaga..." : "Recusando solicitação..."
    try {
      const response = await fetch("/api/candidaturas", {
        method: action === "approve" ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id })
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, "Não foi possível processar a solicitação."))
      }
      await loadManagerData()
    } catch (error) {
      pendingStatus.textContent = apiErrorMessage(error, "Não foi possível processar a solicitação.")
      button.disabled = false
      button.setAttribute("aria-busy", "false")
      const spinner = button.querySelector(".spinner")
      if (spinner) {
        spinner.hidden = true
      }
    }
  }

  async function deleteVacancy (id, button) {
    button.disabled = true
    button.setAttribute("aria-busy", "true")
    const spinner = button.querySelector(".spinner")
    if (spinner) {
      spinner.hidden = false
    }
    publishedStatus.textContent = "Excluindo vaga..."
    try {
      const response = await fetch("/api/vagas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id })
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, "Não foi possível excluir a vaga."))
      }
      await loadManagerData()
    } catch (error) {
      publishedStatus.textContent = apiErrorMessage(error, "Não foi possível excluir a vaga.")
      button.disabled = false
      button.setAttribute("aria-busy", "false")
      const spinner = button.querySelector(".spinner")
      if (spinner) {
        spinner.hidden = true
      }
    }
  }

  window.addEventListener("svrs-auth", function (event) {
    if (event.detail && event.detail.authenticated) {
      showManager()
    } else {
      hideManager()
    }
  })
})()
