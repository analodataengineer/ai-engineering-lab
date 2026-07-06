import type { EmailProvider, SendEmailInput, SendEmailResult } from "./email-provider.js";

export class LogEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    console.log("[email:log]", {
      to: input.to,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey
    });

    return {
      provider: "log",
      status: "sent",
      messageId: `log_${input.idempotencyKey}`
    };
  }
}
