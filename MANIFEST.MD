# Instructions for Codex

## General rules

- Do not rewrite the architecture unless explicitly requested.
- Prefer minimal, safe, high-confidence changes.
- Before editing files, explain the plan.
- After editing files, summarize the diff and mention affected files.
- Do not invent environment variables, endpoints, ports, tables, or services.
- If something is unclear, inspect the repository before assuming.

## Backend rules

- Check API contracts, schemas, migrations, persistence, idempotency, events, and Docker/Compose wiring.
- Do not modify database migrations casually.
- Do not remove existing behavior unless the task explicitly asks for it.

## Agent/project rules

- Agents must act through declared tools, skills, routines, and engines.
- Engines are deterministic sources of rules and persistence.
- Do not move business logic into the wrong layer.
- Keep changes aligned with the existing architecture.

## Review behavior

When reviewing code, report:
- Bugs or regressions.
- Security risks.
- Missing tests.
- Broken Docker/Compose configuration.
- Risky schema, API, or event-flow changes.
- Minimal suggested fix.