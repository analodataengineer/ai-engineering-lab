import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyConsent } from "../src/consent.js";

for (const answer of ["No acepto", "No", "No.", "Negativo", "No consiento", "Prefiero no"]) {
  test(`rechaza consentimiento: ${answer}`, () => {
    assert.equal(classifyConsent(answer), "declined");
  });
}

for (const answer of ["Acepto", "Sí", "Sí!", "Claro", "De acuerdo", "Sí, acepto."]) {
  test(`otorga consentimiento: ${answer}`, () => {
    assert.equal(classifyConsent(answer), "granted");
  });
}

test("no toma la palabra acepto dentro de una respuesta ambigua", () => {
  assert.equal(classifyConsent("Acepto no"), "pending");
});
