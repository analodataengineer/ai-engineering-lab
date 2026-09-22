import type {
  CreateRealtimeSessionInput,
  CreateRealtimeSessionOutput,
  SpeechProvider
} from "./speech-provider.js";

type RealtimeClientSecretBody = Record<string, unknown>;

const realtimeTools = [
  {
    type: "function",
    name: "finish_interview",
    description: "Signal that all required interview topics are covered and request application-level completion.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

function readClientSecret(body: RealtimeClientSecretBody) {
  const nestedSecret = body.client_secret as
    | { value?: string; expires_at?: number }
    | undefined;

  if (nestedSecret) {
    return {
      clientSecret: nestedSecret.value,
      expiresAt: nestedSecret.expires_at
    };
  }

  return {
    clientSecret: body.value as string | undefined,
    expiresAt: body.expires_at as number | undefined
  };
}

export class OpenAIRealtimeProvider implements SpeechProvider {
  name = "openai" as const;

  async createRealtimeSession(
    input: CreateRealtimeSessionInput
  ): Promise<CreateRealtimeSessionOutput> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required");
    }

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": `interview-session-${input.sessionId}`
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
          instructions: input.instructions,
          tools: realtimeTools,
          output_modalities: ["audio"],
          audio: {
            input: {
              transcription: {
                model: "gpt-4o-mini-transcribe",
                language: "es"
              },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "low",
                create_response: false,
                interrupt_response: false
              },
              noise_reduction: {
                type: "near_field"
              }
            },
            output: {
              voice: input.voice ?? "marin"
            }
          }
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI Realtime session failed: ${detail}`);
    }

    const body = (await response.json()) as RealtimeClientSecretBody;
    const { clientSecret, expiresAt } = readClientSecret(body);

    return {
      provider: this.name,
      sessionId: input.sessionId,
      clientSecret,
      expiresAt,
      raw: body
    };
  }
}
