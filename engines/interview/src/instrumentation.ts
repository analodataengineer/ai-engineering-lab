import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

const enabled = process.env.LANGFUSE_ENABLED === "true" &&
  Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);

export const telemetrySdk = enabled
  ? new NodeSDK({
      spanProcessors: [new LangfuseSpanProcessor({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL || undefined,
        environment: process.env.NODE_ENV ?? "development"
      })]
    })
  : null;

if (telemetrySdk) {
  try {
    telemetrySdk.start();
  } catch {
    console.warn(JSON.stringify({ event: "observability.failed", component: "interview-engine", errorCode: "otel_start_failed" }));
  }
}

process.once("SIGTERM", () => { void telemetrySdk?.shutdown(); });
process.once("SIGINT", () => { void telemetrySdk?.shutdown(); });
