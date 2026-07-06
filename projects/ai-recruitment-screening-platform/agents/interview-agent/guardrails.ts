const sensitiveTopics = [
  "edad",
  "fecha de nacimiento",
  "salud",
  "religión",
  "nacionalidad",
  "estado civil",
  "embarazo",
  "hijos",
  "familia",
  "discapacidad",
  "orientación política",
  "orientación sexual"
];

const hiringDecisionTerms = [
  "aprobado",
  "rechazado",
  "descartado",
  "seleccionado",
  "puntaje",
  "score",
  "calificación final"
];

export function containsSensitiveTopic(text: string) {
  const normalized = text.toLowerCase();
  return sensitiveTopics.some((topic) => normalized.includes(topic));
}

export function containsHiringDecision(text: string) {
  const normalized = text.toLowerCase();
  return hiringDecisionTerms.some((term) => normalized.includes(term));
}

export function validateAgentUtterance(text: string) {
  const violations: string[] = [];
  if (containsSensitiveTopic(text)) {
    violations.push("sensitive_topic");
  }
  if (containsHiringDecision(text)) {
    violations.push("hiring_decision");
  }
  const questionCount = (text.match(/\?/g) ?? []).length;
  if (questionCount > 1) {
    violations.push("multiple_questions");
  }
  return { ok: violations.length === 0, violations };
}

export const safeRedirectMessage =
  "Prefiero mantener la entrevista enfocada en aspectos laborales del puesto. Sigamos con experiencia, herramientas o disponibilidad.";
