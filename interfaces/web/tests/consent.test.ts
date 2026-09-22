import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyConsent } from "../src/consent.js";

for (const answer of [
  "No acepto", "No", "No.", "Negativo", "No consiento", "Prefiero no",
  "No le doy consentimiento", "No doy mi consentimiento", "No presto mi consentimiento",
  "No autorizo", "No quiero dar mi consentimiento", "No estoy de acuerdo", "Rechazo"
]) {
  test(`rechaza consentimiento: ${answer}`, () => {
    assert.equal(classifyConsent(answer), "declined");
  });
}

for (const answer of [
  "Acepto", "Sí", "Sí!", "Claro", "De acuerdo", "Sí, acepto.",
  "Claro, acepto", "No tengo problema, acepto.",
  "Sí, estoy de acuerdo", "Sí, doy mi consentimiento", "Sí, quiero continuar",
  "Claro que sí", "De acuerdo, acepto"
]) {
  test(`otorga consentimiento: ${answer}`, () => {
    assert.equal(classifyConsent(answer), "granted");
  });
}

test("no toma la palabra acepto dentro de una respuesta ambigua", () => {
  assert.equal(classifyConsent("Acepto no"), "pending");
});

test("una respuesta ambigua sigue pendiente", () => {
  assert.equal(classifyConsent("No estoy seguro todavía"), "pending");
});

for (const answer of [
  "No quiero continuar", "No quiero seguir", "Quiero cancelar la entrevista",
  "Prefiero terminar", "Quiero finalizar", "Prefiero no continuar",
  "Ya no quiero continuar", "Ya no quiero seguir", "No, no quiero seguir",
  "No quiero continuar con la entrevista", "No quiero seguir con la entrevista",
  "Ya no quiero seguir con la entrevista",
  "No quiero seguir con esto", "No quiero continuar con esto",
  "No quiero seguir, gracias", "Quiero terminar", "Quiero terminar la entrevista",
  "Quiero finalizar la entrevista", "Quiero cancelar", "Quiero detener la entrevista",
  "Quiero parar la entrevista", "Quiero dejarlo acá", "Prefiero dejarlo acá",
  "Hasta acá", "Hasta acá llego", "Dejémoslo acá",
  "Quiero cancelar, por favor", "Hasta acá, gracias por favor",
  "  ¡YA   NO QUIERO SEGUIR con la entrevista!  ",
  "Dejémoslo acá, gracias."
]) {
  test(`solicitud de detención: ${answer}`, () => {
    assert.equal(classifyConsent(answer), "stop_requested");
  });
}

for (const answer of ["No sé", "Tal vez", "No estoy seguro", "¿Para qué sería?"]) {
  test(`ambiguous consent remains pending: ${answer}`, () => {
    assert.equal(classifyConsent(answer), "pending");
  });
}

for (const [answer, expected] of [
  ["No quiero compartir mi correo", "pending"],
  ["Sí, tengo experiencia", "pending"],
  ["Estoy de acuerdo con el horario", "pending"],
  ["Quiero continuar usando Java", "pending"],
  ["Claro que sí, sé programar", "pending"],
  ["No quiero trabajar presencial", "pending"],
  ["No quiero usar esa tecnología", "pending"],
  ["No quiero usar Java", "pending"],
  ["No quiero cambiar de puesto", "pending"],
  ["No tengo problema, acepto", "granted"],
  ["Quiero terminar la tarea", "pending"],
  ["Quiero cancelar mis vacaciones", "pending"],
  ["No quiero seguir usando Java", "pending"],
  ["No quiero continuar con la entrevista de mañana", "pending"],
  ["Hasta acá llega mi experiencia", "pending"],
  ["Quiero finalizar el proyecto, gracias", "pending"]
] as const) {
  test(`non-terminal preference: ${answer}`, () => {
    assert.equal(classifyConsent(answer), expected);
  });
}
