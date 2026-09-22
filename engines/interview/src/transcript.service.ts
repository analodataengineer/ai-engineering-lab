import { query } from "./db.js";
import type { PoolClient } from "pg";
import type { Speaker } from "./schemas.js";
import { writeCandidateEmailLocked, writeCandidateIdentityLocked, writeTargetRoleLocked } from "./session.service.js";
import { withSessionAccess } from "./session-access.js";

export type InterviewTurn = {
  id: string;
  session_id: string;
  turn_index: number;
  speaker: Speaker;
  content: string;
  audio_ref: string | null;
  created_at: Date;
};

export async function recordTurn(
  sessionId: string,
  input: { speaker: Speaker; content: string; audioRef?: string }
) {
  return withSessionAccess(sessionId, "interview_data", async (client) => {
    const previousAgentTurn = await getPreviousAgentTurn(client, sessionId);
    const result = await client.query<InterviewTurn>(
      `with next_index as (
        select coalesce(max(turn_index), 0) + 1 as value
        from interview_turns
        where session_id = $1
      )
      insert into interview_turns (session_id, turn_index, speaker, content, audio_ref)
      select $1, value, $2, $3, $4 from next_index
      returning *`,
      [sessionId, input.speaker, input.content, input.audioRef ?? null]
    );
    if (input.speaker === "candidate") {
      await captureStructuredFields(client, sessionId, input.content, previousAgentTurn?.content ?? "");
    }
    return result.rows[0];
  });
}

export async function listTurns(sessionId: string) {
  const result = await query<InterviewTurn>(
    "select * from interview_turns where session_id = $1 order by turn_index asc",
    [sessionId]
  );
  return result.rows;
}

async function getPreviousAgentTurn(client: PoolClient, sessionId: string) {
  const result = await client.query<InterviewTurn>(
    `select * from interview_turns
     where session_id = $1 and speaker = 'agent'
     order by turn_index desc
     limit 1`,
    [sessionId]
  );
  return result.rows[0] ?? null;
}

async function captureStructuredFields(client: PoolClient, sessionId: string, content: string, previousAgentContent: string) {
  const email = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) {
    await writeCandidateEmailLocked(client, sessionId, email);
  }

  const previousQuestion = previousAgentContent.toLowerCase();
  if (previousQuestion.includes("nombre") && previousQuestion.includes("apellido")) {
    const identity = parseCandidateIdentity(content);
    if (identity.candidateFirstName || identity.candidateDisplayName) {
      await writeCandidateIdentityLocked(client, sessionId, identity);
    }
  }

  if (
    previousQuestion.includes("puesto") ||
    previousQuestion.includes("área") ||
    previousQuestion.includes("area")
  ) {
    await writeTargetRoleLocked(client, sessionId, content.slice(0, 160));
  }
}

function parseCandidateIdentity(content: string) {
  const normalized = content
    .replace(/^(me llamo|mi nombre es|soy)\s+/i, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  const candidateFirstName = parts[0];
  const candidateLastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;

  return {
    candidateFirstName,
    candidateLastName,
    candidateDisplayName: [candidateFirstName, candidateLastName].filter(Boolean).join(" ")
  };
}
