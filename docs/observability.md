# Runtime observability

## Purpose

The runtime emits a small set of operational events and duration spans for an interview. Observability is optional and must not affect consent, persistence, cancellation, completion, or voice behavior.

## Architecture

The browser sends allowlisted telemetry to the Session API:

```text
Browser → POST /sessions/:sessionId/telemetry → Session API → Langfuse
                                      └────── Interview Engine → Langfuse
```

Both server processes initialize OpenTelemetry before application startup. When enabled, `LangfuseSpanProcessor` exports observations created with the v5 `@langfuse/tracing` API. When disabled or unavailable, the adapter writes compact JSON events to the service log.

## Configuration

Set these server-side variables in `.env` or the deployment environment:

```env
LANGFUSE_ENABLED=false
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Set `LANGFUSE_ENABLED=true` and provide both keys to export observations. Never expose `LANGFUSE_SECRET_KEY` to the browser. The default is disabled and does not require a Langfuse account.

## Correlation

The existing `sessionId` is the business correlation key. It is propagated as the Langfuse `sessionId` attribute so separate HTTP operations can be grouped without creating one long-lived trace for the whole interview.

## Event and span taxonomy

The Session API records session creation, Realtime token creation, browser telemetry receipt, engine request timing, and safe request failures. The Interview Engine records consent persistence, turn and summary persistence, terminal completion/cancellation, and rejected state operations.

The browser telemetry endpoint accepts only these event names:

```text
realtime.connected
consent.requested
consent.classified
consent.granted
consent.declined
workflow.step.started
workflow.step.completed
response.requested
response.completed
withdrawal.detected
terminal.begin
microphone.stopped
realtime.closed
```

Duration spans cover consent resolution, workflow steps, Realtime responses, engine requests, and terminal transitions where the current runtime has a clear start and end. The implementation does not create a span for every Realtime protocol message.

## AI FinOps / Usage and Cost Tracking

The browser reads the authoritative `response.done` event from OpenAI Realtime. It forwards only the response ID, model/status, duration, and validated numeric usage fields to the Session API; response output, transcript text, prompts, and audio are never forwarded.

Each response with usage is represented server-side as a Langfuse `generation` named `realtime.generation`. `usageDetails` contains only mutually exclusive buckets. With a consistent `cached_tokens_details` breakdown, it emits `input_text_uncached`, `input_audio_uncached`, `input_text_cached`, `input_audio_cached`, `output_text`, and `output_audio`; it does not also emit `input`, `input_cached`, `output`, or `total`. Langfuse derives prompt, completion, and total usage from those buckets. The original provider aggregates are retained as operational metadata and are not priced. If cached tokens are reported without a text/audio cache breakdown, the generation degrades to exclusive aggregate buckets (`input` as uncached input, `input_cached` as cached input, and either output modality buckets or `output`). The application never estimates the cache distribution.

Realtime response start and completion use absolute `Date.now()` timestamps for the generation `startTime` and `end()` time. `performance.now()` remains monotonic-only and is retained as diagnostic `durationMs` metadata.

Langfuse can infer cost when the response model has a matching model/pricing definition in the project. If the model is not recognized, configure that model in Langfuse; pricing is intentionally not hardcoded in the application.

Each response remains an independent generation. The shared `sessionId` lets Langfuse aggregate response generations into one interview session. Safe metadata also exposes aggregate input/output/total tokens, cached and uncached input, text/audio breakdowns, and `cacheHitRatio` when `inputTokens > 0`. Monetary cost is inferred by Langfuse only when a matching model definition supplies prices; token usage remains available when pricing is not configured.

Sanitized generation shape:

```yaml
name: realtime.generation
sessionId: session-example
responseId: resp-example
model: gpt-realtime
durationMs: 1650
usageDetails:
  input_text_uncached: 210
  input_text_cached: 120
  input_audio_uncached: 40
  input_audio_cached: 10
  output_text: 75
  output_audio: 0
metadata:
  aggregateInputTokens: 380
  aggregateCachedInputTokens: 130
  aggregateOutputTokens: 75
  aggregateTotalTokens: 455
  cacheHitRatio: 0.3421
```

No transcript, prompt, response content, audio, candidate data, credentials, or raw provider payload is included. Invalid, incomplete, or inconsistent usage is ignored by the observability layer and cannot block the interview.

## Privacy rules

Telemetry contains operational metadata only: session ID, component, step, status, classification, provider/model identifiers, HTTP status, normalized error codes, success, and non-negative durations.

The allowlist rejects arbitrary metadata and browser event bodies. It does not accept transcript text, candidate name, email, raw answers, audio content, prompts, authorization headers, recruiter tokens, API keys, or Realtime client secrets. Persisted turns are instrumented by role and status only; their text is never sent to Langfuse.

## Browser telemetry path

`interfaces/web/src/api.ts` sends safe events to `POST /sessions/:sessionId/telemetry`. The Session API validates the session and event schema before forwarding the event to the server-side observability adapter. Telemetry errors are swallowed and logged so the interview can continue.

## Structured-log fallback

With Langfuse disabled, point-in-time events and completed spans are emitted as compact JSON logs, for example:

```json
{"event":"workflow.step.completed","sessionId":"abc-123","step":"experience","durationMs":12450}
```

Fallback logs use the same allowlist and do not serialize request or response bodies.

## Viewing a session in Langfuse

1. Create or select a Langfuse project and obtain its public and secret keys.
2. Set `LANGFUSE_ENABLED=true`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and optionally `LANGFUSE_BASE_URL`.
3. Start the services with `docker compose up --build`.
4. Complete a local interview or exercise a session endpoint.
5. Open the Langfuse project and filter observations by the interview `sessionId`.

The browser never receives the secret key. If export is unavailable, inspect the Session API and Interview Engine JSON logs instead.

The focused checks are:

```bash
npm run test:observability -w services/session-api
npm run test:observability -w engines/interview
```
