import type { EmailProvider } from "./email-provider.js";
import { LogEmailProvider } from "./log-email.provider.js";

export function getEmailProvider(): EmailProvider {
  return new LogEmailProvider();
}
