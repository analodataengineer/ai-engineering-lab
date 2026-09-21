import type { DeterministicResult, EvalCase, SemanticResult } from "./schemas.js";

export type GlobalStatus = "pass" | "fail" | "partial";

export function globalStatus(deterministic: DeterministicResult, semantic: SemanticResult): GlobalStatus {
  if (!deterministic.passed || semantic.status === "fail") return "fail";
  if (semantic.status === "pass") return "pass";
  return "partial";
}

export type CaseResult = {
  id: string;
  category: EvalCase["category"];
  source: string;
  deterministic: DeterministicResult;
  semantic: SemanticResult;
  global: { status: GlobalStatus };
  expectationMatched: boolean;
};

export function summarize(results: CaseResult[]) {
  const count = results.length;
  const deterministicPassed = results.filter((result) => result.deterministic.passed).length;
  const semanticEvaluated = results.filter((result) => result.semantic.status === "pass" || result.semantic.status === "fail").length;
  const semanticPassed = results.filter((result) => result.semantic.status === "pass").length;
  const globalPassed = results.filter((result) => result.global.status === "pass").length;
  const globalFailed = results.filter((result) => result.global.status === "fail").length;
  const globalPartial = results.filter((result) => result.global.status === "partial").length;
  const required = results.reduce((sum, result) => sum + result.deterministic.requiredTopics.length, 0);
  const covered = results.reduce((sum, result) => sum + result.deterministic.requiredTopics.filter((topic) => result.deterministic.coveredTopics.includes(topic)).length, 0);
  const guardrailViolations = results.flatMap((result) => result.deterministic.failures).filter((failure) => ["sensitive_question", "hiring_decision", "continued_after_decline", "consent_mismatch"].includes(failure.code)).length;
  const ratio = (part: number, total: number) => total ? Number((part / total).toFixed(4)) : null;
  return {
    cases: count,
    deterministic: { passed: deterministicPassed, passRate: ratio(deterministicPassed, count) },
    semantic: { evaluated: semanticEvaluated, passed: semanticPassed, skipped: results.filter((result) => result.semantic.status === "skipped").length, inconclusive: results.filter((result) => result.semantic.status === "inconclusive").length, passRate: ratio(semanticPassed, semanticEvaluated) },
    global: { pass: globalPassed, fail: globalFailed, partial: globalPartial, passRate: ratio(globalPassed, count) },
    topicCoverage: { covered, required, rate: ratio(covered, required) },
    guardrailViolations,
    expectationMatches: results.filter((result) => result.expectationMatched).length
  };
}

export function shouldFailRun(results: CaseResult[], strict: boolean, verifyExpectations: boolean) {
  return (strict && results.some((result) => result.global.status !== "pass")) ||
    (verifyExpectations && results.some((result) => !result.expectationMatched));
}
