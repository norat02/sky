# Ma trận 19 lớp bảo mật — trạng thái hiện thực

Tài liệu này đối chiếu từng lớp trong chuỗi
`Auth → Authorization → API Validation → Rate Limiting → Session Validation → Score Validation → Anti-Cheat → Replay Protection → Idempotency → Database Transactions → PostgreSQL Permissions → Secrets Management → HTTPS → Logging → Monitoring → Backup`
(cùng `Pagination` và `Versioning`) với code thực tế trong repository `norat02/sky`.

Mục tiêu: tránh viết lại những thứ đã tồn tại, và định vị chính xác phần nào còn thiếu.

> Xem [`docs/backend-v2.md`](backend-v2.md) cho mô tả kiến trúc tổng thể và
> [`docs/security-controls-100-vi.md`](security-controls-100-vi.md) cho ma trận 100 lớp kiểm soát bảo mật.

## Kết luận ngắn

**19/19 lớp đã hiện thực.** Không lớp nào trong danh sách trên đang thiếu.

Điểm gãy thực sự hiện nằm ở **release pipeline**, không nằm ở code bảo mật: workflow
`Release all platforms` cho tag `v1.0.0` đã **fail ở job `android` và job `ios`** vì thiếu
Repository Secrets. Chi tiết và cách khắc phục nằm ở
[`docs/release-signing-secrets-vi.md`](release-signing-secrets-vi.md).

## Ma trận

