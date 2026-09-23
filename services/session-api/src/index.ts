import "dotenv/config";
import "./instrumentation.js";
import cors from "cors";
import express from "express";
import recruiterRouter from "./routes/recruiter.js";
import sessionsRouter from "./routes/sessions.js";
import { EngineRequestError } from "./engine-client.js";
import { observability } from "./observability.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "session-api" });
});

app.use("/sessions", sessionsRouter);
app.use("/recruiter", recruiterRouter);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const sessionId = typeof req.params.sessionId === "string" ? req.params.sessionId : "unknown";
  if (error instanceof EngineRequestError) {
    observability.recordError("engine.request.failed", {
      sessionId,
      component: "session-api",
      operation: "engine_request",
      errorCode: error.code,
      httpStatus: error.statusCode,
      safeMessage: error.code
    });
    res.status(error.statusCode).json({ error: error.code });
    return;
  }
  observability.recordError("session-api.request.failed", {
    sessionId,
    component: "session-api",
    operation: "request",
    errorCode: "invalid_request",
    httpStatus: 400,
    safeMessage: "invalid_request"
  });
  console.error(error instanceof Error ? error.message : "request_failed");
  res.status(400).json({ error: "invalid_request" });
});

const port = Number(process.env.SESSION_API_PORT ?? 3001);
app.listen(port, () => {
  console.log(`session-api listening on ${port}`);
});
