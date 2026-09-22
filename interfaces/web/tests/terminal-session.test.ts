import assert from "node:assert/strict";
import { test } from "node:test";
import { createTerminalTransition } from "../src/terminal-session.js";

test("finish_interview completion is server-confirmed and deduplicated", async () => {
  let calls = 0;
  let confirmed = 0;
  const transition = createTerminalTransition({
    endSession: async (_sessionId, status) => {
      calls++;
      return { status };
    },
    onConfirmed: (_session, status) => {
      assert.equal(status, "completed");
      confirmed++;
    }
  });
  const [first, second] = await Promise.all([
    transition.request("session-1", "completed"),
    transition.request("session-1", "completed")
  ]);
  assert.equal(first.status, "completed");
  assert.equal(second, first);
  assert.equal(calls, 1);
  assert.equal(confirmed, 1);
});

test("cancellation uses the same confirmed terminal transition", async () => {
  let closed = 0;
  const transition = createTerminalTransition({
    endSession: async (_sessionId, status) => ({ status }),
    onConfirmed: (_session, status) => {
      assert.equal(status, "cancelled");
      closed++;
    }
  });
  await transition.request("session-1", "cancelled");
  await transition.request("session-1", "cancelled");
  assert.equal(closed, 1);
});
