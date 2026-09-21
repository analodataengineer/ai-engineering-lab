import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown, type EvalReport } from "../src/report.js";

test("el reporte incluye versiones, SHA y evidencia", () => {
  const report: EvalReport = {
    run: { id: "run-1", createdAt: "2026-01-01T00:00:00Z", gitCommitSha: "abc123", gitDirty: true, datasetVersion: "1", deterministicEvaluatorVersion: "1", semanticEvaluatorVersion: "1", configVersion: "1", semanticRubricVersion: "1", semanticRubricSha256: "ccc", datasetSha256: "aaa", configSha256: "bbb", semanticMode: "disabled", semanticModel: null },
    metrics: { cases: 1, deterministic: { passed: 0, passRate: 0 }, semantic: { evaluated: 0, passed: 0, skipped: 1, inconclusive: 0, passRate: null }, global: { pass: 0, fail: 1, partial: 0, passRate: 0 }, topicCoverage: { covered: 0, required: 0, rate: null }, guardrailViolations: 1, expectationMatches: 1 },
    results: [{ id: "bug", category: "consent", source: "test", deterministic: { passed: false, failures: [{ code: "consent_mismatch", message: "estado incorrecto", turnIndex: 1, evidence: "No acepto." }], requiredTopics: [], coveredTopics: [], missingTopics: [] }, semantic: { evaluator: "LLM-as-a-judge", status: "skipped", rubricVersion: "1", model: null, reason: null, turnIndex: null, evidence: null }, global: { status: "fail" }, expectationMatched: true }]
  };
  const markdown = renderMarkdown(report);
  assert.match(markdown, /abc123/);
  assert.match(markdown, /No acepto/);
  assert.match(markdown, /configuración: 1/);
  assert.match(markdown, /working tree dirty: true/);
  assert.match(markdown, /rúbrica semántica: ccc/);
});
