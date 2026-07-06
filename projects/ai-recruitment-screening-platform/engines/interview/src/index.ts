import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  candidateEmailSchema,
  candidateIdentitySchema,
  createSessionSchema,
  markConsentSchema,
  recordTurnSchema,
  summarySchema
} from "./schemas.js";
import { getRecruiterDashboard, getRecruiterInterviewDetail } from "./dashboard.service.js";
import { createSummary, getLatestSummary } from "./summary.service.js";
import { listTurns, recordTurn } from "./transcript.service.js";
import {
  createSession,
  endSession,
  getSession,
  listSessions,
  markConsent,
  updateCandidateIdentity,
  updateCandidateEmail
} from "./session.service.js";
import { query } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "interview-engine" });
});

app.post("/sessions", async (req, res, next) => {
  try {
    const input = createSessionSchema.parse(req.body ?? {});
    const session = await createSession(input);
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

app.get("/recruiter/dashboard", async (_req, res, next) => {
  try {
    res.json(await getRecruiterDashboard());
  } catch (error) {
    next(error);
  }
});

app.get("/recruiter/interviews/:sessionId", async (req, res, next) => {
  try {
    const detail = await getRecruiterInterviewDetail(req.params.sessionId);
    if (!detail) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

app.get("/sessions", async (_req, res, next) => {
  try {
    res.json({ sessions: await listSessions() });
  } catch (error) {
    next(error);
  }
});

app.get("/sessions/:sessionId", async (req, res, next) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }
    const [turns, summary] = await Promise.all([
      listTurns(req.params.sessionId),
      getLatestSummary(req.params.sessionId)
    ]);
    res.json({ session, turns, summary });
  } catch (error) {
    next(error);
  }
});

app.post("/sessions/:sessionId/consent", async (req, res, next) => {
  try {
    const input = markConsentSchema.parse(req.body);
    const session = await markConsent(req.params.sessionId, input.consentStatus);
    if (!session) {
      res.status(409).json({ error: "invalid_consent_transition" });
      return;
    }
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post("/sessions/:sessionId/candidate-identity", async (req, res, next) => {
  try {
    const input = candidateIdentitySchema.parse(req.body);
    const session = await updateCandidateIdentity(req.params.sessionId, input);
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post("/sessions/:sessionId/candidate-email", async (req, res, next) => {
  try {
    const input = candidateEmailSchema.parse(req.body);
    const session = await updateCandidateEmail(req.params.sessionId, input.candidateEmail);
    if (!session) {
      res.status(404).json({ error: "session_not_found" });
      return;
    }
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post("/sessions/:sessionId/turns", async (req, res, next) => {
  try {
    const input = recordTurnSchema.parse(req.body);
    const turn = await recordTurn(req.params.sessionId, input);
    res.status(201).json(turn);
  } catch (error) {
    next(error);
  }
});

app.post("/sessions/:sessionId/summary", async (req, res, next) => {
  try {
    const input = summarySchema.parse(req.body);
    const summary = await createSummary(req.params.sessionId, input);
    res.status(201).json(summary);
  } catch (error) {
    next(error);
  }
});

app.post("/sessions/:sessionId/end", async (req, res, next) => {
  try {
    const session = await endSession(req.params.sessionId, req.body?.status ?? "completed");
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(400).json({ error: "invalid_request" });
});

async function ensureRuntimeSchema() {
  await query('create extension if not exists "pgcrypto"');
  await query("alter table interview_sessions add column if not exists candidate_first_name text");
  await query("alter table interview_sessions add column if not exists candidate_last_name text");
  await query("alter table interview_sessions add column if not exists candidate_email text");
  await query("alter table interview_sessions add column if not exists interview_token text");
  await query("alter table interview_sessions add column if not exists completed_at timestamptz");
  await query(`
    create unique index if not exists idx_interview_sessions_interview_token
    on interview_sessions(interview_token)
    where interview_token is not null
  `);
  await query(`
    create table if not exists interview_email_events (
      id uuid primary key default gen_random_uuid(),
      session_id uuid not null references interview_sessions(id) on delete cascade,
      template_name text not null,
      recipient_email text not null,
      provider text not null,
      status text not null check (status in ('sent', 'skipped', 'failed')),
      idempotency_key text not null,
      message_id text,
      error_message text,
      created_at timestamptz not null default now(),
      sent_at timestamptz,
      unique (session_id, template_name)
    )
  `);
}

const port = Number(process.env.INTERVIEW_ENGINE_PORT ?? 3002);
ensureRuntimeSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`interview-engine listening on ${port}`);
    });
  })
  .catch((error) => {
    console.error("failed to prepare runtime schema", error);
    process.exit(1);
  });
