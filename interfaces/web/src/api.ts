const sessionApiUrl = import.meta.env.VITE_SESSION_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly body: string,
    message: string
  ) {
    super(message);
  }
}

export type SessionPayload = {
  id: string;
  status: string;
  consent_status: string;
  candidate_display_name?: string | null;
  candidate_first_name?: string | null;
  candidate_last_name?: string | null;
  candidate_email?: string | null;
  target_role?: string | null;
};

export type TurnPayload = {
  id: string;
  speaker: "agent" | "candidate" | "system";
  content: string;
  turn_index: number;
};

export type SessionDetail = {
  session: SessionPayload;
  turns: TurnPayload[];
  summary: null | {
    profile_summary: string;
    experience_summary: string;
    tools_summary: string;
    availability_summary: string;
    human_review_notes: string;
  };
};

export type RecruiterSession = SessionPayload & {
  turns: TurnPayload[];
  summary: SessionDetail["summary"];
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
};

export type RecruiterDashboard = {
  counters: {
    openPositions: number;
    applications: number;
    interviews: number;
    advancing: number;
    inReview: number;
    notAdvancing: number;
  };
  funnel: Array<{
    label: string;
    count: number;
    percentage: number;
  }>;
  recentInterviews: Array<{
    id: string;
    candidateName: string | null;
    candidateEmail: string | null;
    positionTitle: string | null;
    status: string;
    createdAt: string;
    completedAt: string | null;
    nextAction: string;
  }>;
  automations: {
    thankYouEmail: {
      enabled: boolean;
      sentCount: number;
      failedCount: number;
    };
  };
};

export type RecruiterInterviewDetail = {
  session: {
    id: string;
    status: string;
    candidateFirstName: string | null;
    candidateLastName: string | null;
    candidateDisplayName: string | null;
    candidateEmail: string | null;
    targetRole: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  summary: null | {
    profileSummary: string | null;
    experienceSummary: string | null;
    toolsSummary: string | null;
    availabilitySummary: string | null;
    humanReviewNotes: string | null;
  };
  turns: Array<{
    id: string;
    turnIndex: number;
    speaker: "agent" | "candidate" | "system";
    content: string;
    createdAt: string;
  }>;
  emailEvents: Array<{
    id: string;
    templateName: string;
    recipientEmail: string;
    provider: string;
    status: string;
    messageId: string | null;
    errorMessage: string | null;
    createdAt: string;
    sentAt: string | null;
  }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${sessionApiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    let code = "request_failed";
    let message = body || `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
      if (typeof parsed.error === "string") code = parsed.error;
      if (typeof parsed.message === "string") message = parsed.message;
      else if (typeof parsed.error === "string") message = parsed.error;
    } catch { /* Preserve the raw response body. */ }
    throw new ApiError(response.status, code, body, message);
  }

  return (await response.json()) as T;
}

export function createSession(input: { candidateDisplayName?: string; targetRole?: string }) {
  return request<SessionPayload>("/sessions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getSession(sessionId: string) {
  return request<SessionDetail>(`/sessions/${sessionId}`);
}

export function createRealtimeToken(sessionId: string) {
  return request<{ clientSecret?: string }>(`/sessions/${sessionId}/realtime-token`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function markConsent(sessionId: string, consentStatus: "granted" | "declined") {
  return request<SessionPayload>(`/sessions/${sessionId}/consent`, {
    method: "POST",
    body: JSON.stringify({ consentStatus })
  });
}

export function recordTurn(
  sessionId: string,
  input: { speaker: "agent" | "candidate" | "system"; content: string }
) {
  return request<TurnPayload>(`/sessions/${sessionId}/turns`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createSummary(sessionId: string, input: {
  profileSummary: string;
  experienceSummary: string;
  toolsSummary: string;
  availabilitySummary: string;
  humanReviewNotes: string[];
}) {
  return request(`/sessions/${sessionId}/summary`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function endSession(sessionId: string, status: "completed" | "cancelled" = "completed") {
  return request<SessionPayload>(`/sessions/${sessionId}/end`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export function listRecruiterSessions(accessToken: string) {
  return request<{ sessions: RecruiterSession[] }>("/sessions", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  });
}

export function getRecruiterDashboard(accessToken: string) {
  return request<RecruiterDashboard>("/recruiter/dashboard", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  });
}

export function getRecruiterInterviewDetail(sessionId: string, accessToken: string) {
  return request<RecruiterInterviewDetail>(`/recruiter/interviews/${sessionId}`, {
    headers: accessToken
      ? {
          Authorization: `Bearer ${accessToken}`
        }
      : undefined
  });
}
