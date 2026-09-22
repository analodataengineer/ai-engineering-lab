import type { ConsentDecision } from "./consent";
import { questionResponse, type QuestionResponse } from "./interview-workflow";

export type TranscriptHandlingResult =
  | QuestionResponse
  | { action: "clarify_consent"; instructions: string }
  | { action: "suppress" };

export const CONSENT_CLARIFICATION =
  "The candidate's consent response was ambiguous. Ask only for explicit confirmation of whether they consent to continue the interview. Do not ask for name, email, experience, tools, role, availability, motivation or any other interview information. Do not infer consent.";

export async function resolvePendingConsent<T extends { status: string; consent_status: string }>(
  intent: ConsentDecision,
  deps: {
    markConsent: (decision: "granted" | "declined") => Promise<T>;
    beginDecline: () => void;
    onConfirmed: (session: T) => void;
  }
): Promise<TranscriptHandlingResult> {
  if (intent === "pending") return { action: "clarify_consent", instructions: CONSENT_CLARIFICATION };
  const decision = intent === "granted" ? "granted" : "declined";
  if (decision === "declined") deps.beginDecline();
  const session = await deps.markConsent(decision);
  if (session.consent_status !== decision ||
      session.status !== (decision === "granted" ? "in_progress" : "cancelled")) {
    throw new Error("consent_confirmation_mismatch: backend did not confirm the requested consent state");
  }
  deps.onConfirmed(session);
  return decision === "granted" ? questionResponse("name") : { action: "suppress" };
}
