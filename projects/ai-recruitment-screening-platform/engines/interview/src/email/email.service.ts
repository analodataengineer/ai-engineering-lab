import { query } from "../db.js";
import type { InterviewSession } from "../session.service.js";
import { getEmailProvider } from "./providers.js";
import { renderThankYouEmail } from "./thank-you-template.js";

const templateName = "thank_you_email";

export async function sendThankYouEmail(session: InterviewSession) {
  if (!session.candidate_email) {
    await query(
      `insert into interview_events (session_id, event_type, payload_json)
       values ($1, 'thank_you_email_skipped', $2::jsonb)`,
      [session.id, JSON.stringify({ reason: "missing_candidate_email" })]
    );
    return null;
  }

  const idempotencyKey = `${session.id}:${templateName}`;
  const existing = await query(
    `select * from interview_email_events
     where session_id = $1 and template_name = $2
     limit 1`,
    [session.id, templateName]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const provider = getEmailProvider();
  const email = renderThankYouEmail({
    candidateName: session.candidate_display_name
  });

  try {
    const result = await provider.send({
      to: session.candidate_email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey
    });

    const saved = await query(
      `insert into interview_email_events (
        session_id,
        template_name,
        recipient_email,
        provider,
        status,
        idempotency_key,
        message_id,
        error_message,
        sent_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, case when $5 = 'sent' then now() else null end)
      returning *`,
      [
        session.id,
        templateName,
        session.candidate_email,
        result.provider,
        result.status,
        idempotencyKey,
        result.messageId ?? null,
        result.error ?? null
      ]
    );
    return saved.rows[0];
  } catch (error) {
    const saved = await query(
      `insert into interview_email_events (
        session_id,
        template_name,
        recipient_email,
        provider,
        status,
        idempotency_key,
        error_message
      ) values ($1, $2, $3, $4, 'failed', $5, $6)
      on conflict (session_id, template_name) do nothing
      returning *`,
      [
        session.id,
        templateName,
        session.candidate_email,
        process.env.EMAIL_PROVIDER ?? "log",
        idempotencyKey,
        error instanceof Error ? error.message : "unknown_error"
      ]
    );
    return saved.rows[0] ?? null;
  }
}