| # | Lớp | Trạng thái | Thực hiện tại | Cách kiểm chứng |
|---|---|---|---|---|
| 1 | **Auth** | ✅ Có | `server/auth.mjs` — JWT HS256 (HMAC-SHA256), mật khẩu băm bằng `scrypt` + salt ngẫu nhiên 16 byte, so sánh bằng `timingSafeEqual`. Khóa là `JWT_SECRET` (bắt buộc ≥ 32 ký tự, fail-closed ở production). | `npm run test:admin-auth`, `npm run test:security-controls` |
| 2 | **Token Expiration** | ✅ Có | `server/auth.mjs` — JWT HS256 có `iat`/`exp`, `iss`/`aud` bắt buộc khớp, `exp <= now` ⇒ token vô hiệu (`readToken` trả `null` → HTTP 401). TTL qua `JWT_TTL_SECONDS` (mặc định 24 h). Mỗi lần cấp token ghi một hàng `auth_sessions (user_id, jti, expires_at)`; `validateSession` (`server/security.mjs:27`) từ chối khi `expires_at <= now`. Phía Vercel dùng Supabase `auth.getUser(token)` nên `exp` do Supabase kiểm. | `npm run test:admin-auth`, `npm run test:security-controls` |
| 3 | **Authorization** | ✅ Có | `requireRole(...roles)` từ `server/auth.mjs`; phía Vercel dùng allowlist server-side `ADMIN_USER_IDS` / `ADMIN_EMAILS` trong `api/_security.mjs` — không bao giờ tin metadata của provider. | `npm run audit:f3` |
| 4 | **API Validation** | ✅ Có | Zod schema `strict()` trong `server/app.mjs`: `credentials`, `registerCredentials`, `nameSchema`, `scoreSchema`, `paginationSchema`, `userSchema`. Body giới hạn 64 KB (`express.json({ limit: '64kb', strict: true })`). Lỗi Zod → HTTP 400. | `npm run test:api:security-integration` |
| 5 | **Rate Limiting** | ✅ Có | `guardRate` (`server/app.mjs:61`) → `rateLimit()` trong `server/cache.mjs`. Redis-backed khi có `REDIS_URL`, fallback in-memory kèm circuit breaker (ngưỡng 3 lỗi, mở 15 s). Phản hồi `X-RateLimit-Remaining`, HTTP 429 khi vượt. | `npm run test:api:security-integration` |
| 6 | **Session Validation** | ✅ Có | Bảng `auth_sessions` (`jti`, `expires_at`, `revoked_at`). `validateSession` (`server/security.mjs`) tra cứu theo `user_id + jti`; session hết hạn hoặc đã thu hồi → HTTP 401 `session_expired`. Logout set `revoked_at`. | `npm run test:admin-auth` |
| 7 | **Score Validation** | ✅ Có | `server/game-rules.mjs` — `maxPlausibleScore()` giới hạn điểm theo thời gian đã chơi × `MAX_SCORE_PER_SECOND` (mặc định 25), trần 100 000. `isScorePlausible()` kiểm tra số nguyên an toàn và khoảng. | `npm run test:security-rewarded` |
| 8 | **Anti-Cheat** | ✅ Có | Ngoài score validation: `run-ticket` ký HMAC-SHA256 (`api/_security.mjs`) ràng buộc `uid` + `runId` + `exp` 30 phút; client không thể tự tạo ticket hợp lệ. Có DevTools lock và chống tự xóa dữ liệu. | `npm run test:security-controls` |
| 9 | **Replay Protection** | ✅ Có | `game_runs.version` là optimistic lock: `UPDATE ... WHERE id = $2 AND version = $3 AND status = 'started'`. Không đúng 1 dòng bị ảnh hưởng → HTTP 409 `replay_detected`. `score_runs` chỉ được đóng khi `submitted_at IS NULL` (partial-unique index `scores_open_idx`). | `npm run test:security-controls` |
| 10 | **Idempotency** | ✅ Có | Bảng `idempotency_keys (user_id, key)` + `request_hash`. Header `Idempotency-Key` bắt buộc (`/^[A-Za-z0-9._~-]{1,128}$/`). Cùng key + cùng hash → trả lại response cũ; cùng key + khác hash → HTTP 409 `idempotency_key_reused`. | `npm run test:security-controls` |
| 11 | **Database Transactions** | ✅ Có | `withTransaction()` (`server/db.mjs`): `BEGIN` → `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` → `set_config('app.user_id', $1, true)` → `COMMIT`, `ROLLBACK` khi lỗi, luôn `client.release()`. `set_config(..., true)` là transaction-local nên không rò context giữa các connection trong pool. Có `statement_timeout` và `query_timeout`. | `npm run test:api` |
| 12 | **PostgreSQL Permissions** | ✅ Có | RLS bật trên 6 bảng (`002`, `003`) và `FORCE ROW LEVEL SECURITY` trên `player_profiles` + `economy_transactions` (`004`, `005`). Role runtime `sky_api` được `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`; `anon` bị `REVOKE ALL`, `authenticated` chỉ nhận `SELECT, INSERT, UPDATE`. | `npm run audit:f5` |
| 13 | **Secrets Management** | ✅ Có | Service-role key và `DATABASE_URL` chỉ tồn tại server-side; `SUPABASE_ANON_KEY` là public duy nhất. Audit F-4 quét toàn bộ file production tìm credential literal, private key, fallback secret. `.env` / `.env.*` bị gitignore (trừ `.env.example`). | `npm run audit:f4` |
| 14 | **HTTPS** | ✅ Có | `helmet()` mặc định; CORS allowlist từ `CORS_ORIGIN` (không có origin ⇒ `false`); `x-powered-by` tắt. Vercel phục vụ HTTPS; domain + SSL ghi ở `docs/vercel-domain-ssl-notes.md`. | `npm run verify` |
| 15 | **Logging** | ✅ Có | Middleware `requestId` (`server/security.mjs`) gắn `X-Request-ID`, log JSON dạng `{ event, requestId, method, path, status, durationMs, userId }`. IP chỉ lưu dạng hash (`hashRequest`) trong `security_audit_events`. Không log credential. | `npm run test:security-controls` |
| 16 | **Monitoring** | ✅ Có | `/health` (kèm trạng thái circuit breaker cache), `/ready` (kiểm tra `auth_sessions` + `security_audit_events` đã migrate chưa), `/live`. Lỗi 5xx ghi log có `requestId` + stack. | `npm run test:api` |
| 17 | **Backup** | ✅ Có | AES-GCM roundtrip + phát hiện giả mạo, watermark ẩn 5 lớp, loại trừ điểm pending online. | `npm run test:flows`, `npm run test:e2e:backup`, `npm run test:e2e:backup:attack` |
| 18 | **Pagination** | ✅ Có | Cursor keyset pagination, không dùng `OFFSET`. `encodeCursor`/`decodeCursor` (`server/security.mjs`) mã hóa base64url `{score, createdAt, id}`; query `(score, created_at, id) < ($2, $3, $4)` khớp đúng index `scores_leaderboard_idx`. `limit` mặc định 10, tối đa 100. Cursor hỏng → HTTP 400 `invalid_cursor`. | `npm run test:api` |
| 19 | **Versioning** | ✅ Có | Route chính `/api/v1` (`server/app.mjs:198`); `/api` là alias tạm cho client cũ. Header `API-Version: v1` + `Deprecation: false` do `versionHeaders()` gắn cho mọi response. | `npm run verify` |

