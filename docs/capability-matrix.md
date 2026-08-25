# Capability Matrix

Authority: current local Hermes source and `website/docs/user-guide/features/api-server.md`.

| Capability | State | Evidence |
|---|---|---|
| Health/readiness | VERIFIED_SOURCE | `/health`, `/health/detailed` |
| Session list/create/read/update/fork | VERIFIED_SOURCE | `/api/sessions/*` |
| Resume Desktop/gateway session | VERIFIED_SOURCE | session list + messages resolves canonical resume ID |
| Session SSE text | VERIFIED_SOURCE | `assistant.delta`, `run.completed` |
| Tool lifecycle | VERIFIED_SOURCE | `tool.started`, `tool.completed`, `tool.failed` |
| Runs reconnect/poll | VERIFIED_SOURCE | `/v1/runs/{id}` + `/events` |
| Stop | VERIFIED_SOURCE | `/v1/runs/{id}/stop` |
| Approval | VERIFIED_SOURCE | `/v1/runs/{id}/approval` choices once/session/always/deny |
| Model inventory/override | VERIFIED_SOURCE | `/api/model/options`; request model/provider/options |
| Inline image | VERIFIED_SOURCE | remote/data image accepted |
| File upload | UNSUPPORTED | API docs: uploaded files/input_file/file_id rejected |
| Audio upload/STT | UNSUPPORTED_API | no API upload route; messaging gateway supports voice separately |
| TTS response | PARTIAL | agent may return media/data URL; no dedicated Pocket acceptance yet |
| API runtime live | BLOCKED_RESTART | config written; gateway restart must run outside gateway |
| iPhone install | HUMAN_GATE | Safari Add to Home Screen required |

`VERIFIED_SOURCE` is not `LIVE_VERIFIED`. Promote only after the local API is restarted and real requests pass.
