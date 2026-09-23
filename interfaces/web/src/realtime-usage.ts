export type RealtimeUsage = {
  responseId?: string;
  status?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputUncachedTokens?: number;
  inputCachedTokens?: number;
  inputTextTokens?: number;
  inputAudioTokens?: number;
  inputTextCachedTokens?: number;
  inputAudioCachedTokens?: number;
  inputTextUncachedTokens?: number;
  inputAudioUncachedTokens?: number;
  outputTextTokens?: number;
  outputAudioTokens?: number;
};

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function optionalNumber(value: unknown): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  return nonNegativeNumber(value) ? value : null;
}

/** Extracts only operational usage fields from a Realtime response.done event. */
export function extractRealtimeUsage(payload: unknown): RealtimeUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const event = payload as Record<string, unknown>;
  const response = event.response;
  if (!response || typeof response !== "object") return null;
  const responseObject = response as Record<string, unknown>;
  const usage = responseObject.usage;
  if (!usage || typeof usage !== "object") return null;
  const usageObject = usage as Record<string, unknown>;

  const inputTokens = optionalNumber(usageObject.input_tokens);
  const outputTokens = optionalNumber(usageObject.output_tokens);
  const totalTokens = optionalNumber(usageObject.total_tokens);
  if (inputTokens === null || outputTokens === null || totalTokens === null) return null;
  if (inputTokens === undefined && outputTokens === undefined) return null;

  const inputDetails = usageObject.input_token_details;
  const outputDetails = usageObject.output_token_details;
  const inputDetailObject = inputDetails && typeof inputDetails === "object"
    ? inputDetails as Record<string, unknown> : {};
  const outputDetailObject = outputDetails && typeof outputDetails === "object"
    ? outputDetails as Record<string, unknown> : {};
  const cachedTokens = optionalNumber(inputDetailObject.cached_tokens);
  const inputTextTokens = optionalNumber(inputDetailObject.text_tokens);
  const inputAudioTokens = optionalNumber(inputDetailObject.audio_tokens);
  const outputTextTokens = optionalNumber(outputDetailObject.text_tokens);
  const outputAudioTokens = optionalNumber(outputDetailObject.audio_tokens);
  if (cachedTokens === null || inputTextTokens === null || inputAudioTokens === null || outputTextTokens === null || outputAudioTokens === null) return null;
  if (cachedTokens !== undefined && inputTokens !== undefined && cachedTokens > inputTokens) return null;

  const cachedDetails = inputDetailObject.cached_tokens_details;
  const cachedDetailObject = cachedDetails && typeof cachedDetails === "object"
    ? cachedDetails as Record<string, unknown> : null;
  const cachedTextTokens = cachedDetailObject ? optionalNumber(cachedDetailObject.text_tokens) : undefined;
  const cachedAudioTokens = cachedDetailObject ? optionalNumber(cachedDetailObject.audio_tokens) : undefined;
  if (cachedTextTokens === null || cachedAudioTokens === null) return null;
  const cachedDetailsConsistent = cachedTokens === undefined || cachedTextTokens === undefined || cachedAudioTokens === undefined
    || cachedTextTokens + cachedAudioTokens === cachedTokens;


  const inputBreakdownConsistent = inputTokens === undefined || inputTextTokens === undefined || inputAudioTokens === undefined
    || inputTextTokens + inputAudioTokens === inputTokens;
  const outputBreakdownConsistent = outputTokens === undefined || outputTextTokens === undefined || outputAudioTokens === undefined
    || outputTextTokens + outputAudioTokens === outputTokens;
  const hasCompleteCacheBreakdown = cachedTokens === undefined || cachedTokens === 0
    ? true
    : cachedTextTokens !== undefined && cachedAudioTokens !== undefined
      && cachedDetailsConsistent;
  const cacheFitsModalities = (cachedTextTokens === undefined || inputTextTokens === undefined || cachedTextTokens <= inputTextTokens)
    && (cachedAudioTokens === undefined || inputAudioTokens === undefined || cachedAudioTokens <= inputAudioTokens);

  const normalized: RealtimeUsage = {
    responseId: typeof responseObject.id === "string" ? responseObject.id : undefined,
    status: typeof responseObject.status === "string" ? responseObject.status : undefined,
    inputTokens,
    outputTokens,
    totalTokens,
    inputUncachedTokens: inputTokens === undefined ? undefined : inputTokens - (cachedTokens ?? 0),
    inputCachedTokens: cachedTokens ?? 0,
    ...(inputTextTokens === undefined ? {} : { inputTextTokens }),
    ...(inputAudioTokens === undefined ? {} : { inputAudioTokens }),
    ...(hasCompleteCacheBreakdown && cacheFitsModalities && inputBreakdownConsistent && inputTextTokens !== undefined
      ? { inputTextUncachedTokens: inputTextTokens - (cachedTextTokens ?? 0), inputTextCachedTokens: cachedTextTokens ?? 0 } : {}),
    ...(hasCompleteCacheBreakdown && cacheFitsModalities && inputBreakdownConsistent && inputAudioTokens !== undefined
      ? { inputAudioUncachedTokens: inputAudioTokens - (cachedAudioTokens ?? 0), inputAudioCachedTokens: cachedAudioTokens ?? 0 } : {}),
    ...(outputBreakdownConsistent && outputTextTokens !== undefined ? { outputTextTokens } : {}),
    ...(outputBreakdownConsistent && outputAudioTokens !== undefined ? { outputAudioTokens } : {})
  };
  return normalized;
}
