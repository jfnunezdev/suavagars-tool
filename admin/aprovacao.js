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
  let notificationSoundQueued = false
  let titleBlinkTimer = null
  let reminderTimer = null
  let pendingAlertActive = false
  const notificationEnableButton = document.getElementById("notification-enable")
  const notificationStatus = document.getElementById("notification-status")
  const originalPageTitle = document.title

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

  function replayQueuedNotification () {
    if (!notificationSoundQueued || !pendingAlertActive) {
      return
    }
    notificationSoundQueued = false
    playNotificationSound()
  }

  function unlockNotificationAudio (event) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextConstructor) {
      return
    }
    try {
      if (!notificationAudioContext) {
        notificationAudioContext = new AudioContextConstructor()
      }
      if (notificationAudioContext.state !== "running") {
        notificationAudioContext
          .resume()
          .then(function () {
            replayQueuedNotification(event)
          })
          .catch(function (error) {
            console.warn("Não foi possível habilitar o som de novas solicitações.", error)
          })
      } else {
        replayQueuedNotification(event)
      }
    } catch (error) {
      console.warn("Não foi possível habilitar o som de novas solicitações.", error)
    }
  }

  function showNotificationPrompt (message) {
    if (message && notificationStatus) {
      notificationStatus.textContent = message
      notificationStatus.hidden = false
    }
    if (notificationEnableButton) {
      notificationEnableButton.hidden = false
    }
  }

  function hideNotificationPrompt () {
    if (notificationEnableButton) {
      notificationEnableButton.hidden = true
    }
    if (notificationStatus) {
      notificationStatus.textContent = ""
      notificationStatus.hidden = true
    }
  }

  function notificationNeedsSetup () {
    const audioBlocked = !notificationAudioContext || notificationAudioContext.state !== "running"
    const permission = "Notification" in window ? Notification.permission : "unsupported"
    return audioBlocked || permission !== "granted"
  }

  async function enableNotifications () {
    unlockNotificationAudio()
    if (!("Notification" in window)) {
      showNotificationPrompt("Este navegador não mostra notificações. Mantenha o painel aberto para ouvir o alerta.")
      return
    }
    let permission = Notification.permission
    if (permission === "default") {
      try {
        permission = await Notification.requestPermission()
      } catch (error) {
        permission = "denied"
      }
    }
    if (permission === "granted") {
      if (notificationEnableButton) { notificationEnableButton.hidden = true }
      showNotificationPrompt("Alertas ativados. Você será avisado mesmo com a tela desligada.")
      window.dispatchEvent(new CustomEvent("svrs-notifications-ready"))
      return
    }
    showNotificationPrompt("Permissão negada. Toque no painel uma vez para habilitar o som.")
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

  function playNotificationSound () {
    if (!notificationAudioContext) {
      notificationSoundQueued = true
      showNotificationPrompt("Toque para ativar o som e as notificações de novas vagas.")
      console.warn("Interaja com o painel uma vez para habilitar o som de notificações.")
      return
    }
    const playChime = function () {
      for (let repetition = 0; repetition < 3; repetition += 1) {
        const startTime = notificationAudioContext.currentTime + 0.08 + repetition * 1.5
        scheduleChimeTone(784, startTime, 0.42)
        scheduleChimeTone(659.25, startTime + 0.48, 0.46)
      }
    }
    if (notificationAudioContext.state !== "running") {
      notificationAudioContext
        .resume()
        .then(playChime)
        .catch(function (error) {
          notificationSoundQueued = true
          showNotificationPrompt("Toque novamente para habilitar o som de notificações.")
          console.warn("Não foi possível tocar o som de novas solicitações.", error)
        })
      return
    }
    playChime()
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
    if (!reminderTimer) {
      reminderTimer = window.setInterval(function () {
        if (!pendingAlertActive) {
          return
        }
        startTitleBlink()
        playNotificationSound()
      }, 300000)
    }
  }

  function stopPendingReminder () {
    pendingAlertActive = false
    notificationSoundQueued = false
    if (reminderTimer) {
      window.clearInterval(reminderTimer)
      reminderTimer = null
    }
    stopTitleBlink()
  }

  document.addEventListener("pointerdown", unlockNotificationAudio)
  document.addEventListener("keydown", unlockNotificationAudio)
  window.addEventListener("svrs-user-gesture", unlockNotificationAudio)
  if (notificationEnableButton) {
    notificationEnableButton.addEventListener("click", enableNotifications)
  }
  window.addEventListener("svrs-auth", function (event) {
    if (!event.detail || !event.detail.authenticated) {
      hideNotificationPrompt()
      return
    }
    if (notificationNeedsSetup()) {
      showNotificationPrompt("Toque para ativar alertas de novas vagas, inclusive com a tela desligada.")
    }
  })
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      unlockNotificationAudio()
      stopTitleBlink()
    }
  })
  window.addEventListener("focus", function () {
    unlockNotificationAudio()
    stopTitleBlink()
  })

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

  async function loadManagerData (silent) {
    if (isLoadingManagerData) {
      if (!silent) {
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
      const responses = await Promise.all([
        fetch("/api/candidaturas", { cache: "no-store", headers: { Accept: "application/json" } }),
        fetch("/api/vagas", { cache: "no-store", headers: { Accept: "application/json" } })
      ])
      if (
        responses.some(function (response) {
          return response.status === 401
        })
      ) {
        window.dispatchEvent(new CustomEvent("svrs-auth-expired"))
        return
      }
      const results = await Promise.all(
        responses.map(function (response) {
          return response.json().then(function (data) {
            if (!response.ok) {
              throw new Error(
                data && data.error ? data.error : "Não foi possível carregar o painel."
              )
            }
            return data
          })
        })
      )
      if (!Array.isArray(results[0].solicitacoes) || !Array.isArray(results[1].vagas)) {
        throw new Error("Os dados recebidos do painel estão inválidos.")
      }
      const applications = results[0].solicitacoes
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
      renderPublished(results[1].vagas)
      if (!applications.length) {
        stopPendingReminder()
      } else {
        startPendingReminder(isFirstPendingLoad || hasNewApplications)
      }
    } catch (error) {
      const pendingMessage = error.message || "Não foi possível carregar as solicitações."
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
        throw new Error(
          result && result.error ? result.error : "Não foi possível processar a solicitação."
        )
      }
      await loadManagerData()
    } catch (error) {
      pendingStatus.textContent = error.message || "Não foi possível processar a solicitação."
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
        throw new Error(result && result.error ? result.error : "Não foi possível excluir a vaga.")
      }
      await loadManagerData()
    } catch (error) {
      publishedStatus.textContent = error.message || "Não foi possível excluir a vaga."
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
