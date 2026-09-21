import assert from "node:assert/strict";
import { test } from "node:test";
import { globalStatus, shouldFailRun, summarize, type CaseResult } from "../src/metrics.js";

test("separa cumplimiento, cobertura y ejecución semántica omitida", () => {
  const results: CaseResult[] = [
    { id: "a", category: "coverage", source: "test", deterministic: { passed: true, failures: [], requiredTopics: ["identity"], coveredTopics: ["identity"], missingTopics: [] }, semantic: { evaluator: "LLM-as-a-judge", status: "skipped", rubricVersion: "1", model: null, reason: null, turnIndex: null, evidence: null }, global: { status: "partial" }, expectationMatched: true },
    { id: "b", category: "coverage", source: "test", deterministic: { passed: false, failures: [{ code: "missing_topic", message: "", turnIndex: 0, evidence: "x" }], requiredTopics: ["experience"], coveredTopics: [], missingTopics: ["experience"] }, semantic: { evaluator: "LLM-as-a-judge", status: "skipped", rubricVersion: "1", model: null, reason: null, turnIndex: null, evidence: null }, global: { status: "fail" }, expectationMatched: true }
  ];
  const metrics = summarize(results);
  assert.equal(metrics.global.passRate, 0);
  assert.equal(metrics.topicCoverage.rate, 0.5);
  assert.equal(metrics.semantic.passRate, null);
  assert.equal(metrics.global.partial, 1);
  assert.equal(metrics.global.fail, 1);
  assert.equal(shouldFailRun(results, true, false), true);
  assert.equal(shouldFailRun(results, false, true), false);
});

test("partial, pass y fail tienen semántica explícita; --strict falla con partial", () => {
  const deterministic = { passed: true, failures: [], requiredTopics: [], coveredTopics: [], missingTopics: [] };
  const semantic = { evaluator: "LLM-as-a-judge" as const, status: "skipped" as const, rubricVersion: "1", model: null, reason: null, turnIndex: null, evidence: null };
  assert.equal(globalStatus(deterministic, semantic), "partial");
  assert.equal(globalStatus(deterministic, { ...semantic, status: "inconclusive" }), "partial");
  assert.equal(globalStatus(deterministic, { ...semantic, status: "pass" }), "pass");
  assert.equal(globalStatus(deterministic, { ...semantic, status: "fail" }), "fail");
  assert.equal(shouldFailRun([{ id: "partial", category: "consent", source: "test", deterministic, semantic, global: { status: "partial" }, expectationMatched: true }], true, false), true);
});
