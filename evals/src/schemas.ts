import { z } from "zod";

export const turnSchema = z.object({
  speaker: z.enum(["agent", "candidate", "system"]),
  content: z.string().min(1)
});

export const caseSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  category: z.enum(["consent", "sensitive_scope", "coverage", "conversation_quality"]),
  source: z.string().min(1),
  observedConsentStatus: z.enum(["pending", "granted", "declined"]),
  expectedConsentStatus: z.enum(["pending", "granted", "declined"]),
  requiredTopics: z.array(z.string()).default([]),
  requireClosing: z.boolean().default(false),
  expectedFailureCodes: z.array(z.string()).default([]),
  turns: z.array(turnSchema).min(1)
});

export const datasetSchema = z.object({
  version: z.string().min(1),
  description: z.string(),
  cases: z.array(caseSchema).min(1)
}).superRefine((dataset, ctx) => {
  const ids = new Set<string>();
  dataset.cases.forEach((item, index) => {
    if (ids.has(item.id)) ctx.addIssue({ code: "custom", path: ["cases", index, "id"], message: "duplicate case id" });
    ids.add(item.id);
  });
});

export const configSchema = z.object({
  version: z.string().min(1),
  topics: z.record(z.array(z.string().min(1)).min(1)),
  sensitivePatterns: z.array(z.string().min(1)),
  decisionPatterns: z.array(z.string().min(1)),
  semanticRubricVersion: z.string().min(1)
});

export type EvalCase = z.infer<typeof caseSchema>;
export type EvalConfig = z.infer<typeof configSchema>;
export type Failure = { code: string; message: string; turnIndex: number | null; evidence: string | null };
export type DeterministicResult = {
  passed: boolean;
  failures: Failure[];
  requiredTopics: string[];
  coveredTopics: string[];
  missingTopics: string[];
};
export type SemanticResult = {
  evaluator: "LLM-as-a-judge";
  status: "pass" | "fail" | "inconclusive" | "skipped";
  rubricVersion: string;
  model: string | null;
  reason: string | null;
  turnIndex: number | null;
  evidence: string | null;
};
