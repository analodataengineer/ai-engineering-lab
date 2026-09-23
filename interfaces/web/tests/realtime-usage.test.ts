import test from "node:test";
import assert from "node:assert/strict";
import { extractRealtimeUsage } from "../src/realtime-usage";

const responseDone = (usage: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  type: "response.done",
  response: {
    id: "resp_123",
    status: "completed",
    usage,
    output: [{ type: "audio", transcript: "candidate content must not be captured" }],
    ...extra
  }
});

test("extracts text/audio usage and mutually exclusive cached buckets", () => {
  const result = extractRealtimeUsage(responseDone({
    input_tokens: 100,
    output_tokens: 25,
    total_tokens: 125,
    input_token_details: {
      text_tokens: 90, audio_tokens: 10, cached_tokens: 30,
      cached_tokens_details: { text_tokens: 20, audio_tokens: 10 }
    },
    output_token_details: { text_tokens: 20, audio_tokens: 5 }
  }));

  assert.deepEqual(result, {
    responseId: "resp_123",
    status: "completed",
    inputTokens: 100,
    outputTokens: 25,
    totalTokens: 125,
    inputUncachedTokens: 70,
    inputCachedTokens: 30,
    inputTextTokens: 90,
    inputAudioTokens: 10,
    inputTextUncachedTokens: 70,
    inputTextCachedTokens: 20,
    inputAudioUncachedTokens: 0,
    inputAudioCachedTokens: 10,
    outputTextTokens: 20,
    outputAudioTokens: 5
  });
});

test("text-only and audio-only usage produce zero buckets for the absent modality", () => {
  const text = extractRealtimeUsage(responseDone({
    input_tokens: 10, output_tokens: 4, total_tokens: 14,
    input_token_details: { text_tokens: 10, audio_tokens: 0, cached_tokens: 0 },
    output_token_details: { text_tokens: 4, audio_tokens: 0 }
  }));
  assert.equal(text?.inputTextUncachedTokens, 10);
  assert.equal(text?.inputAudioUncachedTokens, 0);

  const audio = extractRealtimeUsage(responseDone({
    input_tokens: 10, output_tokens: 4, total_tokens: 14,
    input_token_details: { text_tokens: 0, audio_tokens: 10, cached_tokens: 0 },
    output_token_details: { text_tokens: 0, audio_tokens: 4 }
  }));
  assert.equal(audio?.inputAudioUncachedTokens, 10);
  assert.equal(audio?.outputAudioTokens, 4);
});

test("preserves aggregate usage when cached tokens lack modality details", () => {
  const result = extractRealtimeUsage(responseDone({
    input_tokens: 100, output_tokens: 25, total_tokens: 125,
    input_token_details: { text_tokens: 90, audio_tokens: 10, cached_tokens: 30 },
    output_token_details: { text_tokens: 20, audio_tokens: 5 }
  }));
  assert.equal(result?.inputUncachedTokens, 70);
  assert.equal(result?.inputCachedTokens, 30);
  assert.equal(result?.inputTextUncachedTokens, undefined);
  assert.equal(result?.inputAudioCachedTokens, undefined);
});

test("preserves the validated runtime aggregate totals", () => {
  const result = extractRealtimeUsage(responseDone({
    input_tokens: 308, output_tokens: 187, total_tokens: 495,
    input_token_details: { text_tokens: 151, audio_tokens: 157, cached_tokens: 0 },
    output_token_details: { text_tokens: 43, audio_tokens: 144 }
  }));
  assert.equal(result?.inputTokens, 308);
  assert.equal(result?.outputTokens, 187);
  assert.equal(result?.totalTokens, 495);
  assert.equal(result?.inputTextUncachedTokens, 151);
  assert.equal(result?.inputAudioUncachedTokens, 157);
  assert.equal(result?.outputTextTokens, 43);
  assert.equal(result?.outputAudioTokens, 144);
});

test("rejects negative, malformed, and inconsistent usage", () => {
  assert.equal(extractRealtimeUsage(responseDone({ input_tokens: -1, output_tokens: 2, total_tokens: 1 })), null);
  assert.equal(extractRealtimeUsage(responseDone({ input_tokens: 10, output_tokens: 2, total_tokens: 12, input_token_details: { cached_tokens: 11 } })), null);
  const inconsistentCache = extractRealtimeUsage(responseDone({ input_tokens: 10, output_tokens: 2, total_tokens: 12, input_token_details: { text_tokens: 8, audio_tokens: 2, cached_tokens: 4, cached_tokens_details: { text_tokens: 5, audio_tokens: 0 } } }));
  assert.equal(inconsistentCache?.inputTokens, 10);
  assert.equal(inconsistentCache?.inputTextUncachedTokens, undefined);
  const inconsistentTotal = extractRealtimeUsage(responseDone({ input_tokens: 10, output_tokens: 2, total_tokens: 13 }));
  assert.equal(inconsistentTotal?.totalTokens, 13);
  const inconsistentBreakdown = extractRealtimeUsage(responseDone({ input_tokens: 10, output_tokens: 2, total_tokens: 12, input_token_details: { text_tokens: 8, audio_tokens: 1, cached_tokens: 0 } }));
  assert.equal(inconsistentBreakdown?.inputTextTokens, 8);
  assert.equal(inconsistentBreakdown?.inputTextUncachedTokens, undefined);
  assert.equal(extractRealtimeUsage(responseDone({ input_tokens: "10", output_tokens: 2, total_tokens: 12 })), null);
});

test("does not propagate response output or transcript content", () => {
  const result = extractRealtimeUsage(responseDone({ input_tokens: 1, output_tokens: 2, total_tokens: 3 }));
  assert.deepEqual(result, {
    responseId: "resp_123",
    status: "completed",
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
    inputUncachedTokens: 1,
    inputCachedTokens: 0
  });
  assert.equal(JSON.stringify(result).includes("candidate content"), false);
});
