import { DeepgramProvider } from "./deepgram.provider.js";
import { OpenAIRealtimeProvider } from "./openai-realtime.provider.js";
import type { SpeechProvider } from "./speech-provider.js";

export function getSpeechProvider(): SpeechProvider {
  const provider = process.env.VOICE_PROVIDER ?? "openai";
  if (provider === "deepgram") {
    return new DeepgramProvider();
  }
  return new OpenAIRealtimeProvider();
}
