import { propagateAttributes, startObservation, type LangfuseEvent, type LangfuseSpan } from "@langfuse/tracing";

export type SafeObservabilityFields = {
  sessionId: string;
  component?: string;
  step?: string;
  role?: "candidate" | "agent" | "system";
  status?: string;
  consentStatus?: string;
  sessionStatus?: string;
  operation?: string;
  errorCode?: string;
  httpStatus?: number;
  durationMs?: number;
  success?: boolean;
};

export type ObservationHandle = {
  end(fields?: Partial<SafeObservabilityFields>): void;
  recordError(fields: Pick<SafeObservabilityFields, "errorCode" | "httpStatus"> & { safeMessage?: string }): void;
};

const allowedFields = new Set<keyof SafeObservabilityFields>([
  "sessionId", "component", "step", "role", "status", "consentStatus", "sessionStatus",
  "operation", "errorCode", "httpStatus", "durationMs", "success"
]);

function safeFields(input: SafeObservabilityFields): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = { sessionId: input.sessionId };
  for (const [key, value] of Object.entries(input)) {
    if (key === "sessionId" || !allowedFields.has(key as keyof SafeObservabilityFields)) continue;
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) continue;
    if (typeof value === "string" && value.length > 200) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") output[key] = value;
  }
  return output;
}

function jsonLog(name: string, fields: Record<string, string | number | boolean>) {
  console.log(JSON.stringify({ event: name, ...fields }));
}

export type Observability = {
  enabled: boolean;
  event(name: string, fields: SafeObservabilityFields): void;
  startSpan(name: string, fields: SafeObservabilityFields): ObservationHandle;
  recordError(name: string, fields: SafeObservabilityFields & { safeMessage?: string }): void;
};

export function createObservability(options: {
  enabled?: boolean;
  logger?: (name: string, fields: Record<string, string | number | boolean>) => void;
} = {}): Observability {
  const enabled = options.enabled ?? (
    process.env.LANGFUSE_ENABLED === "true" &&
    Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)
  );
  const log = options.logger ?? jsonLog;
  const observe = (name: string, fields: SafeObservabilityFields, type: "event" | "span"): LangfuseEvent | LangfuseSpan | null => {
    const attributes = safeFields(fields);
    if (!enabled) {
      log(name, attributes);
      return null;
    }
    try {
      return propagateAttributes({ sessionId: fields.sessionId }, () => type === "event"
        ? startObservation(name, { metadata: attributes }, { asType: "event" })
        : startObservation(name, { metadata: attributes }));
    } catch {
      console.warn(JSON.stringify({ event: "observability.failed", component: "interview-engine", operation: name, errorCode: "observability_unavailable" }));
      log(name, attributes);
      return null;
    }
  };

  return {
    enabled,
    event(name, fields) {
      const observation = observe(name, fields, "event");
      void observation;
    },
    startSpan(name, fields) {
      const startedAt = performance.now();
      const observation = enabled ? observe(name, fields, "span") : null;
      return {
        end(extra = {}) {
          const finalFields = safeFields({ ...fields, ...extra, durationMs: extra.durationMs ?? performance.now() - startedAt });
          if (observation?.type === "span") (observation as LangfuseSpan).update({ metadata: finalFields }).end();
          else log(name, finalFields);
        },
        recordError(errorFields) {
          const finalFields = safeFields({ ...fields, ...errorFields });
          if (observation?.type === "span") (observation as LangfuseSpan).update({ level: "ERROR", statusMessage: errorFields.safeMessage ?? "operation_failed", metadata: finalFields }).end();
          else log(`${name}.failed`, finalFields);
        }
      };
    },
    recordError(name, fields) {
      const { safeMessage, ...observabilityFields } = fields;
      const observation = enabled ? observe(name, observabilityFields, "span") : null;
      if (!enabled) {
        log(`${name}.failed`, safeFields(observabilityFields));
        return;
      }
      if (observation?.type === "span") (observation as LangfuseSpan).update({ level: "ERROR", statusMessage: safeMessage ?? "operation_failed" }).end();
      else if (observation === null) log(`${name}.failed`, safeFields(observabilityFields));
    }
  };
}

export const observability = createObservability();
