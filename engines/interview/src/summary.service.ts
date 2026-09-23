import { query } from "./db.js";
import type { InterviewSummaryInput } from "./schemas.js";
import { withSessionAccess } from "./session-access.js";
import { observability } from "./observability.js";

export async function createSummary(sessionId: string, summary: InterviewSummaryInput) {
  const span = observability.startSpan("summary.persisted", {
    sessionId,
    component: "interview-engine",
    operation: "create_summary"
  });
  let result;
  try {
    result = await withSessionAccess(sessionId, "interview_data", async (client) => {
      const result = await client.query(
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
    });
  } catch (error) {
    span.recordError({
      errorCode: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "summary_persistence_failed",
      httpStatus: error instanceof Error && "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode) : 500,
      safeMessage: "summary_persistence_failed"
    });
    throw error;
  }
  span.end({ status: "persisted", success: true });
  return result;
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
