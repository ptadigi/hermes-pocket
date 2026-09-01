# Hermes Pocket agent rules

- Source authority: the installed Hermes Agent API Server contract and the official API Server documentation.
- Never expose `API_SERVER_KEY` or `POCKET_AUTH_SECRET` to browser code, logs, docs, or tests.
- BFF is same-origin, minimal Node stdlib. No parallel agent loop or copied Hermes session store.
- TDD: failing behavior test before production code.
- 3D is decorative. DOM content remains accessible. Reduced-motion/static fallback mandatory.
- Completion requires live Hermes API probe, browser E2E, mobile screenshots, console/network review.
- No Hermes gateway restart without notifying owner first.
