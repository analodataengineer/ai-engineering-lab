# AI Recruitment Screening Platform

## Overview

AI Recruitment Screening Platform is a voice-based system for conducting short initial candidate interviews and making the resulting information available for recruiter review.

The platform combines a browser-based voice experience, OpenAI Realtime, deterministic interview workflow control, backend session enforcement, PostgreSQL persistence, recruiter review, automated tests, and offline evaluation.

The system does not score, rank, approve, or reject candidates. Interview information is presented for human review.

## Current Status

### Implemented

- OpenAI Realtime voice interviews over WebRTC.
- Application-owned consent and interview workflow.
- Rule-based consent and withdrawal handling.
- Backend session-state and consent enforcement.
- PostgreSQL persistence for sessions, turns, events, candidate details, basic neutral summaries, and email events.
- Microphone and Realtime cleanup on interview completion or cancellation.
- Recruiter dashboard and interview-detail views.
- Synthetic and adversarial evaluation datasets.
- Automated CI validation with GitHub Actions.
- Runtime observability with optional Langfuse/OpenTelemetry telemetry.

### In Development

- Structured recruiter-facing summaries.
- Recruiter data normalization and UI improvements.

## Architecture

The active application runtime is:

```text
Candidate / Recruiter Web
interfaces/web
        |
        | REST
        v
Session API
services/session-api
        |
        v
Interview Engine
engines/interview
        |
        v
PostgreSQL
```

The voice path is:

```text
Candidate Browser
      |
      | WebRTC
      v
OpenAI Realtime
```

The Session API creates an ephemeral Realtime client secret. The browser uses that secret to establish the WebRTC connection with OpenAI Realtime while the OpenAI API key remains server-side.

### Main Components

- `interfaces/web`: candidate interview experience and recruiter interface.
- `services/session-api`: session creation and management, ephemeral Realtime tokens, recruiter access, and communication with the Interview Engine.
- `engines/interview`: session state, consent enforcement, turns, summaries, events, and persistence logic.
- `storage/migrations`: PostgreSQL migrations.
- `knowledge/interview/policy.md`: shared interview policy.
- `evals`: synthetic and adversarial interview evaluation framework.

## Interview Flow

The active interview workflow is implemented in:

```text
interfaces/web/src/interview-workflow.ts
```

The current sequence is:

```text
consent
→ name
→ email_optional
→ target_role
→ experience
→ tools
→ challenge
→ availability
→ motivation
→ company_reason
→ complete
```

The application owns the workflow state and determines which question comes next.

For each step:

1. The application selects the canonical question.
2. The question is sent to the voice model.
3. The candidate response is processed.
4. The validated answer is persisted.
5. The workflow advances exactly one step.

The model does not independently choose the interview sequence or add follow-up questions.

After the final answer is persisted, the application transitions the session directly to completion.

The interview is designed to take approximately five minutes. The current time budget is informational and does not enforce a hard timeout or skip required steps.

## Consent and Session Control

Consent is handled before the interview workflow is unlocked.

The application uses deterministic rules to identify:

- explicit consent;
- explicit refusal;
- ambiguous responses;
- withdrawal during an active interview.

Ambiguous responses keep the session in the consent phase and trigger clarification.

Before protected interview data can be written, the backend verifies:

```text
consent_status = granted
```

and validates the current session state.

Protected writes use PostgreSQL transactions with a session-row lock so state validation and persistence remain coordinated.

Invalid session operations return structured errors such as:

```text
404 session_not_found
409 invalid_session_state
```

Completion and cancellation transitions are conditional and idempotent to avoid duplicate terminal side effects.

## Realtime Voice Runtime

The active voice provider is OpenAI Realtime over WebRTC.

The runtime uses semantic VAD for speech detection.

Automatic model response creation is disabled. The application explicitly sends:

```text
response.create
```

after a validated candidate turn.

This keeps response generation coordinated with the application-owned workflow.

When a terminal transition begins, the browser:

- stops microphone tracks;
- prevents additional transcript processing;
- cancels an active response when necessary;
- clears buffered output audio;
- closes the Realtime data channel;
- closes the peer connection;
- detaches media references.

Cleanup is idempotent so multiple terminal signals converge on the same final state.

## Observability

The platform includes a minimal, optional runtime observability layer built with Langfuse and OpenTelemetry:

```text
Candidate Browser
      |
      | allowlisted operational telemetry
      v
Session API
      |
      v
Interview Engine
      |
      v
Langfuse
```

The existing `sessionId` is the primary correlation key across observations. Realtime generation telemetry records the configured model, native latency, response status, token usage, and text/audio token breakdowns. Cached and uncached usage is normalized into mutually exclusive buckets so the same tokens are not counted twice. The usage shape is prepared for multimodal pricing; monetary cost calculation requires a matching Langfuse Model Definition and is not provided by the application.

