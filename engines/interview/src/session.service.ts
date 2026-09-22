import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, query } from "./db.js";
import { sendThankYouEmail } from "./email/email.service.js";
import { assertSessionCreationInput, SessionAccessError, withSessionAccess } from "./session-access.js";
import type { ConsentStatus, SessionStatus } from "./schemas.js";

export type InterviewSession = {
  id: string;
  status: SessionStatus;
  candidate_first_name: string | null;
  candidate_last_name: string | null;
  candidate_display_name: string | null;
  candidate_email: string | null;
  interview_token: string | null;
  target_role: string | null;
  consent_status: ConsentStatus;
  started_at: Date | null;
  ended_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export async function createSession(input: {
  candidateFirstName?: string;
  candidateLastName?: string;
  candidateDisplayName?: string;
  candidateEmail?: string;
  interviewToken?: string;
  targetRole?: string;
}) {
  assertSessionCreationInput(input);
  const id = randomUUID();
  const displayName =
    input.candidateDisplayName ??
    [input.candidateFirstName, input.candidateLastName].filter(Boolean).join(" ") ??
    null;
  const result = await query<InterviewSession>(
    `insert into interview_sessions (
      id,
      status,
      candidate_first_name,
      candidate_last_name,
      candidate_display_name,
      candidate_email,
      interview_token,
      target_role,
      consent_status,
      started_at
    ) values ($1, 'consent_pending', $2, $3, $4, $5, $6, $7, 'pending', now())
    returning *`,
    [
      id,
      input.candidateFirstName ?? null,
      input.candidateLastName ?? null,
      displayName || null,
      input.candidateEmail ?? null,
      input.interviewToken ?? null,
      input.targetRole ?? null
    ]
  );
  await recordEvent(id, "session_created", input);
  return result.rows[0];
}

export async function updateCandidateIdentity(
  sessionId: string,
  input: {
    candidateFirstName?: string;
    candidateLastName?: string;
    candidateDisplayName?: string;
  }
) {
  return withSessionAccess(sessionId, "interview_data", (client) =>
    writeCandidateIdentityLocked(client, sessionId, input)
  );
}

/** Internal write: the caller must hold the session row lock. */
export async function writeCandidateIdentityLocked(
  client: PoolClient,
  sessionId: string,
  input: { candidateFirstName?: string; candidateLastName?: string; candidateDisplayName?: string }
) {
    const displayName =
      input.candidateDisplayName ??
      [input.candidateFirstName, input.candidateLastName].filter(Boolean).join(" ") ??
      null;
    const result = await client.query<InterviewSession>(
      `update interview_sessions
       set candidate_first_name = coalesce($2, candidate_first_name),
           candidate_last_name = coalesce($3, candidate_last_name),
           candidate_display_name = coalesce($4, candidate_display_name),
           updated_at = now()
       where id = $1
       returning *`,
      [
        sessionId,
        input.candidateFirstName ?? null,
        input.candidateLastName ?? null,
        displayName || null
      ]
    );
    await recordEvent(sessionId, "candidate_identity_saved", input, client);
    return result.rows[0] ?? null;
}

export async function updateCandidateEmail(sessionId: string, candidateEmail: string) {
  return withSessionAccess(sessionId, "interview_data", (client) =>
    writeCandidateEmailLocked(client, sessionId, candidateEmail)
  );
}

/** Internal write: the caller must hold the session row lock. */
export async function writeCandidateEmailLocked(client: PoolClient, sessionId: string, candidateEmail: string) {
    const result = await client.query<InterviewSession>(
      `update interview_sessions
       set candidate_email = $2, updated_at = now()
       where id = $1
       returning *`,
      [sessionId, candidateEmail]
    );
    await recordEvent(sessionId, "candidate_email_saved", { candidateEmail }, client);
    return result.rows[0] ?? null;
}

export async function updateTargetRole(sessionId: string, targetRole: string) {
  return withSessionAccess(sessionId, "interview_data", (client) =>
    writeTargetRoleLocked(client, sessionId, targetRole)
  );
}

/** Internal write: the caller must hold the session row lock. */
export async function writeTargetRoleLocked(client: PoolClient, sessionId: string, targetRole: string) {
    const result = await client.query<InterviewSession>(
      `update interview_sessions
       set target_role = coalesce(target_role, $2), updated_at = now()
       where id = $1
       returning *`,
      [sessionId, targetRole]
    );
    await recordEvent(sessionId, "target_role_saved", { targetRole }, client);
    return result.rows[0] ?? null;
}

export async function getSession(sessionId: string) {
  const result = await query<InterviewSession>(
    "select * from interview_sessions where id = $1",
    [sessionId]
  );
  return result.rows[0] ?? null;
}

export async function listSessions() {
  const result = await query(
    `select
      s.*,
      coalesce(
        json_agg(t order by t.turn_index) filter (where t.id is not null),
        '[]'::json
      ) as turns,
      (
        select row_to_json(summary_row)
        from (
          select
            id,
            session_id,
            profile_summary,
            experience_summary,
            tools_summary,
            availability_summary,
            human_review_notes,
            created_at
          from interview_summaries
          where session_id = s.id
          order by created_at desc
          limit 1
        ) summary_row
      ) as summary
    from interview_sessions s
    left join interview_turns t on t.session_id = s.id
    group by s.id
    order by s.created_at desc
    limit 100`
  );
  return result.rows;
}

export async function markConsent(sessionId: string, consentStatus: ConsentStatus) {
  const nextStatus: SessionStatus =
    consentStatus === "granted" ? "in_progress" : "cancelled";
  const result = await query<InterviewSession>(
    `update interview_sessions
     set consent_status = $2,
         status = $3,
         ended_at = case when $2 = 'declined' then coalesce(ended_at, now()) else ended_at end,
         updated_at = now()
     where id = $1 and status in ('consent_pending', 'created')
     returning *`,
    [sessionId, consentStatus, nextStatus]
  );
  const session = result.rows[0];
  if (!session) {
    const existing = await query("select 1 from interview_sessions where id = $1", [sessionId]);
    throw new SessionAccessError(existing.rows.length ? "invalid_session_state" : "session_not_found", existing.rows.length ? 409 : 404);
  }
  await recordEvent(sessionId, "consent_marked", { consentStatus });
  return session;
}

export async function endSession(sessionId: string, status: "completed" | "cancelled" = "completed") {
  const outcome = await withSessionAccess(sessionId, status === "completed" ? "complete" : "cancel", async (client, current) => {
    if (current.status === status) {
      const existing = await client.query<InterviewSession>("select * from interview_sessions where id = $1", [sessionId]);
      return { session: existing.rows[0], transitioned: false };
    }
    const result = await client.query<InterviewSession>(
      `update interview_sessions
       set status = $2,
           ended_at = coalesce(ended_at, now()),
           completed_at = case when $2 = 'completed' then coalesce(completed_at, now()) else completed_at end,
           updated_at = now()
       where id = $1 and (
         ($2 = 'completed' and consent_status = 'granted' and status = 'in_progress') or
         ($2 = 'cancelled' and status in ('created', 'consent_pending', 'in_progress'))
       )
       returning *`,
      [sessionId, status]
    );
    const session = result.rows[0];
    if (!session) throw new SessionAccessError("invalid_session_state", 409);
    await recordEvent(sessionId, "session_ended", { status }, client);
    return { session, transitioned: true };
  });
  if (status === "completed" && outcome.transitioned) await sendThankYouEmail(outcome.session);
  return outcome.session;
}

export async function recordEvent(sessionId: string, eventType: string, payload: unknown, client: PoolClient | typeof pool = pool) {
  await client.query(
    `insert into interview_events (session_id, event_type, payload_json)
     values ($1, $2, $3::jsonb)`,
    [sessionId, eventType, JSON.stringify(payload ?? {})]
  );
}
