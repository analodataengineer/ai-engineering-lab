export type ConsentIntent = "granted" | "declined" | "stop_requested" | "pending";
export type ConsentDecision = ConsentIntent;

function normalizeConsentText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[¿?¡!.,;:]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

// Whole-answer patterns: continuation/termination verbs with bounded interview
// complements. Other negative preferences must not end the session.
const withdrawalPatterns = [
  /^(?:no )?(?:ya )?no quiero (?:continuar|seguir)(?: con (?:la entrevista|la conversacion|esto))?$/u,
  /^prefiero no (?:continuar|seguir)(?: con (?:la entrevista|la conversacion|esto))?$/u,
  /^(?:quiero|prefiero) (?:terminar|finalizar|cancelar)(?: la (?:entrevista|conversacion))?$/u,
  /^(?:quiero|prefiero) (?:detener|parar) la (?:entrevista|conversacion)$/u,
  /^(?:quiero|prefiero) dejarlo aca$/u,
  /^hasta aca(?: llego)?$/u,
  /^dejemoslo aca$/u
];

export function classifyConsent(text: string): ConsentIntent {
  const answer = normalizeConsentText(text);
  if (/^(?:no|negativo|rechazo|no acepto|no consiento|prefiero no|no le doy consentimiento|no doy mi consentimiento|no presto mi consentimiento|no autorizo|no quiero dar mi consentimiento|no estoy de acuerdo)$/u.test(answer)) {
    return "declined";
  }
  const withdrawalAnswer = answer.replace(/(?: (?:gracias|por favor)){1,2}$/u, "");
  if (withdrawalPatterns.some((pattern) => pattern.test(withdrawalAnswer))) {
    return "stop_requested";
  }
  if (/^(?:acepto|si|si acepto|si estoy de acuerdo|si doy mi consentimiento|si quiero continuar|claro|claro acepto|claro que si|de acuerdo|de acuerdo acepto|no tengo problema acepto)$/u.test(answer)) {
    return "granted";
  }
  return "pending";
}
