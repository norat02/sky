# Sky Bird v2 Backend

Sky Bird v2 giữ frontend game hiện có và bổ sung REST API Node.js/Express chạy sau Nginx. API mới dùng `/api/v1`; alias `/api` được giữ tạm để tương thích client cũ. Vercel/Supabase Functions trong `api/` vẫn được giữ nguyên cho đến khi hoàn tất cutover một nguồn auth duy nhất.

## Thành phần và lớp bảo vệ

| Thành phần | Vai trò | Cơ chế chính |
|---|---|---|
| Express API | Auth, ván chơi, điểm số, leaderboard và admin | API versioning, Zod validation, Helmet, CORS allowlist, request ID, structured logging |
| PostgreSQL/Neon | Users, sessions, game runs, scores, idempotency keys và outbox | Foreign key, check constraint, cursor indexes, RLS policies, least-privilege role |
| Redis | Cache leaderboard và distributed rate limit | TTL cache 15 giây, counter theo cửa sổ 60 giây; memory fallback chỉ dành cho single-instance dev |
| RabbitMQ | Message queue cho `score.submitted` | Durable exchange, persistent message, outbox publisher |
| Nginx | Load balancing trước nhiều API instance | `least_conn`, failover, HTTPS termination, request limit, forwarded headers |

Mọi request được xử lý theo chuỗi: **Authentication → Authorization → API validation → rate limiting → session validation → score validation → anti-cheat plausibility check → replay protection → idempotency → database transaction → PostgreSQL permissions/RLS → secrets management → HTTPS → logging/monitoring → backup**. JWT có `iss`, `aud`, `jti`, `iat`, `exp`; session server-side có thể revoke trước hạn.

## REST endpoints

| Method | Endpoint | Auth | Mục đích |
|---|---|---|---|
| GET | `/health` | Không | Health check database |
| POST | `/api/v1/auth/register` | Không | Tạo tài khoản và trả JWT |
| POST | `/api/v1/auth/login` | Không | Đăng nhập và tạo session |
| POST | `/api/v1/auth/logout` | Bearer JWT + active session | Revoke session |
| GET | `/api/v1/leaderboard?limit=10&cursor=...` | Không | Leaderboard cursor pagination |
| POST | `/api/v1/runs` | Bearer JWT + active session | Mở một ván chơi |
| POST | `/api/v1/runs/:runId/score` | Bearer JWT + active session + `Idempotency-Key` | Ghi điểm đúng một lần |
| GET | `/api/v1/admin/stats` | Bearer JWT + active session + role `admin` | Đọc thống kê quản trị |

Leaderboard nhận `limit` từ 1–100 và trả `pagination.nextCursor`. Cursor được kiểm tra chữ ký hình dạng và dùng keyset pagination `(score, created_at, id)`, tránh trùng/bỏ dòng khi dữ liệu thay đổi.

## Transaction, replay và anti-cheat

Khi ghi điểm, API mở transaction, khóa bản ghi idempotency bằng `FOR UPDATE`, khóa `game_runs` đúng user bằng `FOR UPDATE`, kiểm tra trạng thái `started`, kiểm tra điểm tối đa hợp lý theo thời gian bắt đầu, rồi đổi trạng thái sang `submitted` bằng optimistic `version`. Score và outbox event được insert trong cùng transaction. Request lặp cùng key và payload trả response cũ; dùng key cho payload khác trả `409`; run đã submit trả `409`.

## Chạy local

```bash
cp .env.example .env
npm run api:dev
```

Toàn bộ PostgreSQL, Redis, RabbitMQ, hai API instance, worker và Nginx:

```bash
docker compose up --build
curl http://localhost:8080/health
```

Trước production, bắt buộc thay JWT/database/RabbitMQ secrets, giới hạn CORS, bật HTTPS ở reverse proxy, chạy migration `002_security_hardening.sql` và `003_security_operations.sql`, dùng role database riêng không có `SUPERUSER/BYPASSRLS`, bật backup PostgreSQL mã hóa và kiểm tra restore định kỳ. Không ghi token, password, connection string hoặc service-role key vào log.

## RLS, permissions, secrets và backup

Migration `002_security_hardening.sql` tạo `auth_sessions`, bật RLS cho các bảng nghiệp vụ và cung cấp policy theo `app.user_id`. Khi triển khai, tạo runtime role riêng, revoke quyền client, dùng secrets manager, rồi bật `FORCE ROW LEVEL SECURITY` sau khi xác nhận ứng dụng đã đặt session context đúng cách. Không dùng database owner trong production API.

Production nên bật PostgreSQL point-in-time recovery hoặc snapshot mã hóa, giữ một bản sao ngoài vùng lỗi và chạy restore drill định kỳ. `/health` chỉ trả `200` khi API truy vấn được database, `/ready` kiểm tra migration bắt buộc và `/live` phục vụ liveness probe; log JSON có `requestId`, route, status, duration và user ID, không có token. Theo dõi 5xx, 401/403 tăng đột biến, 429, latency p95, pool exhaustion và backup freshness.

Ma trận đầy đủ 100 kiểm soát bảo mật, trạng thái hiện tại và ưu tiên còn lại nằm tại [`docs/security-controls-100-vi.md`](security-controls-100-vi.md).

> API v2 là backend reference độc lập. Khi cutover production, chọn một nguồn xác thực duy nhất hoặc xây migration user rõ ràng trước khi bật song song.

## Kiểm thử nhanh

```bash
npm run test:api
npm run verify
npm test
```

Các kiểm thử production nên bổ sung gồm concurrent score submission, expired/revoked session, cursor tampering, idempotency key reuse, RLS bypass attempt, rate-limit distribution qua Redis và backup restore drill.
