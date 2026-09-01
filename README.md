# Hermes Pocket

Hermes Pocket là PWA mobile-first để dùng **Hermes Agent** trên iPhone hoặc trình duyệt di động. Ứng dụng kết nối vào API Server chính thức của Hermes qua một BFF cùng origin, vì vậy khóa `API_SERVER_KEY` không bao giờ đi vào JavaScript phía trình duyệt.

> Đây là dự án cộng đồng độc lập, không phải sản phẩm chính thức của Nous Research.

## Điểm nổi bật

- Dùng chung session, transcript, model và profile với Hermes Desktop/Gateway.
- Chat streaming, tiến trình tool, approval, stop và tiếp tục session.
- Chọn nhiều Hermes profile qua gateway multiplex `/p/<profile>/`.
- Gửi ảnh inline từ điện thoại và hiển thị ảnh do agent trả về.
- Hiển thị ảnh local qua `MEDIA:<path>` bằng route có allowlist và kiểm tra real path.
- Hàng đợi tin nhắn dùng chung Pocket/Desktop cho nội dung text.
- PWA cài lên Home Screen, hỗ trợ safe area iPhone và chế độ standalone.
- BFF chỉ bind loopback; HTTPS bên ngoài là tùy chọn qua Tailscale Funnel.

## Kiến trúc

```text
iPhone / mobile browser
        │ HTTPS (Tailscale, tùy chọn)
        ▼
Hermes Pocket BFF 127.0.0.1:9999
        │ Bearer key chỉ tồn tại server-side
        ▼
Hermes API Server 127.0.0.1:8642
        ▼
Hermes Agent + canonical state.db
```

Pocket không chạy agent loop riêng và không sao chép session database. Xem chi tiết tại [`docs/architecture.md`](docs/architecture.md).

## Yêu cầu

- Hermes Agent đã cài và cấu hình model/provider.
- Node.js 20.19+ hoặc 22.12+ và npm; khuyến nghị Node 22 LTS.
- Windows 10/11 là môi trường được kiểm thử chính.
- Tailscale chỉ cần khi muốn truy cập Pocket từ điện thoại qua HTTPS.

Tài liệu Hermes API Server chính thức: <https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/>

## Cài nhanh

### 1. Clone và cài dependency

```bash
git clone https://github.com/ptadigi/hermes-pocket.git
cd hermes-pocket
npm ci
```

### 2. Tạo cấu hình local

```bash
npm run setup
```

Lệnh này tạo `.env.local` từ `.env.example` và tự sinh `POCKET_AUTH_SECRET`. Sau đó mở `.env.local` và điền:

```dotenv
POCKET_PASSWORD=<choose-a-strong-owner-password>
API_SERVER_KEY=khoa-api-server-cua-profile-default
HERMES_HOME=%LOCALAPPDATA%\hermes
```

Lấy đường dẫn file Hermes `.env` bằng:

```bash
hermes config env-path
```

Mở file đó, bật API Server cho profile `default` và đặt một key mạnh:

```dotenv
API_SERVER_ENABLED=true
API_SERVER_KEY=<generate-a-long-random-key>
```

Sao chép đúng key này sang `API_SERVER_KEY` trong `.env.local` của Pocket. Giữ CORS tắt; trình duyệt chỉ gọi BFF same-origin, không gọi Hermes trực tiếp.

Khởi động Hermes Gateway ở terminal riêng:

```bash
hermes gateway
```

Chỉ chuyển bước khi log có dòng tương đương:

```text
[API Server] API server listening on http://127.0.0.1:8642
```

Probe authenticated endpoint bằng đúng key vừa cấu hình:

```bash
curl -H "Authorization: Bearer <same-API_SERVER_KEY>" http://127.0.0.1:8642/api/sessions
```

Có thể dùng `hermes gateway install` rồi `hermes gateway start` nếu muốn chạy nền như service. Kiểm tra bằng `hermes gateway status`.

### 3. Build và kiểm tra

```bash
npm run check
```

### 4. Chạy

Chạy foreground:

```bash
npm start
```

Mở <http://127.0.0.1:9999> và đăng nhập bằng `POCKET_PASSWORD`.

Chạy nền trên Windows:

```bash
npm run start:background
npm run status
```

## Truy cập từ điện thoại bằng Tailscale

Pocket không tự public theo mặc định. Muốn bật Funnel, sửa `.env.local`:

```dotenv
POCKET_ENABLE_FUNNEL=true
POCKET_FUNNEL_PORT=8443
```

Sau đó chạy lại:

```bash
npm run start:background
```

Kiểm tra mapping:

```bash
tailscale funnel status
```

URL thường có dạng:

```text
https://<ten-may>.<tailnet>.ts.net:8443
```

Dùng cổng riêng nếu cổng 443 đang phục vụ ứng dụng khác. Ví dụ 443 cho một API khác và 8443 cho Pocket sẽ không ghi đè nhau.

`POCKET_ENABLE_FUNNEL=false` chỉ yêu cầu launcher không quản lý Funnel; nó không sửa hoặc thu hồi mapping đang tồn tại. Muốn tắt public access mà vẫn giữ Startup, chạy có chủ đích `tailscale funnel --https=<POCKET_FUNNEL_PORT> off`. `npm run startup:uninstall` cũng thu hồi riêng cổng Pocket trước khi gỡ shortcut; không reset các Funnel khác trên máy.

