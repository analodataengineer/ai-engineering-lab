import assert from "node:assert/strict";
import { test } from "node:test";
import { createInterviewWorkflow, INTERVIEW_STEPS, questionResponse, type QuestionStep } from "../src/interview-workflow.js";

const expectedQuestions: Record<QuestionStep, string> = {
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

for (const [step, question] of Object.entries(expectedQuestions)) {
  test(`${step} requests exactly its canonical Spanish question with no commentary`, () => {
    const result = questionResponse(step as QuestionStep);
    assert.equal(result.step, step);
    assert.equal(result.instructions,
      `Say exactly the following question in neutral Rioplatense Spanish and nothing else:\n"${question}"\n\nDo not add commentary. Do not ask a second question. Do not make a transition statement. Do not announce completion. Do not add follow-up questions or additional conversational turns. Wait for the candidate after the question.`);
  });
}

test("time budget records start, marks 4:30 and 5:00, and never skips required steps", async () => {
  let clock = 1000;
  const workflow = createInterviewWorkflow(() => clock);
  assert.equal(workflow.startedAt, 1000);
  assert.equal(workflow.budget.remainingMs, 300000);
  workflow.confirmConsent({ consent_status: "granted", status: "in_progress" });
  clock += 269999;
  assert.equal(workflow.budget.phase, "normal");
  clock++;
  assert.equal(workflow.budget.phase, "mandatory_only");
  assert.equal(workflow.budget.allowAdditionalTurns, false);
  assert.equal(workflow.budget.remainingMs, 30000);
  assert.equal(workflow.step, "name");
  clock += 30000;
  assert.equal(workflow.budget.phase, "over_budget");
  assert.equal(workflow.budget.remainingMs, 0);
  assert.equal(workflow.budget.allowAdditionalTurns, false);
  assert.equal(workflow.canFinish(), false);
  assert.equal(await workflow.recordAnswer(async () => {}, () => true), "email_optional");
});

test("pending consent cannot advance or finish; backend confirmation is mandatory", async () => {
  const workflow = createInterviewWorkflow();
  assert.equal(workflow.step, "consent");
  assert.equal(workflow.canFinish(), false);
  assert.throws(() => workflow.confirmConsent({ consent_status: "pending", status: "in_progress" }), /consent_required/);
  assert.throws(() => workflow.confirmConsent({ consent_status: "granted", status: "cancelled" }), /consent_required/);
  await assert.rejects(workflow.recordAnswer(async () => assert.fail("no write"), () => true), /invalid_workflow_step/);
  assert.equal(workflow.step, "consent");
});

test("confirmed grant selects name; persisted turns advance exactly once in fixed order", async () => {
  const workflow = createInterviewWorkflow();
  assert.deepEqual(workflow.confirmConsent({ consent_status: "granted", status: "in_progress" }), questionResponse("name"));
  assert.throws(() => workflow.confirmConsent({ consent_status: "granted", status: "in_progress" }), /invalid_workflow_step/);
  let persisted = 0;
  for (const next of INTERVIEW_STEPS.slice(2)) {
    const previous = workflow.step;
    const result = await workflow.recordAnswer(async () => {
      assert.equal(workflow.step, previous, "no advance before persistence");
      persisted++;
    }, () => true);
    assert.equal(result, next);
    assert.equal(workflow.step, next);
  }
  assert.equal(persisted, 9);
  assert.equal(workflow.canFinish(), true);
  await assert.rejects(workflow.recordAnswer(async () => assert.fail("already complete"), () => true), /invalid_workflow_step/);
});

test("overlapping answers persist and advance in order", async () => {
  const workflow = createInterviewWorkflow();
  workflow.confirmConsent({ consent_status: "granted", status: "in_progress" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const order: string[] = [];
  const first = workflow.recordAnswer(async () => { order.push("name"); await gate; }, () => true);
  const second = workflow.recordAnswer(async () => { order.push("email"); }, () => true);
  await Promise.resolve();
  assert.deepEqual(order, ["name"]);
  release();
  assert.deepEqual(await Promise.all([first, second]), ["email_optional", "target_role"]);
  assert.deepEqual(order, ["name", "email"]);
});

test("withdrawal during persistence prevents workflow advancement", async () => {
  const workflow = createInterviewWorkflow();
  workflow.confirmConsent({ consent_status: "granted", status: "in_progress" });
  let active = true;
  await workflow.recordAnswer(async () => { active = false; }, () => active);
  assert.equal(workflow.step, "name");
});
