import test from "node:test";
import assert from "node:assert/strict";
import { buildRealtimeUsageDetails, createObservability } from "../src/observability.js";
import { telemetryEventSchema } from "../src/routes/sessions.js";

test("observability is safe when Langfuse is disabled", () => {
  const events: Array<Record<string, string | number | boolean>> = [];
  const observability = createObservability({ enabled: false, logger: (_name, fields) => events.push(fields) });

  assert.doesNotThrow(() => {
    observability.event("workflow.step.completed", {
      sessionId: "session-1",
      step: "experience",
      durationMs: 120,
      success: true
    });
  });
  assert.deepEqual(events[0], {
    sessionId: "session-1",
    step: "experience",
    durationMs: 120,
    success: true
  });
});

test("observability allowlist drops candidate and secret fields", () => {
  const events: Array<Record<string, string | number | boolean>> = [];
  const observability = createObservability({ enabled: false, logger: (_name, fields) => events.push(fields) });

  observability.event("session.created", {
    sessionId: "session-2",
    state: "consent_pending",
    candidateName: "Ada Lovelace",
    candidateEmail: "ada@example.com",
    transcript: "raw answer",
    authorization: "Bearer secret",
    clientSecret: "ephemeral-secret",
    durationMs: -4
  } as never);

  assert.deepEqual(events[0], { sessionId: "session-2", state: "consent_pending" });
});

test("browser telemetry schema accepts only allowlisted operational fields", () => {
  const sanitized = telemetryEventSchema.parse({
    name: "consent.classified",
    classification: "ambiguous",
    durationMs: 20,
    model: "gpt-realtime"
  });
  assert.equal(sanitized.model, "gpt-realtime");
  assert.throws(() => telemetryEventSchema.parse({ name: "unknown.event" }));
  assert.throws(() => telemetryEventSchema.parse({ name: "consent.classified", transcript: "no acepto" }));
  assert.throws(() => telemetryEventSchema.parse({ name: "consent.classified", candidateEmail: "candidate@example.com" }));
});

test("observability failures do not escape business code", () => {
  const observability = createObservability({ enabled: true, logger: () => {} });
  assert.doesNotThrow(() => observability.event("session.created", { sessionId: "session-3" }));
  assert.doesNotThrow(() => observability.generation("realtime.generation", {
    sessionId: "session-3",
    inputUncachedTokens: 1,
    inputCachedTokens: 0,
    outputTokens: 1,
    totalTokens: 2
  }));
});

test("generation usage is normalized without propagating content", () => {
  const events: Array<Record<string, string | number | boolean>> = [];
  const observability = createObservability({ enabled: false, logger: (_name, fields) => events.push(fields) });

  observability.generation("realtime.generation", {
    sessionId: "session-4",
    responseId: "resp-1",
    model: "gpt-realtime",
    responseStatus: "completed",
    durationMs: 850,
    responseStartedAtMs: 1_700_000_000_000,
    responseCompletedAtMs: 1_700_000_000_850,
    inputUncachedTokens: 70,
    inputCachedTokens: 30,
    outputTokens: 25,
    totalTokens: 125,
    inputTextTokens: 90,
    inputAudioTokens: 10,
    outputTextTokens: 20,
    outputAudioTokens: 5,
    transcript: "must never be accepted"
  } as never);

  assert.deepEqual(events[0], {
    sessionId: "session-4",
    responseId: "resp-1",
    model: "gpt-realtime",
    responseStatus: "completed",
    durationMs: 850,
    inputTextTokens: 90,
    inputAudioTokens: 10,
    outputTextTokens: 20,
    outputAudioTokens: 5,
    inputUncachedTokens: 70,
    inputCachedTokens: 30,
    outputTokens: 25,
    totalTokens: 125,
    aggregateOutputTokens: 25,
    aggregateTotalTokens: 125
  });
  assert.equal(JSON.stringify(events[0]).includes("must never"), false);
});

test("generation usage preserves aggregates and emits exclusive multimodal pricing buckets", () => {
  const usage = buildRealtimeUsageDetails({
    sessionId: "session-usage",
    inputTokens: 308,
    inputUncachedTokens: 254,
    inputCachedTokens: 54,
    inputTextUncachedTokens: 120,
    inputAudioUncachedTokens: 134,
    inputTextCachedTokens: 31,
    inputAudioCachedTokens: 23,
    outputTokens: 187,
    outputTextTokens: 43,
    outputAudioTokens: 144,
    totalTokens: 495
  });
  assert.deepEqual(usage, {
    input_text_uncached: 120,
    input_audio_uncached: 134,
    input_text_cached: 31,
    input_audio_cached: 23,
    output_text: 43,
    output_audio: 144
  });
});

