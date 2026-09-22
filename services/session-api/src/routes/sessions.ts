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
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/realtime-token", async (req, res, next) => {
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
    res.json(token);
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
