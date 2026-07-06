import { query } from "./db.js";
import type { InterviewSummaryInput } from "./schemas.js";

export async function createSummary(sessionId: string, summary: InterviewSummaryInput) {
  const result = await query(
    `insert into interview_summaries (
      session_id,
      profile_summary,
      experience_summary,
      tools_summary,
      availability_summary,
      human_review_notes
    ) values ($1, $2, $3, $4, $5, $6)
    returning *`,
    [
      sessionId,
      summary.profileSummary,
      summary.experienceSummary,
      summary.toolsSummary,
      summary.availabilitySummary,
      summary.humanReviewNotes.join("\n")
    ]
  );
  return result.rows[0];
}

export async function getLatestSummary(sessionId: string) {
  const result = await query(
    `select * from interview_summaries
     where session_id = $1
     order by created_at desc
     limit 1`,
    [sessionId]
  );
  return result.rows[0] ?? null;
}
