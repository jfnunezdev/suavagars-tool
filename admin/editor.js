;(function () {
  "use strict"

  const linkInput = document.getElementById("linkVaga")
  const companyInput = document.getElementById("company")
  const roleInput = document.getElementById("role")
  const salaryInput = document.getElementById("salary")
  const cityInput = document.getElementById("city")
  const modelInput = document.getElementById("model")
  const contractTypeInput = document.getElementById("contract-type")
  const scheduleInput = document.getElementById("schedule")
  const activitiesInput = document.getElementById("activities")
  const benefitsInput = document.getElementById("benefits")
  const requirementsInput = document.getElementById("requirements")
  const instagramCaptionOutput = document.getElementById("instagram-caption")
  const whatsappPostOutput = document.getElementById("whatsapp-post")
  const instagramStatus = document.getElementById("instagram-status")
  const whatsappStatus = document.getElementById("whatsapp-status")
  const fetchStatus = document.getElementById("fetch-status")
  const postStatus = document.getElementById("post-status")
  const gestorStatus = document.getElementById("gestor-status")
  const duplicateDialog = document.getElementById("duplicate-warning")
  const duplicateMessage = document.getElementById("duplicate-warning-message")
  const duplicateCancelButton = document.getElementById("duplicate-cancel")
  const duplicateConfirmButton = document.getElementById("duplicate-confirm")
  const imageStatus = document.getElementById("image-status")
  const instagramTab = document.getElementById("tab-instagram")
  const whatsappTab = document.getElementById("tab-whatsapp")
  const instagramPanel = document.getElementById("instagram-panel")
  const whatsappPanel = document.getElementById("whatsapp-panel")
  const canvas = document.getElementById("post-canvas")
  const context = canvas.getContext("2d")
  const preview = document.getElementById("image-preview")
  let imageUrl = ""
  let generatedImageBlob = null
  let manualFields = {}
  let lastAutoValues = {}

  const editableFields = {
    company: companyInput,
    role: roleInput,
    salary: salaryInput,
    city: cityInput,
    model: modelInput,
    contractType: contractTypeInput,
    schedule: scheduleInput,
    activities: activitiesInput,
    benefits: benefitsInput,
    requirements: requirementsInput
  }
  if (
    !Array.from(contractTypeInput.options).some(function (option) {
      return option.value === "Autônomo"
    })
  ) {
    const autonomousOption = document.createElement("option")
    autonomousOption.value = "Autônomo"
    autonomousOption.textContent = "Autônomo"
    contractTypeInput.appendChild(autonomousOption)
  }
  Object.keys(editableFields).forEach(function (key) {
    editableFields[key].addEventListener("input", function () {
      manualFields[key] = true
    })
    editableFields[key].addEventListener("change", function () {
      manualFields[key] = true
    })
  })

  function normalizeDuplicateValue (value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[.-]/g, "")
      .trim()
      .replace(/\s+/g, " ")
  }

  function duplicateDateLabel (value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "Data não disponível" : date.toLocaleString("pt-BR")
  }

  let duplicateConfirmationResolver = null
  function resolveDuplicateConfirmation (confirmed) {
    const resolve = duplicateConfirmationResolver
    duplicateConfirmationResolver = null
    if (typeof duplicateDialog.close === "function" && duplicateDialog.open) {
      duplicateDialog.close()
    }
    if (resolve) {
      resolve(confirmed)
    }
  }

  function confirmDuplicateVacancy (duplicate) {
    const message =
      "Você já publicou essa vaga antes:\n" +
      "Empresa: " +
      (duplicate.company || "A consultar") +
      "\n" +
      "Cargo: " +
      (duplicate.role || "A consultar") +
      "\n" +
      "Publicada em: " +
      duplicateDateLabel(duplicate.createdAt) +
      "\n" +
      "¿Deseja adicionar mesmo assim?"
    duplicateMessage.textContent = message
    if (typeof duplicateDialog.showModal !== "function") {
      return Promise.resolve(window.confirm("⚠️ ATENÇÃO! VAGA DUPLICADA\n" + message))
    }
    return new Promise(function (resolve) {
      duplicateConfirmationResolver = resolve
      duplicateDialog.showModal()
      duplicateConfirmButton.focus()
    })
  }

  duplicateCancelButton.addEventListener("click", function () {
    resolveDuplicateConfirmation(false)
  })
  duplicateConfirmButton.addEventListener("click", function () {
    resolveDuplicateConfirmation(true)
  })
  duplicateDialog.addEventListener("cancel", function (event) {
    event.preventDefault()
    resolveDuplicateConfirmation(false)
  })
  duplicateDialog.addEventListener("close", function () {
    if (duplicateConfirmationResolver) {
      resolveDuplicateConfirmation(false)
    }
  })

  function isPublicWebLink (parsed) {
    if (parsed.username || parsed.password) {
      return false
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "")
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host === "0.0.0.0" ||
      host.indexOf(":") !== -1
    ) {
      return false
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4) {
      const parts = ipv4.slice(1).map(Number)
      if (
        parts.some(function (part) {
          return part > 255
        })
      ) {
        return false
      }
      if (
        parts[0] === 10 ||
        parts[0] === 127 ||
        parts[0] === 0 ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      ) {
        return false
      }
    }
    return true
  }

  function getValidLink () {
    const value = linkInput.value.trim()
    try {
      const parsed = new URL(value)
      if (
        (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
        !isPublicWebLink(parsed)
      ) {
        return ""
      }
      if (
        Array.from(parsed.searchParams.keys()).some(function (key) {
          return /^(?:token|access_token|api_key|key|auth|authorization|code|session|signature|secret|password)$/i.test(
            key
          )
        })
      ) {
        return ""
      }
      return parsed.href
    } catch (error) {
      return ""
    }
  }

  const defaultFieldValues = {
    company: "A consultar",
    role: "",
    salary: "A consultar",
    city: "A consultar",
    model: "A consultar",
    contractType: "A consultar",
    schedule: "A consultar",
    activities: "",
    benefits: "",
    requirements: ""
  }

  function setAutoValue (field, value) {
    const input = editableFields[field]
    let cleaned = (value || "").replace(/\s+/g, " ").trim()
    if (field === "schedule") {
      cleaned = normalizeSchedule(cleaned)
    }
    if (field === "city") {
      cleaned = normalizeCityValue(cleaned)
    }
    if (
      !input ||
      !cleaned ||
      isInvalidJobText(cleaned) ||
      isTokenLike(cleaned) ||
      (field === "role" && !isPlausibleJobTitle(cleaned)) ||
      manualFields[field]
    ) {
      return false
    }
    const current = input.value.trim()
    const isDefault = !current || current === defaultFieldValues[field]
    if (!isDefault && current !== lastAutoValues[field]) {
      return false
    }
    if (
      input.tagName === "SELECT" &&
      !Array.from(input.options).some(function (option) {
        return option.value === cleaned
      })
    ) {
      return false
    }
    input.value = cleaned
    lastAutoValues[field] = cleaned
    return true
  }

  function parseTitle (title, filled) {
    if (!title || isInvalidJobText(title) || isTokenLike(title)) {
      return false
    }
    const cleaned = title
      .replace(/\s*[|–—-]\s*(?:Catho|Indeed|Gupy|InfoJobs|LinkedIn|Instagram|Google Jobs).*$/i, "")
      .trim()
    if (
      !cleaned ||
      /^(?:catho|indeed|gupy|infojobs|linkedin|google(?: jobs)?|instagram)$/i.test(cleaned)
    ) {
      return false
    }
    const parts = cleaned
      .split(/\s(?:-|–|—|\|)\s/)
      .map(function (part) {
        return part.trim()
      })
      .filter(Boolean)

    if (parts.length >= 2) {
      setTrackedValue("role", parts[0], filled)
      if (!findCityInText(parts[1])) {
        setTrackedValue("company", parts[1], filled)
      }
    } else if (cleaned) {
      setTrackedValue("role", cleaned, filled)
    }
    return true
  }

  function isInvalidJobText (value) {
    const text = (value || "").trim()
    return (
      /\b(?:401|403|404|500)\b/i.test(text) ||
      /(?:access\s*denied|google\s*search|just\s+a\s+moment|redirecting|page\s+not\s+found|not\s+found|forbidden|captcha|cloudflare|temporarily\s+unavailable)/i.test(
        text
      ) ||
      /^(?:error|an?\s+error\s+occurred|something\s+went\s+wrong)(?:\b.*)?$/i.test(text)
    )
  }

  function isTokenLike (value) {
    const text = (value || "").trim()
    if (!text) {
      return false
    }
    const compact = text.replace(/[^a-z0-9]/gi, "")
    const mixedCaseToken =
      /^[a-z0-9_-]{24,}$/i.test(text) && /[a-z]/.test(text) && /[A-Z]/.test(text)
    const digitCount = (compact.match(/\d/g) || []).length
    const shortMixedToken =
      /^[a-z0-9]{16,}$/i.test(text) && /[a-z]/.test(text) && /[A-Z]/.test(text) && digitCount >= 2
    if (mixedCaseToken || shortMixedToken) {
      return true
    }

    const words = text.match(/[a-zÀ-ÿ]+/gi) || []
    return (
      words.some(function (word) {
        const normalized = word
          .toLocaleLowerCase("pt-BR")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
        const vowels = (normalized.match(/[aeiou]/g) || []).length
        const ratio = vowels / normalized.length
        return (
          (normalized.length >= 20 && ratio < 0.31) ||
          (normalized.length >= 28 && ratio < 0.38) ||
          (normalized.length >= 36 && compact.length >= 36)
        )
      }) ||
      (/^[a-z0-9]+$/i.test(compact) &&
        compact.length >= 34 &&
        (compact.match(/[aeiou]/gi) || []).length / compact.length < 0.32)
    )
  }

  function isPlausibleJobTitle (value) {
    const text = (value || "").trim()
    if (!text || isInvalidJobText(text) || isTokenLike(text)) {
      return false
    }
    const normalized = text
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
    return (
      !/^(?:vaga|vagas|emprego|empregos|job|jobs|career|careers|oportunidade|oportunidades|google search|linkedin|catho|indeed|gupy|infojobs|a consultar|cargo nao identificado)$/i.test(
        normalized
      ) && (normalized.match(/[a-z]/g) || []).length >= 3
    )
  }

  function isPlausibleSchedule (value) {
    const normalized = (value || "")
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (!normalized) {
      return false
    }
    if (
      /\b(?:horario\s+comercial|horario\s+(?:flexivel|variavel|a combinar)|flexibilidade\s+de\s+horarios?|diurno|noturno)\b/.test(
        normalized
      ) ||
      /\bflexivel\s+conforme\s+(?:a\s+)?(?:demanda|necessidade)\b/.test(normalized) ||
      /\bconforme\s+(?:a\s+)?(?:demanda|necessidade)(?:\s+de\s+(?:visitas|atendimento))?\b/.test(
        normalized
      ) ||
      /\bturno(?:\s+(?:da|de|do)\s+)?(?:manha|tarde|noite|madrugada)\b/.test(normalized) ||
      /\b\d{1,2}\s*x\s*\d{1,2}\b/.test(normalized) ||
      /\bescala\s+(?:de\s+)?(?:trabalho|revezamento|rotativa|alternada|flexivel|a\s+combinar)\b/.test(
        normalized
      ) ||
      /\b(?:segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)\s+(?:a|ate|[-–—])\s*(?:segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)\b/.test(
        normalized
      )
    ) {
      return true
    }

    const ranges =
      /\b(?:das?\s*)?((?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)?)\s*(?:as|[-–—])\s*((?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)?)\b/gi
    let match
    while ((match = ranges.exec(normalized))) {
      if (
        /[h:]/i.test(match[1]) ||
        /[h:]/i.test(match[2]) ||
        (match[1].length === 2 && match[2].length === 2)
      ) {
        return true
      }
    }
    return false
  }

  function normalizeSchedule (value) {
    const cleaned = (value || "").replace(/\s+/g, " ").trim()
    if (!cleaned || cleaned.length > 180) {
      return ""
    }
    if (
      /^hor[aá]rio\s+(?:comercial|flex[ií]vel|vari[aá]vel|a\s+combinar)\b/i.test(cleaned) &&
      isPlausibleSchedule(cleaned)
    ) {
      return cleaned
    }
    const withoutLabel = cleaned.replace(
      /^(?:hor[aá]rio(?:\s+de\s+trabalho)?(?:\s*\/\s*turno)?|turno|jornada|work\s*hours)\s*[:\-–]?\s*/i,
      ""
    )
    if (
      /^(?:hor[aá]rio(?:\s+de\s+trabalho)?|work\s*hours)\s*[:\-–]\s*/i.test(cleaned) &&
      isPlausibleSchedule(withoutLabel)
    ) {
      return withoutLabel
    }
    if (isPlausibleSchedule(withoutLabel)) {
      return withoutLabel
    }
    if (isPlausibleSchedule(cleaned)) {
      return cleaned
    }
    return ""
  }

  function readableSlug (value) {
    let decoded = value || ""
    try {
      decoded = decodeURIComponent(decoded)
    } catch (error) {
      decoded = decoded.replace(/%20/gi, " ")
    }
    return decoded
      .replace(/\d+/g, " ")
      .replace(/[-_]+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  function cleanSectionText (value) {
    return (value || "")
      .replace(
        /\b(?:candidate-se|candidatar-se|inscreva-se|aplique agora|apply now|veja mais vagas|criar conta|entrar na sua conta|faça login|faca login|cadastre-se|login|register|sign in|sign up)\b[\s\S]*$/i,
        ""
      )
      .replace(/[\s,;:|•–—-]+$/g, "")
      .replace(/\s+(?:e|ou|de|da|do|das|dos|para|com|por|que|a|o|as|os)$/i, "")
      .trim()
  }

  function cleanBenefitsText (value) {
    return cleanSectionText(
      (value || "")
        .split(/\r?\n/)
        .map(function (line) {
          return line.trim()
        })
        .filter(function (line) {
          return line && !/:\s*$/.test(line)
        })
        .join("; ")
    )
  }

  function removeDuplicateRequirementText (requirements, activities, benefits) {
    function normalize (value) {
      return (value || "")
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    }
    const existing = [normalize(activities), normalize(benefits)].filter(Boolean)
    if (!normalize(requirements) || existing.indexOf(normalize(requirements)) !== -1) {
      return ""
    }
    return (requirements || "")
      .split(/[;\n]+/)
      .map(function (part) {
        return part.trim()
      })
      .filter(function (part) {
        return part && existing.indexOf(normalize(part)) === -1
      })
      .join("; ")
  }

  function isSectionBoundary (line) {
    return /^(?:como se candidatar|candidate-se|candidatar-se|inscreva-se|aplique agora|apply now|sobre a empresa|etapas do processo|mais informa[cç][oõ]es|cadastre-se|fa[cç]a login|entrar na sua conta)\b/i.test(
      line
    )
  }

  function titleCase (value) {
    const smallWords = ["da", "de", "do", "das", "dos", "e"]
    const spelling = {
      rh: "RH",
      ti: "TI",
      pcd: "PCD",
      cnpj: "CNPJ",
      mei: "MEI",
      sao: "São",
      goncalves: "Gonçalves",
      ijui: "Ijuí",
      bage: "Bagé",
      tramandai: "Tramandaí",
      venancio: "Venâncio",
      tres: "Três",
      producao: "produção",
      operacao: "operação",
      administracao: "administração",
      reposicao: "reposição",
      gestao: "gestão",
      tecnico: "técnico",
      tecnica: "técnica",
      eletrico: "elétrico",
      eletrica: "elétrica",
      mecanico: "mecânico",
      mecanica: "mecânica",
      logistica: "logística",
      comunicacao: "comunicação",
      contabil: "contábil",
      saude: "saúde",
      educacao: "educação",
      seguranca: "segurança",
      manutencao: "manutenção",
      construcao: "construção",
      analise: "análise",
      comercio: "comércio",
      servicos: "serviços"
    }
    return value
      .toLocaleLowerCase("pt-BR")
      .split(" ")
      .map(function (word, index) {
        if (spelling[word]) {
          if (spelling[word] === spelling[word].toUpperCase()) {
            return spelling[word]
          }
          return spelling[word].charAt(0).toLocaleUpperCase("pt-BR") + spelling[word].slice(1)
        }
        return index > 0 && smallWords.indexOf(word) !== -1
          ? word
          : word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1)
      })
      .join(" ")
  }

  function parseLinkDetails (link) {
    const result = { role: "", city: "" }
    try {
      const parsed = new URL(link)
      const params = parsed.searchParams
      const roleFromQuery =
        params.get("cargo") ||
        params.get("title") ||
        params.get("job") ||
        params.get("role") ||
        params.get("q") ||
        params.get("query")
      const cityFromQuery =
        params.get("cidade") || params.get("city") || params.get("location") || params.get("local")
      if (roleFromQuery) {
        const queryRole = titleCase(readableSlug(roleFromQuery))
        if (isPlausibleJobTitle(queryRole)) {
          result.role = queryRole
        }
      }
      if (cityFromQuery && !isTokenLike(cityFromQuery)) {
        result.city = normalizeCityValue(readableSlug(cityFromQuery))
      }

      const ignored =
        /^(?:vaga|vagas|emprego|empregos|job|jobs|career|careers|oportunidade|oportunidades|rs|br|p|reel|reels|stories|post|posts|share|company|companies|profile|search|view|viewjob|search-results)$/i
      let segments = parsed.pathname
        .split("/")
        .filter(Boolean)
        .filter(function (segment) {
          return (
            !/^\d+$/.test(segment) && !isTokenLike(segment) && !ignored.test(readableSlug(segment))
          )
        })
      if (
        /(\.|^)instagram\.com$/i.test(parsed.hostname) &&
        (segments.length === 1 ||
          !segments.length ||
          /^(?:[a-z0-9_-]+)$/i.test(segments[segments.length - 1]))
      ) {
        segments = []
      }
      const slug = readableSlug(segments.join(" ")).replace(/([a-z])rs$/i, "$1 rs")
      let words = slug ? slug.split(" ") : []
      const cities = [
        "caxias do sul",
        "porto alegre",
        "santa maria",
        "novo hamburgo",
        "sao leopoldo",
        "rio grande",
        "passo fundo",
        "bento goncalves",
        "santa cruz do sul",
        "cachoeirinha",
        "alvorada",
        "gravatai",
        "canoas",
        "pelotas",
        "erechim",
        "lajeado",
        "ijui",
        "bage",
        "farroupilha",
        "sapiranga",
        "esteio",
        "santa rosa",
        "uruguaiana",
        "cruz alta",
        "carazinho",
        "vacaria",
        "tramandai",
        "torres",
        "sao borja",
        "venancio aires",
        "guaiba",
        "estancia velha",
        "campo bom",
        "taquara",
        "cachoeira do sul",
        "santo angelo",
        "frederico westphalen",
        "sao jose do norte",
        "sao gabriel",
        "tres passos",
        "marau",
        "capao da canoa",
        "charqueadas"
      ]

      if (!result.city && words.length) {
        const cityInSlug = findCityInText(slug)
        if (cityInSlug) {
          result.city = cityInSlug
          const citySlugToRemove = readableSlug(cityInSlug)
            .toLocaleLowerCase("pt-BR")
            .replace(/\s+(?:go|rs)$/, "")
          const cityPosition = slug.toLocaleLowerCase("pt-BR").lastIndexOf(citySlugToRemove)
          if (cityPosition >= 0) {
            words = readableSlug(slug.slice(0, cityPosition)).split(" ").filter(Boolean)
          }
        }
      }

      if (result.city && words.length && !result.role) {
        const citySlug = readableSlug(result.city)
          .toLocaleLowerCase("pt-BR")
          .replace(/\s+rs$/, "")
        const pathWords = words.slice()
        if (pathWords[pathWords.length - 1].toLocaleLowerCase("pt-BR") === "rs") {
          pathWords.pop()
        }
        const pathSlug = pathWords.join(" ").toLocaleLowerCase("pt-BR")
        if (citySlug && pathSlug.endsWith(citySlug)) {
          words = readableSlug(pathSlug.slice(0, pathSlug.length - citySlug.length))
            .split(" ")
            .filter(Boolean)
        }
      }

      if (!result.city && words.length) {
        let rsIndex = -1
        for (let i = words.length - 1; i >= 0; i--) {
          if (words[i].toLocaleLowerCase("pt-BR") === "rs") {
            rsIndex = i
            break
          }
        }
        const locationWords = words
          .slice(0, rsIndex > 0 ? rsIndex : words.length)
          .join(" ")
          .toLocaleLowerCase("pt-BR")
        for (let c = 0; c < cities.length; c++) {
          if (locationWords.endsWith(cities[c])) {
            const cityAt = locationWords.length - cities[c].length
            result.city = titleCase(cities[c]) + " - RS"
            words = readableSlug(locationWords.slice(0, cityAt)).split(" ").filter(Boolean)
            break
          }
        }
        if (!result.city && rsIndex > 0) {
          const cityStart = Math.max(0, rsIndex - 2)
          const cityWords = words.slice(cityStart, rsIndex)
          result.city = titleCase(cityWords.join(" ")) + " - RS"
          words = words.slice(0, cityStart)
        } else if (!result.city) {
          const slugLower = words.join(" ").toLocaleLowerCase("pt-BR")
          for (let cityIndex = 0; cityIndex < cities.length; cityIndex++) {
            const foundAt = slugLower.lastIndexOf(cities[cityIndex])
            if (foundAt >= 0) {
              result.city = titleCase(cities[cityIndex]) + " - RS"
              words = readableSlug(slug.slice(0, foundAt)).split(" ").filter(Boolean)
              break
            }
          }
        }
      }

      if (!result.role && words.length) {
        while (
          /^(?:vaga|vagas|emprego|empregos|job|jobs|career|careers|oportunidade|oportunidades|de)$/i.test(
            words[0]
          )
        ) {
          words.shift()
        }
        const pathRole = titleCase(words.join(" "))
        if (isPlausibleJobTitle(pathRole)) {
          result.role = pathRole
        }
      }
    } catch (error) {
      return result
    }
    return result
  }

  function addFilled (filled, field) {
    if (!filled) {
      return
    }
    const label = {
      company: "Empresa",
      role: "Cargo",
      salary: "Salário",
      city: "Cidade",
      model: "Modelo",
      contractType: "Tipo de contratação",
      schedule: "Horário",
      activities: "Atividades",
      benefits: "Benefícios",
      requirements: "Requisitos"
    }[field]
    if (label && filled.indexOf(label) === -1) {
      filled.push(label)
    }
  }

  function setTrackedValue (field, value, filled) {
    if (setAutoValue(field, value)) {
      addFilled(filled, field)
    }
  }

  function setFallbackValue (field, value, filled) {
    const input = editableFields[field]
    if (!input || manualFields[field]) {
      return
    }
    const current = input.value.trim()
    if (!current || current === defaultFieldValues[field]) {
      setTrackedValue(field, value, filled)
    }
  }

  function clearAutoValues () {
    Object.keys(editableFields).forEach(function (field) {
      if (
        !manualFields[field] &&
        lastAutoValues[field] &&
        editableFields[field].value.trim() === lastAutoValues[field]
      ) {
        editableFields[field].value = defaultFieldValues[field] || ""
        delete lastAutoValues[field]
      }
    })
  }

  function fillFromLink (link, filled, onlyEmpty) {
    if (!link) {
      return
    }
    const details = parseLinkDetails(link)
    const setValue = onlyEmpty ? setFallbackValue : setTrackedValue
    setValue("role", details.role, filled)
    setValue("city", details.city, filled)
    applyTextDetails(link, filled, onlyEmpty)
  }

  function extractSalary (text) {
    let source = text || ""
    try {
      source = decodeURIComponent(source)
    } catch (error) {
      source = source.replace(/%20/gi, " ")
    }
    const exactSalary = source.match(
      /(?:a partir de\s+|sal[aá]rio(?:\s+de)?\s*)?R\$\s*[\d.]+(?:,\d{2})?(?:\s*(?:a|até|–|—|-)\s*(?:R\$\s*)?[\d.]+(?:,\d{2})?)?/i
    )
    if (exactSalary) {
      return exactSalary[0].trim()
    }
    source = source.replace(/[-_]+/g, " ")
    const phrase = source.match(/a\s+combinar|sal[aá]rio\s+compat[ií]vel(?:\s+com\s+o\s+mercado)?/i)
    if (phrase) {
      return /^a\s+combinar$/i.test(phrase[0]) ? "A Combinar" : "Salário compatível"
    }
    const salaryPrefix = /\ba\s+partir\s+de\b/i.test(source) ? "A partir de " : ""
    const currency = source.match(/R\$\s*([\d.]+(?:,\d{2})?)/i)
    if (currency) {
      return salaryPrefix + "R$ " + currency[1].replace(/[.,]+$/, "")
    }
    const formattedNumber = source.match(/\b\d{1,3}(?:\.\d{3})+,\d{2}\b/)
    if (formattedNumber) {
      return salaryPrefix + "R$ " + formattedNumber[0]
    }
    const salaryAmount = source.match(/sal[aá]rio\s*(?:de|:)?\s*(\d{3,6}(?:,\d{2})?)/i)
    return salaryAmount ? salaryPrefix + "R$ " + salaryAmount[1] : ""
  }

  const textFieldPatterns = {
    role: /^\s*(?:cargo|vaga|t[ií]tulo|posi[cç][aã]o)\s*[:\-–]?\s*(.*)$/i,
    company: /^\s*(?:empresa|contratante|empresa contratante)\s*[:\-–]?\s*(.*)$/i,
    city: /^\s*(?:cidade|local|localidade|localiza[cç][aã]o)\s*[:\-–]?\s*(.*)$/i,
    model: /^\s*(?:modelo(?: de trabalho)?|modalidade)\s*[:\-–]?\s*(.*)$/i,
    salary: /^\s*(?:sal[aá]rio|faixa salarial|remunera[cç][aã]o)\s*[:\-–]?\s*(.*)$/i,
    contractType:
      /^\s*(?:tipo(?:\s+de\s+(?:contrata[cç][aã]o|contrato))?|regime|contrata[cç][aã]o)\s*[:\-–]?\s*(.*)$/i,
    schedule:
      /^\s*(?:hor[aá]rio(?:\s+de\s+trabalho)?(?:\s*\/\s*turno)?|turno|jornada|work\s*hours)\s*[:\-–]?\s*(.*)$/i,
    activities:
      /^\s*(?:atividades|responsabilidades|o que vai fazer|principais atividades|descri[cç][aã]o da vaga|job description|responsibilities)\s*[:\-–]?\s*(.*)$/i,
    benefits:
      /^\s*(?:benef[ií]cios?(?:(?:\s+(?:e\s+vantagens|que\s+fazem\s+a\s+diferen[cç]a))|(?:\s+[^:]{1,60}:))?|o que voc[eê] recebe|o que oferecemos|benefits|job\s*benefits)\s*[:\-–]?\s*(.*)$/i,
    requirements:
      /^\s*(?:requisitos|pr[eé]-requisitos|qualifica[cç][oõ]es|o que precisa|o que buscamos|perfil(?:\s+desejado)?|perfil\s+[^:]{1,40}:|requirements|qualifications)\??\s*[:\-–]?\s*(.*)$/i
  }

  function cleanPlainText (value) {
    return (value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "\n")
      .replace(/[\t ]+\n/g, "\n")
      .replace(/\n[\t ]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  function extractLabeledSection (text, field) {
    const lines = cleanPlainText(text)
      .split("\n")
      .map(function (line) {
        return line.replace(/^\s*[•✔✅\-–—]+\s*/, "").trim()
      })
    const pattern = textFieldPatterns[field]
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(pattern)
      if (!match) {
        continue
      }
      const values = match[1] ? [match[1].trim()] : []
      const multiLine = ["activities", "benefits", "requirements"].indexOf(field) !== -1
      if (!multiLine && values.length) {
        return field === "schedule" ? normalizeSchedule(lines[i]) : values[0]
      }
      for (let j = i + 1; j < lines.length; j++) {
        if (isSectionBoundary(lines[j])) {
          break
        }
        if (field === "benefits" && /:\s*$/.test(lines[j])) {
          continue
        }
        const sameField = lines[j].match(pattern)
        if (sameField) {
          if (field === "schedule" && sameField[1]) {
            values.push(lines[j])
          }
          if (
            multiLine &&
            field !== "schedule" &&
            sameField[1] &&
            !(field === "benefits" && /:\s*$/.test(sameField[1]))
          ) {
            values.push(sameField[1].trim())
          }
          if (multiLine && field !== "schedule") {
            continue
          }
          break
        }
        const nextSection = Object.keys(textFieldPatterns).some(function (key) {
          return textFieldPatterns[key].test(lines[j])
        })
        if (nextSection) {
          break
        }
        if (lines[j]) {
          values.push(lines[j])
          if (!multiLine) {
            break
          }
        }
      }
      const section = cleanSectionText(values.filter(Boolean).join("; "))
      return field === "schedule"
        ? normalizeSchedule([lines[i], section].filter(Boolean).join(" "))
        : section
    }
    return ""
  }

  function findCityInText (text) {
    const cities = [
      "aparecida de goiania",
      "goiania",
      "anapolis",
      "caxias do sul",
      "porto alegre",
      "santa maria",
      "novo hamburgo",
      "sao leopoldo",
      "rio grande",
      "passo fundo",
      "bento goncalves",
      "santa cruz do sul",
      "cachoeirinha",
      "alvorada",
      "gravatai",
      "canoas",
      "pelotas",
      "erechim",
      "lajeado",
      "ijui",
      "bage",
      "farroupilha",
      "sapiranga",
      "esteio",
      "santa rosa",
      "uruguaiana",
      "cruz alta",
      "carazinho",
      "vacaria",
      "tramandai",
      "torres",
      "sao borja",
      "venancio aires",
      "guaiba",
      "estancia velha",
      "campo bom",
      "taquara",
      "cachoeira do sul",
      "santo angelo",
      "frederico westphalen",
      "sao jose do norte",
      "sao gabriel",
      "tres passos",
      "marau",
      "capao da canoa",
      "charqueadas"
    ]
    const normalized = (text || "")
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
    for (let i = 0; i < cities.length; i++) {
      if (new RegExp("\\b" + cities[i].replace(/ /g, "\\s+") + "\\b").test(normalized)) {
        const cityName =
          cities[i] === "goiania"
            ? "Goiânia"
            : cities[i] === "anapolis"
              ? "Anápolis"
              : cities[i] === "aparecida de goiania"
                ? "Aparecida de Goiânia"
                : titleCase(cities[i])
        return cityName + (i < 3 ? " - GO" : " - RS")
      }
    }
    return ""
  }

  function normalizeCityValue (value) {
    const city = (value || "").trim()
    if (!city) {
      return ""
    }
    const specific = findCityInText(city)
    if (specific) {
      return specific
    }
    const normalized = city
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
    const states = {
      go: "GO",
      goias: "GO",
      rs: "RS",
      "rio grande do sul": "RS",
      sp: "SP",
      "sao paulo": "SP",
      rj: "RJ",
      "rio de janeiro": "RJ",
      mg: "MG",
      "minas gerais": "MG",
      df: "DF",
      "distrito federal": "DF",
      pr: "PR",
      parana: "PR",
      sc: "SC",
      "santa catarina": "SC",
      ba: "BA",
      bahia: "BA",
      pe: "PE",
      pernambuco: "PE",
      ce: "CE",
      ceara: "CE",
      es: "ES",
      "espirito santo": "ES",
      ma: "MA",
      maranhao: "MA",
      mt: "MT",
      "mato grosso": "MT",
      ms: "MS",
      "mato grosso do sul": "MS",
      pa: "PA",
      para: "PA",
      pb: "PB",
      paraiba: "PB",
      pi: "PI",
      piaui: "PI",
      rn: "RN",
      "rio grande do norte": "RN",
      ro: "RO",
      rondonia: "RO",
      rr: "RR",
      roraima: "RR",
      ac: "AC",
      acre: "AC",
      al: "AL",
      alagoas: "AL",
      ap: "AP",
      amapa: "AP",
      am: "AM",
      amazonas: "AM",
      se: "SE",
      sergipe: "SE",
      to: "TO",
      tocantins: "TO"
    }
    const parts = normalized.split(/\s*[-,/]\s*/)
    if (parts.length > 1 && states[parts[parts.length - 1]]) {
      return titleCase(city.split(/\s*[-,/]\s*/)[0]) + " - " + states[parts[parts.length - 1]]
    }
    return city
  }

  function isStateOnlyLocation (value) {
    const normalized = (value || "")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
    return /^(?:goias(?:\s*-\s*go)?|go|rio grande do sul(?:\s*-\s*rs)?|rs|sao paulo(?:\s*-\s*sp)?|sp|rio de janeiro(?:\s*-\s*rj)?|rj|minas gerais(?:\s*-\s*mg)?|mg|distrito federal(?:\s*-\s*df)?|df)$/.test(
      normalized
    )
  }

  function normalizeContractType (value) {
    const type = (value || "").toLocaleLowerCase("pt-BR")
    if (/tempor/.test(type)) {
      return "Temporário"
    }
    if (/est[aá]gio|internship/.test(type)) {
      return "Estágio"
    }
    if (/aut[oô]nom[oa]|self.?employed|freelancer/.test(type)) {
      return "Autônomo"
    }
    if (/\bpj\b/.test(type)) {
      return "PJ"
    }
    if (/diarista/.test(type)) {
      return "Diarista"
    }
    if (/full.?time/.test(type)) {
      return "Tempo integral"
    }
    if (/part.?time/.test(type)) {
      return "Meio período"
    }
    if (/contractor/.test(type)) {
      return "Contrato"
    }
    if (/volunteer/.test(type)) {
      return "Voluntário"
    }
    if (/clt|efetivo/.test(type)) {
      return "CLT (Efetivo)"
    }
    if (/a combinar|unspecified/.test(type)) {
      return "A combinar"
    }
    return ""
  }

  function applyTextDetails (text, filled, onlyEmpty) {
    if (!text) {
      return
    }
    const fields = [
      "role",
      "company",
      "city",
      "model",
      "salary",
      "contractType",
      "schedule",
      "activities",
      "benefits",
      "requirements"
    ]
    const details = {}
    fields.forEach(function (field) {
      details[field] = extractLabeledSection(text, field)
    })
    details.benefits = cleanBenefitsText(details.benefits)
    details.requirements = removeDuplicateRequirementText(
      details.requirements,
      details.activities,
      details.benefits
    )
    const cityInText = findCityInText(text)
    if (cityInText && (!details.city || isStateOnlyLocation(details.city))) {
      details.city = cityInText
    } else {
      details.city = normalizeCityValue(details.city)
    }
    if (!details.salary) {
      details.salary = extractSalary(text)
    }
    if (!details.contractType) {
      details.contractType = normalizeContractType(text)
    } else {
      details.contractType = normalizeContractType(details.contractType) || details.contractType
    }
    if (!details.model) {
      const modelMatch = text.match(/\b(remoto|h[ií]brido|presencial)\b/i)
      if (modelMatch) {
        details.model = titleCase(modelMatch[1])
      }
    }
    if (!details.schedule) {
      const scheduleMatch = text.match(/(?:hor[aá]rio|turno|jornada)\s*[:-]?\s*([^.;\n]+)/i)
      if (scheduleMatch) {
        details.schedule = normalizeSchedule(scheduleMatch[0].trim())
      }
    }
    Object.keys(details).forEach(function (field) {
      if (onlyEmpty) {
        setFallbackValue(field, details[field], filled)
      } else {
        setTrackedValue(field, details[field], filled)
      }
    })
  }

  function isSensitiveLink (link) {
    try {
      const parsed = new URL(link)
      return (
        !isPublicWebLink(parsed) ||
        Array.from(parsed.searchParams.keys()).some(function (key) {
          return /^(?:token|access_token|api_key|key|auth|authorization|code|session|signature|secret|password)$/i.test(
            key
          )
        })
      )
    } catch (error) {
      return true
    }
  }

  function applyApiDetails (data, filled) {
    parseTitle(data.title, filled)
    let apiCity = data.city
    if (isStateOnlyLocation(apiCity)) {
      apiCity =
        findCityInText([data.title, data.activities, data.requirements].join(" ")) || apiCity
    }
    ;[
      "company",
      "city",
      "salary",
      "model",
      "contractType",
      "schedule",
      "activities",
      "benefits",
      "requirements"
    ].forEach(function (field) {
      setTrackedValue(field, field === "city" ? apiCity : data[field], filled)
    })
    if (typeof data.descriptionText === "string") {
      applyTextDetails(data.descriptionText, filled, true)
    }
  }

  document.getElementById("new-job").addEventListener("click", function () {
    if (!window.confirm("Tem certeza que quer limpar tudo e começar uma nova vaga?")) {
      return
    }
    linkInput.value = ""
    Object.keys(editableFields).forEach(function (field) {
      editableFields[field].value = ""
    })
    manualFields = {}
    lastAutoValues = {}
    instagramCaptionOutput.value = ""
    whatsappPostOutput.value = ""
    fetchStatus.textContent = ""
    postStatus.textContent = ""
    gestorStatus.textContent = ""
    instagramStatus.textContent = ""
    whatsappStatus.textContent = ""
    imageStatus.textContent = ""
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
    }
    imageUrl = ""
    generatedImageBlob = null
    preview.removeAttribute("src")
    document.getElementById("preview-wrap").hidden = true
    document.getElementById("download-image").disabled = true
    document.getElementById("btnCopiarImagem").disabled = true
    document.getElementById("btnCompartilharImagem").hidden = true
    setOutputTab("instagram")
    linkInput.focus()
  })

  document.getElementById("fetch-button").addEventListener("click", async function () {
    const link = getValidLink()
    if (!link) {
      if (!manualFields.role && roleInput.value.trim() === lastAutoValues.role) {
        roleInput.value = ""
        delete lastAutoValues.role
      }
      const enteredLink = linkInput.value.trim()
      fetchStatus.textContent = !enteredLink
        ? "Cole o link público da vaga antes de buscar os dados."
        : isSensitiveLink(enteredLink)
          ? "Por segurança, só é possível consultar links públicos sem credenciais, tokens ou endereços locais."
          : "Cole um link público válido começando com http:// ou https://."
      return
    }

    const button = document.getElementById("fetch-button")
    const spinner = document.getElementById("fetch-spinner")
    const filled = []
    const errors = []
    let resolvedLink = link
    clearAutoValues()
    button.disabled = true
    button.setAttribute("aria-busy", "true")
    spinner.hidden = false
    fetchStatus.textContent = "Buscando dados do link. Isso pode levar alguns segundos..."
    try {
      const response = await fetch("/api/vaga?url=" + encodeURIComponent(link), {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(
          data && data.error ? data.error : "O servidor não conseguiu ler este portal."
        )
      }
      if (typeof data.finalUrl === "string" && /^https?:\/\//i.test(data.finalUrl)) {
        resolvedLink = data.finalUrl
      }
      applyApiDetails(data, filled)
    } catch (error) {
      errors.push(error.message || "Não foi possível consultar o servidor de vagas.")
    } finally {
      button.disabled = false
      button.setAttribute("aria-busy", "false")
      spinner.hidden = true
    }

    fillFromLink(resolvedLink, filled, true)
    if (!manualFields.role && !isPlausibleJobTitle(roleInput.value)) {
      roleInput.value = ""
      delete lastAutoValues.role
    }
    const roleAvailable = isPlausibleJobTitle(roleInput.value)
    const review = []
    const labels = {
      company: "Empresa",
      role: "Cargo",
      salary: "Salário",
      city: "Cidade",
      model: "Modelo",
      contractType: "Tipo",
      schedule: "Horário",
      activities: "Atividades",
      benefits: "Benefícios",
      requirements: "Requisitos"
    }
    Object.keys(editableFields).forEach(function (field) {
      const value = editableFields[field].value.trim()
      if (!value || value === defaultFieldValues[field]) {
        review.push(labels[field])
      }
    })
    let status
    if (!roleAvailable) {
      status =
        "Não foi possível extrair automaticamente os dados do link. Complete ou ajuste os campos manualmente antes de gerar o post e a imagem."
    } else if (errors.length) {
      status =
        "O portal bloqueou a leitura ou o servidor não conseguiu acessá-lo. Cargo identificado pela URL; complete ou ajuste os demais campos manualmente antes de gerar o post e a imagem."
    } else {
      status = filled.length
        ? "Dados preenchidos: " + filled.join(", ") + ". "
        : "Confira os dados encontrados. "
      status += review.length
        ? "Confira ou complete: " + review.join(", ") + "."
        : "Confira os dados antes de gerar o post e a imagem."
    }
    if (errors.length) {
      status += " Detalhe: " + errors.join("; ") + "."
    }
    fetchStatus.textContent = status
  })
  function summarizeItems (text, limit, maxLength) {
    const source = (text || "").trim()
    if (!source) {
      return ["A consultar"]
    }
    const items = source
      .replace(/[•;]/g, "\n")
      .replace(/[.!?]\s+/g, "\n")
      .split(/[\n,]+/)
      .map(function (item) {
        return item.replace(/^[\s\-–—✔✅]+|[\s]+$/g, "").trim()
      })
      .filter(Boolean)
    if (!items.length) {
      return ["A consultar"]
    }
    return items.slice(0, limit).map(function (item) {
      if (item.length <= maxLength) {
        return item
      }
      const shortened = item.slice(0, maxLength - 1)
      const lastSpace = shortened.lastIndexOf(" ")
      return (lastSpace > 0 ? shortened.slice(0, lastSpace) : shortened) + "…"
    })
  }

  function setOutputTab (format) {
    const showInstagram = format === "instagram"
    instagramTab.setAttribute("aria-selected", showInstagram ? "true" : "false")
    whatsappTab.setAttribute("aria-selected", showInstagram ? "false" : "true")
    instagramPanel.hidden = !showInstagram
    whatsappPanel.hidden = showInstagram
  }

  instagramTab.addEventListener("click", function () {
    setOutputTab("instagram")
  })
  whatsappTab.addEventListener("click", function () {
    setOutputTab("whatsapp")
  })

  document.getElementById("generate-post").addEventListener("click", function () {
    const link = linkInput.value.trim()
    fillFromLink(link)
    const company = companyInput.value.trim() || "A consultar"
    const role = roleInput.value.trim() || "A consultar"
    const salary = salaryInput.value.trim() || "A consultar"
    const city = cityInput.value.trim() || "A consultar"
    const contractType = contractTypeInput.value.trim() || "A consultar"
    const schedule = scheduleInput.value.trim() || "A consultar"
    const activities = summarizeItems(activitiesInput.value, 3, 110)
    const requirements = summarizeItems(requirementsInput.value, 5, 90)
    const benefits = summarizeItems(benefitsInput.value, 5, 90)

    const instagramLines = [
      "📢 VAGA NOVA - " + role,
      "🏢 Empresa: " + company,
      "📍 " + city,
      "💰 Salário: " + salary,
      "📋 Contrato: " + contractType,
      "🕐 Horário: " + schedule,
      "",
      "O que você vai fazer:",
      activities
        .map(function (item) {
          return "• " + item
        })
        .join("\n"),
      "",
      "Requisitos:",
      requirements
        .map(function (item) {
          return "✔ " + item
        })
        .join("\n"),
      "",
      "Benefícios:",
      benefits
        .map(function (item) {
          return "✔ " + item
        })
        .join("\n"),
      "",
      "📣 Comente EU QUERO / Link na bio",
      "🔗 Link na bio para se candidatar",
      "#vagas #caxiasdosul #vagasrs",
      "📌 Vagas todos os dias no meu Canal do WhatsApp - Link na bio"
    ]
    instagramCaptionOutput.value = instagramLines
      .join("\n")
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")

    const whatsappLines = [
      "*🔥 VAGA NOVA - " + role + "*",
      "🏢 " + company + " | 📍 " + city,
      "💰 " + salary,
      "📋 " + contractType,
      "🕐 Horário: " + schedule
    ]
    whatsappLines.push(
      "✅ Requisitos: " + summarizeItems(requirementsInput.value, 3, 55).join("; ")
    )
    whatsappLines.push("🎁 Benefícios: " + summarizeItems(benefitsInput.value, 4, 55).join("; "))
    whatsappLines.push("👉 Interessados: Comente EU QUERO ou chame no direct")
    whatsappLines.push("@suavagars")
    whatsappLines.push(link ? "👉 Candidate-se aqui: " + link : "👉 Link na bio / Chama no direct")
    whatsappPostOutput.value = whatsappLines.join("\n")
    postStatus.textContent = "Legendas para Instagram e WhatsApp geradas."
  })

  document.getElementById("add-vaga-gestor").addEventListener("click", async function () {
    const link = getValidLink()
    if (!roleInput.value.trim()) {
      gestorStatus.textContent = "Preencha o cargo antes de adicionar a vaga."
      return
    }
    if (!link) {
      gestorStatus.textContent = "Informe um link público válido da vaga antes de adicionar."
      return
    }

    const button = document.getElementById("add-vaga-gestor")
    const spinner = document.getElementById("publish-spinner")
    button.disabled = true
    button.setAttribute("aria-busy", "true")
    spinner.hidden = false
    document.getElementById("generate-post").click()
    copyOutput(whatsappPostOutput, whatsappStatus)
    gestorStatus.textContent = "Verificando se a vaga já está publicada..."
    try {
      const vacancy = {
        role: roleInput.value.trim(),
        company: companyInput.value.trim() || "A consultar",
        city: cityInput.value.trim() || "A consultar",
        salary: salaryInput.value.trim() || "A consultar",
        contractType: contractTypeInput.value.trim() || "A consultar",
        link
      }
      const listResponse = await fetch("/api/vagas", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      })
      const listResult = await listResponse.json()
      if (!listResponse.ok) {
        throw new Error(
          listResult && listResult.error
            ? listResult.error
            : "Não foi possível verificar as vagas já publicadas."
        )
      }
      if (!listResult || !Array.isArray(listResult.vagas)) {
        throw new Error("A lista de vagas retornou um formato inválido.")
      }

      const normalizedCompany = normalizeDuplicateValue(vacancy.company)
      const normalizedRole = normalizeDuplicateValue(vacancy.role)
      const duplicate = listResult.vagas.find(function (existing) {
        return (
          existing &&
          normalizeDuplicateValue(existing.company) === normalizedCompany &&
          normalizeDuplicateValue(existing.role) === normalizedRole
        )
      })
      if (duplicate) {
        const confirmed = await confirmDuplicateVacancy(duplicate)
        if (!confirmed) {
          gestorStatus.textContent = "Adição cancelada. A vaga não foi adicionada."
          button.disabled = false
          button.setAttribute("aria-busy", "false")
          spinner.hidden = true
          return
        }
      }

      gestorStatus.textContent = "Publicando vaga no site..."
      const response = await fetch("/api/vagas", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(vacancy)
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result && result.error ? result.error : "Não foi possível salvar a vaga.")
      }
      gestorStatus.textContent = "✅ Vaga publicada no site e registrada no gestor!"
    } catch (error) {
      gestorStatus.textContent = error.message || "Não foi possível publicar a vaga."
    } finally {
      button.disabled = false
      button.setAttribute("aria-busy", "false")
      spinner.hidden = true
    }
  })

  async function copyOutput (output, status) {
    if (!output.value) {
      status.textContent = "Gere o conteúdo antes de copiar."
      return
    }
    try {
      await navigator.clipboard.writeText(output.value)
      status.textContent = "Conteúdo copiado para a área de transferência."
    } catch (error) {
      output.focus()
      output.select()
      const copied = document.execCommand("copy")
      status.textContent = copied
        ? "Conteúdo copiado para a área de transferência."
        : "Não foi possível copiar automaticamente. Selecione e copie o texto."
    }
  }

  document.getElementById("copy-instagram").addEventListener("click", function () {
    copyOutput(instagramCaptionOutput, instagramStatus)
  })

  document.getElementById("copy-whatsapp").addEventListener("click", function () {
    copyOutput(whatsappPostOutput, whatsappStatus)
  })

  document.getElementById("share-whatsapp").addEventListener("click", function () {
    window.open(
      "https://whatsapp.com/channel/0029VbEAoWKHwXb8eaOKcQ2p",
      "_blank",
      "noopener,noreferrer"
    )
  })

  document.getElementById("visit-instagram").addEventListener("click", function () {
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer")
  })

  function roundedRect (ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
    ctx.fill()
  }

  function getWrappedLines (ctx, text, maxWidth) {
    const words = text.split(/\s+/)
    const lines = []
    let line = ""
    words.forEach(function (word) {
      const candidate = line ? line + " " + word : word
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    })
    if (line) {
      lines.push(line)
    }
    return lines
  }

  function fitLineWithEllipsis (ctx, text, maxWidth) {
    const words = text.split(/\s+/)
    while (words.length && ctx.measureText(words.join(" ") + "…").width > maxWidth) {
      words.pop()
    }
    return words.length ? words.join(" ") + "…" : "…"
  }

  document.getElementById("generate-image").addEventListener("click", function () {
    const button = document.getElementById("generate-image")
    const spinner = document.getElementById("image-spinner")
    button.disabled = true
    button.setAttribute("aria-busy", "true")
    spinner.hidden = false
    imageStatus.textContent = "Gerando imagem da vaga..."
    fillFromLink(linkInput.value.trim())
    const company = companyInput.value.trim() || "Empresa Confidencial"
    const role = roleInput.value.trim() || "Cargo não identificado"
    const city = cityInput.value.trim() || "A consultar"
    const salary = salaryInput.value.trim() || "A combinar / Direto com a empresa"
    const contractType = contractTypeInput.value.trim() || "Efetivo - CLT"
    const schedule = scheduleInput.value.trim() || "Horário comercial - Consultar"

    const logo = document.querySelector("header img")
    if (!logo.complete || !logo.naturalWidth) {
      imageStatus.textContent =
        "Não foi possível carregar o logotipo. Confira se o arquivo está disponível."
      return
    }

    generatedImageBlob = null
    document.getElementById("btnCopiarImagem").disabled = true
    document.getElementById("btnCompartilharImagem").hidden = true
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = "#FFFFFF"
    context.fillRect(0, 0, 1080, 1080)

    const logoScale = Math.min(600 / logo.naturalWidth, 130 / logo.naturalHeight)
    const logoWidth = logo.naturalWidth * logoScale
    const logoHeight = logo.naturalHeight * logoScale
    const logoX = (1080 - logoWidth) / 2
    const logoY = 30
    context.fillStyle = "#FFFFFF"
    context.fillRect(logoX - 24, logoY - 8, logoWidth + 48, logoHeight + 16)
    context.drawImage(logo, logoX, logoY, logoWidth, logoHeight)

    context.fillStyle = "#0B5CFF"
    context.textAlign = "center"
    context.textBaseline = "middle"
    const upperRole = role.toLocaleUpperCase("pt-BR")
    let roleFontSize = 72
    const roleMaxWidth = 920
    let roleLines
    while (roleFontSize >= 34) {
      context.font = "700 " + roleFontSize + "px Arial, Helvetica, sans-serif"
      roleLines = getWrappedLines(context, upperRole, roleMaxWidth)
      if (roleLines.length <= 2) {
        break
      }
      roleFontSize -= 4
    }
    if (roleLines.length > 2) {
      roleLines = [
        roleLines[0],
        fitLineWithEllipsis(context, roleLines.slice(1).join(" "), roleMaxWidth)
      ]
    }
    const roleLineHeight = roleFontSize * 1.12
    const roleTop = logoY + logoHeight + 20
    context.font = "700 " + roleFontSize + "px Arial, Helvetica, sans-serif"
    roleLines.forEach(function (line, index) {
      context.fillText(line, 540, roleTop + roleLineHeight * (index + 0.5))
    })

    context.fillStyle = "#31516d"
    const companyCity = company + " - " + city
    let companyFontSize = 38
    const companyMaxWidth = 900
    context.font = "500 " + companyFontSize + "px Arial, Helvetica, sans-serif"
    let companyLines = getWrappedLines(context, companyCity, companyMaxWidth)
    while (companyLines.length > 2 && companyFontSize > 28) {
      companyFontSize -= 2
      context.font = "500 " + companyFontSize + "px Arial, Helvetica, sans-serif"
      companyLines = getWrappedLines(context, companyCity, companyMaxWidth)
    }
    if (companyLines.length > 2) {
      companyLines = [
        companyLines[0],
        fitLineWithEllipsis(context, companyLines.slice(1).join(" "), companyMaxWidth)
      ]
    }
    const companyTop = roleTop + roleLines.length * roleLineHeight + 28
    const companyLineHeight = companyFontSize * 1.35
    context.font = "500 " + companyFontSize + "px Arial, Helvetica, sans-serif"
    companyLines.forEach(function (line, index) {
      context.fillText(line, 540, companyTop + companyLineHeight * (index + 0.5))
    })

    const infoGroups = [
      "💰 Salário: " + salary,
      "📋 Tipo: " + contractType,
      "🕐 Horário: " + schedule
    ]
    let infoFontSize = 34
    const infoMaxWidth = 940
    let infoLines
    while (infoFontSize > 24) {
      context.font = "600 " + infoFontSize + "px Arial, Helvetica, sans-serif"
      infoLines = infoGroups.map(function (item) {
        return getWrappedLines(context, item, infoMaxWidth)
      })
      if (
        infoLines.every(function (lines) {
          return lines.length <= 2
        })
      ) {
        break
      }
      infoFontSize -= 2
    }
    context.fillStyle = "#31516d"
    context.font = "600 " + infoFontSize + "px Arial, Helvetica, sans-serif"
    const infoLineHeight = infoFontSize * 1.35
    const infoGroupGap = 12
    const infoTop = companyTop + companyLines.length * companyLineHeight + 28
    let currentInfoY = infoTop
    infoLines.forEach(function (lines) {
      if (lines.length > 2) {
        lines = [lines[0], fitLineWithEllipsis(context, lines.slice(1).join(" "), infoMaxWidth)]
      }
      lines.forEach(function (line) {
        context.fillText(line, 540, currentInfoY + infoLineHeight / 2)
        currentInfoY += infoLineHeight
      })
      currentInfoY += infoGroupGap
    })

    const buttonTop = currentInfoY - infoGroupGap + 36
    const buttonHeight = 90
    context.fillStyle = "#25D366"
    roundedRect(context, 340, buttonTop, 400, buttonHeight, 45)
    context.fillStyle = "#124b2a"
    context.font = "700 43px Arial, Helvetica, sans-serif"
    context.fillText("VAGA NOVA", 540, buttonTop + buttonHeight / 2)

    context.fillStyle = "#0B5CFF"
    context.font = "700 34px Arial, Helvetica, sans-serif"
    context.fillText("@suavagars", 540, 970)

    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
    }
    canvas.toBlob(function (blob) {
      const button = document.getElementById("generate-image")
      const spinner = document.getElementById("image-spinner")
      button.disabled = false
      button.setAttribute("aria-busy", "false")
      spinner.hidden = true
      if (!blob) {
        imageStatus.textContent = "Não foi possível criar a imagem. Tente novamente."
        return
      }
      generatedImageBlob = blob
      imageUrl = URL.createObjectURL(blob)
      preview.src = imageUrl
      document.getElementById("preview-wrap").hidden = false
      document.getElementById("download-image").disabled = false
      document.getElementById("btnCopiarImagem").disabled = false
      imageStatus.textContent = "Imagem pronta. Você pode baixar e publicar."
    }, "image/png")
  })

  document.getElementById("btnCopiarImagem").addEventListener("click", async function () {
    if (!generatedImageBlob) {
      imageStatus.textContent = "Gere a imagem antes de copiá-la."
      return
    }

    const copyButton = document.getElementById("btnCopiarImagem")
    const shareButton = document.getElementById("btnCompartilharImagem")
    const ClipboardItemConstructor =
      window.ClipboardItem || (typeof ClipboardItem !== "undefined" ? ClipboardItem : null)
    copyButton.disabled = true
    try {
      if (
        !navigator.clipboard ||
        typeof navigator.clipboard.write !== "function" ||
        !ClipboardItemConstructor
      ) {
        throw new Error("Este navegador não permite copiar imagens diretamente.")
      }
      await navigator.clipboard.write([
        new ClipboardItemConstructor({ "image/png": generatedImageBlob })
      ])
      shareButton.hidden = true
      imageStatus.textContent = "✅ Imagem copiada! Agora abra o Instagram e cole direto no post."
    } catch (error) {
      shareButton.hidden = false
      imageStatus.textContent =
        "Não foi possível copiar a imagem. Use COMPARTILHAR IMAGEM ou BAIXAR IMAGEM."
    } finally {
      copyButton.disabled = !generatedImageBlob
    }
  })

  document.getElementById("btnCompartilharImagem").addEventListener("click", async function () {
    if (!generatedImageBlob) {
      imageStatus.textContent = "Gere a imagem antes de compartilhá-la."
      return
    }
    if (typeof navigator.share !== "function" || typeof File === "undefined") {
      imageStatus.textContent =
        "Este navegador não permite compartilhar arquivos. Use BAIXAR IMAGEM."
      return
    }

    const imageFile = new File([generatedImageBlob], "sua-vaga-rs.png", { type: "image/png" })
    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [imageFile] })) {
      imageStatus.textContent =
        "Este navegador não permite compartilhar arquivos. Use BAIXAR IMAGEM."
      return
    }
    try {
      await navigator.share({
        files: [imageFile],
        title: "Sua Vaga RS - Vaga",
        text: "Imagem da vaga pronta para compartilhar."
      })
      imageStatus.textContent = "Imagem compartilhada."
    } catch (error) {
      imageStatus.textContent =
        error && error.name === "AbortError"
          ? "Compartilhamento cancelado."
          : "Não foi possível compartilhar a imagem. Use BAIXAR IMAGEM."
    }
  })

  document.getElementById("download-image").addEventListener("click", function () {
    if (!imageUrl) {
      return
    }
    const download = document.createElement("a")
    download.href = imageUrl
    download.download = "sua-vaga-rs.png"
    document.body.appendChild(download)
    download.click()
    download.remove()
  })
})()
