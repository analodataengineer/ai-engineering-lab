export function isAffirmativeConsent(text: string) {
  return /\b(si|sí|acepto|de acuerdo|continuar|consiento)\b/i.test(text);
}

export function isDeclinedConsent(text: string) {
  return /\b(no|rechazo|no acepto|prefiero no|cancelar)\b/i.test(text);
}
