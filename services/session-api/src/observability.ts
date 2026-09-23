import { propagateAttributes, startObservation, type LangfuseEvent, type LangfuseGeneration, type LangfuseSpan } from "@langfuse/tracing";

export type SafeObservabilityFields = {
  sessionId: string;
  component?: string;
  provider?: string;
  model?: string;
  responseId?: string;
  responseStatus?: string;
  step?: string;
  state?: string;
  consentStatus?: string;
  sessionStatus?: string;
  classification?: "granted" | "declined" | "ambiguous" | "withdrawal";
  reason?: string;
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

export type RealtimeGenerationFields = {
  sessionId: string;
  responseId?: string;
  model?: string;
  responseStatus?: string;
  responseStartedAtMs?: number;
  responseCompletedAtMs?: number;
  durationMs?: number;
  inputTokens?: number;
  inputUncachedTokens?: number;
  inputCachedTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTextTokens?: number;
  inputAudioTokens?: number;
  inputTextCachedTokens?: number;
  inputAudioCachedTokens?: number;
  inputTextUncachedTokens?: number;
  inputAudioUncachedTokens?: number;
  outputTextTokens?: number;
  outputAudioTokens?: number;
};

/** Builds mutually-exclusive usage buckets without any content fields. */
export function buildRealtimeUsageDetails(fields: RealtimeGenerationFields): Record<string, number> | null {
  const inputUncached = fields.inputUncachedTokens ?? 0;
  const inputCached = fields.inputCachedTokens ?? 0;
  const aggregateInput = fields.inputTokens ?? inputUncached + inputCached;
  const output = fields.outputTokens ?? 0;
  if ([aggregateInput, inputUncached, inputCached, output].some((value) => !Number.isFinite(value) || value < 0)) return null;
  if (fields.inputTokens !== undefined && inputUncached + inputCached !== fields.inputTokens) return null;
  const hasInputPricingBuckets = [
    fields.inputTextUncachedTokens,
    fields.inputAudioUncachedTokens,
    fields.inputTextCachedTokens,
    fields.inputAudioCachedTokens
  ].every((value) => value !== undefined);
  const hasOutputPricingBuckets = fields.outputTextTokens !== undefined && fields.outputAudioTokens !== undefined;
  const usageDetails: Record<string, number> = {};
  if (hasInputPricingBuckets) {
    usageDetails.input_text_uncached = fields.inputTextUncachedTokens!;
    usageDetails.input_audio_uncached = fields.inputAudioUncachedTokens!;
    usageDetails.input_text_cached = fields.inputTextCachedTokens!;
    usageDetails.input_audio_cached = fields.inputAudioCachedTokens!;
  } else if (fields.inputTokens !== undefined || fields.inputUncachedTokens !== undefined) {
    usageDetails.input = inputUncached;
    if (inputCached > 0) usageDetails.input_cached = inputCached;
  }
  if (hasOutputPricingBuckets) {
    usageDetails.output_text = fields.outputTextTokens!;
    usageDetails.output_audio = fields.outputAudioTokens!;
  } else if (fields.outputTokens !== undefined) {
    usageDetails.output = output;
  }
  return Object.keys(usageDetails).length > 0 ? usageDetails : null;
}

const allowedFields = new Set<keyof SafeObservabilityFields>([
  "sessionId", "component", "provider", "model", "step", "state", "consentStatus",
  "sessionStatus", "classification", "reason", "operation", "errorCode", "httpStatus", "responseId", "responseStatus",
  "durationMs", "success"
]);

function safeFields(input: SafeObservabilityFields): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = { sessionId: input.sessionId };
  for (const [key, value] of Object.entries(input)) {
    if (key === "sessionId" || !allowedFields.has(key as keyof SafeObservabilityFields)) continue;
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) continue;
    if (typeof value === "string" && value.length > 200) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
    }
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
  generation(name: string, fields: RealtimeGenerationFields): void;
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
    } catch (error) {
      console.warn(JSON.stringify({ event: "observability.failed", component: "session-api", operation: name, errorCode: "observability_unavailable" }));
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
    },
    generation(name, fields) {
      const metadata: Record<string, string | number | boolean> = { sessionId: fields.sessionId };
      const metadataFields = ["responseId", "model", "responseStatus", "durationMs", "inputTextTokens", "inputAudioTokens", "outputTextTokens", "outputAudioTokens"] as const;
      for (const key of metadataFields) {
        const value = fields[key];
        if (value === undefined) continue;
        if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) return;
        if (typeof value === "string" && value.length > 200) return;
        if (typeof value === "string" || typeof value === "number") metadata[key] = value;
      }
      for (const [key, value] of [
        ["aggregateInputTokens", fields.inputTokens],
        ["aggregateOutputTokens", fields.outputTokens],
        ["aggregateTotalTokens", fields.totalTokens]
      ] as const) {
        if (value === undefined) continue;
        if (!Number.isInteger(value) || value < 0) return;
        metadata[key] = value;
      }
      const usageDetails = buildRealtimeUsageDetails(fields);
      if (!usageDetails) return;
      const inputUncached = fields.inputUncachedTokens ?? 0;
      const inputCached = fields.inputCachedTokens ?? 0;
      const output = fields.outputTokens ?? 0;
      const fallbackTotal = fields.totalTokens ?? (fields.inputTokens ?? inputUncached + inputCached) + output;
      const hasTimestamps = fields.responseStartedAtMs !== undefined && fields.responseCompletedAtMs !== undefined;
      if ((fields.responseStartedAtMs === undefined) !== (fields.responseCompletedAtMs === undefined)) return;
      const startTime = hasTimestamps ? new Date(fields.responseStartedAtMs!) : undefined;
      const endTime = hasTimestamps ? new Date(fields.responseCompletedAtMs!) : undefined;
      if (hasTimestamps && (!startTime || !endTime || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime.getTime() < startTime.getTime())) return;
      const fallbackFields: Record<string, string | number | boolean> = {
        ...metadata,
        inputUncachedTokens: inputUncached,
        inputCachedTokens: inputCached,
        outputTokens: output,
        totalTokens: fallbackTotal
      };
      if (!enabled) {
        log(name, fallbackFields);
        return;
      }
      try {
        const generation = propagateAttributes({ sessionId: fields.sessionId }, () => {
          return startObservation(name, {
            model: fields.model,
            usageDetails,
            metadata
          }, { asType: "generation", startTime });
        });
        (generation as LangfuseGeneration).end(endTime);
      } catch {
        console.warn(JSON.stringify({ event: "observability.failed", component: "session-api", operation: name, errorCode: "observability_unavailable" }));
        log(name, fallbackFields);
      }
    }
  };
}

export const observability = createObservability();
