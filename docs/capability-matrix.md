# Capability Matrix

Nguồn authority: source hiện tại của repository và tài liệu Hermes API Server chính thức.

| Capability | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Health endpoint Pocket | TEST_VERIFIED | `GET /pocket/health`, integration test |
| Session list/create/read/fork | SOURCE_VERIFIED | Hermes Sessions REST |
| Resume canonical session | SOURCE_VERIFIED | session ID + messages từ Hermes |
| Session SSE text/tool lifecycle | SOURCE_VERIFIED | `assistant.delta`, tool events, completion |
| Run status/reconnect/stop/approval | SOURCE_VERIFIED | `/v1/runs/*` |
| Model inventory/override | SOURCE_VERIFIED | `/api/model/options`, session model route |
| Multi-profile multiplex | TEST_VERIFIED | profile registry/routing tests; một shared listener |
| Runtime green/red indicator | LIVE_VERIFIED_LOCAL | authority snapshot + prior mobile QA; fail-closed khi stale |
| Pending text queue Pocket/Desktop | TEST_VERIFIED | CAS, lease, concurrent append, CRUD tests |
| Gửi ảnh điện thoại → Hermes | LIVE_TRANSPORT_VERIFIED | Hermes log nhận `[1 image]`, materialize PNG 42,1 KB và gọi vision; lượt model bị 429 quota, không phải lỗi transport |
| Hiển thị `image_url` / Markdown image | TEST_VERIFIED | `messageParts` tests |
| Hiển thị `MEDIA:<local path>` | LIVE_HTTP_VERIFIED | HTTPS 8443 trả đúng `image/png`, 283.701 byte, PNG signature hợp lệ; DOM/mobile còn human gate |
| Ảnh hai chiều trên iPhone bản cuối | HUMAN_LIVE_GATE | cần user-visible mobile acceptance trên bundle cuối |
| File upload tùy ý | UNSUPPORTED | Hermes API Server từ chối `file`, `input_file`, `file_id` |
| Shared queue attachment | UNSUPPORTED | attachment giữ tại client nguồn |
| TTS/audio upload | PARTIAL | không có Pocket upload route chuyên dụng |
| PWA Add to Home Screen | HUMAN_GATE | thao tác Safari/iOS |
| Windows startup | IMPLEMENTED | Startup shortcut qua `npm run startup:install` |
| Tailscale Funnel | IMPLEMENTED_OPT_IN | chỉ bật khi `POCKET_ENABLE_FUNNEL=true` |

## Cách đọc trạng thái

- `SOURCE_VERIFIED`: contract có trong source/docs, chưa khẳng định UI live.
- `TEST_VERIFIED`: test tự động chạy qua hành vi liên quan.
- `LIVE_VERIFIED_LOCAL`: đã có runtime/UI evidence trên môi trường phát triển, nhưng không đại diện mọi máy.
- `LIVE_TRANSPORT_VERIFIED`: dữ liệu đã đi xuyên qua runtime thật tới downstream processor; không đồng nghĩa provider đã trả kết quả.
- `LIVE_HTTP_VERIFIED`: endpoint live trả đúng payload/headers; không đồng nghĩa đã nghiệm thu pixel trên thiết bị.
- `HUMAN_LIVE_GATE`: cần người dùng xác nhận trên thiết bị thật.
- `UNSUPPORTED`: ngoài contract hiện tại, không được mô tả như đã có.
