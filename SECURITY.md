# Security Policy

Hermes Pocket đặt một BFF giữa trình duyệt và Hermes API Server để tránh đưa bearer key vào client. Vì Hermes có quyền dùng tool trên máy chủ, hãy coi việc expose Pocket ra Internet là một quyết định bảo mật quan trọng.

## Phiên bản được hỗ trợ

Dự án đang ở giai đoạn `0.x`. Chỉ nhánh mặc định và bản phát hành mới nhất nhận bản vá bảo mật.

## Báo lỗ hổng

Không đăng credential, exploit hoạt động hoặc dữ liệu session vào Issue công khai. Hãy dùng GitHub Security Advisories của repository nếu được bật; nếu chưa có, mở một Issue tối giản yêu cầu kênh liên hệ riêng, không kèm chi tiết khai thác.

Báo cáo nên gồm:

- commit hoặc phiên bản bị ảnh hưởng;
- tác động và điều kiện khai thác;
- bước tái hiện tối thiểu đã loại bỏ bí mật;
- đề xuất vá nếu có.

## Mô hình triển khai an toàn

- Giữ `POCKET_HOST=127.0.0.1` và Hermes API Server trên loopback.
- Dùng `POCKET_PASSWORD` dài, riêng biệt; không dùng lại mật khẩu tài khoản khác.
- Không commit `.env.local`.
- Để `POCKET_ENABLE_FUNNEL=false` trừ khi thật sự cần truy cập Internet.
- Nếu bật Funnel, dùng cổng riêng và kiểm tra `tailscale funnel status` trước/sau thay đổi.
- Giới hạn `POCKET_MEDIA_ROOTS` vào đúng thư mục cần hiển thị ảnh. Không đặt `C:\`, `/` hoặc thư mục chứa credential.
- Chỉ chạy một gateway `default` sở hữu API listener; profile phụ dùng multiplex prefix.
- Cập nhật Hermes Agent, Node.js và dependency định kỳ; chạy `npm audit` sau cập nhật.

## Secret handling

Pocket không có endpoint reveal env. Settings chỉ trả trạng thái/redacted values. BFF inject `API_SERVER_KEY` khi proxy và không chuyển header Authorization về browser.

Nếu credential từng xuất hiện trong commit/log/ảnh chụp, hãy rotate credential; chỉ xóa chuỗi khỏi file hiện tại là chưa đủ.

## Phạm vi

Các lỗi trong Hermes Agent core nên báo cho dự án Hermes Agent. Các lỗi riêng của BFF/PWA, profile routing, media route, CSRF, cookie hoặc Tailscale setup thuộc repository này.
