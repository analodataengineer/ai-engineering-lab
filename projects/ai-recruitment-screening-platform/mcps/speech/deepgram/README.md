# Deepgram Speech Boundary

Deepgram is reserved as an alternate STT/TTS provider.

The MVP includes a stub provider in:

- `services/session-api/src/providers/deepgram.provider.ts`

Future implementation should satisfy the shared `SpeechProvider` interface without changing the web or engine layers.
