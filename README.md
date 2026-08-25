# Hermes Pocket

PWA mobile-first cho iPhone, kết nối cùng Hermes Agent profile `default` qua API Server chính thức.

## Kiến trúc

```text
iPhone Safari/PWA → Tailscale HTTPS → Hermes Pocket BFF 127.0.0.1:9999
                                      → Hermes API Server 127.0.0.1:8642
                                      → canonical Hermes agent/session DB
```

BFF giữ `API_SERVER_KEY` phía máy Windows. Trình duyệt chỉ nhận session cookie HttpOnly và CSRF cookie same-origin.

## Chạy local

1. Tạo `.env.local` theo `.env.example`.
2. Bật API Server trong Hermes default profile.
3. `npm install`
4. `npm test && npm run build`
5. Nạp env rồi chạy `npm start`.

Windows Git Bash:

```bash
set -a; source .env.local; set +a; npm start
```

## Trạng thái capability

Xem `docs/capability-matrix.md`. Không suy rộng từ OpenAI compatibility: Hermes Sessions REST là nguồn canonical cho session hub; Runs/SSE là nguồn activity/approval/stop.

## Bảo mật

- Không commit `.env.local`.
- Không đưa Hermes bearer token vào frontend.
- BFF chỉ proxy allowlist route cần thiết.
- Mutation bắt buộc CSRF.
- API Server và BFF bind loopback-only.
- HTTPS do Tailscale đảm nhiệm.
