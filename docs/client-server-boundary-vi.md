# Ranh giới Client–Server của Sky Bird

## Nguyên tắc

Frontend chỉ giữ trạng thái gameplay cục bộ, session Auth và hàng đợi offline. Frontend **không đọc trực tiếp bảng `scores`, `score_runs`, hồ sơ người chơi hoặc giao dịch economy**.

Mọi dữ liệu có quyền truy cập hoặc có side effect đi qua API server:

| Tác vụ | Endpoint | Quyền kiểm tra tại server |
|---|---|---|
| Lấy bảng xếp hạng 24 giờ | `GET /api/leaderboard` | Giới hạn 10 bản ghi, chỉ trả tên/điểm đã chuẩn hóa |
| Cấp run ticket | `POST /api/run-ticket` | JWT Supabase, user ID, ticket HMAC và thời hạn |
| Gửi điểm | `POST /api/submit-score` | JWT, ticket, chống replay, tốc độ điểm, rate limit, consume run |
| Economy | `POST /api/economy` | JWT, transaction server-side, RPC/permission và không âm coin |
| Admin | `GET /api/admin-data` | JWT + allowlist admin |

Supabase client trong frontend chỉ phục vụ **Auth session/OAuth**. Service-role key, signing secret và database credential chỉ tồn tại trong runtime server.

## Offline

- Người chơi vẫn có thể chơi khi không có mạng.
- Điểm cá nhân và trạng thái local tiếp tục được lưu trên thiết bị.
- Điểm của tài khoản đã có run ticket được xếp vào hàng đợi và tự gửi lại khi kết nối trở lại.
- Nếu chưa có run ticket hợp lệ, điểm offline không được giả mạo để ghi thẳng vào bảng trực tuyến; người chơi vẫn có thể chơi tiếp và điểm trực tuyến sẽ cần một ván online hợp lệ.

## Trạng thái kết nối

`#netDot` là live status có `role="status"`, `aria-live="polite"` và ba trạng thái trực quan:

- `online`: xanh lá, API đang sẵn sàng.
- `offline`: đỏ, vẫn chơi được cục bộ nhưng chưa có kết nối server.
- `degraded`: màu hổ phách, mạng có thể hoạt động nhưng API tạm thời không phản hồi.

Bảng xếp hạng không dùng fallback đọc trực tiếp từ database. Khi API lỗi, giao diện giữ cache hiển thị nếu có và thông báo trạng thái thay vì phá vỡ ranh giới phân quyền.
