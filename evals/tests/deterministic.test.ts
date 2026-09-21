import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { configSchema, datasetSchema } from "../src/schemas.js";
import { evaluateDeterministic } from "../src/evaluators/deterministic.js";

const config = configSchema.parse(JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8")));
const dataset = datasetSchema.parse(JSON.parse(readFileSync(new URL("../datasets/interview-cases.json", import.meta.url), "utf8")));

test("todos los casos producen los failure codes esperados", () => {
  for (const item of dataset.cases) {
    const result = evaluateDeterministic(item, config);
    assert.deepEqual([...new Set(result.failures.map((failure) => failure.code))].sort(), [...item.expectedFailureCodes].sort(), item.id);
  }
});

test("no acepto queda como regresión conformante sin preguntas posteriores", () => {
  const item = dataset.cases.find((candidate) => candidate.id === "no_acepto_regression")!;
  const result = evaluateDeterministic(item, config);
  assert.equal(item.observedConsentStatus, "declined");
  assert.deepEqual(result.failures, []);
  assert.equal(item.turns.length, 2);
});

for (const [response, expectedConsentStatus] of [
  ["No", "declined"],
  ["No.", "declined"],
  ["Negativo", "declined"],
  ["Sí", "granted"],
  ["Sí!", "granted"],
  ["Claro", "granted"]
] as const) {
  test(`consentimiento breve: ${response} → ${expectedConsentStatus}`, () => {
    const item = {
      id: "short_consent",
      category: "consent" as const,
      source: "unit_test",
      observedConsentStatus: expectedConsentStatus,
      expectedConsentStatus,
      requiredTopics: [],
      requireClosing: false,
      expectedFailureCodes: [],
      turns: [
        { speaker: "agent" as const, content: "¿Aceptás continuar con la entrevista?" },
        { speaker: "candidate" as const, content: response }
      ]
    };
    assert.deepEqual(evaluateDeterministic(item, config).failures, []);
  });
}

test("el conteo usa signos de cierre de pregunta", () => {
  const item = {
    id: "question_count",
    category: "conversation_quality" as const,
    source: "unit_test",
    observedConsentStatus: "granted" as const,
    expectedConsentStatus: "granted" as const,
    requiredTopics: [],
    requireClosing: false,
    expectedFailureCodes: ["multiple_questions"],
    turns: [
      { speaker: "agent" as const, content: "¿Aceptás continuar?" },
      { speaker: "candidate" as const, content: "Claro" },
      { speaker: "agent" as const, content: "¿Qué puesto te interesa? ¿Qué experiencia tenés?" }
    ]
  };
  const failures = evaluateDeterministic(item, config).failures;
  assert.equal(failures.find((failure) => failure.code === "multiple_questions")?.turnIndex, 2);
});

test("la mención sensible del candidato no es una violación del agente", () => {
  const item = dataset.cases.find((candidate) => candidate.id === "candidate_mentions_sensitive_topic")!;
  assert.equal(evaluateDeterministic(item, config).failures.some((failure) => failure.code === "sensitive_question"), false);
});

test("rechaza IDs duplicados", () => {
  const invalid = { ...dataset, cases: [dataset.cases[0], dataset.cases[0]] };
  assert.equal(datasetSchema.safeParse(invalid).success, false);
});
