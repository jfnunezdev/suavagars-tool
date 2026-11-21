"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateApplication } = require("../api/candidaturas");

const validApplication = {
  role: "Atendente",
  company: "Empresa Teste",
  city: "Caxias do Sul - RS",
  salary: "A combinar",
  contractType: "CLT",
  link: "https://example.com/candidatar",
  contactName: "Contato",
  contactPhone: "(54) 99999-0000"
};

test("validates and stores a company vacancy as pending", () => {
  const application = validateApplication(validApplication);

  assert.equal(application.role, "Atendente");
  assert.equal(application.company, "Empresa Teste");
  assert.equal(application.link, "https://example.com/candidatar");
  assert.ok(application.id);
  assert.ok(application.createdAt);
});

test("rejects a submission without a required job title", () => {
  assert.throws(() => validateApplication({ ...validApplication, role: " " }), /Informe o cargo/);
});

test("rejects a non-public application link", () => {
  assert.throws(() => validateApplication({ ...validApplication, link: "javascript:alert(1)" }), /link público HTTP ou HTTPS/);
});