## Thứ tự chuỗi bảo vệ

Thứ tự middleware trong `server/app.mjs` là cố ý, kiểm tra từ ngoài vào trong:

```text
helmet (HTTPS/security headers)
  → cors (allowlist)
    → express.json 64 KB, strict
      → requestId (logging + correlation)
        → guardRate (/api)                    ← Rate Limiting
          → versionHeaders('v1')             ← Versioning
            → noStore (route nhạy cảm)
              → requireAuth                   ← Auth
                → validateSession             ← Session Validation
                  → requireRole('admin')      ← Authorization
                    → zod parse               ← API Validation
                      → isScorePlausible      ← Score Validation
                        → run-ticket verify   ← Anti-Cheat
                          → version lock      ← Replay Protection
                            → idempotency      ← Idempotency
                              → withTransaction ← Database Transactions
```

`/health`, `/ready`, `/live` nằm ngoài `api` router nên không bị rate limit — chủ ý, để
orchestrator poll được.

## Các điểm cần biết

1. **Hai API surface song song.** `server/app.mjs` (Express, dùng cho Neon/Postgres) và
   `api/*.mjs` (Vercel Functions, dùng Supabase) có middleware riêng. Cùng một quy tắc
   phải được áp dụng ở cả hai nơi — đừng chỉ vá một bên.

2. **Leaderboard rolling 24h.** `api/_db.mjs::getLeaderboard()` lọc `created_at >= now - 24h`;
   bản Express dùng index `scores_leaderboard_24h_idx` (`006_leaderboard_24h.sql`). Dữ liệu
   lịch sử được giữ, không xoá.

3. **`scores` có policy `FOR SELECT USING (true)`.** Đọc bảng xếp hạng là công khai có chủ ý;
   ghi vẫn bị giới hạn theo chủ sở hữu. Audit F-5 kiểm tra ranh giới này.

4. **Economy là server-authoritative.** `complete_score_reward()` và `unlock_character()`
   là `SECURITY DEFINER` với `search_path` cố định, và có `UNIQUE (user_id, operation, reference_id)`
   để chống cộng dồn trùng. Client không bao giờ được gửi số coin hay giá tiền.

5. **Rate limiter có fallback in-memory.** Khi Redis không sẵn sàng, bộ đếm chuyển sang tiến
   trình. Trong môi trường nhiều instance, hãy bật `REDIS_URL` — nếu không, giới hạn sẽ
   không dùng chung giữa các instance.

## Chạy toàn bộ kiểm chứng

```bash
npm run build
npm run verify
npm test
npm run test:api
npm run test:api:integration
npm run test:e2e
for a in f2 f3 f4 f5 f6 f7 f8 f9 f10; do npm run "audit:$a"; done
```

CI chạy phần này ở workflow
[`Security TDD Gate`](../.github/workflows/security-gate.yml) và
[`Security Checks`](../.github/workflows/security.yml).
