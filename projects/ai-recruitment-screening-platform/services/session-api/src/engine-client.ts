const engineBaseUrl = process.env.INTERVIEW_ENGINE_URL ?? "http://interview-engine:3002";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${engineBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`engine_request_failed: ${detail}`);
  }

  return (await response.json()) as T;
}

export function createEngineSession(input: unknown) {
  return request("/sessions", {
    method: "POST",
    body: JSON.stringify(input ?? {})
  });
}

export function getEngineSession(sessionId: string) {
  return request(`/sessions/${sessionId}`);
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

export function endEngineSession(sessionId: string) {
  return request(`/sessions/${sessionId}/end`, {
    method: "POST",
    body: JSON.stringify({ status: "completed" })
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
