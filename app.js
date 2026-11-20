(function () {
      "use strict";

      var linkInput = document.getElementById("linkVaga");
      var companyInput = document.getElementById("company");
      var roleInput = document.getElementById("role");
      var salaryInput = document.getElementById("salary");
      var cityInput = document.getElementById("city");
      var modelInput = document.getElementById("model");
      var contractTypeInput = document.getElementById("contract-type");
      var scheduleInput = document.getElementById("schedule");
      var activitiesInput = document.getElementById("activities");
      var benefitsInput = document.getElementById("benefits");
      var requirementsInput = document.getElementById("requirements");
      var instagramCaptionOutput = document.getElementById("instagram-caption");
      var whatsappPostOutput = document.getElementById("whatsapp-post");
      var instagramStatus = document.getElementById("instagram-status");
      var whatsappStatus = document.getElementById("whatsapp-status");
      var fetchStatus = document.getElementById("fetch-status");
      var postStatus = document.getElementById("post-status");
      var gestorStatus = document.getElementById("gestor-status");
      var duplicateDialog = document.getElementById("duplicate-warning");
      var duplicateMessage = document.getElementById("duplicate-warning-message");
      var duplicateCancelButton = document.getElementById("duplicate-cancel");
      var duplicateConfirmButton = document.getElementById("duplicate-confirm");
      var imageStatus = document.getElementById("image-status");
      var instagramTab = document.getElementById("tab-instagram");
      var whatsappTab = document.getElementById("tab-whatsapp");
      var instagramPanel = document.getElementById("instagram-panel");
      var whatsappPanel = document.getElementById("whatsapp-panel");
      var canvas = document.getElementById("post-canvas");
      var context = canvas.getContext("2d");
      var preview = document.getElementById("image-preview");
      var imageUrl = "";
      var generatedImageBlob = null;
      var manualFields = {};
      var lastAutoValues = {};

      var editableFields = {
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
      };
      if (!Array.from(contractTypeInput.options).some(function (option) { return option.value === "Autônomo"; })) {
        var autonomousOption = document.createElement("option");
        autonomousOption.value = "Autônomo";
        autonomousOption.textContent = "Autônomo";
        contractTypeInput.appendChild(autonomousOption);
      }
      Object.keys(editableFields).forEach(function (key) {
        editableFields[key].addEventListener("input", function () {
          manualFields[key] = true;
        });
        editableFields[key].addEventListener("change", function () {
          manualFields[key] = true;
        });
      });

      function normalizeDuplicateValue(value) {
        return String(value == null ? "" : value)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[.-]/g, "")
          .trim()
          .replace(/\s+/g, " ");
      }

      function duplicateDateLabel(value) {
        var date = new Date(value);
        return Number.isNaN(date.getTime()) ? "Data não disponível" : date.toLocaleString("pt-BR");
      }

      var duplicateConfirmationResolver = null;
      function resolveDuplicateConfirmation(confirmed) {
        var resolve = duplicateConfirmationResolver;
        duplicateConfirmationResolver = null;
        if (typeof duplicateDialog.close === "function" && duplicateDialog.open) duplicateDialog.close();
        if (resolve) resolve(confirmed);
      }

      function confirmDuplicateVacancy(duplicate) {
        var message = "Você já publicou essa vaga antes:\n" +
          "Empresa: " + (duplicate.company || "A consultar") + "\n" +
          "Cargo: " + (duplicate.role || "A consultar") + "\n" +
          "Publicada em: " + duplicateDateLabel(duplicate.createdAt) + "\n" +
          "¿Deseja adicionar mesmo assim?";
        duplicateMessage.textContent = message;
        if (typeof duplicateDialog.showModal !== "function") {
          return Promise.resolve(window.confirm("⚠️ ATENÇÃO! VAGA DUPLICADA\n" + message));
        }
        return new Promise(function (resolve) {
          duplicateConfirmationResolver = resolve;
          duplicateDialog.showModal();
          duplicateConfirmButton.focus();
        });
      }

      duplicateCancelButton.addEventListener("click", function () {
        resolveDuplicateConfirmation(false);
      });
      duplicateConfirmButton.addEventListener("click", function () {
        resolveDuplicateConfirmation(true);
      });
      duplicateDialog.addEventListener("cancel", function (event) {
        event.preventDefault();
        resolveDuplicateConfirmation(false);
      });
      duplicateDialog.addEventListener("close", function () {
        if (duplicateConfirmationResolver) resolveDuplicateConfirmation(false);
      });

      function isPublicWebLink(parsed) {
        if (parsed.username || parsed.password) return false;
        var host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
        if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
            host === "0.0.0.0" || host.indexOf(":") !== -1) return false;
        var ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (ipv4) {
          var parts = ipv4.slice(1).map(Number);
          if (parts.some(function (part) { return part > 255; })) return false;
          if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
              (parts[0] === 169 && parts[1] === 254) ||
              (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
              (parts[0] === 192 && parts[1] === 168) ||
              (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)) return false;
        }
        return true;
      }

      function getValidLink() {
        var value = linkInput.value.trim();
        try {
          var parsed = new URL(value);
          if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !isPublicWebLink(parsed)) return "";
          if (Array.from(parsed.searchParams.keys()).some(function (key) {
            return /^(?:token|access_token|api_key|key|auth|authorization|code|session|signature|secret|password)$/i.test(key);
          })) return "";
          return parsed.href;
        } catch (error) {
          return "";
        }
      }

      var defaultFieldValues = {
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
      };

      function setAutoValue(field, value) {
        var input = editableFields[field];
        var cleaned = (value || "").replace(/\s+/g, " ").trim();
        if (field === "schedule") cleaned = normalizeSchedule(cleaned);
        if (field === "city") cleaned = normalizeCityValue(cleaned);
        if (!input || !cleaned || isInvalidJobText(cleaned) || isTokenLike(cleaned) ||
            (field === "role" && !isPlausibleJobTitle(cleaned)) || manualFields[field]) return false;
        var current = input.value.trim();
        var isDefault = !current || current === defaultFieldValues[field];
        if (!isDefault && current !== lastAutoValues[field]) return false;
        if (input.tagName === "SELECT" &&
            !Array.from(input.options).some(function (option) { return option.value === cleaned; })) return false;
        input.value = cleaned;
        lastAutoValues[field] = cleaned;
        return true;
      }

      function parseTitle(title, filled) {
        if (!title || isInvalidJobText(title) || isTokenLike(title)) {
          return false;
        }
        var cleaned = title
          .replace(/\s*[|–—-]\s*(?:Catho|Indeed|Gupy|InfoJobs|LinkedIn|Instagram|Google Jobs).*$/i, "")
          .trim();
        if (!cleaned || /^(?:catho|indeed|gupy|infojobs|linkedin|google(?: jobs)?|instagram)$/i.test(cleaned)) return false;
        var parts = cleaned.split(/\s(?:-|–|—|\|)\s/).map(function (part) {
          return part.trim();
        }).filter(Boolean);

        if (parts.length >= 2) {
          setTrackedValue("role", parts[0], filled);
          if (!findCityInText(parts[1])) setTrackedValue("company", parts[1], filled);
        } else if (cleaned) {
          setTrackedValue("role", cleaned, filled);
        }
        return true;
      }

      function isInvalidJobText(value) {
        var text = (value || "").trim();
        return /\b(?:401|403|404|500)\b/i.test(text) ||
          /(?:access\s*denied|google\s*search|just\s+a\s+moment|redirecting|page\s+not\s+found|not\s+found|forbidden|captcha|cloudflare|temporarily\s+unavailable)/i.test(text) ||
          /^(?:error|an?\s+error\s+occurred|something\s+went\s+wrong)(?:\b.*)?$/i.test(text);
      }

      function isTokenLike(value) {
        var text = (value || "").trim();
        if (!text) return false;
        var compact = text.replace(/[^a-z0-9]/gi, "");
        var mixedCaseToken = /^[a-z0-9_-]{24,}$/i.test(text) &&
          /[a-z]/.test(text) && /[A-Z]/.test(text);
        var digitCount = (compact.match(/\d/g) || []).length;
        var shortMixedToken = /^[a-z0-9]{16,}$/i.test(text) &&
          /[a-z]/.test(text) && /[A-Z]/.test(text) && digitCount >= 2;
        if (mixedCaseToken || shortMixedToken) return true;

        var words = text.match(/[a-zÀ-ÿ]+/gi) || [];
        return words.some(function (word) {
          var normalized = word.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          var vowels = (normalized.match(/[aeiou]/g) || []).length;
          var ratio = vowels / normalized.length;
          return (normalized.length >= 20 && ratio < 0.31) ||
            (normalized.length >= 28 && ratio < 0.38) ||
            (normalized.length >= 36 && compact.length >= 36);
        }) || (/^[a-z0-9]+$/i.test(compact) && compact.length >= 34 &&
          (compact.match(/[aeiou]/gi) || []).length / compact.length < 0.32);
      }

      function isPlausibleJobTitle(value) {
        var text = (value || "").trim();
        if (!text || isInvalidJobText(text) || isTokenLike(text)) return false;
        var normalized = text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return !/^(?:vaga|vagas|emprego|empregos|job|jobs|career|careers|oportunidade|oportunidades|google search|linkedin|catho|indeed|gupy|infojobs|a consultar|cargo nao identificado)$/i.test(normalized) &&
          (normalized.match(/[a-z]/g) || []).length >= 3;
      }

      function isPlausibleSchedule(value) {
        var normalized = (value || "").toLocaleLowerCase("pt-BR").normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!normalized) return false;
        if (/\b(?:horario\s+comercial|horario\s+(?:flexivel|variavel|a combinar)|flexibilidade\s+de\s+horarios?|diurno|noturno)\b/.test(normalized) ||
            /\bflexivel\s+conforme\s+(?:a\s+)?(?:demanda|necessidade)\b/.test(normalized) ||
            /\bconforme\s+(?:a\s+)?(?:demanda|necessidade)(?:\s+de\s+(?:visitas|atendimento))?\b/.test(normalized) ||
            /\bturno(?:\s+(?:da|de|do)\s+)?(?:manha|tarde|noite|madrugada)\b/.test(normalized) ||
            /\b\d{1,2}\s*x\s*\d{1,2}\b/.test(normalized) ||
            /\bescala\s+(?:de\s+)?(?:trabalho|revezamento|rotativa|alternada|flexivel|a\s+combinar)\b/.test(normalized) ||
            /\b(?:segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)\s+(?:a|ate|[-–—])\s*(?:segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)\b/.test(normalized)) {
          return true;
        }

        var ranges = /\b(?:das?\s*)?((?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)?)\s*(?:as|[-–—])\s*((?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)?)\b/gi;
        var match;
        while ((match = ranges.exec(normalized))) {
          if (/[h:]/i.test(match[1]) || /[h:]/i.test(match[2]) ||
              (match[1].length === 2 && match[2].length === 2)) return true;
        }
        return false;
      }

      function normalizeSchedule(value) {
        var cleaned = (value || "").replace(/\s+/g, " ").trim();
        if (!cleaned || cleaned.length > 180) return "";
        if (/^hor[aá]rio\s+(?:comercial|flex[ií]vel|vari[aá]vel|a\s+combinar)\b/i.test(cleaned) &&
            isPlausibleSchedule(cleaned)) return cleaned;
        var withoutLabel = cleaned.replace(/^(?:hor[aá]rio(?:\s+de\s+trabalho)?(?:\s*\/\s*turno)?|turno|jornada|work\s*hours)\s*[:\-–]?\s*/i, "");
        if (/^(?:hor[aá]rio(?:\s+de\s+trabalho)?|work\s*hours)\s*[:\-–]\s*/i.test(cleaned) &&
            isPlausibleSchedule(withoutLabel)) return withoutLabel;
        if (isPlausibleSchedule(withoutLabel)) return withoutLabel;
        if (isPlausibleSchedule(cleaned)) return cleaned;
        return "";
      }

      function readableSlug(value) {
        var decoded = value || "";
        try {
          decoded = decodeURIComponent(decoded);
        } catch (error) {
          decoded = decoded.replace(/%20/gi, " ");
        }
        return decoded
          .replace(/\d+/g, " ")
          .replace(/[-_]+/g, " ")
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      function cleanSectionText(value) {
        return (value || "")
          .replace(/\b(?:candidate-se|candidatar-se|inscreva-se|aplique agora|apply now|veja mais vagas|criar conta|entrar na sua conta|faça login|faca login|cadastre-se|login|register|sign in|sign up)\b[\s\S]*$/i, "")
          .replace(/[\s,;:|•–—-]+$/g, "")
          .replace(/\s+(?:e|ou|de|da|do|das|dos|para|com|por|que|a|o|as|os)$/i, "")
          .trim();
      }

      function cleanBenefitsText(value) {
        return cleanSectionText((value || "").split(/\r?\n/)
          .map(function (line) { return line.trim(); })
          .filter(function (line) { return line && !/:\s*$/.test(line); })
          .join("; "));
      }

      function removeDuplicateRequirementText(requirements, activities, benefits) {
        function normalize(value) {
          return (value || "").toLocaleLowerCase("pt-BR").normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, " ").trim();
        }
        var existing = [normalize(activities), normalize(benefits)].filter(Boolean);
        if (!normalize(requirements) || existing.indexOf(normalize(requirements)) !== -1) return "";
        return (requirements || "").split(/[;\n]+/)
          .map(function (part) { return part.trim(); })
          .filter(function (part) { return part && existing.indexOf(normalize(part)) === -1; })
          .join("; ");
      }

      function isSectionBoundary(line) {
        return /^(?:como se candidatar|candidate-se|candidatar-se|inscreva-se|aplique agora|apply now|sobre a empresa|etapas do processo|mais informa[cç][oõ]es|cadastre-se|fa[cç]a login|entrar na sua conta)\b/i.test(line);
      }

      function titleCase(value) {
        var smallWords = ["da", "de", "do", "das", "dos", "e"];
        var spelling = {
          rh: "RH", ti: "TI", pcd: "PCD", cnpj: "CNPJ", mei: "MEI",
          sao: "São", goncalves: "Gonçalves", ijui: "Ijuí", bage: "Bagé",
          tramandai: "Tramandaí", venancio: "Venâncio", tres: "Três",
          producao: "produção", operacao: "operação", administracao: "administração",
          reposicao: "reposição",
          gestao: "gestão", tecnico: "técnico", tecnica: "técnica",
          eletrico: "elétrico", eletrica: "elétrica", mecanico: "mecânico",
          mecanica: "mecânica", logistica: "logística", comunicacao: "comunicação",
          contabil: "contábil", saude: "saúde", educacao: "educação",
          seguranca: "segurança", manutencao: "manutenção", construcao: "construção",
          analise: "análise", comercio: "comércio", servicos: "serviços"
        };
        return value.toLocaleLowerCase("pt-BR").split(" ").map(function (word, index) {
          if (spelling[word]) {
            if (spelling[word] === spelling[word].toUpperCase()) return spelling[word];
            return spelling[word].charAt(0).toLocaleUpperCase("pt-BR") + spelling[word].slice(1);
          }
          return index > 0 && smallWords.indexOf(word) !== -1
            ? word
            : word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
        }).join(" ");
      }

      function parseLinkDetails(link) {
        var result = { role: "", city: "" };
        try {
          var parsed = new URL(link);
          var params = parsed.searchParams;
          var roleFromQuery = params.get("cargo") || params.get("title") || params.get("job") || params.get("role") || params.get("q") || params.get("query");
          var cityFromQuery = params.get("cidade") || params.get("city") || params.get("location") || params.get("local");
          if (roleFromQuery) {
            var queryRole = titleCase(readableSlug(roleFromQuery));
            if (isPlausibleJobTitle(queryRole)) result.role = queryRole;
          }
          if (cityFromQuery && !isTokenLike(cityFromQuery)) {
            result.city = normalizeCityValue(readableSlug(cityFromQuery));
          }

          var ignored = /^(?:vaga|vagas|emprego|empregos|job|jobs|career|careers|oportunidade|oportunidades|rs|br|p|reel|reels|stories|post|posts|share|company|companies|profile|search|view|viewjob|search-results)$/i;
          var segments = parsed.pathname.split("/").filter(Boolean).filter(function (segment) {
            return !/^\d+$/.test(segment) && !isTokenLike(segment) && !ignored.test(readableSlug(segment));
          });
          if (/(\.|^)instagram\.com$/i.test(parsed.hostname) &&
              (segments.length === 1 || !segments.length || /^(?:[a-z0-9_-]+)$/i.test(segments[segments.length - 1]))) {
            segments = [];
          }
          var slug = readableSlug(segments.join(" ")).replace(/([a-z])rs$/i, "$1 rs");
          var words = slug ? slug.split(" ") : [];
          var cities = [
            "caxias do sul", "porto alegre", "santa maria", "novo hamburgo",
            "sao leopoldo", "rio grande", "passo fundo", "bento goncalves",
            "santa cruz do sul", "cachoeirinha", "alvorada", "gravatai",
            "canoas", "pelotas", "erechim", "lajeado", "ijui", "bage",
            "farroupilha", "sapiranga", "esteio", "santa rosa", "uruguaiana",
            "cruz alta", "carazinho", "vacaria", "tramandai", "torres",
            "sao borja", "venancio aires", "guaiba", "estancia velha",
            "campo bom", "taquara", "cachoeira do sul", "santo angelo",
            "frederico westphalen", "sao jose do norte", "sao gabriel",
            "tres passos", "marau", "capao da canoa", "charqueadas"
          ];

          if (!result.city && words.length) {
            var cityInSlug = findCityInText(slug);
            if (cityInSlug) {
              result.city = cityInSlug;
              var citySlugToRemove = readableSlug(cityInSlug).toLocaleLowerCase("pt-BR").replace(/\s+(?:go|rs)$/, "");
              var cityPosition = slug.toLocaleLowerCase("pt-BR").lastIndexOf(citySlugToRemove);
              if (cityPosition >= 0) words = readableSlug(slug.slice(0, cityPosition)).split(" ").filter(Boolean);
            }
          }

          if (result.city && words.length && !result.role) {
            var citySlug = readableSlug(result.city).toLocaleLowerCase("pt-BR").replace(/\s+rs$/, "");
            var pathWords = words.slice();
            if (pathWords[pathWords.length - 1].toLocaleLowerCase("pt-BR") === "rs") pathWords.pop();
            var pathSlug = pathWords.join(" ").toLocaleLowerCase("pt-BR");
            if (citySlug && pathSlug.endsWith(citySlug)) {
              words = readableSlug(pathSlug.slice(0, pathSlug.length - citySlug.length)).split(" ").filter(Boolean);
            }
          }

          if (!result.city && words.length) {
            var rsIndex = -1;
            for (var i = words.length - 1; i >= 0; i--) {
              if (words[i].toLocaleLowerCase("pt-BR") === "rs") {
                rsIndex = i;
                break;
              }
            }
            var locationWords = words.slice(0, rsIndex > 0 ? rsIndex : words.length).join(" ").toLocaleLowerCase("pt-BR");
            for (var c = 0; c < cities.length; c++) {
              if (locationWords.endsWith(cities[c])) {
                var cityAt = locationWords.length - cities[c].length;
                result.city = titleCase(cities[c]) + " - RS";
                words = readableSlug(locationWords.slice(0, cityAt)).split(" ").filter(Boolean);
                break;
              }
            }
            if (!result.city && rsIndex > 0) {
              var cityStart = Math.max(0, rsIndex - 2);
              var cityWords = words.slice(cityStart, rsIndex);
              result.city = titleCase(cityWords.join(" ")) + " - RS";
              words = words.slice(0, cityStart);
            } else if (!result.city) {
              var slugLower = words.join(" ").toLocaleLowerCase("pt-BR");
              for (var cityIndex = 0; cityIndex < cities.length; cityIndex++) {
                var foundAt = slugLower.lastIndexOf(cities[cityIndex]);
                if (foundAt >= 0) {
                  result.city = titleCase(cities[cityIndex]) + " - RS";
                  words = readableSlug(slug.slice(0, foundAt)).split(" ").filter(Boolean);
                  break;
                }
              }
            }
          }

          if (!result.role && words.length) {
            while (/^(?:vaga|vagas|emprego|empregos|job|jobs|career|careers|oportunidade|oportunidades|de)$/i.test(words[0])) {
              words.shift();
            }
            var pathRole = titleCase(words.join(" "));
            if (isPlausibleJobTitle(pathRole)) result.role = pathRole;
          }
        } catch (error) {
          return result;
        }
        return result;
      }

      function addFilled(filled, field) {
        if (!filled) return;
        var label = {
          company: "Empresa", role: "Cargo", salary: "Salário", city: "Cidade",
          model: "Modelo", contractType: "Tipo de contratação", schedule: "Horário",
          activities: "Atividades", benefits: "Benefícios", requirements: "Requisitos"
        }[field];
        if (label && filled.indexOf(label) === -1) filled.push(label);
      }

      function setTrackedValue(field, value, filled) {
        if (setAutoValue(field, value)) addFilled(filled, field);
      }

      function setFallbackValue(field, value, filled) {
        var input = editableFields[field];
        if (!input || manualFields[field]) return;
        var current = input.value.trim();
        if (!current || current === defaultFieldValues[field]) setTrackedValue(field, value, filled);
      }

      function clearAutoValues() {
        Object.keys(editableFields).forEach(function (field) {
          if (!manualFields[field] && lastAutoValues[field] &&
              editableFields[field].value.trim() === lastAutoValues[field]) {
            editableFields[field].value = defaultFieldValues[field] || "";
            delete lastAutoValues[field];
          }
        });
      }

      function fillFromLink(link, filled, onlyEmpty) {
        if (!link) return;
        var details = parseLinkDetails(link);
        var setValue = onlyEmpty ? setFallbackValue : setTrackedValue;
        setValue("role", details.role, filled);
        setValue("city", details.city, filled);
        applyTextDetails(link, filled, onlyEmpty);
      }

      function extractSalary(text) {
        var source = text || "";
        try {
          source = decodeURIComponent(source);
        } catch (error) {
          source = source.replace(/%20/gi, " ");
        }
        var exactSalary = source.match(/(?:a partir de\s+|sal[aá]rio(?:\s+de)?\s*)?R\$\s*[\d.]+(?:,\d{2})?(?:\s*(?:a|até|–|—|-)\s*(?:R\$\s*)?[\d.]+(?:,\d{2})?)?/i);
        if (exactSalary) return exactSalary[0].trim();
        source = source.replace(/[-_]+/g, " ");
        var phrase = source.match(/a\s+combinar|sal[aá]rio\s+compat[ií]vel(?:\s+com\s+o\s+mercado)?/i);
        if (phrase) return /^a\s+combinar$/i.test(phrase[0]) ? "A Combinar" : "Salário compatível";
        var salaryPrefix = /\ba\s+partir\s+de\b/i.test(source) ? "A partir de " : "";
        var currency = source.match(/R\$\s*([\d.]+(?:,\d{2})?)/i);
        if (currency) return salaryPrefix + "R$ " + currency[1].replace(/[.,]+$/, "");
        var formattedNumber = source.match(/\b\d{1,3}(?:\.\d{3})+,\d{2}\b/);
        if (formattedNumber) return salaryPrefix + "R$ " + formattedNumber[0];
        var salaryAmount = source.match(/sal[aá]rio\s*(?:de|:)?\s*(\d{3,6}(?:,\d{2})?)/i);
        return salaryAmount ? salaryPrefix + "R$ " + salaryAmount[1] : "";
      }

      var textFieldPatterns = {
        role: /^\s*(?:cargo|vaga|t[ií]tulo|posi[cç][aã]o)\s*[:\-–]?\s*(.*)$/i,
        company: /^\s*(?:empresa|contratante|empresa contratante)\s*[:\-–]?\s*(.*)$/i,
        city: /^\s*(?:cidade|local|localidade|localiza[cç][aã]o)\s*[:\-–]?\s*(.*)$/i,
        model: /^\s*(?:modelo(?: de trabalho)?|modalidade)\s*[:\-–]?\s*(.*)$/i,
        salary: /^\s*(?:sal[aá]rio|faixa salarial|remunera[cç][aã]o)\s*[:\-–]?\s*(.*)$/i,
        contractType: /^\s*(?:tipo(?:\s+de\s+(?:contrata[cç][aã]o|contrato))?|regime|contrata[cç][aã]o)\s*[:\-–]?\s*(.*)$/i,
        schedule: /^\s*(?:hor[aá]rio(?:\s+de\s+trabalho)?(?:\s*\/\s*turno)?|turno|jornada|work\s*hours)\s*[:\-–]?\s*(.*)$/i,
        activities: /^\s*(?:atividades|responsabilidades|o que vai fazer|principais atividades|descri[cç][aã]o da vaga|job description|responsibilities)\s*[:\-–]?\s*(.*)$/i,
        benefits: /^\s*(?:benef[ií]cios?(?:(?:\s+(?:e\s+vantagens|que\s+fazem\s+a\s+diferen[cç]a))|(?:\s+[^:]{1,60}:))?|o que voc[eê] recebe|o que oferecemos|benefits|job\s*benefits)\s*[:\-–]?\s*(.*)$/i,
        requirements: /^\s*(?:requisitos|pr[eé]-requisitos|qualifica[cç][oõ]es|o que precisa|o que buscamos|perfil(?:\s+desejado)?|perfil\s+[^:]{1,40}:|requirements|qualifications)\??\s*[:\-–]?\s*(.*)$/i
      };

      function cleanPlainText(value) {
        return (value || "")
          .replace(/\u00a0/g, " ")
          .replace(/\r/g, "\n")
          .replace(/[\t ]+\n/g, "\n")
          .replace(/\n[\t ]+/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      function extractLabeledSection(text, field) {
        var lines = cleanPlainText(text).split("\n").map(function (line) {
          return line.replace(/^\s*[•✔✅\-–—]+\s*/, "").trim();
        });
        var pattern = textFieldPatterns[field];
        for (var i = 0; i < lines.length; i++) {
          var match = lines[i].match(pattern);
          if (!match) continue;
          var values = match[1] ? [match[1].trim()] : [];
          var multiLine = ["activities", "benefits", "requirements"].indexOf(field) !== -1;
          if (!multiLine && values.length) {
            return field === "schedule" ? normalizeSchedule(lines[i]) : values[0];
          }
          for (var j = i + 1; j < lines.length; j++) {
            if (isSectionBoundary(lines[j])) break;
            if (field === "benefits" && /:\s*$/.test(lines[j])) continue;
            var sameField = lines[j].match(pattern);
            if (sameField) {
              if (field === "schedule" && sameField[1]) values.push(lines[j]);
              if (multiLine && field !== "schedule" && sameField[1] &&
                  !(field === "benefits" && /:\s*$/.test(sameField[1]))) {
                values.push(sameField[1].trim());
              }
              if (multiLine && field !== "schedule") continue;
              break;
            }
            var nextSection = Object.keys(textFieldPatterns).some(function (key) {
              return textFieldPatterns[key].test(lines[j]);
            });
            if (nextSection) break;
            if (lines[j]) {
              values.push(lines[j]);
              if (!multiLine) break;
            }
          }
          var section = cleanSectionText(values.filter(Boolean).join("; "));
          return field === "schedule"
            ? normalizeSchedule([lines[i], section].filter(Boolean).join(" "))
            : section;
        }
        return "";
      }

      function findCityInText(text) {
        var cities = [
          "aparecida de goiania", "goiania", "anapolis",
          "caxias do sul", "porto alegre", "santa maria", "novo hamburgo", "sao leopoldo",
          "rio grande", "passo fundo", "bento goncalves", "santa cruz do sul", "cachoeirinha",
          "alvorada", "gravatai", "canoas", "pelotas", "erechim", "lajeado", "ijui", "bage",
          "farroupilha", "sapiranga", "esteio", "santa rosa", "uruguaiana", "cruz alta",
          "carazinho", "vacaria", "tramandai", "torres", "sao borja", "venancio aires",
          "guaiba", "estancia velha", "campo bom", "taquara", "cachoeira do sul", "santo angelo",
          "frederico westphalen", "sao jose do norte", "sao gabriel", "tres passos", "marau",
          "capao da canoa", "charqueadas"
        ];
        var normalized = (text || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        for (var i = 0; i < cities.length; i++) {
          if (new RegExp("\\b" + cities[i].replace(/ /g, "\\s+") + "\\b").test(normalized)) {
            var cityName = cities[i] === "goiania" ? "Goiânia"
              : cities[i] === "anapolis" ? "Anápolis"
                : cities[i] === "aparecida de goiania" ? "Aparecida de Goiânia"
                  : titleCase(cities[i]);
            return cityName + (i < 3 ? " - GO" : " - RS");
          }
        }
        return "";
      }

      function normalizeCityValue(value) {
        var city = (value || "").trim();
        if (!city) return "";
        var specific = findCityInText(city);
        if (specific) return specific;
        var normalized = city.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        var states = {
          go: "GO", goias: "GO", rs: "RS", "rio grande do sul": "RS",
          sp: "SP", "sao paulo": "SP", rj: "RJ", "rio de janeiro": "RJ",
          mg: "MG", "minas gerais": "MG", df: "DF", "distrito federal": "DF",
          pr: "PR", parana: "PR", sc: "SC", "santa catarina": "SC",
          ba: "BA", bahia: "BA", pe: "PE", pernambuco: "PE",
          ce: "CE", ceara: "CE", es: "ES", "espirito santo": "ES",
          ma: "MA", maranhao: "MA", mt: "MT", "mato grosso": "MT",
          ms: "MS", "mato grosso do sul": "MS", pa: "PA", para: "PA",
          pb: "PB", paraiba: "PB", pi: "PI", piaui: "PI",
          rn: "RN", "rio grande do norte": "RN", ro: "RO", rondonia: "RO",
          rr: "RR", roraima: "RR", ac: "AC", acre: "AC",
          al: "AL", alagoas: "AL", ap: "AP", amapa: "AP",
          am: "AM", amazonas: "AM", se: "SE", sergipe: "SE",
          to: "TO", tocantins: "TO"
        };
        var parts = normalized.split(/\s*[-,/]\s*/);
        if (parts.length > 1 && states[parts[parts.length - 1]]) {
          return titleCase(city.split(/\s*[-,/]\s*/)[0]) + " - " + states[parts[parts.length - 1]];
        }
        return city;
      }

      function isStateOnlyLocation(value) {
        var normalized = (value || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return /^(?:goias(?:\s*-\s*go)?|go|rio grande do sul(?:\s*-\s*rs)?|rs|sao paulo(?:\s*-\s*sp)?|sp|rio de janeiro(?:\s*-\s*rj)?|rj|minas gerais(?:\s*-\s*mg)?|mg|distrito federal(?:\s*-\s*df)?|df)$/.test(normalized);
      }

      function normalizeContractType(value) {
        var type = (value || "").toLocaleLowerCase("pt-BR");
        if (/tempor/.test(type)) return "Temporário";
        if (/est[aá]gio|internship/.test(type)) return "Estágio";
        if (/aut[oô]nom[oa]|self.?employed|freelancer/.test(type)) return "Autônomo";
        if (/\bpj\b/.test(type)) return "PJ";
        if (/diarista/.test(type)) return "Diarista";
        if (/full.?time/.test(type)) return "Tempo integral";
        if (/part.?time/.test(type)) return "Meio período";
        if (/contractor/.test(type)) return "Contrato";
        if (/volunteer/.test(type)) return "Voluntário";
        if (/clt|efetivo/.test(type)) return "CLT (Efetivo)";
        if (/a combinar|unspecified/.test(type)) return "A combinar";
        return "";
      }

      function applyTextDetails(text, filled, onlyEmpty) {
        if (!text) return;
        var fields = ["role", "company", "city", "model", "salary", "contractType", "schedule", "activities", "benefits", "requirements"];
        var details = {};
        fields.forEach(function (field) { details[field] = extractLabeledSection(text, field); });
        details.benefits = cleanBenefitsText(details.benefits);
        details.requirements = removeDuplicateRequirementText(details.requirements, details.activities, details.benefits);
        var cityInText = findCityInText(text);
        if (cityInText && (!details.city || isStateOnlyLocation(details.city))) details.city = cityInText;
        else details.city = normalizeCityValue(details.city);
        if (!details.salary) details.salary = extractSalary(text);
        if (!details.contractType) details.contractType = normalizeContractType(text);
        else details.contractType = normalizeContractType(details.contractType) || details.contractType;
        if (!details.model) {
          var modelMatch = text.match(/\b(remoto|h[ií]brido|presencial)\b/i);
          if (modelMatch) details.model = titleCase(modelMatch[1]);
        }
        if (!details.schedule) {
          var scheduleMatch = text.match(/(?:hor[aá]rio|turno|jornada)\s*[:\-]?\s*([^.;\n]+)/i);
          if (scheduleMatch) details.schedule = normalizeSchedule(scheduleMatch[0].trim());
        }
        Object.keys(details).forEach(function (field) {
          if (onlyEmpty) setFallbackValue(field, details[field], filled);
          else setTrackedValue(field, details[field], filled);
        });
      }

      function isSensitiveLink(link) {
        try {
          var parsed = new URL(link);
          return !isPublicWebLink(parsed) || Array.from(parsed.searchParams.keys()).some(function (key) {
            return /^(?:token|access_token|api_key|key|auth|authorization|code|session|signature|secret|password)$/i.test(key);
          });
        } catch (error) {
          return true;
        }
      }

      function applyApiDetails(data, filled) {
        parseTitle(data.title, filled);
        var apiCity = data.city;
        if (isStateOnlyLocation(apiCity)) {
          apiCity = findCityInText([data.title, data.activities, data.requirements].join(" ")) || apiCity;
        }
        ["company", "city", "salary", "model", "contractType", "schedule", "activities", "benefits", "requirements"]
          .forEach(function (field) {
            setTrackedValue(field, field === "city" ? apiCity : data[field], filled);
          });
        if (typeof data.descriptionText === "string") {
          applyTextDetails(data.descriptionText, filled, true);
        }
      }

      document.getElementById("new-job").addEventListener("click", function () {
        if (!window.confirm("Tem certeza que quer limpar tudo e começar uma nova vaga?")) return;
        linkInput.value = "";
        Object.keys(editableFields).forEach(function (field) { editableFields[field].value = ""; });
        manualFields = {};
        lastAutoValues = {};
        instagramCaptionOutput.value = "";
        whatsappPostOutput.value = "";
        fetchStatus.textContent = "";
        postStatus.textContent = "";
        gestorStatus.textContent = "";
        instagramStatus.textContent = "";
        whatsappStatus.textContent = "";
        imageStatus.textContent = "";
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        imageUrl = "";
        generatedImageBlob = null;
        preview.removeAttribute("src");
        document.getElementById("preview-wrap").hidden = true;
        document.getElementById("download-image").disabled = true;
        document.getElementById("btnCopiarImagem").disabled = true;
        document.getElementById("btnCompartilharImagem").hidden = true;
        setOutputTab("instagram");
        linkInput.focus();
      });

      document.getElementById("fetch-button").addEventListener("click", async function () {
        var link = getValidLink();
        if (!link) {
          if (!manualFields.role && roleInput.value.trim() === lastAutoValues.role) {
            roleInput.value = "";
            delete lastAutoValues.role;
          }
          var enteredLink = linkInput.value.trim();
          fetchStatus.textContent = !enteredLink
            ? "Cole o link público da vaga antes de buscar os dados."
            : isSensitiveLink(enteredLink)
              ? "Por segurança, só é possível consultar links públicos sem credenciais, tokens ou endereços locais."
              : "Cole um link público válido começando com http:// ou https://.";
          return;
        }

        var button = document.getElementById("fetch-button");
        var filled = [];
        var errors = [];
        var resolvedLink = link;
        clearAutoValues();
        button.disabled = true;
        fetchStatus.textContent = "Buscando dados do link. Isso pode levar alguns segundos...";
        try {
          var response = await fetch("/api/vaga?url=" + encodeURIComponent(link), {
            method: "GET",
            credentials: "same-origin",
            headers: { "Accept": "application/json" }
          });
          var data = await response.json();
          if (!response.ok) {
            throw new Error(data && data.error ? data.error : "O servidor não conseguiu ler este portal.");
          }
          if (typeof data.finalUrl === "string" && /^https?:\/\//i.test(data.finalUrl)) {
            resolvedLink = data.finalUrl;
          }
          applyApiDetails(data, filled);
        } catch (error) {
          errors.push(error.message || "Não foi possível consultar o servidor de vagas.");
        } finally {
          button.disabled = false;
        }

        fillFromLink(resolvedLink, filled, true);
        if (!manualFields.role && !isPlausibleJobTitle(roleInput.value)) {
          roleInput.value = "";
          delete lastAutoValues.role;
        }
        var roleAvailable = isPlausibleJobTitle(roleInput.value);
        var review = [];
        var labels = {
          company: "Empresa", role: "Cargo", salary: "Salário", city: "Cidade",
          model: "Modelo", contractType: "Tipo", schedule: "Horário",
          activities: "Atividades", benefits: "Benefícios", requirements: "Requisitos"
        };
        Object.keys(editableFields).forEach(function (field) {
          var value = editableFields[field].value.trim();
          if (!value || value === defaultFieldValues[field]) review.push(labels[field]);
        });
        var status;
        if (!roleAvailable) {
          status = "Não foi possível extrair automaticamente os dados do link. Complete ou ajuste os campos manualmente antes de gerar o post e a imagem.";
        } else if (errors.length) {
          status = "O portal bloqueou a leitura ou o servidor não conseguiu acessá-lo. Cargo identificado pela URL; complete ou ajuste os demais campos manualmente antes de gerar o post e a imagem.";
        } else {
          status = filled.length ? "Dados preenchidos: " + filled.join(", ") + ". " : "Confira os dados encontrados. ";
          status += review.length ? "Confira ou complete: " + review.join(", ") + "." : "Confira os dados antes de gerar o post e a imagem.";
        }
        if (errors.length) status += " Detalhe: " + errors.join("; ") + ".";
        fetchStatus.textContent = status;
      });
      function summarizeItems(text, limit, maxLength) {
        var source = (text || "").trim();
        if (!source) return ["A consultar"];
        var items = source
          .replace(/[•;]/g, "\n")
          .replace(/[.!?]\s+/g, "\n")
          .split(/[\n,]+/)
          .map(function (item) { return item.replace(/^[\s\-–—✔✅]+|[\s]+$/g, "").trim(); })
          .filter(Boolean);
        if (!items.length) return ["A consultar"];
        return items.slice(0, limit).map(function (item) {
          if (item.length <= maxLength) return item;
          var shortened = item.slice(0, maxLength - 1);
          var lastSpace = shortened.lastIndexOf(" ");
          return (lastSpace > 0 ? shortened.slice(0, lastSpace) : shortened) + "…";
        });
      }

      function setOutputTab(format) {
        var showInstagram = format === "instagram";
        instagramTab.setAttribute("aria-selected", showInstagram ? "true" : "false");
        whatsappTab.setAttribute("aria-selected", showInstagram ? "false" : "true");
        instagramPanel.hidden = !showInstagram;
        whatsappPanel.hidden = showInstagram;
      }

      instagramTab.addEventListener("click", function () { setOutputTab("instagram"); });
      whatsappTab.addEventListener("click", function () { setOutputTab("whatsapp"); });

      document.getElementById("generate-post").addEventListener("click", function () {
        var link = linkInput.value.trim();
        fillFromLink(link);
        var company = companyInput.value.trim() || "A consultar";
        var role = roleInput.value.trim() || "A consultar";
        var salary = salaryInput.value.trim() || "A consultar";
        var city = cityInput.value.trim() || "A consultar";
        var contractType = contractTypeInput.value.trim() || "A consultar";
        var schedule = scheduleInput.value.trim() || "A consultar";
        var activities = summarizeItems(activitiesInput.value, 3, 110);
        var requirements = summarizeItems(requirementsInput.value, 5, 90);
        var benefits = summarizeItems(benefitsInput.value, 5, 90);

        var instagramLines = [
          "📢 VAGA NOVA - " + role,
          "🏢 Empresa: " + company,
          "📍 " + city,
          "💰 Salário: " + salary,
          "📋 Contrato: " + contractType,
          "🕐 Horário: " + schedule,
          "",
          "O que você vai fazer:",
          activities.map(function (item) { return "• " + item; }).join("\n"),
          "",
          "Requisitos:",
          requirements.map(function (item) { return "✔ " + item; }).join("\n"),
          "",
          "Benefícios:",
          benefits.map(function (item) { return "✔ " + item; }).join("\n"),
          "",
          "📣 Comente EU QUERO / Link na bio",
          "🔗 Link na bio para se candidatar",
          "#vagas #caxiasdosul #vagasrs",
          "📌 Vagas todos os dias no meu Canal do WhatsApp - Link na bio"
        ];
        instagramCaptionOutput.value = instagramLines.join("\n")
          .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n");

        var whatsappLines = [
          "*🔥 VAGA NOVA - " + role + "*",
          "🏢 " + company + " | 📍 " + city,
          "💰 " + salary,
          "📋 " + contractType,
          "🕐 Horário: " + schedule
        ];
        whatsappLines.push("✅ Requisitos: " + summarizeItems(requirementsInput.value, 3, 55).join("; "));
        whatsappLines.push("🎁 Benefícios: " + summarizeItems(benefitsInput.value, 4, 55).join("; "));
        whatsappLines.push("👉 Interessados: Comente EU QUERO ou chame no direct");
        whatsappLines.push("@suavagars");
        whatsappLines.push(link ? "👉 Candidate-se aqui: " + link : "👉 Link na bio / Chama no direct");
        whatsappPostOutput.value = whatsappLines.join("\n");
        postStatus.textContent = "Legendas para Instagram e WhatsApp geradas.";
      });

      document.getElementById("add-vaga-gestor").addEventListener("click", async function () {
        var link = getValidLink();
        if (!roleInput.value.trim()) {
          gestorStatus.textContent = "Preencha o cargo antes de adicionar a vaga.";
          return;
        }
        if (!link) {
          gestorStatus.textContent = "Informe um link público válido da vaga antes de adicionar.";
          return;
        }

        var button = document.getElementById("add-vaga-gestor");
        button.disabled = true;
        gestorStatus.textContent = "Verificando se a vaga já está no Meu Gestor...";
        try {
          var vacancy = {
            role: roleInput.value.trim(),
            company: companyInput.value.trim() || "A consultar",
            city: cityInput.value.trim() || "A consultar",
            salary: salaryInput.value.trim() || "A consultar",
            contractType: contractTypeInput.value.trim() || "A consultar",
            link: link
          };
          var listResponse = await fetch("/api/vagas", {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
            headers: { "Accept": "application/json" }
          });
          var listResult = await listResponse.json();
          if (!listResponse.ok) {
            throw new Error(listResult && listResult.error ? listResult.error : "Não foi possível verificar as vagas já publicadas.");
          }
          if (!listResult || !Array.isArray(listResult.vagas)) {
            throw new Error("A lista de vagas retornou um formato inválido.");
          }

          var normalizedCompany = normalizeDuplicateValue(vacancy.company);
          var normalizedRole = normalizeDuplicateValue(vacancy.role);
          var duplicate = listResult.vagas.find(function (existing) {
            return existing &&
              normalizeDuplicateValue(existing.company) === normalizedCompany &&
              normalizeDuplicateValue(existing.role) === normalizedRole;
          });
          if (duplicate) {
            var confirmed = await confirmDuplicateVacancy(duplicate);
            if (!confirmed) {
              gestorStatus.textContent = "Adição cancelada. A vaga não foi adicionada.";
              return;
            }
          }

          gestorStatus.textContent = "Adicionando vaga ao Meu Gestor...";
          var response = await fetch("/api/vagas", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(vacancy)
          });
          var result = await response.json();
          if (!response.ok) throw new Error(result && result.error ? result.error : "Não foi possível salvar a vaga.");
          gestorStatus.textContent = "✅ Vaga adicionada ao Meu Gestor!";
        } catch (error) {
          gestorStatus.textContent = error.message || "Não foi possível adicionar a vaga ao Meu Gestor.";
        } finally {
          button.disabled = false;
        }
      });

      async function copyOutput(output, status) {
        if (!output.value) {
          status.textContent = "Gere o conteúdo antes de copiar.";
          return;
        }
        try {
          await navigator.clipboard.writeText(output.value);
          status.textContent = "Conteúdo copiado para a área de transferência.";
        } catch (error) {
          output.focus();
          output.select();
          var copied = document.execCommand("copy");
          status.textContent = copied
            ? "Conteúdo copiado para a área de transferência."
            : "Não foi possível copiar automaticamente. Selecione e copie o texto.";
        }
      }

      document.getElementById("copy-instagram").addEventListener("click", function () {
        copyOutput(instagramCaptionOutput, instagramStatus);
      });

      document.getElementById("copy-whatsapp").addEventListener("click", function () {
        copyOutput(whatsappPostOutput, whatsappStatus);
      });

      document.getElementById("share-whatsapp").addEventListener("click", function () {
        window.open("https://whatsapp.com/channel/0029VbEAoWKHwXb8eaOKcQ2p", "_blank", "noopener,noreferrer");
      });

      document.getElementById("visit-instagram").addEventListener("click", function () {
        window.open("https://instagram.com/suavagars", "_blank", "noopener,noreferrer");
      });

      function roundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
      }

      function getWrappedLines(ctx, text, maxWidth) {
        var words = text.split(/\s+/);
        var lines = [];
        var line = "";
        words.forEach(function (word) {
          var candidate = line ? line + " " + word : word;
          if (line && ctx.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = word;
          } else {
            line = candidate;
          }
        });
        if (line) lines.push(line);
        return lines;
      }

      function fitLineWithEllipsis(ctx, text, maxWidth) {
        var words = text.split(/\s+/);
        while (words.length && ctx.measureText(words.join(" ") + "…").width > maxWidth) {
          words.pop();
        }
        return words.length ? words.join(" ") + "…" : "…";
      }

      document.getElementById("generate-image").addEventListener("click", function () {
        fillFromLink(linkInput.value.trim());
        var company = companyInput.value.trim() || "Empresa Confidencial";
        var role = roleInput.value.trim() || "Cargo não identificado";
        var city = cityInput.value.trim() || "Caxias do Sul - RS";
        var salary = salaryInput.value.trim() || "A combinar / Direto com a empresa";
        var contractType = contractTypeInput.value.trim() || "Efetivo - CLT";
        var schedule = scheduleInput.value.trim() || "Horário comercial - Consultar";

        var logo = document.querySelector("header img");
        if (!logo.complete || !logo.naturalWidth) {
          imageStatus.textContent = "Não foi possível carregar logo.png. Confira se o arquivo está na mesma pasta do index.html.";
          return;
        }

        generatedImageBlob = null;
        document.getElementById("btnCopiarImagem").disabled = true;
        document.getElementById("btnCompartilharImagem").hidden = true;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, 1080, 1080);

        var logoScale = Math.min(600 / logo.naturalWidth, 130 / logo.naturalHeight);
        var logoWidth = logo.naturalWidth * logoScale;
        var logoHeight = logo.naturalHeight * logoScale;
        var logoX = (1080 - logoWidth) / 2;
        var logoY = 30;
        context.fillStyle = "#FFFFFF";
        context.fillRect(logoX - 24, logoY - 8, logoWidth + 48, logoHeight + 16);
        context.drawImage(logo, logoX, logoY, logoWidth, logoHeight);

        context.fillStyle = "#0B5CFF";
        context.textAlign = "center";
        context.textBaseline = "middle";
        var upperRole = role.toLocaleUpperCase("pt-BR");
        var roleFontSize = 72;
        var roleMaxWidth = 920;
        var roleLines;
        while (roleFontSize >= 34) {
          context.font = "700 " + roleFontSize + "px Arial, Helvetica, sans-serif";
          roleLines = getWrappedLines(context, upperRole, roleMaxWidth);
          if (roleLines.length <= 2) break;
          roleFontSize -= 4;
        }
        if (roleLines.length > 2) {
          roleLines = [roleLines[0], fitLineWithEllipsis(context, roleLines.slice(1).join(" "), roleMaxWidth)];
        }
        var roleLineHeight = roleFontSize * 1.12;
        var roleTop = logoY + logoHeight + 20;
        context.font = "700 " + roleFontSize + "px Arial, Helvetica, sans-serif";
        roleLines.forEach(function (line, index) {
          context.fillText(line, 540, roleTop + roleLineHeight * (index + 0.5));
        });

        context.fillStyle = "#31516d";
        var companyCity = company + " - " + city;
        var companyFontSize = 38;
        var companyMaxWidth = 900;
        context.font = "500 " + companyFontSize + "px Arial, Helvetica, sans-serif";
        var companyLines = getWrappedLines(context, companyCity, companyMaxWidth);
        while (companyLines.length > 2 && companyFontSize > 28) {
          companyFontSize -= 2;
          context.font = "500 " + companyFontSize + "px Arial, Helvetica, sans-serif";
          companyLines = getWrappedLines(context, companyCity, companyMaxWidth);
        }
        if (companyLines.length > 2) {
          companyLines = [companyLines[0], fitLineWithEllipsis(context, companyLines.slice(1).join(" "), companyMaxWidth)];
        }
        var companyTop = roleTop + roleLines.length * roleLineHeight + 28;
        var companyLineHeight = companyFontSize * 1.35;
        context.font = "500 " + companyFontSize + "px Arial, Helvetica, sans-serif";
        companyLines.forEach(function (line, index) {
          context.fillText(line, 540, companyTop + companyLineHeight * (index + 0.5));
        });

        var infoGroups = [
          "💰 Salário: " + salary,
          "📋 Tipo: " + contractType,
          "🕐 Horário: " + schedule
        ];
        var infoFontSize = 34;
        var infoMaxWidth = 940;
        var infoLines;
        while (infoFontSize > 24) {
          context.font = "600 " + infoFontSize + "px Arial, Helvetica, sans-serif";
          infoLines = infoGroups.map(function (item) {
            return getWrappedLines(context, item, infoMaxWidth);
          });
          if (infoLines.every(function (lines) { return lines.length <= 2; })) break;
          infoFontSize -= 2;
        }
        context.fillStyle = "#31516d";
        context.font = "600 " + infoFontSize + "px Arial, Helvetica, sans-serif";
        var infoLineHeight = infoFontSize * 1.35;
        var infoGroupGap = 12;
        var infoTop = companyTop + companyLines.length * companyLineHeight + 28;
        var currentInfoY = infoTop;
        infoLines.forEach(function (lines) {
          if (lines.length > 2) {
            lines = [lines[0], fitLineWithEllipsis(context, lines.slice(1).join(" "), infoMaxWidth)];
          }
          lines.forEach(function (line) {
            context.fillText(line, 540, currentInfoY + infoLineHeight / 2);
            currentInfoY += infoLineHeight;
          });
          currentInfoY += infoGroupGap;
        });

        var buttonTop = currentInfoY - infoGroupGap + 36;
        var buttonHeight = 90;
        context.fillStyle = "#25D366";
        roundedRect(context, 340, buttonTop, 400, buttonHeight, 45);
        context.fillStyle = "#124b2a";
        context.font = "700 43px Arial, Helvetica, sans-serif";
        context.fillText("VAGA NOVA", 540, buttonTop + buttonHeight / 2);

        context.fillStyle = "#0B5CFF";
        context.font = "700 34px Arial, Helvetica, sans-serif";
        context.fillText("@suavagars", 540, 970);

        if (imageUrl) URL.revokeObjectURL(imageUrl);
        canvas.toBlob(function (blob) {
          if (!blob) {
            imageStatus.textContent = "Não foi possível criar a imagem. Tente novamente.";
            return;
          }
          generatedImageBlob = blob;
          imageUrl = URL.createObjectURL(blob);
          preview.src = imageUrl;
          document.getElementById("preview-wrap").hidden = false;
          document.getElementById("download-image").disabled = false;
          document.getElementById("btnCopiarImagem").disabled = false;
          imageStatus.textContent = "Imagem pronta. Você pode baixar e publicar.";
        }, "image/png");
      });

      document.getElementById("btnCopiarImagem").addEventListener("click", async function () {
        if (!generatedImageBlob) {
          imageStatus.textContent = "Gere a imagem antes de copiá-la.";
          return;
        }

        var copyButton = document.getElementById("btnCopiarImagem");
        var shareButton = document.getElementById("btnCompartilharImagem");
        var ClipboardItemConstructor = window.ClipboardItem ||
          (typeof ClipboardItem !== "undefined" ? ClipboardItem : null);
        copyButton.disabled = true;
        try {
          if (!navigator.clipboard || typeof navigator.clipboard.write !== "function" ||
              !ClipboardItemConstructor) {
            throw new Error("Este navegador não permite copiar imagens diretamente.");
          }
          await navigator.clipboard.write([
            new ClipboardItemConstructor({ "image/png": generatedImageBlob })
          ]);
          shareButton.hidden = true;
          imageStatus.textContent = "✅ Imagem copiada! Agora abra o Instagram e cole direto no post.";
        } catch (error) {
          shareButton.hidden = false;
          imageStatus.textContent = "Não foi possível copiar a imagem. Use COMPARTILHAR IMAGEM ou BAIXAR IMAGEM.";
        } finally {
          copyButton.disabled = !generatedImageBlob;
        }
      });

      document.getElementById("btnCompartilharImagem").addEventListener("click", async function () {
        if (!generatedImageBlob) {
          imageStatus.textContent = "Gere a imagem antes de compartilhá-la.";
          return;
        }
        if (typeof navigator.share !== "function" || typeof File === "undefined") {
          imageStatus.textContent = "Este navegador não permite compartilhar arquivos. Use BAIXAR IMAGEM.";
          return;
        }

        var imageFile = new File([generatedImageBlob], "sua-vaga-rs.png", { type: "image/png" });
        if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [imageFile] })) {
          imageStatus.textContent = "Este navegador não permite compartilhar arquivos. Use BAIXAR IMAGEM.";
          return;
        }
        try {
          await navigator.share({
            files: [imageFile],
            title: "Sua Vaga RS - Vaga",
            text: "Imagem da vaga pronta para compartilhar."
          });
          imageStatus.textContent = "Imagem compartilhada.";
        } catch (error) {
          imageStatus.textContent = error && error.name === "AbortError"
            ? "Compartilhamento cancelado."
            : "Não foi possível compartilhar a imagem. Use BAIXAR IMAGEM.";
        }
      });

      document.getElementById("download-image").addEventListener("click", function () {
        if (!imageUrl) return;
        var download = document.createElement("a");
        download.href = imageUrl;
        download.download = "sua-vaga-rs.png";
        document.body.appendChild(download);
        download.click();
        download.remove();
      });
    }());
