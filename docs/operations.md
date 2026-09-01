# Vận hành Hermes Pocket

## Cổng mặc định

| Thành phần | Địa chỉ | Quy tắc |
|---|---|---|
| Hermes API Server | `127.0.0.1:8642` | chỉ gateway `default` sở hữu listener |
| Pocket BFF | `127.0.0.1:9999` | luôn loopback-only |
| Pocket HTTPS | cổng cấu hình, ví dụ `8443` | Tailscale, chỉ khi opt-in |

## Kiểm tra nhanh

```bash
npm run status
curl http://127.0.0.1:9999/pocket/health
tailscale funnel status
```

Health hợp lệ trả JSON:

```json
{"status":"ok","service":"hermes-pocket"}
```

Máy cài mới phải bật API Server trong file do `hermes config env-path` trả về:

```dotenv
API_SERVER_ENABLED=true
API_SERVER_KEY=<same-key-as-Pocket-.env.local>
```

Chạy `hermes gateway run`, chờ API Server nghe tại `127.0.0.1:8642`, rồi probe `/api/sessions` với bearer key trước khi khởi động Pocket.

## Khởi động

Foreground:

```bash
npm start
```

Background:

```bash
npm run start:background
```

Launcher nền dùng cùng parser `.env.local` với foreground, chờ health JSON trước khi báo PID và không mở thêm process nếu Pocket đã chạy. Nếu BFF hoặc Funnel không sẵn sàng, lệnh trả lỗi và ghi chi tiết BFF vào `hermes-pocket.log`.

Tự chạy khi đăng nhập Windows:

```bash
npm run startup:install
```

Gỡ shortcut Startup và thu hồi riêng cổng Funnel của Pocket; không xóa source hoặc `.env.local`:

```bash
npm run startup:uninstall
```

## Tailscale

Funnel mặc định tắt. Bật trong `.env.local`:

```dotenv
POCKET_ENABLE_FUNNEL=true
POCKET_FUNNEL_PORT=8443
```

Sau đó chạy lại background launcher. Luôn kiểm tra mapping trước và sau:

```bash
tailscale funnel status
```

Nếu cổng 443 đã phục vụ ứng dụng khác, giữ ứng dụng đó ở 443 và đặt Pocket ở 8443 hoặc cổng Funnel được Tailscale hỗ trợ khác. Không dùng lệnh thiếu `--https=<port>` vì có thể ghi đè root mapping ngoài ý muốn.

Funnel là public Internet endpoint. Chỉ bật khi cần và dùng mật khẩu Pocket mạnh. Nếu chỉ dùng trong tailnet, ưu tiên Tailscale Serve.

`POCKET_ENABLE_FUNNEL=false` khiến launcher không quản lý Funnel và không thay đổi mapping đang tồn tại. Để tắt public access mà vẫn giữ Startup, chạy có chủ đích `tailscale funnel --https=<POCKET_FUNNEL_PORT> off`. Lệnh `npm run startup:uninstall` cũng thu hồi riêng cổng Pocket trước khi gỡ shortcut. Không dùng `tailscale funnel reset` vì lệnh đó xóa cả mapping của dịch vụ khác.

## Tunnel thay thế (không dùng Tailscale)

Pocket BFF luôn nghe loopback `127.0.0.1:9999`. Bất kỳ reverse tunnel nào forward về địa chỉ đó đều dùng được; Tailscale Funnel chỉ là một lựa chọn. Trong mọi trường hợp, đặt `POCKET_ENABLE_FUNNEL=false` để launcher không tự đụng Tailscale, rồi chạy tunnel ở tiến trình riêng.

### Cloudflare Tunnel (cloudflared)

Dùng thử nhanh, không cần tài khoản:

```bash
cloudflared tunnel --url http://127.0.0.1:9999
```

Lệnh in ra một URL `https://<random>.trycloudflare.com` trỏ thẳng vào Pocket. Dùng lâu dài thì tạo named tunnel gắn domain riêng:

```bash
cloudflared tunnel login
cloudflared tunnel create hermes-pocket
cloudflared tunnel route dns hermes-pocket pocket.example.com
cloudflared tunnel run --url http://127.0.0.1:9999 hermes-pocket
```

### ngrok

```bash
ngrok http 9999
```

### Bảo mật khi mở ra Internet

- Bất kỳ tunnel nào cũng là public endpoint: bắt buộc `POCKET_PASSWORD` mạnh.
- Chỉ giữ tunnel chạy khi cần; tắt khi không dùng.
- Không expose cổng Hermes API Server `8642` ra ngoài — chỉ expose Pocket `9999`.
- Cookie phiên có cờ `Secure`, nên truy cập từ xa phải qua HTTPS (các tunnel trên đều cấp HTTPS).

## Profile default bị trống

Triệu chứng: Pocket mở được nhưng `default` không có session, trong khi profile phụ vẫn có.

Kiểm tra:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*gateway run*' } |
  Select-Object ProcessId,CommandLine
```

Nguyên nhân phổ biến là nhiều gateway profile cùng bind 8642. Chỉ chạy một listener `default`; profile phụ đi qua `/p/<profile>/` với key riêng. Không thêm `API_SERVER_ENABLED`/`API_SERVER_PORT` vào profile phụ.

Sau khi sửa, verify riêng:

- default key → `/api/sessions`;
- profile key → `/p/<profile>/api/sessions`.

Không in key vào log hoặc tài liệu.

## Tailscale NoState / logged out

1. Mở ứng dụng Tailscale và Connect lại.
2. Nếu daemon kẹt, chạy PowerShell Administrator:

```powershell
Restart-Service Tailscale -Force
```

3. Kiểm tra `tailscale status` và `tailscale funnel status`.

## Ảnh không hiện

### Ảnh điện thoại gửi lên

- kiểm tra browser có quyền chọn ảnh;
- xem request chat có content multimodal `image_url`;
- kiểm tra model/provider hỗ trợ vision.

### Ảnh agent trả về

- remote URL phải là HTTPS hoặc data image URL;
- Markdown phải dùng `![alt](https://example.com/image.png)`;
- local file phải dùng `MEDIA:<absolute path>`;
- path phải nằm dưới một root trong `POCKET_MEDIA_ROOTS`;
- thử `HEAD /pocket/media?path=...` sau khi đăng nhập.

Không mở rộng media root ra toàn ổ đĩa chỉ để “cho chạy”.

## Service worker và icon iOS

Sau khi build mới, service worker sẽ cập nhật app shell. iOS thường giữ icon Home Screen lâu hơn cache web; nếu icon không đổi, xóa app khỏi Home Screen rồi Add to Home Screen lại.

## Browser QA an toàn

Các script QA phải dùng Chrome headless với `--user-data-dir` riêng. Không dùng `taskkill /T`; cờ đó có thể giết cả cây Chrome người dùng hoặc process không liên quan. Không chạy browser QA khi người dùng đang dùng Chrome mà chưa báo trước.

## Log

Background launcher ghi `hermes-pocket.log` ở repo root. Log này bị gitignore. Không gửi log công khai trước khi kiểm tra credential/PII.
