import { type Request, Router } from "express";
import { getRecruiterDashboard, getRecruiterInterviewDetail } from "../engine-client.js";

const router = Router();

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

router.get("/dashboard", async (req, res, next) => {
  try {
    if (!requireRecruiterAccess(req)) {
      res.status(401).json({ error: "recruiter_access_required" });
      return;
    }

    res.json(await getRecruiterDashboard());
  } catch (error) {
    next(error);
  }
});

router.get("/interviews/:sessionId", async (req, res, next) => {
  try {
    if (!requireRecruiterAccess(req)) {
      res.status(401).json({ error: "recruiter_access_required" });
      return;
    }

    res.json(await getRecruiterInterviewDetail(req.params.sessionId));
  } catch (error) {
    next(error);
  }
});

export default router;
