# Kubernetes Preparation

Kubernetes manifests are intentionally not implemented in the MVP.

Deployable components for a later phase:

- `web`: static or Vite-built frontend service.
- `session-api`: backend API that owns voice provider credentials and ephemeral token creation.
- `interview-engine`: deterministic persistence and interview state service.
- `postgres`: preferably an external or managed database.
- `redis`: preferably an external or managed cache.
- Secrets: `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `VOICE_PROVIDER`.

Recommended future additions:

- Deployments and Services for `web`, `session-api`, and `interview-engine`.
- Ingress for public web/API routing.
- ExternalSecret or sealed secret strategy for provider keys.
- Migration job for PostgreSQL schema changes.
