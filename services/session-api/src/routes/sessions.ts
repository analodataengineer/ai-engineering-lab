import { type Request, Router } from "express";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  createEngineSession,
  createEngineSummary,
  endEngineSession,
  getEngineSession,
  listEngineSessions,
  markEngineConsent,
  recordEngineTurn,
  saveEngineCandidateIdentity,
  saveEngineCandidateEmail
} from "../engine-client.js";
import { getSpeechProvider } from "../providers/index.js";
import { observability } from "../observability.js";

const router = Router();
const interviewPolicy = readFileSync(new URL("../../../../knowledge/interview/policy.md", import.meta.url), "utf8");

const createSessionSchema = z.object({
  candidateFirstName: z.string().trim().min(1).max(80).optional(),
  candidateLastName: z.string().trim().min(1).max(120).optional(),
  candidateDisplayName: z.string().trim().min(1).max(120).optional(),
  candidateEmail: z.string().trim().email().max(254).optional(),
  interviewToken: z.string().trim().min(12).max(160).optional(),
  targetRole: z.string().trim().min(1).max(160).optional()
});

const turnSchema = z.object({
  speaker: z.enum(["agent", "candidate", "system"]),
  content: z.string().trim().min(1).max(4000),
  audioRef: z.string().trim().max(500).optional()
});

const consentSchema = z.object({
  consentStatus: z.enum(["granted", "declined"])
});

const identitySchema = z.object({
  candidateFirstName: z.string().trim().min(1).max(80).optional(),
  candidateLastName: z.string().trim().min(1).max(120).optional(),
  candidateDisplayName: z.string().trim().min(1).max(160).optional()
});

const summarySchema = z.object({
  profileSummary: z.string().trim().max(3000).default(""),
  experienceSummary: z.string().trim().max(3000).default(""),
  toolsSummary: z.string().trim().max(3000).default(""),
  availabilitySummary: z.string().trim().max(3000).default(""),
  humanReviewNotes: z.array(z.string().trim().max(500)).max(12).default([])
});

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function sanitizeRealtimeToken(token: {
  provider: string;
  sessionId: string;
  model?: string;
  clientSecret?: string;
  expiresAt?: number;
}) {
  return {
    provider: token.provider,
    sessionId: token.sessionId,
    model: token.model,
    clientSecret: token.clientSecret,
    expiresAt: token.expiresAt
  };
}

export const telemetryEventSchema = z.object({
  name: z.enum([
    "realtime.connected", "consent.requested", "consent.classified", "consent.granted",
    "consent.declined", "workflow.step.started", "workflow.step.completed", "response.requested",
    "response.completed", "withdrawal.detected", "terminal.begin", "microphone.stopped", "realtime.closed"
  ]),
  step: z.string().trim().min(1).max(80).optional(),
  state: z.string().trim().min(1).max(80).optional(),
  classification: z.enum(["granted", "declined", "ambiguous", "withdrawal"]).optional(),
  reason: z.string().trim().min(1).max(80).optional(),
  provider: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  responseId: z.string().trim().min(1).max(160).optional(),
  responseStatus: z.string().trim().min(1).max(80).optional(),
  inputTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  outputTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  totalTokens: z.number().finite().int().nonnegative().max(20_000_000).optional(),
  inputUncachedTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  inputCachedTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  inputTextTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  inputAudioTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  inputTextCachedTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  inputAudioCachedTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  inputTextUncachedTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  inputAudioUncachedTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  outputTextTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  outputAudioTokens: z.number().finite().int().nonnegative().max(10_000_000).optional(),
  responseStartedAtMs: z.number().finite().int().nonnegative().max(9_999_999_999_999).optional(),
  responseCompletedAtMs: z.number().finite().int().nonnegative().max(9_999_999_999_999).optional(),
  durationMs: z.number().finite().nonnegative().max(86_400_000).optional(),
  success: z.boolean().optional()
}).strict().refine((value) => {
  if (value.inputTokens === undefined) return true;
  const cached = value.inputCachedTokens ?? 0;
  const uncached = value.inputUncachedTokens ?? value.inputTokens - cached;
  return uncached >= 0 && uncached + cached === value.inputTokens;
}, { path: ["inputUncachedTokens"], message: "input token buckets must equal inputTokens" }).refine((value) => {
  if (value.inputTextCachedTokens === undefined || value.inputTextUncachedTokens === undefined || value.inputTextTokens === undefined) return true;
  return value.inputTextCachedTokens + value.inputTextUncachedTokens === value.inputTextTokens;
}, { path: ["inputTextCachedTokens"], message: "input text cached/uncached buckets must equal inputTextTokens" }).refine((value) => {
  if (value.inputAudioCachedTokens === undefined || value.inputAudioUncachedTokens === undefined || value.inputAudioTokens === undefined) return true;
  return value.inputAudioCachedTokens + value.inputAudioUncachedTokens === value.inputAudioTokens;
}, { path: ["inputAudioCachedTokens"], message: "input audio cached/uncached buckets must equal inputAudioTokens" }).refine((value) => {
  if (value.inputTextCachedTokens === undefined || value.inputAudioCachedTokens === undefined || value.inputCachedTokens === undefined) return true;
  return value.inputTextCachedTokens + value.inputAudioCachedTokens === value.inputCachedTokens;
}, { path: ["inputCachedTokens"], message: "input cached modality buckets must equal inputCachedTokens" }).refine((value) => {
  if (value.responseStartedAtMs === undefined || value.responseCompletedAtMs === undefined) return true;
  return value.responseCompletedAtMs >= value.responseStartedAtMs;
}, { path: ["responseCompletedAtMs"], message: "responseCompletedAtMs must be >= responseStartedAtMs" });

