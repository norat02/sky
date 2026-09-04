# Sky Bird v2 Backend

Sky Bird v2 giữ frontend game hiện có và bổ sung một REST API Node.js/Express có thể chạy độc lập sau Nginx. Kiến trúc này phù hợp cho môi trường local, staging hoặc triển khai container; phần Vercel Functions cũ vẫn được giữ nguyên để bảo toàn luồng production hiện tại.

## Các thành phần

| Thành phần | Vai trò | Cơ chế chính |
|---|---|---|
| Express API | RESTful API cho auth, ván chơi, điểm số, leaderboard và admin | JSON schema validation, Helmet, CORS, HTTP status chuẩn |
| PostgreSQL/Neon | Lưu users, game runs, scores, idempotency keys và outbox | Foreign key, check constraint, unique/partial/composite index |
| Redis | Cache leaderboard và distributed rate limit | TTL cache 15 giây, counter theo cửa sổ 60 giây |
| RabbitMQ | Message queue cho sự kiện `score.submitted` | Durable topic exchange, persistent message, outbox publisher |
| Outbox worker | Phát sự kiện sau khi transaction commit | `FOR UPDATE SKIP LOCKED`, retry ở vòng lặp worker |
| Nginx | Load balancing trước nhiều API instance | `least_conn`, failover, request limit, forwarded headers |

## REST endpoints

| Method | Endpoint | Auth | Mục đích |
|---|---|---|---|
| GET | `/health` | Không | Health check database |
| POST | `/api/auth/register` | Không | Tạo tài khoản và trả JWT |
| POST | `/api/auth/login` | Không | Đăng nhập và trả JWT |
| GET | `/api/leaderboard` | Không | Đọc top 10, có cache |
| POST | `/api/runs` | Bearer JWT | Mở một ván chơi |
| POST | `/api/runs/:runId/score` | Bearer JWT + `Idempotency-Key` | Ghi điểm đúng một lần |
| GET | `/api/admin/stats` | Bearer JWT + role `admin` | Đọc thống kê quản trị |

## Transaction và concurrency

Khi ghi điểm, API mở transaction, khóa bản ghi idempotency bằng `FOR UPDATE`, khóa `game_runs` của đúng user bằng `FOR UPDATE`, rồi kiểm tra optimistic version. Sau đó API đổi trạng thái ván từ `started` sang `submitted`, insert score và insert outbox event trong cùng transaction. Vì vậy request lặp hoặc hai request đồng thời không thể tạo hai điểm cho cùng một ván.

`Idempotency-Key` được liên kết với user và hash của request. Gửi lại cùng key và cùng payload trả lại response cũ; dùng lại key cho payload khác trả `409`. Đây là lớp bảo vệ cần thiết khi client retry sau timeout.

## Chạy local

Cần Docker Compose. Từ thư mục repository:

```bash
cp .env.server.example .env
npm run api:dev
```

Để chạy toàn bộ PostgreSQL, Redis, RabbitMQ, hai API instance, worker và Nginx:

```bash
docker compose up --build
curl http://localhost:8080/health
```

API qua load balancer tại `http://localhost:8080`; RabbitMQ Management UI tại `http://localhost:15672` với tài khoản `sky/sky`. Trước production, bắt buộc thay `JWT_SECRET`, mật khẩu database, mật khẩu RabbitMQ và giới hạn CORS.

## Luồng kiểm thử nhanh

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"player@example.com","password":"correct horse battery staple"}'
```

Dùng token trả về để mở ván, sau đó gửi điểm:

```bash
curl -X POST http://localhost:8080/api/runs \
  -H "authorization: Bearer $TOKEN"

curl -X POST http://localhost:8080/api/runs/$RUN_ID/score \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: run-score-001' \
  -d '{"playerName":"Sky Player","score":42}'
```

Gửi lại lệnh cuối với cùng `Idempotency-Key` sẽ không tạo bản ghi thứ hai. Gọi `/api/leaderboard` lần đầu sẽ cache miss; các lần tiếp theo trong 15 giây sẽ cache hit.

> API mới là backend reference độc lập; các biến Supabase/Neon và endpoint cũ trong `api/` không bị xóa. Khi cutover production, nên chọn một nguồn xác thực duy nhất hoặc xây migration user rõ ràng trước khi bật song song.
