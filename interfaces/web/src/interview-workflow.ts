export const INTERVIEW_STEPS = [
  "consent", "name", "email_optional", "target_role", "experience", "tools",
  "challenge", "availability", "motivation", "company_reason", "complete"
] as const;

export type InterviewStep = typeof INTERVIEW_STEPS[number];
export type QuestionStep = Exclude<InterviewStep, "consent" | "complete">;
export type QuestionResponse = { action: "respond"; step: QuestionStep; instructions: string };

export const INTERVIEW_QUESTIONS: Readonly<Record<QuestionStep, string>> = {
  name: "¿Cuál es tu nombre y apellido?",
  email_optional: "¿Querés compartir un correo para recibir una confirmación? Es opcional.",
  target_role: "¿A qué puesto o área te estás postulando?",
  experience: "Contame brevemente cuál es tu experiencia relacionada con este puesto.",
  tools: "¿Qué herramientas o tecnologías manejás principalmente?",
  challenge: "Contame brevemente una situación laboral desafiante y cómo la resolviste.",
  availability: "¿Cuál es tu disponibilidad y modalidad de trabajo preferida?",
  motivation: "¿Qué te motivó a postularte?",
  company_reason: "¿Por qué elegiste esta empresa?"
};

const questionRules = "Do not add commentary. Do not ask a second question. Do not make a transition statement. Do not announce completion. Do not add follow-up questions or additional conversational turns. Wait for the candidate after the question.";

export const CONSENT_REQUEST = 'Say exactly the following in neutral Rioplatense Spanish and nothing else: "Hola. Esta es una entrevista inicial para revisión humana. Para continuar necesito tu consentimiento. Podés responder «Sí, acepto» o «No acepto»." Do not infer consent or ask any interview questions. Wait for the candidate.';

export const INTERVIEW_BUDGET_MS = 5 * 60 * 1000;
export const MANDATORY_ONLY_AT_MS = 4.5 * 60 * 1000;

export function questionResponse(step: QuestionStep): QuestionResponse {
  return {
    action: "respond", step,
    instructions: `Say exactly the following question in neutral Rioplatense Spanish and nothing else:\n"${INTERVIEW_QUESTIONS[step]}"\n\n${questionRules}`
  };
}

// Browser application state; model messages cannot select or advance a step.
export function createInterviewWorkflow(now: () => number = Date.now) {
  const startedAt = now();
  let step: InterviewStep = "consent";
  let confirmed = false;
  let pending: Promise<unknown> = Promise.resolve();
  return {
    get startedAt() { return startedAt; },
    get budget() {
      const elapsedMs = Math.max(0, now() - startedAt);
      return {
        elapsedMs,
        remainingMs: Math.max(0, INTERVIEW_BUDGET_MS - elapsedMs),
        phase: elapsedMs >= INTERVIEW_BUDGET_MS ? "over_budget"
          : elapsedMs >= MANDATORY_ONLY_AT_MS ? "mandatory_only" : "normal",
        // Extra turns are prohibited throughout, including after 4:30.
        // Do not silently skip required steps to force a five-minute cutoff.
        allowAdditionalTurns: false as const
      };
    },
    get step() { return step; },
    canFinish() { return confirmed && step === "complete"; },
    confirmConsent(session: { consent_status: string; status: string }) {
      if (session.consent_status !== "granted" || session.status !== "in_progress") {
        throw new Error("consent_required: workflow requires backend-confirmed consent");
      }
      if (step !== "consent") throw new Error("invalid_workflow_step: consent already handled");
      confirmed = true;
      step = "name";
      return questionResponse(step);
    },
    // Serialize persistence and advancement so overlapping transcripts cannot
    // skip/reorder stages. Control intent is handled before calling this method.
    recordAnswer(persist: () => Promise<unknown>, isActive: () => boolean): Promise<InterviewStep> {
      const next = pending.then(async () => {
        if (!isActive()) return step;
        if (!confirmed || step === "consent" || step === "complete") {
          throw new Error("invalid_workflow_step: answer is not allowed at this stage");
        }
        await persist();
        if (!isActive()) return step;
        step = INTERVIEW_STEPS[INTERVIEW_STEPS.indexOf(step) + 1];
        return step;
      });
      pending = next;
      return next;
    }
  };
}
