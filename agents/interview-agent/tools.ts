import { tool } from "@openai/agents";
import { z } from "zod";
import {
  markConsentInputSchema,
  recordTurnInputSchema,
  saveCandidateIdentityInputSchema,
  saveCandidateEmailInputSchema,
  sessionToolInputSchema,
  summaryInputSchema
} from "./schemas.js";

const engineBaseUrl = process.env.INTERVIEW_ENGINE_URL ?? "http://interview-engine:3002";

async function engineRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${engineBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

export const recordInterviewTurn = tool({
  name: "record_interview_turn",
  description: "Registra un turno de conversación en el engine determinístico.",
  parameters: recordTurnInputSchema,
  execute: async (input: z.infer<typeof recordTurnInputSchema>) =>
    engineRequest(`/sessions/${input.sessionId}/turns`, {
      method: "POST",
      body: JSON.stringify(input)
    })
});

export const markConsent = tool({
  name: "mark_consent",
  description: "Marca si la persona aceptó o rechazó continuar con la entrevista.",
  parameters: markConsentInputSchema,
  execute: async (input: z.infer<typeof markConsentInputSchema>) =>
    engineRequest(`/sessions/${input.sessionId}/consent`, {
      method: "POST",
      body: JSON.stringify({ consentStatus: input.consentStatus })
    })
});

export const getNextQuestion = tool({
  name: "get_next_question",
  description: "Obtiene el estado actual para decidir la próxima pregunta permitida.",
  parameters: sessionToolInputSchema,
  execute: async (input: z.infer<typeof sessionToolInputSchema>) =>
    engineRequest(`/sessions/${input.sessionId}`)
});

export const saveCandidateIdentity = tool({
  name: "save_candidate_identity",
  description: "Guarda nombre, apellido y nombre visible del candidato en el engine.",
  parameters: saveCandidateIdentityInputSchema,
  execute: async (input: z.infer<typeof saveCandidateIdentityInputSchema>) =>
    engineRequest(`/sessions/${input.sessionId}/candidate-identity`, {
      method: "POST",
      body: JSON.stringify({
        candidateFirstName: input.candidateFirstName,
        candidateLastName: input.candidateLastName,
        candidateDisplayName: input.candidateDisplayName
      })
    })
});

export const saveCandidateEmail = tool({
  name: "save_candidate_email",
  description: "Guarda un email válido del candidato para enviar confirmación al finalizar.",
  parameters: saveCandidateEmailInputSchema,
  execute: async (input: z.infer<typeof saveCandidateEmailInputSchema>) =>
    engineRequest(`/sessions/${input.sessionId}/candidate-email`, {
      method: "POST",
      body: JSON.stringify({ candidateEmail: input.candidateEmail })
    })
});

export const createInterviewSummary = tool({
  name: "create_interview_summary",
  description: "Guarda un resumen neutral para revisión humana.",
  parameters: summaryInputSchema,
  execute: async (input: z.infer<typeof summaryInputSchema>) => {
    const { sessionId, ...summary } = input;
    return engineRequest(`/sessions/${sessionId}/summary`, {
      method: "POST",
      body: JSON.stringify(summary)
    });
  }
});

export const completeInterview = tool({
  name: "complete_interview",
  description: "Finaliza la entrevista sin tomar una decisión de contratación.",
  parameters: sessionToolInputSchema,
  execute: async (input: z.infer<typeof sessionToolInputSchema>) =>
    engineRequest(`/sessions/${input.sessionId}/end`, {
      method: "POST",
      body: JSON.stringify({ status: "completed" })
    })
});

export const interviewTools = [
  recordInterviewTurn,
  getNextQuestion,
  markConsent,
  saveCandidateIdentity,
  saveCandidateEmail,
  completeInterview,
  createInterviewSummary
];
