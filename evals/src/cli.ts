import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configSchema, datasetSchema } from "./schemas.js";
import { DETERMINISTIC_EVALUATOR_VERSION, evaluateDeterministic } from "./evaluators/deterministic.js";
import { SEMANTIC_EVALUATOR_VERSION, SEMANTIC_RUBRIC_SHA256, evaluateSemantic } from "./evaluators/semantic.js";
import { globalStatus, shouldFailRun, summarize, type CaseResult } from "./metrics.js";
import { renderMarkdown, type EvalReport } from "./report.js";

const evalRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function option(name: string) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Falta valor para ${name}`);
  return args[index + 1];
}

async function main() {
  const datasetPath = resolve(option("--input") ?? resolve(evalRoot, "datasets/interview-cases.json"));
  const configPath = resolve(option("--config") ?? resolve(evalRoot, "config.json"));
  const outputDir = resolve(option("--output") ?? resolve(evalRoot, "results"));
  const [datasetBytes, configBytes] = await Promise.all([readFile(datasetPath), readFile(configPath)]);
  const dataset = datasetSchema.parse(JSON.parse(datasetBytes.toString("utf8")));
  const config = configSchema.parse(JSON.parse(configBytes.toString("utf8")));
  for (const item of dataset.cases) for (const topic of item.requiredTopics) if (!config.topics[topic]) throw new Error(`Tema desconocido ${topic} en ${item.id}`);
  let gitCommitSha: string | null = null;
  let gitDirty: boolean | null = null;
  const gitSafeDirectory = `safe.directory=${resolve(evalRoot, "..").replaceAll("\\", "/")}`;
  try {
    gitCommitSha = execFileSync("git", ["-c", gitSafeDirectory, "rev-parse", "HEAD"], { cwd: evalRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    gitDirty = execFileSync("git", ["-c", gitSafeDirectory, "status", "--porcelain", "--untracked-files=normal"], { cwd: evalRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().length > 0;
  } catch { /* optional metadata outside a Git checkout */ }
  const results: CaseResult[] = [];
  for (const item of dataset.cases) {
    const deterministic = evaluateDeterministic(item, config);
    const semantic = await evaluateSemantic(item, config);
    const actualFailureCodes = [...new Set(deterministic.failures.map((failure) => failure.code))].sort();
    const expectedFailureCodes = [...new Set(item.expectedFailureCodes)].sort();
    results.push({
      id: item.id, category: item.category, source: item.source, deterministic, semantic,
      global: { status: globalStatus(deterministic, semantic) },
      expectationMatched: JSON.stringify(actualFailureCodes) === JSON.stringify(expectedFailureCodes)
    });
  }
  const report: EvalReport = {
    run: {
      id: randomUUID(), createdAt: new Date().toISOString(), gitCommitSha, gitDirty,
      datasetVersion: dataset.version,
      deterministicEvaluatorVersion: DETERMINISTIC_EVALUATOR_VERSION,
      semanticEvaluatorVersion: SEMANTIC_EVALUATOR_VERSION,
      configVersion: config.version,
      semanticRubricVersion: config.semanticRubricVersion,
      semanticRubricSha256: SEMANTIC_RUBRIC_SHA256,
      datasetSha256: createHash("sha256").update(datasetBytes).digest("hex"),
      configSha256: createHash("sha256").update(configBytes).digest("hex"),
      semanticMode: process.env.EVAL_SEMANTIC_URL ? "LLM-as-a-judge" : "disabled",
      semanticModel: process.env.EVAL_SEMANTIC_MODEL ?? null
    },
    metrics: summarize(results), results
  };
  const basename = `eval-${dataset.version}-${report.run.id}`;
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDir, `${basename}.json`), JSON.stringify(report, null, 2) + "\n"),
    writeFile(resolve(outputDir, `${basename}.md`), renderMarkdown(report))
  ]);
  console.log(`JSON: ${resolve(outputDir, `${basename}.json`)}`);
  console.log(`Markdown: ${resolve(outputDir, `${basename}.md`)}`);
  console.log(JSON.stringify(report.metrics, null, 2));
  if (shouldFailRun(results, args.includes("--strict"), args.includes("--verify-expectations"))) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
