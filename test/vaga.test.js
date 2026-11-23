"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { extractPage } = require("../api/vaga")

const source = "https://example.com/vaga/atendente"

test("extractPage parses JSON-LD JobPosting structured data", () => {
  const html = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Atendente de Loja",
            "hiringOrganization": { "name": "Loja Teste" },
            "jobLocation": { "address": { "addressLocality": "Caxias do Sul", "addressRegion": "RS", "addressCountry": "BR" } },
            "baseSalary": { "currency": "BRL", "value": { "minValue": 2500, "maxValue": 3000, "unitText": "MONTH" } },
            "employmentType": "FULL_TIME",
            "jobBenefits": ["Vale refeição", "Plano de saúde"],
            "qualifications": ["Ensino médio completo", "Experiência com atendimento"]
          }
        </script>
      </head>
      <body></body>
    </html>
  `
  const result = extractPage(html, source)
  assert.equal(result.title, "Atendente de Loja")
  assert.equal(result.company, "Loja Teste")
  assert.equal(result.city, "Caxias do Sul - RS")
  assert.ok(result.salary.includes("R$"))
  assert.equal(result.contractType, "Tempo integral")
  assert.ok(result.benefits.includes("Vale refeição"))
  assert.ok(result.requirements.includes("Ensino médio completo"))
})

test("extractPage returns empty title for non-job pages", () => {
  const html = "<html><head><title>Página de erro 404</title></head><body></body></html>"
  const result = extractPage(html, source)
  assert.equal(result.title, "")
})

test("extractPage extracts title from <title> tag when no JSON-LD", () => {
  const html = "<html><head><title>Vaga de Vendedor - Loja X</title></head><body></body></html>"
  const result = extractPage(html, source)
  assert.ok(result.title.includes("Vendedor"))
})

test("extractPage extracts company from meta tags", () => {
  const html = "<html><head><meta name=\"job:company\" content=\"Empresa Meta\"><title>Vaga</title></head><body></body></html>"
  const result = extractPage(html, source)
  assert.equal(result.company, "Empresa Meta")
})

test("extractPage extracts city from text labels", () => {
  const html = "<html><body>Cidade: Porto Alegre - RS</body></html>"
  const result = extractPage(html, source)
  assert.ok(result.city.includes("Porto Alegre"))
})

test("extractPage truncates long text fields", () => {
  const longText = "A".repeat(600)
  const html = `<html><body>Salário: ${longText}</body></html>`
  const result = extractPage(html, source)
  assert.ok(result.salary.length <= 500)
})

test("extractPage handles empty HTML gracefully", () => {
  const result = extractPage("", source)
  assert.equal(result.title, "")
  assert.equal(result.company, "")
  assert.equal(result.source, source)
})

test("extractPage normalizes contract type from text", () => {
  const html = "<html><body>Tipo de contratação: PJ</body></html>"
  const result = extractPage(html, source)
  assert.equal(result.contractType, "PJ")
})
