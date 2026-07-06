# OpenAI Speech Boundary

OpenAI Realtime is the primary voice provider for the MVP.

The active implementation lives in:

- `services/session-api/src/providers/openai-realtime.provider.ts`

The provider creates ephemeral Realtime sessions from the backend so the browser never receives `OPENAI_API_KEY`.
