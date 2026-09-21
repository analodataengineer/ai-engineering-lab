# Local Evaluations

This package evaluates interview traces from JSON files. It does not import application modules, use the database, or call OpenAI by default. The included traces are synthetic.

## Run

From the repository root, after `npm ci`:

```bash
npm run eval:test
npm run eval -- --verify-expectations
```

The second command writes `evals/results/eval-<version>-<run-id>.json` and `.md` reports. Git ignores these files. Each report includes SHA-256 hashes of the dataset, configuration, and semantic rubric, plus the commit SHA and `gitDirty` when Git is available. `--verify-expectations` fails if the evaluator does not detect the expected failure codes. `--strict` fails on any global `fail` or `partial` result. The baseline includes adversarial cases and skips the semantic judge, so `--strict` is expected to fail initially.

To use another file: `npm run eval -- --input ruta/a/dataset.json --output ruta/de/salida`. Follow the format in `datasets/interview-cases.json`: each case has a unique ID, source, turns, observed and expected consent status, required topics, and expected failure codes. Increment the dataset `version` when changing cases or expectations. Increment the evaluator version constants and the version in `config.json` when changing their rules or patterns.

To add a case, copy an object within `cases`, change its `id` and turns, set `requiredTopics` using keys from `config.json`, and list the failure codes the evaluator should detect in `expectedFailureCodes`. For example, a conformant interview can use `"expectedFailureCodes": []`; a question about age can use `"expectedFailureCodes": ["sensitive_question"]`. Run the tests and then `--verify-expectations` to check the annotation.

The `no_acepto_regression` case checks that "No acepto" sets consent to `declined` and that no question follows. It is a synthetic trace of the expected behavior, not a recording of a real session.

## Optional Semantic Judge

`EVAL_SEMANTIC_URL` enables an **LLM-as-a-judge** through an HTTP endpoint compatible with chat completions. Set `EVAL_SEMANTIC_MODEL` as well; `EVAL_SEMANTIC_API_KEY` is optional. A local server can provide this endpoint. The rubric and response schema are in `src/evaluators/semantic.ts`, and the report records the hash of the exact rubric. The system prompt treats transcripts as untrusted data and instructs the judge to ignore instructions within them. This reduces prompt-injection risk but does not eliminate it. An `inconclusive` result is not treated as approval. CI does not set these environment variables.

## Interpret Results

The JSON separates `deterministic`, `semantic`, and `global` results for each case. The global status is `pass` only when both evaluators pass, `fail` when either fails, and `partial` when the deterministic evaluator passes but the semantic evaluator is skipped or inconclusive. The global pass rate counts only `pass` results. `expectationMatches` measures whether the evaluator detected the failures seeded in the dataset. Topic coverage counts only topics marked as required for each case.

Keyword rules can miss paraphrases or produce false positives: a contextual pattern such as `salud` may occur in a legitimate work-related question. Review the evidence and use semantic evaluation to support these cases. Do not put real personal information in versioned datasets or shared reports.