Telemetry is content-free: transcripts, prompts, audio, candidate answers, names, emails, tokens, and request bodies are excluded. Langfuse credentials remain server-side. Configuration is optional and uses the variables documented in [`.env.example`](.env.example); when disabled or unavailable, observability fails open and does not interrupt the interview.

See [`docs/observability.md`](docs/observability.md) for event taxonomy, usage normalization, privacy rules, and setup details.

## Persistence and Recruiter Review

The Interview Engine persists interview information in PostgreSQL.

Stored information includes:

- interview sessions;
- consent status;
- session lifecycle status;
- candidate turns;
- agent turns;
- lifecycle and domain events;
- candidate identity;
- optional email;
- target role;
- neutral summaries;
- email events.

The recruiter interface provides access to:

- dashboard metrics;
- recent interviews;
- candidate information;
- interview status;
- transcript;
- summary;
- email-related events.

The current summary implementation is deterministic and based on persisted session information.

## Evaluation

The `evals/` module evaluates interview behavior independently from the application runtime.

It includes:

- synthetic interview traces;
- adversarial cases;
- deterministic evaluators;
- expected outcomes;
- optional semantic LLM evaluation;
- JSON reports;
- Markdown reports.

Current evaluation areas include:

- consent handling;
- sensitive-question guardrails;
- hiring-decision language;
- required topic coverage;
- multi-question behavior;
- closing behavior;
- human-review expectations;
- conversational quality.

The semantic LLM judge is optional and disabled by default.

Run the evaluation suite with:

```bash
npm ci
npm run eval:test
npm run eval -- --verify-expectations
```

See:

```text
evals/README.md
```

for evaluation configuration and dataset authoring.

### Tests, Evals and Observability

These concerns are kept separate:

```text
Tests
→ software and runtime correctness

Evals
→ interview behavior and policy conformance

Observability
→ runtime operational visibility
```

Observability provides operational events and Realtime generation telemetry. More advanced dashboards and production operations remain future work.

## Continuous Integration

GitHub Actions provides automated CI through:

```text
.github/workflows/evals.yml
```

The workflow runs:

```text
monorepo build
web consent tests
web lifecycle/workflow tests
Interview Engine tests
evaluation tests
evaluation expectation verification
```

## Run Locally

### Requirements

- Docker
- Docker Compose
- OpenAI API key

Create the environment file:

```bash
cp .env.example .env
```

Set:

```env
OPENAI_API_KEY=your_key
```

For the current email implementation:

```env
EMAIL_PROVIDER=log
```

Recruiter access can be protected with:

```env
RECRUITER_AUTH_ENABLED=true
RECRUITER_ACCESS_TOKEN=your_token
```

Start the platform:

```bash
docker compose up --build
```

Available services:

```text
Candidate app     http://localhost:5173
Recruiter app     http://localhost:5173/recruiter
Session API       http://localhost:3001
Interview Engine  http://localhost:3002
```

Open the candidate application and allow microphone access when requested to start the voice interview flow.

The recruiter interface is available at:

```text
http://localhost:5173/recruiter
```

## Main Endpoints

### Sessions

```text
GET  /health
POST /sessions
GET  /sessions
GET  /sessions/:sessionId
```

### Interview Runtime

```text
POST /sessions/:sessionId/realtime-token
POST /sessions/:sessionId/consent
POST /sessions/:sessionId/turns
POST /sessions/:sessionId/summary
POST /sessions/:sessionId/candidate-email
POST /sessions/:sessionId/candidate-identity
POST /sessions/:sessionId/end
```

### Recruiter

```text
GET /recruiter/dashboard
GET /recruiter/interviews/:sessionId
```

## Reference Components

The repository also contains components that are not part of the active browser voice runtime.

### Agents SDK

```text
agents/interview-agent
```

Contains an alternative/reference Agents SDK agent definition, tools, schemas, and instructions.

The current voice interview does not execute through this agent.

### Skills

```text
skills/interview
```

Contains documented reusable interview capabilities.

### Routines

```text
routines/interview
```

Contains interview workflow documentation.

The active workflow state machine is implemented in:

```text
interfaces/web/src/interview-workflow.ts
```

### Knowledge

```text
knowledge/interview/question-bank.json
knowledge/interview/role-profiles
```

These files provide reference knowledge.

The canonical questions used by the active browser runtime are defined by the interview workflow.

### Speech Providers

```text
mcps/speech
```

Contains speech-provider boundary documentation.

The active provider implementation is OpenAI Realtime.

The current Deepgram provider:

```text
services/session-api/src/providers/deepgram.provider.ts
```

is an integration stub and is not part of the active runtime.

## Next Additions

- Advanced runtime observability and operational dashboards.
- Structured recruiter summaries.
- Recruiter data and UI improvements.
- Browser session resume and recovery.
- Real email delivery.
- Invitation flow.
- Configurable runtime question source.
- Alternative speech provider support.
