import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIRealtimeProvider } from "../src/providers/openai-realtime.provider.js";
import { sanitizeRealtimeToken } from "../src/routes/sessions.js";

const originalFetch = globalThis.fetch;
const originalModel = process.env.OPENAI_REALTIME_MODEL;
const originalApiKey = process.env.OPENAI_API_KEY;

function mockOpenAIResponse() {
  return {
    ok: true,
    json: async () => ({ client_secret: { value: "ephemeral", expires_at: 123 } }),
    text: async () => ""
  } as Response;
}

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalModel === undefined) delete process.env.OPENAI_REALTIME_MODEL;
  else process.env.OPENAI_REALTIME_MODEL = originalModel;
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
});

test("configured OPENAI_REALTIME_MODEL is used for session.model and returned", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_REALTIME_MODEL = "gpt-realtime-test";
  let request: any;
  globalThis.fetch = async (_input, init) => {
    request = JSON.parse(String(init?.body));
    return mockOpenAIResponse();
  };

  const result = await new OpenAIRealtimeProvider().createRealtimeSession({ sessionId: "s-1", instructions: "policy" });
  assert.equal(request.session.model, "gpt-realtime-test");
  assert.equal(result.model, "gpt-realtime-test");
});

test("default realtime model is used when OPENAI_REALTIME_MODEL is absent", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_REALTIME_MODEL;
  let request: any;
  globalThis.fetch = async (_input, init) => {
    request = JSON.parse(String(init?.body));
    return mockOpenAIResponse();
  };

  const result = await new OpenAIRealtimeProvider().createRealtimeSession({ sessionId: "s-2", instructions: "policy" });
  assert.equal(request.session.model, "gpt-realtime");
  assert.equal(result.model, "gpt-realtime");
});

test("public realtime token is sanitized and does not expose raw provider data", () => {
  const publicToken = sanitizeRealtimeToken({
    provider: "openai",
    sessionId: "s-3",
    model: "gpt-realtime",
    clientSecret: "ephemeral",
    expiresAt: 123,
    raw: { client_secret: "secret", prompt: "candidate content" }
  } as never);
  assert.deepEqual(publicToken, {
    provider: "openai",
    sessionId: "s-3",
    model: "gpt-realtime",
    clientSecret: "ephemeral",
    expiresAt: 123
  });
  assert.equal("raw" in publicToken, false);
});
