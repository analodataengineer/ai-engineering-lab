import { query } from "./db.js";
import type { Speaker } from "./schemas.js";
import { updateCandidateEmail, updateCandidateIdentity, updateTargetRole } from "./session.service.js";

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
  const previousAgentTurn = await getPreviousAgentTurn(sessionId);
  const result = await query<InterviewTurn>(
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
    await captureStructuredFields(sessionId, input.content, previousAgentTurn?.content ?? "");
  }
  return result.rows[0];
}

export async function listTurns(sessionId: string) {
  const result = await query<InterviewTurn>(
    "select * from interview_turns where session_id = $1 order by turn_index asc",
    [sessionId]
  );
  return result.rows;
}

async function getPreviousAgentTurn(sessionId: string) {
  const result = await query<InterviewTurn>(
    `select * from interview_turns
     where session_id = $1 and speaker = 'agent'
     order by turn_index desc
     limit 1`,
    [sessionId]
  );
  return result.rows[0] ?? null;
}

async function captureStructuredFields(sessionId: string, content: string, previousAgentContent: string) {
  const email = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) {
    await updateCandidateEmail(sessionId, email);
  }

  const previousQuestion = previousAgentContent.toLowerCase();
  if (previousQuestion.includes("nombre") && previousQuestion.includes("apellido")) {
    const identity = parseCandidateIdentity(content);
    if (identity.candidateFirstName || identity.candidateDisplayName) {
      await updateCandidateIdentity(sessionId, identity);
    }
  }

  if (
    previousQuestion.includes("puesto") ||
    previousQuestion.includes("área") ||
    previousQuestion.includes("area")
  ) {
    await updateTargetRole(sessionId, content.slice(0, 160));
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
