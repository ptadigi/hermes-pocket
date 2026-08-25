# Architecture

## Decision

**PWA + same-origin BFF.** Direct browser-to-Hermes rejected because it requires a reusable bearer token in JavaScript-accessible storage or memory. Capacitor deferred until PWA live acceptance.

## Runtime

- Hermes API Server: official `gateway/platforms/api_server.py`, loopback `127.0.0.1:8642`.
- Pocket BFF: Node stdlib, loopback `127.0.0.1:9999`.
- HTTPS: Tailscale Serve proxies privately within the tailnet to Pocket BFF. No new public listening port. Existing Funnel is public and must be replaced at the delivery gate.
- State: canonical Hermes `state.db`; Pocket stores no transcript or memory.

## Authentication

- Owner enters Pocket password.
- BFF issues signed HttpOnly Secure SameSite=Strict session cookie.
- Separate CSRF cookie echoed in `X-CSRF-Token` for mutations.
- BFF injects Hermes bearer key server-side.
- Proxy route allowlist blocks jobs, raw files, arbitrary paths and provider endpoints not needed by UI.

## Session path

`GET/POST /api/sessions` → list/create canonical session.

`GET /api/sessions/{id}/messages` → resume canonical messages.

`POST /api/sessions/{id}/chat/stream` → SSE assistant/tool lifecycle.

`POST /v1/runs` + events/status/approval/stop → detachable long-run control when UI needs it.

## Deliberate limits

- No duplicate agent loop.
- No copied session DB.
- No arbitrary file upload: current Hermes API explicitly supports inline images only.
- No service worker caching API or private transcript payloads.
