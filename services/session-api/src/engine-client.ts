import { observability } from "./observability.js";

const engineBaseUrl = process.env.INTERVIEW_ENGINE_URL ?? "http://interview-engine:3002";

export class EngineRequestError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const sessionId = path.match(/^\/sessions\/([^/]+)/)?.[1] ?? "unknown";
  const span = observability.startSpan("engine.request", {
    sessionId,
    component: "session-api",
    operation: `${init?.method ?? "GET"} ${path.split("?")[0]}`
  });
  let response: Response;
  try {
    response = await fetch(`${engineBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });
  } catch (error) {
    span.recordError({ errorCode: "engine_unreachable", httpStatus: 503, safeMessage: "engine_unreachable" });
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text();
    let code = "engine_request_failed";
    try {
      const body = JSON.parse(detail) as { error?: string };
      if (typeof body.error === "string") code = body.error;
    } catch { /* Keep a stable error code for non-JSON responses. */ }
    span.recordError({ errorCode: code, httpStatus: response.status, safeMessage: code });
    throw new EngineRequestError(response.status, code);
  }
  span.end({ httpStatus: response.status, success: true });
  return (await response.json()) as T;
}

export function createEngineSession(input: unknown) {
  return request<{ id: string; status: string; consent_status: string }>("/sessions", {
    method: "POST",
    body: JSON.stringify(input ?? {})
  });
}

export function getEngineSession(sessionId: string) {
  return request<{ session: { status: string; consent_status: string } }>(`/sessions/${sessionId}`);
}

export function listEngineSessions() {
  return request("/sessions");
}

export function getRecruiterDashboard() {
  return request("/recruiter/dashboard");
}

export function getRecruiterInterviewDetail(sessionId: string) {
  return request(`/recruiter/interviews/${sessionId}`);
}

export function endEngineSession(sessionId: string, status: "completed" | "cancelled" = "completed") {
  return request(`/sessions/${sessionId}/end`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export function markEngineConsent(sessionId: string, consentStatus: "granted" | "declined") {
  return request(`/sessions/${sessionId}/consent`, {
    method: "POST",
    body: JSON.stringify({ consentStatus })
  });
}

export function saveEngineCandidateEmail(sessionId: string, candidateEmail: string) {
  return request(`/sessions/${sessionId}/candidate-email`, {
    method: "POST",
    body: JSON.stringify({ candidateEmail })
  });
}

export function saveEngineCandidateIdentity(
  sessionId: string,
  input: {
    candidateFirstName?: string;
    candidateLastName?: string;
    candidateDisplayName?: string;
  }
) {
  return request(`/sessions/${sessionId}/candidate-identity`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function recordEngineTurn(sessionId: string, input: unknown) {
  return request(`/sessions/${sessionId}/turns`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createEngineSummary(sessionId: string, input: unknown) {
  return request(`/sessions/${sessionId}/summary`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}
