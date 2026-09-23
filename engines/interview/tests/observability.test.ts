import test from "node:test";
import assert from "node:assert/strict";
import { createObservability } from "../src/observability.js";

test("engine observability preserves correlation and non-negative durations", () => {
  const events: Array<Record<string, string | number | boolean>> = [];
  const observability = createObservability({ enabled: false, logger: (_name, fields) => events.push(fields) });
  const span = observability.startSpan("turn.persisted", {
    sessionId: "session-4",
    role: "candidate"
  });

  span.end({ durationMs: 0 });
  assert.equal(events[0].sessionId, "session-4");
  assert.equal(events[0].durationMs, 0);
});

test("engine observability does not throw when Langfuse is unavailable", () => {
  const observability = createObservability({ enabled: true, logger: () => {} });
  assert.doesNotThrow(() => {
    const span = observability.startSpan("summary.persisted", { sessionId: "session-5" });
    span.recordError({ errorCode: "database_unavailable", httpStatus: 503, safeMessage: "persistence_failed" });
    span.end({ success: false });
  });
});
