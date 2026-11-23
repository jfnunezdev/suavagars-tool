"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { validateVacancy } = require("../api/vagas")

const validVacancy = {
  role: "Atendente",
  company: "Empresa Teste",
  city: "Caxias do Sul - RS",
  salary: "R$ 2.500,00",
  contractType: "CLT (Efetivo)",
  link: "https://example.com/vaga"
}

test("validateVacancy accepts a complete vacancy", () => {
  const vaga = validateVacancy(validVacancy)
  assert.equal(vaga.role, "Atendente")
  assert.equal(vaga.company, "Empresa Teste")
  assert.equal(vaga.city, "Caxias do Sul - RS")
  assert.equal(vaga.salary, "R$ 2.500,00")
  assert.equal(vaga.contractType, "CLT (Efetivo)")
  assert.equal(vaga.link, "https://example.com/vaga")
  assert.ok(vaga.id)
  assert.ok(vaga.createdAt)
})

test("validateVacancy rejects missing role", () => {
  assert.throws(() => validateVacancy({ ...validVacancy, role: "" }), /Informe o cargo/)
  assert.throws(() => validateVacancy({ ...validVacancy, role: "   " }), /Informe o cargo/)
})

test("validateVacancy rejects missing link", () => {
  assert.throws(() => validateVacancy({ ...validVacancy, link: "" }), /link público HTTP ou HTTPS/)
})

test("validateVacancy rejects non-HTTP link", () => {
  assert.throws(() => validateVacancy({ ...validVacancy, link: "ftp://example.com" }), /link público HTTP ou HTTPS/)
  assert.throws(() => validateVacancy({ ...validVacancy, link: "javascript:alert(1)" }), /link público HTTP ou HTTPS/)
})

test("validateVacancy trims and bounds text fields", () => {
  const vaga = validateVacancy({
    ...validVacancy,
    company: "  Empresa com espaços  ",
    role: "  Atendente  "
  })
  assert.equal(vaga.company, "Empresa com espaços")
  assert.equal(vaga.role, "Atendente")
})

test("validateVacancy defaults missing optional fields", () => {
  const vaga = validateVacancy({ ...validVacancy, company: "", city: "", salary: "", contractType: "" })
  assert.equal(vaga.company, "A consultar")
  assert.equal(vaga.city, "A consultar")
  assert.equal(vaga.salary, "A consultar")
  assert.equal(vaga.contractType, "A consultar")
})

test("validateVacancy rejects non-object body", () => {
  assert.throws(() => validateVacancy(null), /formato JSON/)
  assert.throws(() => validateVacancy("texto"), /formato JSON/)
  assert.throws(() => validateVacancy([1, 2, 3]), /formato JSON/)
})

test("validateVacancy rejects link with credentials", () => {
  assert.throws(() => validateVacancy({ ...validVacancy, link: "https://user:pass@example.com/vaga" }), /link público HTTP ou HTTPS/)
})
