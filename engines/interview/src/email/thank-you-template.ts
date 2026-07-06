export function renderThankYouEmail(input: { candidateName?: string | null }) {
  const greeting = input.candidateName ? `Hola ${input.candidateName},` : "Hola,";

  return {
    subject: "Gracias por completar tu entrevista inicial",
    text: `${greeting}

Gracias por completar la entrevista inicial.

Tu información fue registrada correctamente y será revisada por el equipo de recruiting.

Este mensaje no representa una decisión final del proceso.

Saludos,
Equipo de Recruiting`,
    html: `<p>${greeting}</p>
<p>Gracias por completar la entrevista inicial.</p>
<p>Tu información fue registrada correctamente y será revisada por el equipo de recruiting.</p>
<p><strong>Este mensaje no representa una decisión final del proceso.</strong></p>
<p>Saludos,<br />Equipo de Recruiting</p>`
  };
}
