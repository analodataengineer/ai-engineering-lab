import type { PoolClient } from "pg";
import { pool } from "./db.js";
import type { ConsentStatus, SessionStatus } from "./schemas.js";
import { observability } from "./observability.js";

export type SessionAccessState = {
  status: SessionStatus;
  consent_status: ConsentStatus;
};

export type SessionOperation = "interview_data" | "complete" | "cancel";

export function assertSessionCreationInput(input: {
  candidateFirstName?: string;
  candidateLastName?: string;
  candidateDisplayName?: string;
  candidateEmail?: string;
  targetRole?: string;
}) {
  const interviewFields = [
    input.candidateFirstName,
    input.candidateLastName,
    input.candidateDisplayName,
    input.candidateEmail,
    input.targetRole
  ];
  if (interviewFields.some((value) => value !== undefined)) {
    throw new SessionAccessError("invalid_session_state", 409);
  }
}

export class SessionAccessError extends Error {
  constructor(
    public readonly code: "session_not_found" | "invalid_session_state",
    public readonly statusCode: 404 | 409
  ) {
    super(code);
  }
}

export function assertSessionOperationAllowed(session: SessionAccessState | null, operation: SessionOperation): void {
  if (!session) throw new SessionAccessError("session_not_found", 404);
  if (operation === "cancel") {
    if (["created", "consent_pending", "in_progress", "cancelled"].includes(session.status)) return;
  } else if (
    session.consent_status === "granted" &&
    (session.status === "in_progress" || (operation === "complete" && session.status === "completed"))
  ) {
    return;
  }
  throw new SessionAccessError("invalid_session_state", 409);
}

export async function withSessionAccess<T>(
  sessionId: string,
  operation: SessionOperation,
  action: (client: PoolClient, session: SessionAccessState) => Promise<T>,
  connect: () => Promise<PoolClient> = () => pool.connect()
): Promise<T> {
  const client = await connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const result = await client.query<SessionAccessState>(
      "select status, consent_status from interview_sessions where id = $1 for update",
      [sessionId]
    );
    const session = result.rows[0] ?? null;
    try {
      assertSessionOperationAllowed(session, operation);
    } catch (error) {
      if (error instanceof SessionAccessError) {
        observability.recordError("request.rejected", {
          sessionId,
          component: "interview-engine",
          operation,
          errorCode: error.code,
          httpStatus: error.statusCode,
          sessionStatus: session?.status,
          consentStatus: session?.consent_status,
          safeMessage: error.code
        });
      }
      throw error;
    }
    const output = await action(client, session!);
    await client.query("COMMIT");
    return output;
  } catch (error) {
    if (transactionStarted) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
