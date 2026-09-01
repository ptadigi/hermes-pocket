# Đóng góp cho Hermes Pocket

Cảm ơn anh em đã muốn cải thiện Hermes Pocket. Dự án ưu tiên thay đổi nhỏ, có test và giữ nguyên ranh giới bảo mật giữa trình duyệt với Hermes Agent.

## Chuẩn bị

1. Cài Hermes Agent và Node.js 20.19+ hoặc 22.12+.
2. Fork/clone repository.
3. Chạy `npm ci`.
4. Chạy `npm run setup`, sau đó điền credential vào `.env.local`.
5. Chạy `npm run check` trước khi sửa để có baseline.

## Quy trình thay đổi

1. Tạo branch riêng.
2. Viết test tái hiện hành vi cần sửa.
3. Chỉ sửa phạm vi liên quan.
4. Chạy `npm run check`.
5. Nếu sửa UI mobile, ghi rõ viewport và bằng chứng kiểm tra. Không commit ảnh có dữ liệu cá nhân/session thật.

## Nguyên tắc kiến trúc

- Không đưa `API_SERVER_KEY`, mật khẩu hoặc token vào frontend, log, docs hay test.
- Không tạo agent loop hoặc session store riêng trong Pocket.
- Dùng Hermes API Server làm authority cho session và model.
- BFF chỉ bind loopback; public exposure phải là opt-in.
- Route proxy phải nằm trong allowlist và mutation phải kiểm CSRF.
- Media local chỉ được đọc từ allowlisted roots sau realpath validation.
- Nội dung DOM phải dùng được khi tắt hiệu ứng; tôn trọng `prefers-reduced-motion`.
- Touch target mobile tối thiểu 44px và phải xử lý iOS safe area.

## Commit và Pull Request

Dùng subject ngắn theo dạng:

```text
feat: add install guidance
fix: preserve multimodal images
security: tighten media roots
```

PR nên ghi:

- vấn đề và hành vi mong muốn;
- file/phạm vi đã đổi;
- lệnh test đã chạy;
- ảnh hoặc video nếu thay đổi UI;
- rủi ro, giới hạn và cách rollback.

## Báo lỗi

Mở GitHub Issue với phiên bản Node, phiên bản Hermes, hệ điều hành, bước tái hiện và log đã loại bỏ credential. Với lỗi bảo mật, làm theo `SECURITY.md` thay vì đăng công khai.
