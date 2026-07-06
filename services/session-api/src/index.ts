import "dotenv/config";
import cors from "cors";
import express from "express";
import recruiterRouter from "./routes/recruiter.js";
import sessionsRouter from "./routes/sessions.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "session-api" });
});

app.use("/sessions", sessionsRouter);
app.use("/recruiter", recruiterRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(400).json({ error: "invalid_request" });
});

const port = Number(process.env.SESSION_API_PORT ?? 3001);
app.listen(port, () => {
  console.log(`session-api listening on ${port}`);
});
