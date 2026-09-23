export type CreateRealtimeSessionInput = {
  sessionId: string;
  instructions: string;
  voice?: string;
};

export type CreateRealtimeSessionOutput = {
  provider: "openai" | "deepgram";
  sessionId: string;
  model?: string;
  clientSecret?: string;
  expiresAt?: number;
  raw?: unknown;
};

export interface SpeechProvider {
  name: "openai" | "deepgram";
  createRealtimeSession(
    input: CreateRealtimeSessionInput
  ): Promise<CreateRealtimeSessionOutput>;
}
