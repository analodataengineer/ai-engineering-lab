import type { CaseResult } from "./metrics.js";
import { summarize } from "./metrics.js";

export type EvalReport = {
  run: {
    id: string;
    createdAt: string;
    gitCommitSha: string | null;
    gitDirty: boolean | null;
    datasetVersion: string;
    deterministicEvaluatorVersion: string;
    semanticEvaluatorVersion: string;
    configVersion: string;
    semanticRubricVersion: string;
    semanticRubricSha256: string;
    datasetSha256: string;
    configSha256: string;
    semanticMode: "disabled" | "LLM-as-a-judge";
    semanticModel: string | null;
  };
  metrics: ReturnType<typeof summarize>;
  results: CaseResult[];
};

export function renderMarkdown(report: EvalReport) {
  const { run, metrics, results } = report;
  const lines = [
    `# Evaluación ${run.id}`,
    "",
    `- Fecha: ${run.createdAt}`,
    `- Git commit SHA: ${run.gitCommitSha ?? "no disponible"}`,
    `- Git working tree dirty: ${run.gitDirty === null ? "no disponible" : run.gitDirty}`,
    `- Dataset: ${run.datasetVersion}; evaluador determinístico: ${run.deterministicEvaluatorVersion}; evaluador semántico: ${run.semanticEvaluatorVersion}; configuración: ${run.configVersion}; rúbrica: ${run.semanticRubricVersion}`,
    `- SHA-256 dataset: ${run.datasetSha256}; configuración: ${run.configSha256}; rúbrica semántica: ${run.semanticRubricSha256}`,
    `- Semántico: ${run.semanticMode}${run.semanticModel ? ` (${run.semanticModel})` : ""}`,
    "",
    "## Métricas",
    "",
    `- Determinístico: ${metrics.deterministic.passed}/${metrics.cases} (${pct(metrics.deterministic.passRate)})`,
    `- Semántico: ${metrics.semantic.passed}/${metrics.semantic.evaluated} evaluados; ${metrics.semantic.skipped} omitidos; ${metrics.semantic.inconclusive} inconclusos`,
    `- Global: ${metrics.global.pass} pass, ${metrics.global.fail} fail, ${metrics.global.partial} partial; tasa pass ${pct(metrics.global.passRate)}`,
    `- Cobertura de temas requeridos: ${metrics.topicCoverage.covered}/${metrics.topicCoverage.required} (${pct(metrics.topicCoverage.rate)})`,
    `- Violaciones de guardrails: ${metrics.guardrailViolations}`,
    `- Concordancia con expectativas del dataset: ${metrics.expectationMatches}/${metrics.cases}`,
    "",
    "## Resultados por caso",
    "",
    "| Caso | Determinístico | Semántico | Global | Expectativa |",
    "| --- | --- | --- | --- | --- |",
    ...results.map((result) => `| ${result.id} | ${result.deterministic.passed ? "pass" : "fail"} | ${result.semantic.status} | ${result.global.status} | ${result.expectationMatched ? "match" : "mismatch"} |`),
    "",
    "## Failures y evidencia",
    ""
  ];
  for (const result of results) {
    for (const failure of result.deterministic.failures) lines.push(`- **${result.id} / ${failure.code}**: ${failure.message}. Turno ${failure.turnIndex ?? "N/A"}: ${JSON.stringify(failure.evidence)}`);
    if (result.semantic.status === "fail") lines.push(`- **${result.id} / LLM-as-a-judge**: ${result.semantic.reason}. Turno ${result.semantic.turnIndex}: ${JSON.stringify(result.semantic.evidence)}`);
  }
  if (!results.some((result) => result.deterministic.failures.length || result.semantic.status === "fail")) lines.push("Sin failures detectados.");
  lines.push("", "Los casos sintéticos verifican reglas y trazas representativas; no miden por sí solos sesiones de voz en producción.", "");
  return lines.join("\n");
}

function pct(value: number | null) { return value === null ? "N/A" : `${Math.round(value * 100)}%`; }
