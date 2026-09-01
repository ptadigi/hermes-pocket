# Kiến trúc Hermes Pocket

## Quyết định chính

Hermes Pocket dùng **PWA + same-origin BFF**. Trình duyệt không gọi trực tiếp Hermes API Server vì cách đó buộc bearer key tồn tại trong JavaScript-accessible memory/storage. BFF giữ key server-side, phát cookie đăng nhập HttpOnly và kiểm CSRF cho mutation.

## Sơ đồ runtime

```text
Mobile Safari / PWA
        │ HTTPS tùy chọn (Tailscale)
        ▼
Pocket BFF 127.0.0.1:9999
        │ Authorization: Bearer <server-side key>
        ▼
Hermes API Server 127.0.0.1:8642
        ▼
Hermes Agent + canonical state.db
```

- Hermes API Server là authority cho session, message, model, runs và SSE.
- Pocket không chạy agent loop, không sao chép transcript và không tạo memory store riêng.
- Service worker chỉ cache app shell; API, private transcript và media route không được cache công khai.

## Trust boundaries

### Browser

Browser chỉ giữ session cookie HttpOnly và CSRF cookie. Nó không biết `API_SERVER_KEY`, provider key hoặc credential Hermes.

### Pocket BFF

BFF:

- bind loopback mặc định;
- inject bearer key khi proxy;
- chỉ proxy các route nằm trong allowlist;
- bắt buộc CSRF cho mutation;
- trả settings đã redact;
- phục vụ local image từ allowlisted roots sau realpath validation.

### Tailscale

Public/private HTTPS là lớp ngoài BFF và phải opt-in. `POCKET_ENABLE_FUNNEL=false` là mặc định. Khi bật Funnel, nên dùng cổng riêng để không ghi đè dịch vụ khác trên cùng hostname.

## Profile multiplex

Một gateway `default` sở hữu listener API Server. Profile phụ dùng cùng listener qua `/p/<profile>/` với key riêng. Pocket khám phá profile từ `HERMES_HOME` và gửi `X-Pocket-Profile`; BFF resolve prefix/key tương ứng.

Không chạy nhiều gateway profile cùng bind một cổng API.

## Luồng session

- `GET/POST /api/sessions` — list/create canonical session.
- `GET /api/sessions/{id}/messages` — đọc transcript canonical.
- `POST /api/sessions/{id}/chat/stream` — streaming assistant/tool lifecycle.
- `/v1/runs/*` — status, events, approval và stop.
- `GET /pocket/runtime/sessions` — snapshot status đã giảm còn `id`, `session_key`, `status`.

Runtime snapshot fail-closed: thiếu hoặc quá hạn thì UI không được tự suy trạng thái xanh.

## Ảnh hai chiều

### Inbound

Pocket gửi text + `image_url` dạng data URL theo contract multimodal chính thức của Hermes API Server.

### Outbound

UI tách content thành text/image parts và hỗ trợ:

- multimodal `image_url`;
- Markdown image;
- `MEDIA:<local-path>` chuyển qua `/pocket/media?path=...`.

Media route yêu cầu đăng nhập, chỉ nhận extension ảnh và chỉ đọc file nằm dưới `POCKET_MEDIA_ROOTS` sau khi resolve real path.

## Shared queue

Pending text queue dùng file authority chung, có atomic replacement, inter-process lock, revision/CAS và owner lease. Attachment không được đưa vào queue chung vì path/data URL không portable giữa client.

## Giới hạn có chủ ý

- Không upload file tùy ý; Hermes API Server chỉ hỗ trợ inline image ở luồng này.
- Không expose raw filesystem hoặc arbitrary upstream route.
- Không bind BFF ra LAN/Internet trực tiếp.
- Không mặc định bật Funnel.
- Windows là môi trường được kiểm thử chính; startup packaging cho Linux/macOS chưa có.
