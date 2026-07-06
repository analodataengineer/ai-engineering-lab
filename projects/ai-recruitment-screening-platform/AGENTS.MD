# Instructions for Codex

This repository implements a portable MVP for a voice-based interview agent.

## Product goal

Build a simple conversational voice agent that conducts an initial job interview, records the session, and generates a neutral summary for human review.

This project must be modular and reusable. Do not build it as a single demo file.

## Architecture rules

Separate responsibilities clearly:

* `interfaces/web`: user interface only.
* `services/session-api`: session creation, realtime token generation, voice provider coordination.
* `agents/interview-agent`: conversational behavior, instructions, tools, guardrails.
* `skills/interview`: reusable interview capabilities written in Markdown.
* `routines/interview`: ordered interview flow.
* `engines/interview`: deterministic state, validation, persistence, summaries, events.
* `mcps/speech`: external speech provider adapters.
* `knowledge/interview`: configurable question bank and interview policy.
* `storage/migrations`: database schema.

The agent must not write directly to the database. It must use tools or APIs that call the engine.

The engine must not behave like a conversational agent. It must validate, persist and expose deterministic operations.

## Safety rules

The agent must not:

* Decide whether to hire or reject a candidate.
* Produce final candidate scores.
* Ask about age, health, religion, politics, marital status, pregnancy, family situation, ethnicity, disability or other sensitive attributes.
* Infer protected characteristics.
* Invent information not provided by the candidate.

The agent may:

* Ask about professional experience.
* Ask about tools, tasks, availability and work preferences.
* Ask for clarification.
* Produce a neutral summary.
* Suggest points for human review.

## Technical rules

Use:

* TypeScript.
* Node.js.
* Vite.
* Express or Fastify.
* OpenAI Agents SDK / Realtime for the first MVP.
* PostgreSQL for durable persistence.
* Redis only for temporary state, locks or lightweight events.
* Docker Compose for local portability.
* Zod for schemas and validation.

Keep OpenAI and Deepgram API keys server-side only.

Do not expose secrets in the frontend.

## Provider rules

OpenAI is the default voice provider for the MVP.

Deepgram should be represented as an alternate provider boundary, but it does not need to be fully implemented in the first working version unless explicitly requested.

Use a provider interface so future STT/TTS providers can be swapped without rewriting the agent.

## Development rules

Before editing:

* Inspect existing files.
* Explain a short plan.
* Keep changes minimal.

When editing:

* Prefer small modules.
* Avoid hidden business logic.
* Validate inputs with schemas.
* Avoid hardcoded secrets.
* Keep prompts, skills and knowledge configurable.

After editing:

* Summarize changed files.
* Explain how to run the project.
* Explain how to test the interview flow.
* Mention any known limitations.

## Out of scope for MVP

Do not implement:

* Candidate scoring.
* Automatic hiring recommendations.
* Authentication.
* Advanced dashboard.
* Kubernetes manifests beyond a placeholder README.
* Multi-company tenancy.
* Calendar scheduling.
* Email sending.
* Resume parsing.
* Production observability.
