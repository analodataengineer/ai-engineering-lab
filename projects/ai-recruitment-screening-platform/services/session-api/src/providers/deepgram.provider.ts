import type {
  CreateRealtimeSessionInput,
  CreateRealtimeSessionOutput,
  SpeechProvider
} from "./speech-provider.js";

export class DeepgramProvider implements SpeechProvider {
  name = "deepgram" as const;

  async createRealtimeSession(
    input: CreateRealtimeSessionInput
  ): Promise<CreateRealtimeSessionOutput> {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error("DEEPGRAM_API_KEY is required");
    }

    return {
      provider: this.name,
      sessionId: input.sessionId,
      raw: {
        status: "stub",
        message: "Deepgram adapter boundary is reserved for a future STT/TTS implementation."
      }
    };
  }
}
