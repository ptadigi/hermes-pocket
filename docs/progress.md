# Trạng thái dự án

Tài liệu này chỉ ghi trạng thái hiện tại; không dùng PID, hostname hoặc credential môi trường phát triển làm bằng chứng phát hành.

## Đã triển khai

- PWA mobile-first + same-origin BFF.
- Canonical Hermes sessions và transcript.
- Streaming assistant/tool lifecycle.
- Settings authority với secret redaction.
- Multi-profile discovery/routing qua shared gateway listener.
- Runtime status fail-closed.
- Shared pending text queue với CAS/lease.
- Inline image inbound và image rendering outbound.
- Authenticated local `MEDIA:` route với root allowlist.
- PWA icons/manifest/service worker.
- Windows startup launcher.
- Tailscale Funnel opt-in với cổng cấu hình riêng.
- Community README, security policy, contributing guide, MIT license và CI.

## Gate phát hành

- `npm ci` trên cây sạch.
- `npm run check` trên bytes cuối.
- `npm audit` không có high/critical runtime vulnerability.
- Secret/path scan không có credential hoặc đường dẫn user-specific.
- Runtime health local và HTTPS route (nếu bật Funnel).
- Ảnh hai chiều hiển thị thật trên mobile bundle cuối.

## Bằng chứng ảnh hai chiều — 2026-08-31

- Inbound: Pocket/BFF gửi content multimodal; Hermes log ghi `[1 image]`, tạo PNG tạm 42,1 KB và bắt đầu vision processing.
- Provider: vision không hoàn tất vì model được cấu hình trả 429 quota và Hermes chờ retry; đây không phải mất ảnh ở Pocket.
- Outbound: authenticated `GET /pocket/media` qua HTTPS 8443 trả `image/png`, 283.701 byte, signature PNG hợp lệ.
- Parser/render: test bao phủ `image_url`, Markdown image và `MEDIA:` kể cả Windows path có khoảng trắng.
- Mobile pixel acceptance: chưa chạy vì Chrome người dùng đang mở; tránh khởi chạy/kill CDP trái quy tắc an toàn.

## Human gates

- Safari Add to Home Screen.
- Xác nhận icon PWA sau khi xóa/cài lại nếu iOS giữ cache.
- Xác nhận ảnh inbound/outbound trên thiết bị thật.
