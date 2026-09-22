import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { connectRealtime, createRealtimeLifecycle, type RealtimeCloseReason, type RealtimeConnection } from "../src/realtime.js";
import { classifyConsent } from "../src/consent.js";
import { CONSENT_CLARIFICATION, resolvePendingConsent, type TranscriptHandlingResult } from "../src/consent-response.js";
import { createTerminalTransition } from "../src/terminal-session.js";
import { CONSENT_REQUEST, createInterviewWorkflow, INTERVIEW_STEPS, questionResponse } from "../src/interview-workflow.js";

function makeConnection() {
  const calls = { tracksStopped: 0, channelClosed: 0, peerClosed: 0, audioPaused: 0 };
  const states: string[] = ["listening"];
  const tracks = [{ stop: () => { calls.tracksStopped++; } }, { stop: () => { calls.tracksStopped++; } }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  const channel = {
    readyState: "open",
    onopen: () => undefined,
    onmessage: () => undefined,
    close: () => { calls.channelClosed++; channel.readyState = "closed"; }
  } as unknown as RTCDataChannel;
  const peer = {
    signalingState: "stable",
    ontrack: () => undefined,
    close: () => { calls.peerClosed++; peer.signalingState = "closed"; }
  } as unknown as RTCPeerConnection;
  const audio = {
    srcObject: stream,
    pause: () => { calls.audioPaused++; }
  } as unknown as HTMLAudioElement;
  const lifecycle = createRealtimeLifecycle(peer, audio, {
    onStatus: (status) => states.push(status),
    onSpeechState: (state) => states.push(state)
  });
  lifecycle.setStream(stream);
  lifecycle.setChannel(channel);
  return { lifecycle, calls, states, channel, peer, audio };
}

for (const reason of ["completed", "declined", "cancelled", "session_error"] as RealtimeCloseReason[]) {
  test(`active → ${reason} stops microphone and clears Realtime resources`, () => {
    const { lifecycle, calls, states, channel, peer, audio } = makeConnection();
    lifecycle.close(reason);
    assert.deepEqual(calls, { tracksStopped: 2, channelClosed: 1, peerClosed: 1, audioPaused: 1 });
    assert.equal(lifecycle.closed, true);
    assert.equal(channel.onmessage, null);
    assert.equal(channel.onopen, null);
    assert.equal(peer.ontrack, null);
    assert.equal(audio.srcObject, null);
    assert.deepEqual(states, ["listening", "idle", reason]);
  });
}

test("cleanup called twice closes each resource once", () => {
  const { lifecycle, calls, states } = makeConnection();
  lifecycle.close("completed");
  assert.doesNotThrow(() => lifecycle.close("completed"));
  assert.deepEqual(calls, { tracksStopped: 2, channelClosed: 1, peerClosed: 1, audioPaused: 1 });
  assert.deepEqual(states, ["listening", "idle", "completed"]);
  assert.equal(lifecycle.canProcess(), false);
});

test("terminal transition stops microphone and blocks events before final close", () => {
  const { lifecycle, calls, channel, peer } = makeConnection();
  lifecycle.beginTerminalTransition();
  assert.equal(calls.tracksStopped, 2);
  assert.equal(lifecycle.canProcess(), false);
  assert.equal(calls.channelClosed, 0);
  assert.equal(calls.peerClosed, 0);
  lifecycle.close("completed");
  assert.equal(calls.channelClosed, 1);
  assert.equal(calls.peerClosed, 1);
  assert.equal(channel.readyState, "closed");
  assert.equal(peer.signalingState, "closed");
});

test("microphone is stopped while the terminal request is still pending", async () => {
  const { lifecycle, calls } = makeConnection();
  let resolveRequest!: () => void;
  const request = new Promise<void>((resolve) => { resolveRequest = resolve; });
  lifecycle.beginTerminalTransition();
  assert.equal(calls.tracksStopped, 2);
  assert.equal(calls.channelClosed, 0);
  resolveRequest();
  await request;
  lifecycle.close("completed");
});

test("a late Realtime event is ignored after cleanup", () => {
  const { lifecycle, states } = makeConnection();
  lifecycle.close("declined");
  if (lifecycle.canProcess()) states.push("listening");
  assert.deepEqual(states, ["listening", "idle", "declined"]);
});

test("No le doy consentimiento follows decline through cleanup", () => {
  const { lifecycle, calls, states } = makeConnection();
  assert.equal(classifyConsent("No le doy consentimiento"), "declined");
  // The application calls this after markConsent returns the cancelled session.
  lifecycle.close("declined");
  assert.deepEqual(calls, { tracksStopped: 2, channelClosed: 1, peerClosed: 1, audioPaused: 1 });
  assert.deepEqual(states, ["listening", "idle", "declined"]);
  assert.equal(lifecycle.canProcess(), false);
});

test("a stop request uses the same cancellation cleanup", () => {
  const { lifecycle, calls, states } = makeConnection();
  assert.equal(classifyConsent("Quiero cancelar la entrevista"), "stop_requested");
  lifecycle.close("cancelled");
  assert.deepEqual(calls, { tracksStopped: 2, channelClosed: 1, peerClosed: 1, audioPaused: 1 });
  assert.deepEqual(states, ["listening", "idle", "cancelled"]);
  assert.equal(lifecycle.canProcess(), false);
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Exercises the production data-channel wiring. No browser, network or paid model calls.
async function runtime(t: TestContext, options: {
  transcript?: (text: string, connection: RealtimeConnection) => Promise<void | TranscriptHandlingResult>;
  isConsentGranted?: () => boolean;
  canFinishInterview?: () => boolean;
  finish?: (connection: RealtimeConnection) => Promise<void>;
  duringMedia?: (connection: RealtimeConnection) => Promise<void>;
} = {}) {
  const sent: { type: string; response?: { instructions?: string; tool_choice?: string } }[] = [];
  const calls = { stopped: 0, peerClosed: 0, channelClosed: 0, transcripts: 0, finishes: 0 };
  const errors: unknown[] = [];
  const states: string[] = [];
  let connection!: RealtimeConnection;
  const abort = new AbortController();
  const channel = {
    readyState: "open", onopen: null as null | (() => void),
    onmessage: null as null | ((event: MessageEvent) => void),
    send: (data: string) => sent.push(JSON.parse(data)),
    close() { calls.channelClosed++; this.readyState = "closed"; }
  };
  class Peer {
    signalingState = "stable";
    addTrack() {}
    createDataChannel() { return channel; }
    async createOffer() { return { sdp: "mock" }; }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    close() { calls.peerClosed++; this.signalingState = "closed"; }
  }
  const globals: Record<string, unknown> = {
    RTCPeerConnection: Peer,
    document: { createElement: () => ({ setAttribute() {}, pause() {}, srcObject: null }) },
    navigator: { mediaDevices: { getUserMedia: async () => {
      assert.ok(connection, "onLifecycle runs before requesting microphone");
      await options.duringMedia?.(connection);
      return { getTracks: () => [{ stop() { calls.stopped++; } }] };
    } } },
    fetch: async () => ({ ok: true, text: async () => "mock-answer" })
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  await connectRealtime("synthetic-secret", {
    isConsentGranted: options.isConsentGranted ?? (() => true),
    canFinishInterview: options.canFinishInterview ?? (() => true),
    onLifecycle: (value) => { connection = value; },
    onStatus: (value) => states.push(value),
    onSpeechState: (value) => states.push(value),
    onTranscriptError: (error) => errors.push(error),
    onTranscript: async (speaker, text) => {
      if (speaker === "candidate") {
        calls.transcripts++;
        return (await options.transcript?.(text, connection)) ?? questionResponse("experience");
      }
      return { action: "suppress" };
    },
    onFinishInterview: async () => { calls.finishes++; await options.finish?.(connection); }
  }, abort.signal);
  const lateHandler = channel.onmessage!;
  const emit = (payload: object) => lateHandler({ data: JSON.stringify(payload) } as MessageEvent);
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  const candidate = (text: string, id = "candidate-1") => emit({
    type: "conversation.item.input_audio_transcription.completed", item_id: id,
    content_index: 0, transcript: text
  });
  channel.onopen!();
  channel.onopen!();
  assert.equal(sent.length, connection.canProcess() ? 1 : 0, "greeting only for active lifecycle");
  if (connection.canProcess()) {
    assert.equal(sent[0].response?.instructions, CONSENT_REQUEST);
    assert.equal(sent[0].response?.tool_choice, "none");
  }
  emit({ type: "response.done" });
  sent.length = 0;
  t.after(() => connection.close("cancelled"));
  return { connection, calls, errors, states, sent, emit, candidate, flush, abort };
}

test("normal candidate handler is awaited; duplicate turn creates exactly one response", async (t) => {
  const pending = deferred();
  const app = await runtime(t, { transcript: async () => pending.promise });
  app.candidate("Mi experiencia es en soporte");
  app.candidate("Mi experiencia es en soporte");
  assert.equal(app.calls.transcripts, 1);
  assert.equal(app.sent.length, 0);
  pending.resolve();
  await app.flush();
  assert.deepEqual(app.sent.map((event) => event.type), ["response.create"]);
  app.candidate("Mi experiencia es en soporte");
  await app.flush();
  assert.equal(app.sent.length, 1);
});

for (const phrase of ["No quiero continuar", "No doy mi consentimiento"]) {
  test(`terminal candidate "${phrase}" stops microphone before backend confirmation, without response`, async (t) => {
    const backend = deferred();
    const app = await runtime(t, { transcript: async (text, connection) => {
      assert.ok(["stop_requested", "declined"].includes(classifyConsent(text)));
      connection.beginTerminalTransition();
      await backend.promise;
      connection.close("cancelled");
    } });
    app.candidate(phrase);
    assert.equal(app.calls.stopped, 1);
    assert.equal(app.connection.canProcess(), false);
    assert.equal(app.calls.peerClosed, 0);
    app.candidate("Todavia hablando", "late");
    app.emit({ type: "response.done" });
    assert.equal(app.states.at(-1), "idle");
    backend.resolve();
    await app.flush();
    assert.equal(app.calls.transcripts, 1);
    assert.deepEqual(app.sent.map((event) => event.type), ["output_audio_buffer.clear"]);
    assert.equal(app.calls.peerClosed, 1);
  });
}

test("finish_interview stops input synchronously and never requests a follow-up response", async (t) => {
  const backend = deferred();
  const app = await runtime(t, { finish: async (connection) => {
    assert.equal(connection.canProcess(), false);
    await backend.promise;
    connection.close("completed");
  } });
  const tool = { type: "response.output_item.done", output_index: 0, item: {
    type: "function_call", id: "fc_finish_1", call_id: "finish-1",
    name: "finish_interview", arguments: "{}", status: "completed"
  } };
  app.emit(tool);
  assert.equal(app.calls.stopped, 1);
  app.emit(tool);
  app.candidate("Otra respuesta");
  backend.resolve();
  await app.flush();
  assert.equal(app.calls.finishes, 1);
  assert.equal(app.calls.transcripts, 0);
  assert.deepEqual(app.sent.map((event) => event.type), ["output_audio_buffer.clear"]);
  assert.equal(app.calls.peerClosed, 1);
  assert.equal(app.calls.channelClosed, 1);
  app.emit(tool);
  await app.flush();
  assert.equal(app.calls.finishes, 1);
  assert.equal(app.calls.peerClosed, 1);
});

test("terminal transition during pending transcript prevents response after resolution", async (t) => {
  const pending = deferred();
  const app = await runtime(t, { transcript: async () => pending.promise });
  app.candidate("Una respuesta normal");
  app.connection.beginTerminalTransition();
  pending.resolve();
  await app.flush();
  assert.deepEqual(app.sent.map((event) => event.type), ["output_audio_buffer.clear"]);
  assert.equal(app.calls.stopped, 1);
});

test("failed transcript handling closes resources and never requests another response", async (t) => {
  const pending = deferred();
  const app = await runtime(t, { transcript: async () => pending.promise });
  app.candidate("Una respuesta normal");
  pending.reject(new Error("409 invalid_session_state"));
  await app.flush();
  assert.equal(app.errors.length, 1);
  assert.equal(app.calls.stopped, 1);
  assert.equal(app.calls.peerClosed, 1);
  app.candidate("Evento tardio", "late");
  assert.equal(app.calls.transcripts, 1);
  assert.equal(app.sent.length, 0);
});

test("overlapping validated turns wait for response.done and each advance once", async (t) => {
  const app = await runtime(t);
  app.candidate("Primera respuesta");
  await app.flush();
  app.candidate("Segunda respuesta", "candidate-2");
  await app.flush();
  assert.equal(app.sent.length, 1);
  app.emit({ type: "response.done" });
  assert.equal(app.sent.length, 2);
  app.emit({ type: "response.done" });
  assert.equal(app.sent.length, 2);
});

test("active response is cancelled and buffered audio cleared exactly once on terminal transition", async (t) => {
  const app = await runtime(t);
  app.candidate("Experiencia profesional");
  await app.flush();
  app.emit({ type: "response.created", response: { id: "resp_1", status: "in_progress" } });
  app.sent.length = 0;
  app.connection.beginTerminalTransition();
  assert.equal(app.calls.stopped, 1);
  assert.deepEqual(app.sent.map((event) => event.type), ["response.cancel", "output_audio_buffer.clear"]);
  app.connection.beginTerminalTransition();
  app.emit({ type: "response.done", response: { id: "resp_1", status: "cancelled", output: [] } });
  app.candidate("Evento tardio", "late");
  await app.flush();
  assert.equal(app.sent.length, 2);
  assert.equal(app.calls.transcripts, 1);
});

test("completed close followed by setup abort preserves completed reason", async (t) => {
  const app = await runtime(t);
  app.connection.close("completed");
  app.abort.abort();
  app.connection.close("session_error");
  assert.equal(app.states.at(-1), "completed");
  assert.equal(app.states.includes("session_error"), false);
  assert.equal(app.calls.peerClosed, 1);
  assert.equal(app.calls.channelClosed, 1);
});

test("terminal transition during microphone acquisition stops newly returned tracks", async (t) => {
  const app = await runtime(t, { duringMedia: async (connection) => {
    connection.beginTerminalTransition();
    await Promise.resolve();
  } });
  assert.equal(app.calls.stopped, 1);
  assert.equal(app.connection.canProcess(), false);
  assert.equal(app.sent.length, 0);
});

test("ambiguous consent produces only clarification and leaves backend pending", async (t) => {
  let writes = 0;
  let state = "pending";
  const app = await runtime(t, {
    isConsentGranted: () => state === "granted",
    transcript: (text) => resolvePendingConsent(classifyConsent(text), {
      markConsent: async () => { writes++; return { status: "in_progress", consent_status: "granted" }; },
      beginDecline: () => assert.fail("not a refusal"),
      onConfirmed: (session) => { state = session.consent_status; }
    })
  });
  app.candidate("Tal vez");
  await app.flush();
  assert.equal(state, "pending");
  assert.equal(writes, 0, "no consent update or interview turn persisted");
  assert.deepEqual(app.sent, [{
    type: "response.create",
    response: { output_modalities: ["audio"], instructions: CONSENT_CLARIFICATION, tool_choice: "none" }
  }]);
});

test("grant waits for backend confirmation before normal response; subsequent answer waits for persistence", async (t) => {
  let consent = "pending";
  let writes = 0;
  let persisted = false;
  const confirmation = deferred();
  const persistence = deferred();
  const app = await runtime(t, {
    isConsentGranted: () => consent === "granted",
    transcript: async (text) => {
      if (consent === "pending") return resolvePendingConsent(classifyConsent(text), {
        markConsent: async (decision) => {
          assert.equal(decision, "granted");
          writes++;
          await confirmation.promise;
          return { status: "in_progress", consent_status: "granted" };
        },
        beginDecline: () => assert.fail("not a refusal"),
        onConfirmed: (session) => { consent = session.consent_status; }
      });
      await persistence.promise;
      persisted = true;
      return questionResponse("experience");
    }
  });
  app.candidate("Sí, acepto");
  assert.equal(writes, 1);
  assert.equal(consent, "pending");
  assert.equal(app.sent.length, 0);
  confirmation.resolve();
  await app.flush();
  assert.equal(consent, "granted");
  assert.deepEqual(app.sent.map((event) => event.type), ["response.create"]);
  assert.equal(app.sent[0].response?.instructions, questionResponse("name").instructions);
  app.emit({ type: "response.done" });
  app.sent.length = 0;
  app.candidate("Trabajo con TypeScript", "answer-2");
  assert.equal(persisted, false);
  assert.equal(app.sent.length, 0);
  persistence.resolve();
  await app.flush();
  assert.equal(persisted, true);
  assert.deepEqual(app.sent.map((event) => event.type), ["response.create"]);
});

test("backend returning pending cannot be treated as granted", async (t) => {
  let confirmed = false;
  const app = await runtime(t, {
    isConsentGranted: () => confirmed,
    transcript: (text) => resolvePendingConsent(classifyConsent(text), {
      markConsent: async () => ({ status: "consent_pending", consent_status: "pending" }),
      beginDecline: () => assert.fail("not a refusal"),
      onConfirmed: () => { confirmed = true; }
    })
  });
  app.candidate("Acepto");
  await app.flush();
  assert.equal(confirmed, false);
  assert.equal(app.sent.length, 0);
  assert.match(String(app.errors[0]), /consent_confirmation_mismatch/);
});

test("normal response result is rejected defensively when application consent is pending", async (t) => {
  const app = await runtime(t, { isConsentGranted: () => false });
  app.candidate("Experiencia");
  await app.flush();
  assert.equal(app.sent.length, 0);
  assert.match(String(app.errors[0]), /consent_required/);
});

test("pending consent blocks terminal tool before completion callback", async (t) => {
  const app = await runtime(t, { isConsentGranted: () => false });
  app.emit({ type: "response.output_item.done", output_index: 0, item: {
    type: "function_call", status: "completed", name: "finish_interview",
    call_id: "finish-pending", arguments: "{}"
  } });
  await app.flush();
  assert.equal(app.calls.finishes, 0, "no summary or completion attempted");
  assert.equal(app.calls.stopped, 2);
  assert.match(String(app.errors[0]), /consent_required/);
  assert.equal(app.sent.some((event) => event.type === "response.create"), false);
});

test("declined pending consent cancels before returning suppress", async (t) => {
  let backendStatus = "consent_pending";
  const app = await runtime(t, {
    isConsentGranted: () => false,
    transcript: (text, connection) => resolvePendingConsent(classifyConsent(text), {
      beginDecline: () => connection.beginTerminalTransition(),
      markConsent: async (decision) => {
        assert.equal(decision, "declined");
        assert.equal(connection.canProcess(), false);
        backendStatus = "cancelled";
        return { status: backendStatus, consent_status: "declined" };
      },
      onConfirmed: () => connection.close("declined")
    })
  });
  app.candidate("No acepto");
  await app.flush();
  assert.equal(backendStatus, "cancelled");
  assert.ok(app.calls.stopped > 0);
  assert.equal(app.sent.some((event) => event.type === "response.create"), false);
});

for (const granted of [false, true]) {
  test(`natural withdrawal cancels with consent ${granted ? "granted" : "pending"}`, async (t) => {
    const backend = deferred();
    const requests: string[] = [];
    const app = await runtime(t, {
      isConsentGranted: () => granted,
      transcript: async (text, connection) => {
        const intent = classifyConsent(text);
        assert.equal(intent, "stop_requested");
        if (!granted) return resolvePendingConsent(intent, {
          beginDecline: () => connection.beginTerminalTransition(),
          markConsent: async (decision) => {
            requests.push(`consent:${decision}`);
            await backend.promise;
            return { status: "cancelled", consent_status: "declined" };
          },
          onConfirmed: () => connection.close("cancelled")
        });
        connection.beginTerminalTransition();
        const terminal = createTerminalTransition({
          endSession: async (_id, status) => {
            requests.push(`end:${status}`);
            await backend.promise;
            return { status: "cancelled" };
          },
          onConfirmed: () => connection.close("cancelled")
        });
        await terminal.request("synthetic-session", "cancelled");
        return { action: "suppress" };
      }
    });
    app.candidate("Ya no quiero seguir con la entrevista");
    assert.equal(app.calls.stopped, 1, "microphone stops before backend confirmation");
    assert.equal(app.connection.canProcess(), false);
    assert.deepEqual(requests, [granted ? "end:cancelled" : "consent:declined"]);
    backend.resolve();
    await app.flush();
    assert.equal(app.sent.some((event) => event.type === "response.create"), false);
    assert.equal(app.calls.peerClosed, 1);
    assert.equal(app.calls.channelClosed, 1);
  });
}

test("declining to share email keeps an interview with granted consent active", async (t) => {
  const turns: string[] = [];
  const app = await runtime(t, {
    transcript: async (text) => {
      assert.equal(classifyConsent(text), "pending");
      turns.push(text);
      return questionResponse("target_role");
    }
  });
  app.candidate("No quiero compartir mi correo");
  await app.flush();
  assert.deepEqual(turns, ["No quiero compartir mi correo"]);
  assert.equal(app.connection.canProcess(), true);
  assert.equal(app.calls.stopped, 0);
  assert.deepEqual(app.sent.map((event) => event.type), ["response.create"]);
});

test("pending-consent browser regression stays at consent and cannot complete", async (t) => {
  const workflow = createInterviewWorkflow();
  const app = await runtime(t, {
    isConsentGranted: () => false,
    canFinishInterview: () => workflow.canFinish(),
    transcript: (text) => resolvePendingConsent(classifyConsent(text), {
      markConsent: async () => assert.fail("ambiguous input must not grant consent"),
      beginDecline: () => assert.fail("not a withdrawal"),
      onConfirmed: () => assert.fail("no confirmation")
    })
  });
  for (const [i, text] of ["Tal vez", "Soy Ana", "Tengo experiencia", "Hasta luego"].entries()) {
    app.candidate(text, `pending-${i}`);
    await app.flush();
    assert.equal(workflow.step, "consent");
    assert.equal(app.sent.at(-1)?.response?.instructions, CONSENT_CLARIFICATION);
    assert.equal(app.sent.at(-1)?.response?.tool_choice, "none");
    app.emit({ type: "response.done" });
  }
  app.emit({ type: "response.output_item.done", item: {
    type: "function_call", name: "finish_interview", call_id: "premature",
    arguments: "{}", status: "completed"
  } });
  await app.flush();
  assert.equal(app.calls.finishes, 0);
  assert.equal(workflow.step, "consent");
});

test("full workflow requests ordered topics then completes directly without a model closing", async (t) => {
  const workflow = createInterviewWorkflow();
  let granted = false;
  let completed = 0;
  const recorded: string[] = [];
  const app = await runtime(t, {
    isConsentGranted: () => granted,
    canFinishInterview: () => workflow.canFinish(),
    transcript: async (text, connection) => {
      if (!granted) return resolvePendingConsent(classifyConsent(text), {
        markConsent: async () => ({ consent_status: "granted", status: "in_progress" }),
        beginDecline: () => connection.beginTerminalTransition(),
        onConfirmed: (session) => { workflow.confirmConsent(session); granted = true; }
      });
      const next = await workflow.recordAnswer(async () => { recorded.push(text); }, () => connection.canProcess());
      if (next === "complete") {
        connection.beginTerminalTransition();
        assert.equal(connection.canProcess(), false);
        const terminal = createTerminalTransition({
          endSession: async (_id, status) => { completed++; return { status }; },
          onConfirmed: () => connection.close("completed")
        });
        await terminal.request("synthetic-session", "completed");
        return { action: "suppress" };
      }
      assert.notEqual(next, "consent");
      return questionResponse(next as Exclude<typeof next, "consent" | "complete">);
    }
  });
  app.candidate("Sí, acepto", "grant");
  await app.flush();
  assert.equal(workflow.step, "name");
  for (const step of INTERVIEW_STEPS.slice(1, -1)) {
    assert.equal(workflow.step, step);
    assert.equal(app.sent.at(-1)?.response?.instructions, questionResponse(step as Parameters<typeof questionResponse>[0]).instructions);
    assert.equal(app.sent.at(-1)?.response?.tool_choice, "none");
    app.emit({ type: "response.done" });
    app.emit({ type: "response.output_audio_transcript.done", transcript: "Voy a cerrar la entrevista" });
    await app.flush();
    assert.equal(workflow.step, step, "agent words do not advance the workflow");
    const responsesBeforeAnswer = app.sent.filter((event) => event.type === "response.create").length;
    app.candidate(step === "email_optional" ? "No quiero compartir mi correo" : "Respuesta profesional", `answer-${step}`);
    await app.flush();
    assert.equal(app.sent.filter((event) => event.type === "response.create").length,
      responsesBeforeAnswer + (step === "company_reason" ? 0 : 1));
  }
  assert.equal(workflow.step, "complete");
  assert.equal(recorded.length, 9);
  assert.equal(completed, 1);
  assert.equal(app.calls.finishes, 0, "completion does not rely on model tool selection");
  assert.equal(app.sent.filter((event) => event.type === "response.create").length, 9);
  assert.equal(app.states.at(-1), "completed");
  assert.ok(app.calls.stopped > 0);
  assert.equal(app.calls.peerClosed, 1);
});

for (const step of INTERVIEW_STEPS.slice(0, -1)) {
  test(`withdrawal preempts workflow at ${step}`, async (t) => {
    const workflow = createInterviewWorkflow();
    if (step !== "consent") {
      workflow.confirmConsent({ consent_status: "granted", status: "in_progress" });
      while (workflow.step !== step) await workflow.recordAnswer(async () => {}, () => true);
    }
    let cancelled = 0;
    const app = await runtime(t, {
      isConsentGranted: () => step !== "consent",
      canFinishInterview: () => workflow.canFinish(),
      transcript: async (text, connection) => {
        assert.equal(classifyConsent(text), "stop_requested");
        connection.beginTerminalTransition();
        cancelled++;
        connection.close("cancelled");
        return { action: "suppress" };
      }
    });
    app.candidate("Ya no quiero seguir con la entrevista");
    await app.flush();
    assert.equal(workflow.step, step);
    assert.equal(cancelled, 1);
    assert.equal(app.sent.some((event) => event.type === "response.create"), false);
    assert.ok(app.calls.stopped > 0);
  });
}
