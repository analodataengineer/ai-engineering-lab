import { query } from "./db.js";

type DashboardSession = {
  id: string;
  status: string;
  candidate_first_name: string | null;
  candidate_last_name: string | null;
  candidate_display_name: string | null;
  candidate_email: string | null;
  target_role: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
};

export async function getRecruiterDashboard() {
  const [sessionsResult, emailResult] = await Promise.all([
    query<DashboardSession>(
      `select
        id,
        status,
        candidate_first_name,
        candidate_last_name,
        candidate_display_name,
        candidate_email,
        target_role,
        created_at,
        started_at,
        completed_at
       from interview_sessions
       order by created_at desc
       limit 100`
    ),
    query<{ status: string; count: string }>(
      `select status, count(*)::text as count
       from interview_email_events
       group by status`
    )
  ]);

  const sessions = sessionsResult.rows;
  const applications = sessions.length;
  const interviews = sessions.length;
  const inReview = sessions.filter((session) =>
    ["completed", "in_review"].includes(session.status)
  ).length;
  const advancing = sessions.filter((session) => session.status === "advancing").length;
  const notAdvancing = sessions.filter((session) => session.status === "not_advancing").length;

  const funnel = [
    { label: "Solicitudes", count: applications },
    { label: "Entrevistas", count: interviews },
    { label: "En revisión", count: inReview },
    { label: "Avanzan", count: advancing },
    { label: "No avanzan", count: notAdvancing }
  ].map((item) => ({
    ...item,
    percentage: applications > 0 ? Math.round((item.count / applications) * 100) : 0
  }));

  const emailCounts = Object.fromEntries(
    emailResult.rows.map((row) => [row.status, Number(row.count)])
  );

  return {
    counters: {
      openPositions: 0,
      applications,
      interviews,
      advancing,
      inReview,
      notAdvancing
    },
    funnel,
    recentInterviews: sessions.slice(0, 8).map((session) => ({
      id: session.id,
      candidateName:
        session.candidate_display_name ||
        [session.candidate_first_name, session.candidate_last_name].filter(Boolean).join(" ") ||
        null,
      candidateEmail: session.candidate_email,
      positionTitle: session.target_role,
      status: session.status === "completed" ? "in_review" : session.status,
      createdAt: session.created_at,
      completedAt: session.completed_at,
      nextAction: session.status === "completed" ? "Ver detalle" : "Esperar cierre"
    })),
    automations: {
      thankYouEmail: {
        enabled: (process.env.EMAIL_PROVIDER ?? "log") === "log",
        sentCount: emailCounts.sent ?? 0,
        failedCount: emailCounts.failed ?? 0
      }
    }
  };
}

export async function getRecruiterInterviewDetail(sessionId: string) {
  const [sessionResult, summaryResult, turnsResult, emailEventsResult] = await Promise.all([
    query<{
      id: string;
      status: string;
      candidate_first_name: string | null;
      candidate_last_name: string | null;
      candidate_display_name: string | null;
      candidate_email: string | null;
      target_role: string | null;
      created_at: Date;
      started_at: Date | null;
      completed_at: Date | null;
    }>(
      `select
        id,
        status,
        candidate_first_name,
        candidate_last_name,
        candidate_display_name,
        candidate_email,
        target_role,
        created_at,
        started_at,
        completed_at
       from interview_sessions
       where id = $1`,
      [sessionId]
    ),
    query<{
      profile_summary: string | null;
      experience_summary: string | null;
      tools_summary: string | null;
      availability_summary: string | null;
      human_review_notes: string | null;
    }>(
      `select
        profile_summary,
        experience_summary,
        tools_summary,
        availability_summary,
        human_review_notes
       from interview_summaries
       where session_id = $1
       order by created_at desc
       limit 1`,
      [sessionId]
    ),
    query<{
      id: string;
      turn_index: number;
      speaker: "agent" | "candidate" | "system";
      content: string;
      created_at: Date;
    }>(
      `select id, turn_index, speaker, content, created_at
       from interview_turns
       where session_id = $1
       order by turn_index asc`,
      [sessionId]
    ),
    query<{
      id: string;
      template_name: string;
      recipient_email: string;
      provider: string;
      status: string;
      message_id: string | null;
      error_message: string | null;
      created_at: Date;
      sent_at: Date | null;
    }>(
      `select
        id,
        template_name,
        recipient_email,
        provider,
        status,
        message_id,
        error_message,
        created_at,
        sent_at
       from interview_email_events
       where session_id = $1
       order by created_at desc`,
      [sessionId]
    )
  ]);

  const session = sessionResult.rows[0];
  if (!session) {
    return null;
  }

  const summary = summaryResult.rows[0] ?? null;

  return {
    session: {
      id: session.id,
      status: session.status,
      candidateFirstName: session.candidate_first_name,
      candidateLastName: session.candidate_last_name,
      candidateDisplayName: session.candidate_display_name,
      candidateEmail: session.candidate_email,
      targetRole: session.target_role,
      createdAt: session.created_at,
      startedAt: session.started_at,
      completedAt: session.completed_at
    },
    summary: summary
      ? {
          profileSummary: summary.profile_summary,
          experienceSummary: summary.experience_summary,
          toolsSummary: summary.tools_summary,
          availabilitySummary: summary.availability_summary,
          humanReviewNotes: summary.human_review_notes
        }
      : null,
    turns: turnsResult.rows.map((turn) => ({
      id: turn.id,
      turnIndex: turn.turn_index,
      speaker: turn.speaker,
      content: turn.content,
      createdAt: turn.created_at
    })),
    emailEvents: emailEventsResult.rows.map((event) => ({
      id: event.id,
      templateName: event.template_name,
      recipientEmail: event.recipient_email,
      provider: event.provider,
      status: event.status,
      messageId: event.message_id,
      errorMessage: event.error_message,
      createdAt: event.created_at,
      sentAt: event.sent_at
    }))
  };
}
