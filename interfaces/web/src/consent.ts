export type ConsentDecision = "granted" | "declined" | "pending";

export function classifyConsent(text: string): ConsentDecision {
  const answer = text.trim().toLocaleLowerCase("es").replace(/[.!?]+$/u, "").trim();
  if (/^(?:no|negativo|no acepto|no consiento|prefiero no)$/u.test(answer)) return "declined";
  if (/^(?:acepto|s[ií]|s[ií],?\s+acepto|claro|de acuerdo)$/u.test(answer)) return "granted";
  return "pending";
}
