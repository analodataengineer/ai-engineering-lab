import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolClient } from "pg";
import {
  assertSessionCreationInput, SessionAccessError, type SessionAccessState, withSessionAccess
} from "../src/session-access.js";

const pending: SessionAccessState = { status: "consent_pending", consent_status: "pending" };
const granted: SessionAccessState = { status: "in_progress", consent_status: "granted" };
const declined: SessionAccessState = { status: "cancelled", consent_status: "declined" };

function database(state: SessionAccessState | null) {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes("for update")) return { rows: state ? [state] : [] };
      return { rows: [] };
    },
    release: () => statements.push("RELEASE")
  } as unknown as PoolClient;
  return { client, statements, connect: async () => client };
}

test("granted consent permits a write on the locked transaction client", async () => {
  const db = database(granted);
  const result = await withSessionAccess("session-1", "interview_data", async (client) => {
    assert.equal(client, db.client);
    await client.query("WRITE");
    return "accepted";
  }, db.connect);
  assert.equal(result, "accepted");
  assert.deepEqual(db.statements, ["BEGIN", "select status, consent_status from interview_sessions where id = $1 for update", "WRITE", "COMMIT", "RELEASE"]);
});

test("a cancellation committed before lock acquisition prevents the protected write", async () => {
  const db = database(declined);
  let wrote = false;
  await assert.rejects(
    withSessionAccess("session-1", "interview_data", async () => { wrote = true; }, db.connect),
    (error: unknown) => error instanceof SessionAccessError && error.statusCode === 409 && error.code === "invalid_session_state"
  );
  assert.equal(wrote, false);
  assert.deepEqual(db.statements.slice(-2), ["ROLLBACK", "RELEASE"]);
});

test("pending and declined sessions reject data and completion; cancellation stays allowed", async () => {
  for (const state of [pending, declined]) {
    for (const operation of ["interview_data", "complete"] as const) {
      const db = database(state);
      await assert.rejects(withSessionAccess("session-1", operation, async () => "write", db.connect),
        (error: unknown) => error instanceof SessionAccessError && error.statusCode === 409);
    }
    const db = database(state);
    assert.equal(await withSessionAccess("session-1", "cancel", async () => "accepted", db.connect), "accepted");
  }
});

test("missing session returns 404 session_not_found", async () => {
  const db = database(null);
  await assert.rejects(withSessionAccess("missing", "interview_data", async () => "write", db.connect),
    (error: unknown) => error instanceof SessionAccessError && error.statusCode === 404 && error.code === "session_not_found");
});

test("session creation cannot prefill interview data before consent", () => {
  assert.doesNotThrow(() => assertSessionCreationInput({}));
  for (const input of [{ candidateFirstName: "Ana" }, { candidateEmail: "ana@example.com" }, { targetRole: "Support" }]) {
    assert.throws(() => assertSessionCreationInput(input), SessionAccessError);
  }
});
