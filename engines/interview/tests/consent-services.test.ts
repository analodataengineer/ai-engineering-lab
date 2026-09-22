import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { pool } from "../src/db.js";
import { SessionAccessError } from "../src/session-access.js";
import {
  createSession,
  endSession,
  markConsent,
  updateCandidateEmail,
  updateCandidateIdentity
} from "../src/session.service.js";
import { createSummary } from "../src/summary.service.js";
import { recordTurn } from "../src/transcript.service.js";

const summary = {
  profileSummary: "",
  experienceSummary: "",
  toolsSummary: "",
  availabilitySummary: "",
  humanReviewNotes: []
};

function useDatabaseDouble(t: TestContext, options: { rejectEndUpdate?: boolean } = {}) {
  let session: { id: string; status: string; consent_status: string; candidate_email: string | null } | null = null;
  const dataWrites: string[] = [];

  const queryDouble = async (sql: string, values: unknown[] = []) => {
    const statement = sql.replace(/\s+/g, " ").toLowerCase();
    if (["begin", "commit", "rollback"].includes(statement)) return { rows: [] };
    if (statement.includes("insert into interview_sessions")) {
      session = { id: values[0] as string, status: "consent_pending", consent_status: "pending", candidate_email: null };
      return { rows: [session] };
    }
    if (statement.startsWith("select status, consent_status from interview_sessions")) {
      return { rows: session ? [session] : [] };
    }
    if (statement.startsWith("select 1 from interview_sessions")) return { rows: session ? [{ "?column?": 1 }] : [] };
    if (statement.includes("set consent_status =")) {
      if (!session || session.status !== "consent_pending") return { rows: [] };
      session.consent_status = values[1] as string;
      session.status = session.consent_status === "granted" ? "in_progress" : "cancelled";
      return { rows: [session] };
    }
    if (statement.startsWith("select * from interview_turns")) return { rows: [] };
    if (statement.includes("insert into interview_turns")) {
      dataWrites.push("turn");
      return { rows: [{ id: "turn-1", speaker: values[1], content: values[2] }] };
    }
    if (statement.includes("insert into interview_summaries")) {
      dataWrites.push("summary");
      return { rows: [{ id: "summary-1" }] };
    }
    if (statement.includes("set candidate_first_name =")) {
      dataWrites.push("identity");
      return { rows: [session] };
    }
    if (statement.includes("set candidate_email =")) {
      dataWrites.push("email");
      if (session) session.candidate_email = values[1] as string;
      return { rows: [session] };
    }
    if (statement.includes("set status =")) {
      if (options.rejectEndUpdate) return { rows: [] };
      if (!session || session.status === "cancelled") return { rows: [] };
      dataWrites.push("end");
      if (session) session.status = values[1] as string;
      return { rows: [session] };
    }
    if (statement.startsWith("select * from interview_sessions")) return { rows: session ? [session] : [] };
    if (statement.includes("insert into interview_events")) {
      dataWrites.push(`event:${values[1]}`);
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${statement}`);
  };
  t.mock.method(pool, "query", queryDouble);
  t.mock.method(pool, "connect", async () => ({ query: queryDouble, release: () => undefined }));

  return { dataWrites };
}

async function expectStateConflict(action: () => Promise<unknown>) {
  await assert.rejects(action, (error: unknown) =>
    error instanceof SessionAccessError && error.statusCode === 409 && error.code === "invalid_session_state"
  );
}

test("service methods reject interview data while pending, then accept it after consent", async (t) => {
  const db = useDatabaseDouble(t);
  const session = await createSession({});
  assert.equal(session.consent_status, "pending");
  await expectStateConflict(() => recordTurn(session.id, { speaker: "agent", content: "¿Qué experiencia tenés?" }));
  await expectStateConflict(() => createSummary(session.id, summary));
  await expectStateConflict(() => updateCandidateIdentity(session.id, { candidateFirstName: "Ana" }));
  await expectStateConflict(() => updateCandidateEmail(session.id, "ana@example.com"));
  await expectStateConflict(() => endSession(session.id, "completed"));
  assert.deepEqual(db.dataWrites, ["event:session_created"]);

  await markConsent(session.id, "granted");
  await recordTurn(session.id, { speaker: "agent", content: "¿Qué experiencia tenés?" });
  await createSummary(session.id, summary);
  await updateCandidateIdentity(session.id, { candidateFirstName: "Ana" });
  await updateCandidateEmail(session.id, "ana@example.com");
  assert.deepEqual(db.dataWrites, ["event:session_created", "event:consent_marked", "turn", "summary", "identity", "event:candidate_identity_saved", "email", "event:candidate_email_saved"]);
});

test("service methods reject data after decline and allow idempotent cancellation", async (t) => {
  const db = useDatabaseDouble(t);
  const session = await createSession({});
  await markConsent(session.id, "declined");
  await expectStateConflict(() => recordTurn(session.id, { speaker: "agent", content: "¿Qué experiencia tenés?" }));
  await expectStateConflict(() => createSummary(session.id, summary));
  await expectStateConflict(() => updateCandidateIdentity(session.id, { candidateFirstName: "Ana" }));
  await expectStateConflict(() => updateCandidateEmail(session.id, "ana@example.com"));
  await expectStateConflict(() => endSession(session.id, "completed"));
  assert.equal((await endSession(session.id, "cancelled"))?.status, "cancelled");
  assert.equal((await endSession(session.id, "cancelled"))?.status, "cancelled");
  assert.deepEqual(db.dataWrites, ["event:session_created", "event:consent_marked"]);
});

test("missing consent session returns 404 session_not_found", async (t) => {
  useDatabaseDouble(t);
  await assert.rejects(() => markConsent("missing", "granted"), (error: unknown) =>
    error instanceof SessionAccessError && error.statusCode === 404 && error.code === "session_not_found");
});

test("cancelled session cannot complete or cause completion side effects", async (t) => {
  const db = useDatabaseDouble(t);
  const session = await createSession({});
  await markConsent(session.id, "declined");
  await expectStateConflict(() => endSession(session.id, "completed"));
  assert.equal(db.dataWrites.includes("end"), false);
  assert.equal(db.dataWrites.includes("event:session_ended"), false);
  assert.equal(db.dataWrites.some((write) => write.includes("email")), false);
});

test("a zero-row completion transition produces no event or email", async (t) => {
  const db = useDatabaseDouble(t, { rejectEndUpdate: true });
  const session = await createSession({});
  await markConsent(session.id, "granted");
  await expectStateConflict(() => endSession(session.id, "completed"));
  assert.equal(db.dataWrites.includes("event:session_ended"), false);
  assert.equal(db.dataWrites.some((write) => write.includes("email")), false);
});

test("repeated cancellation preserves state and inserts one end event", async (t) => {
  const db = useDatabaseDouble(t);
  const session = await createSession({});
  await markConsent(session.id, "granted");
  assert.equal((await endSession(session.id, "cancelled")).status, "cancelled");
  assert.equal((await endSession(session.id, "cancelled")).status, "cancelled");
  assert.equal(db.dataWrites.filter((write) => write === "end").length, 1);
  assert.equal(db.dataWrites.filter((write) => write === "event:session_ended").length, 1);
});
