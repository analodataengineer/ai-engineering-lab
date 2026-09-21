# AI Recruitment Screening Platform

Portable MVP of a voice-based conversational agent for initial candidate interviews, with a recruiter-facing platform for reviewing interview results and candidate information.

The project separates the web interface, session API, deterministic interview engine, agent definition, skills, routines, knowledge base, and storage. The agent does not approve, reject, or score candidates. It conducts a short interview and produces neutral information for human review.

## Architecture

Evaluaciones locales: `evals/` contiene casos sintéticos, comprobaciones determinísticas, un juez semántico opcional y reportes JSON/Markdown. Ver [guía de evaluaciones](evals/README.md). El baseline se reproduce con `npm run eval:test` y `npm run eval -- --verify-expectations` después de `npm ci`.

- `interfaces/web`: web experience for candidates and recruiters.
- `services/session-api`: sessions, ephemeral voice tokens, provider coordination, and recruiter access.
- `engines/interview`: deterministic state, consent, turns, events, and summaries.
- `agents/interview-agent`: agent definition, tools, schemas, and guardrails.
- `skills/interview`: documented reusable capabilities.
- `routines/interview`: `default-interview` workflow.
- `knowledge/interview`: questions, general role profile, and policy.
- `storage/migrations`: initial PostgreSQL schema.
- `mcps/speech`: boundaries for OpenAI and Deepgram.

## Requirements

- Docker and Docker Compose.
- `OPENAI_API_KEY` for voice with OpenAI Realtime.
- `RECRUITER_AUTH_ENABLED=false` for local development without recruiter authentication.
- `RECRUITER_ACCESS_TOKEN` to protect the recruiter screen when `RECRUITER_AUTH_ENABLED=true`.
- `EMAIL_PROVIDER=log` to simulate thank-you emails without an external email provider.

## Run Locally

1. Create a `.env` file from `.env.example`.
2. Set `OPENAI_API_KEY`.
3. Keep `RECRUITER_AUTH_ENABLED=false` for local development, or set `RECRUITER_AUTH_ENABLED=true` and define a `RECRUITER_ACCESS_TOKEN`.
4. Keep `EMAIL_PROVIDER=log` for local development.
5. Run:

```bash
docker compose up --build
```

Services:

- Candidate app: `http://localhost:5173`
- Recruiter app: `http://localhost:5173/recruiter`
- Session API: `http://localhost:3001`
- Interview Engine: `http://localhost:3002`

## Candidate Flow

1. The candidate opens `http://localhost:5173`.
2. The interview attempts to start automatically.
3. The browser requests microphone permission.
4. The agent greets the candidate, explains that the conversation should take no more than 5 minutes, and asks for consent.
5. The agent asks for the candidate’s first and last name.
6. The agent may ask for an optional email address to send a confirmation.
7. The agent asks about the position or area of interest and continues the job-related flow.
8. After the final question, the agent closes the conversation.
9. The session is stored for recruiter review.

The candidate screen does not display the transcript or summary.

## Recruiter Flow

1. Open `http://localhost:5173/recruiter`.
2. Enter the value of `RECRUITER_ACCESS_TOKEN`.
3. Review KPIs, funnel information, recent interviews, and email automation.
4. Open `View details` on an interview to see identity, email, role, summary, transcript, and email events.

If `RECRUITER_AUTH_ENABLED=false`, recruiter endpoints do not require a token for local development.

If `RECRUITER_AUTH_ENABLED=true`, recruiter endpoints require:

```http
Authorization: Bearer <RECRUITER_ACCESS_TOKEN>
```

The `GET /recruiter/dashboard` endpoint uses the same token and returns the dashboard aggregates.

The `GET /recruiter/interviews/:sessionId` endpoint returns the real interview details.

## Automated Email

When a session moves to `completed`, the engine attempts to send a thank-you email if `candidate_email` exists.

For local development:

```env
EMAIL_PROVIDER=log
```

The `log` provider does not send real emails. It logs the recipient, subject, and idempotency key in the `interview-engine` logs.

Idempotency uses:

```text
session_id + thank_you_email
```

If the candidate email is missing, an internal event is recorded and the interview closing flow is not blocked.

## Main Endpoints

- `GET /health`
- `POST /sessions`
- `GET /sessions` with recruiter token
- `POST /sessions/:sessionId/realtime-token`
- `POST /sessions/:sessionId/end`
- `GET /sessions/:sessionId`
- `POST /sessions/:sessionId/consent`
- `POST /sessions/:sessionId/turns`
- `POST /sessions/:sessionId/summary`
- `POST /sessions/:sessionId/candidate-email`
- `POST /sessions/:sessionId/candidate-identity`
- `GET /recruiter/dashboard`
- `GET /recruiter/interviews/:sessionId`

## Invitation-Ready Model

`interview_sessions` includes an `interview_token` with a partial unique index. This prepares the data model for future links such as:

```text
/interview/:token
```

The complete email invitation flow is outside the scope of the current MVP.

## Extension Points

- Change questions in `knowledge/interview/question-bank.json`.
- Adjust policies in `knowledge/interview/policy.md`.
- Modify the flow in `routines/interview/default-interview.routine.md`.
- Implement Deepgram by completing `services/session-api/src/providers/deepgram.provider.ts`.
- Add formal recruiter authentication before using the platform in production.
- Implement SMTP or Resend as a real email provider.
- Implement real invitations using `interview_token`.
- Add manual status changes by recruiters.