test("aggregate cache without modality details does not create unverifiable input pricing buckets", () => {
  const usage = buildRealtimeUsageDetails({
    sessionId: "session-cache",
    inputTokens: 100,
    inputUncachedTokens: 70,
    inputCachedTokens: 30,
    outputTokens: 25,
    totalTokens: 125,
    outputTextTokens: 20,
    outputAudioTokens: 5
  });
  assert.deepEqual(usage, {
    input: 70,
    input_cached: 30,
    output_text: 20,
    output_audio: 5
  });
  assert.equal(Object.keys(usage!).some((key) => key.startsWith("input_text_") || key.startsWith("input_audio_")), false);
});

test("runtime 102/64/275/377 usage has no aggregate/component overlap", () => {
  const usage = buildRealtimeUsageDetails({
    sessionId: "session-regression",
    inputTokens: 102,
    inputUncachedTokens: 38,
    inputCachedTokens: 64,
    inputTextTokens: 102,
    inputAudioTokens: 0,
    inputTextCachedTokens: 64,
    inputAudioCachedTokens: 0,
    inputTextUncachedTokens: 38,
    inputAudioUncachedTokens: 0,
    outputTokens: 275,
    outputTextTokens: 49,
    outputAudioTokens: 226,
    totalTokens: 377
  });
  assert.deepEqual(usage, {
    input_text_cached: 64,
    input_text_uncached: 38,
    input_audio_cached: 0,
    input_audio_uncached: 0,
    output_text: 49,
    output_audio: 226
  });
  assert.equal(Object.hasOwn(usage!, "input"), false);
  assert.equal(Object.hasOwn(usage!, "input_cached"), false);
  assert.equal(Object.hasOwn(usage!, "output"), false);
  assert.equal(Object.hasOwn(usage!, "total"), false);
});

test("generation rejects invalid absolute timestamps without affecting business code", () => {
  const events: Array<Record<string, string | number | boolean>> = [];
  const observability = createObservability({ enabled: false, logger: (_name, fields) => events.push(fields) });
  observability.generation("realtime.generation", {
    sessionId: "session-invalid-time",
    inputUncachedTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
    responseStartedAtMs: 2_000,
    responseCompletedAtMs: 1_999
  });
  assert.equal(events.length, 0);
});

test("browser usage fields reject negative values and accept numeric usage", () => {
  assert.doesNotThrow(() => telemetryEventSchema.parse({
    name: "response.completed",
    responseId: "resp-1",
    model: "gpt-realtime",
    inputTokens: 100,
    inputCachedTokens: 30,
    inputUncachedTokens: 70,
    outputTokens: 25,
    totalTokens: 125
  }));
  assert.throws(() => telemetryEventSchema.parse({
    name: "response.completed",
    inputTokens: -1
  }));
  assert.doesNotThrow(() => telemetryEventSchema.parse({
    name: "response.completed",
    inputTokens: 10,
    inputCachedTokens: 0,
    inputUncachedTokens: 10,
    inputTextTokens: 8,
    inputAudioTokens: 1,
    outputTokens: 2,
    totalTokens: 13
  }));
  assert.throws(() => telemetryEventSchema.parse({
    name: "response.completed",
    inputTokens: "100"
  }));
  assert.throws(() => telemetryEventSchema.parse({
    name: "response.completed",
    inputTokens: 100,
    inputCachedTokens: 40,
    inputUncachedTokens: 50
  }));
  const timestamps = telemetryEventSchema.parse({
    name: "response.completed",
    responseStartedAtMs: 1_700_000_000_000,
    responseCompletedAtMs: 1_700_000_002_238,
    durationMs: 2238.8
  });
  assert.equal(timestamps.responseCompletedAtMs! >= timestamps.responseStartedAtMs!, true);
  assert.throws(() => telemetryEventSchema.parse({
    name: "response.completed",
    responseStartedAtMs: 1_700_000_002_238,
    responseCompletedAtMs: 1_700_000_002_237
  }));
});