> Tailscale Funnel tạo endpoint công khai trên Internet. Hãy dùng mật khẩu Pocket mạnh. Nếu chỉ cần truy cập trong tailnet, cấu hình Tailscale Serve thay vì Funnel.

### Không dùng Tailscale? Dùng tunnel khác

Pocket BFF luôn nghe `127.0.0.1:9999`, nên bất kỳ reverse tunnel nào cũng dùng được. Đặt `POCKET_ENABLE_FUNNEL=false` để launcher không đụng Tailscale, rồi chạy tunnel ở tiến trình riêng, ví dụ Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:9999
```

hoặc ngrok:

```bash
ngrok http 9999
```

Chỉ expose cổng Pocket `9999`, không bao giờ expose Hermes API Server `8642`. Xem [`docs/operations.md`](docs/operations.md) để biết cấu hình named tunnel gắn domain riêng.

## Tự khởi động cùng Windows

```bash
npm run startup:install
```

Script tạo shortcut `Hermes-Pocket.cmd` trong Startup của user hiện tại. Nó gọi `scripts/start.mjs`, tự nạp `.env.local`, chạy BFF nền và chỉ bật Funnel khi `POCKET_ENABLE_FUNNEL=true`.

Gỡ startup và thu hồi đúng cổng Funnel của Pocket mà không xóa source hoặc cấu hình:

```bash
npm run startup:uninstall
```

## Ảnh hai chiều

### Điện thoại → Hermes

Pocket chuyển ảnh thành inline `data:image/...` và gửi cùng phần text theo contract multimodal của Hermes API Server.

### Hermes → điện thoại

Pocket hiển thị:

- `image_url` trong content multimodal;
- ảnh Markdown `![mô tả](https://...)`;
- tag `MEDIA:C:\duong-dan\anh.png` do agent trả về.

Ảnh local chỉ được phục vụ khi nằm trong `POCKET_MEDIA_ROOTS`. Ví dụ Windows:

```dotenv
POCKET_MEDIA_ROOTS=%LOCALAPPDATA%\hermes
```

Route media yêu cầu đăng nhập, chỉ cho phép PNG/JPEG/GIF/WebP/BMP và kiểm tra real path để chặn traversal. SVG local bị từ chối vì có thể chứa active content cùng origin. Chỉ thêm một thư mục khác khi thật sự cần; không mở toàn bộ `%USERPROFILE%` hoặc ổ đĩa.

## Nhiều profile

Gateway `default` là listener duy nhất trên 8642. Profile phụ dùng cùng listener qua `/p/<profile>/` và có `API_SERVER_KEY` riêng.

Không chạy nhiều gateway profile cùng bind 8642. Nếu profile `default` trống nhưng profile khác có session, xem [`docs/operations.md`](docs/operations.md).

## Scripts

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Vite + BFF watch mode trên loopback |
| `npm run build` | TypeScript + production bundle |
| `npm run typecheck` | Kiểm TypeScript |
| `npm test` | Chạy Node test suite |
| `npm run check` | Typecheck + test + build |
| `npm start` | Chạy production foreground, nạp `.env.local` |
| `npm run start:background` | Chạy production nền và bật Funnel nếu opt-in |
| `npm run status` | Kiểm tra BFF có phản hồi |
| `npm run startup:install` | Cài startup shortcut cho Windows |
| `npm run startup:uninstall` | Gỡ startup shortcut, giữ nguyên source/config |
| `npm run setup` | Tạo `.env.local` an toàn lần đầu |

## Bảo mật

- Không commit `.env.local`, log, session hoặc credential.
- BFF giữ Hermes bearer key server-side.
- Cookie đăng nhập HttpOnly, Secure, SameSite=Strict.
- Mutation yêu cầu CSRF token.
- Proxy chỉ cho phép route Hermes cần thiết.
- BFF và Hermes API Server nên bind loopback-only.
- Settings không có endpoint đọc plaintext secret.

Xem [`SECURITY.md`](SECURITY.md) trước khi expose ra Internet.

## Tài liệu

- [`docs/architecture.md`](docs/architecture.md) — kiến trúc và trust boundaries.
- [`docs/capability-matrix.md`](docs/capability-matrix.md) — capability đã kiểm chứng và giới hạn.
- [`docs/operations.md`](docs/operations.md) — vận hành, Tailscale và xử lý sự cố.
- [`docs/design-system.md`](docs/design-system.md) — design tokens và UX constraints.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — cách đóng góp.

## Giới hạn hiện tại

- Chỉ hỗ trợ ảnh inline; Hermes API Server không nhận file upload tùy ý.
- Hàng đợi chia sẻ giữa Desktop/Pocket chỉ đồng bộ text, không đồng bộ attachment local.
- iOS có thể cache icon PWA; cần xóa app khỏi Home Screen rồi Add to Home Screen lại khi icon thay đổi.
- Windows là nền tảng được kiểm thử chính; Linux/macOS cần bổ sung startup packaging.
- Nếu Hermes được cài với layout Python khác chuẩn Windows, đặt `HERMES_PYTHON` thành đường dẫn tuyệt đối tới Python của Hermes để dùng trang Settings.

## License

MIT — xem [`LICENSE`](LICENSE).
