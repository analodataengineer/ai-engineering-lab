import { Agent } from "@openai/agents";
import { readFileSync } from "node:fs";
import { interviewTools } from "./tools.js";

export const interviewAgent = new Agent({
  name: "interview-agent",
  instructions: readFileSync(new URL("../../../knowledge/interview/policy.md", import.meta.url), "utf8"),
  tools: interviewTools
});