function requireRecruiterAccess(req: Request) {
  if (process.env.RECRUITER_AUTH_ENABLED !== "true") {
    return true;
  }
  const configuredToken = process.env.RECRUITER_ACCESS_TOKEN;
  const authorization = req.headers.authorization;
  const providedToken =
    typeof authorization === "string" ? authorization.replace(/^Bearer\s+/i, "") : "";
  return Boolean(configuredToken && providedToken && providedToken === configuredToken);
}

router.get("/", async (req, res, next) => {
  try {
    if (!requireRecruiterAccess(req)) {
      res.status(401).json({ error: "recruiter_access_required" });
      return;
    }

    res.json(await listEngineSessions());
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createSessionSchema.parse(req.body ?? {});
    const session = await createEngineSession(input);
    observability.event("session.created", {
      sessionId: session.id,
      component: "session-api",
      state: session.status,
      consentStatus: session.consent_status,
      success: true
    });
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/realtime-token", async (req, res, next) => {
  const span = observability.startSpan("realtime.token.created", {
    sessionId: req.params.sessionId,
    component: "session-api",
    operation: "create_realtime_token"
  });
  try {
    const current = await getEngineSession(req.params.sessionId);
    if (current.session.consent_status === "declined" || ["completed", "cancelled", "failed"].includes(current.session.status)) {
      res.status(409).json({ error: "invalid_session_state" });
      return;
    }
    const provider = getSpeechProvider();
    const token = await provider.createRealtimeSession({
      sessionId: req.params.sessionId,
      voice: req.body?.voice,
      instructions: interviewPolicy
    });
    span.end({ provider: token.provider, model: token.model, httpStatus: 200, success: true });
    res.json(sanitizeRealtimeToken(token));
  } catch (error) {
    span.recordError({ errorCode: error instanceof Error ? "realtime_token_failed" : "realtime_token_failed", httpStatus: 400, safeMessage: "realtime_token_failed" });
    next(error);
  }
});

router.post("/:sessionId/telemetry", async (req, res, next) => {
  try {
    const event = telemetryEventSchema.parse(req.body ?? {});
    const current = await getEngineSession(req.params.sessionId);
    observability.event("browser.telemetry.received", {
      sessionId: req.params.sessionId,
      component: "session-api",
      operation: event.name,
      state: event.state,
      step: event.step,
      classification: event.classification,
      reason: event.reason,
      provider: event.provider,
      model: event.model,
      responseId: event.responseId,
      responseStatus: event.responseStatus,
      durationMs: event.durationMs,
      success: event.success ?? true,
      sessionStatus: current.session.status,
      consentStatus: current.session.consent_status
    });
    observability.event(event.name, {
      sessionId: req.params.sessionId,
      component: "web",
      step: event.step,
      state: event.state,
      classification: event.classification,
      reason: event.reason,
      provider: event.provider,
      model: event.model,
      responseId: event.responseId,
      responseStatus: event.responseStatus,
      durationMs: event.durationMs,
      success: event.success
    });
    if (event.name === "response.completed" && (event.inputTokens !== undefined || event.outputTokens !== undefined || event.totalTokens !== undefined)) {
      observability.generation("realtime.generation", {
        sessionId: req.params.sessionId,
        responseId: event.responseId,
        model: event.model,
        responseStatus: event.responseStatus,
        responseStartedAtMs: event.responseStartedAtMs,
        responseCompletedAtMs: event.responseCompletedAtMs,
        durationMs: event.durationMs,
        inputTokens: event.inputTokens,
        inputUncachedTokens: event.inputUncachedTokens ?? (event.inputTokens ?? 0) - (event.inputCachedTokens ?? 0),
        inputCachedTokens: event.inputCachedTokens ?? 0,
        outputTokens: event.outputTokens,
        totalTokens: event.totalTokens,
        inputTextTokens: event.inputTextTokens,
        inputAudioTokens: event.inputAudioTokens,
        inputTextCachedTokens: event.inputTextCachedTokens,
        inputAudioCachedTokens: event.inputAudioCachedTokens,
        inputTextUncachedTokens: event.inputTextUncachedTokens,
        inputAudioUncachedTokens: event.inputAudioUncachedTokens,
        outputTextTokens: event.outputTextTokens,
        outputAudioTokens: event.outputAudioTokens
      });
    }
    res.status(202).json({ accepted: true });
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/end", async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(["completed", "cancelled"]).default("completed") }).parse(req.body ?? {});
    const session = await endEngineSession(req.params.sessionId, status);
    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/consent", async (req, res, next) => {
  try {
    const input = consentSchema.parse(req.body);
    const session = await markEngineConsent(req.params.sessionId, input.consentStatus);
    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/candidate-identity", async (req, res, next) => {
  try {
    const input = identitySchema.parse(req.body);
    const session = await saveEngineCandidateIdentity(req.params.sessionId, input);
    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/turns", async (req, res, next) => {
  try {
    const input = turnSchema.parse(req.body);
    const turn = await recordEngineTurn(req.params.sessionId, input);
    const emailMatch = input.speaker === "candidate" ? input.content.match(emailPattern) : null;
    if (emailMatch) {
      await saveEngineCandidateEmail(req.params.sessionId, emailMatch[0]);
    }
    res.status(201).json(turn);
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/summary", async (req, res, next) => {
  try {
    const input = summarySchema.parse(req.body);
    const summary = await createEngineSummary(req.params.sessionId, input);
    res.status(201).json(summary);
  } catch (error) {
    next(error);
  }
});

router.get("/:sessionId", async (req, res, next) => {
  try {
    const session = await getEngineSession(req.params.sessionId);
    res.json(session);
  } catch (error) {
    next(error);
  }
});

export default router;
