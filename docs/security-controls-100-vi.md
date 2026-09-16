# Ma trận 100 lớp bảo mật Sky Bird

## Phạm vi và cách đọc

Tài liệu này chuyển checklist 100 mục thành ma trận kiểm soát cho repository `norat02/sky`. Trạng thái **Đã có** nghĩa là đã có bằng chứng trong source hoặc cấu hình. Trạng thái **Một phần** nghĩa là chỉ có một lớp bảo vệ, còn phụ thuộc nền tảng hoặc cần hoàn thiện vận hành. Trạng thái **Cần triển khai** nghĩa là chưa có implementation đủ để tuyên bố đã đáp ứng.

> Không nên dùng checklist này như chứng nhận compliance hoặc kết luận penetration test. Một số kiểm soát, như HTTPS, backup, MFA và DAST, cần được xác nhận trong môi trường triển khai thật.

## Ma trận kiểm soát

| # | Kiểm soát | Trạng thái | Bằng chứng hoặc việc cần làm |
|---:|---|---|---|
| 1 | Authentication | Đã có | Supabase Auth cho legacy; JWT cho API v2. |
| 2 | Authorization | Đã có | Middleware `requireAuth`, `requireRole` và admin checks. |
| 3 | Access Control | Đã có | User chỉ thao tác game run của chính mình; admin route riêng. |
| 4 | RBAC | Đã có | Role `player` và `admin` trong API v2. |
| 5 | ABAC | Một phần | Có kiểm tra user ownership, IP và session; chưa có policy engine riêng. |
| 6 | RLS | Đã có | Supabase RLS và migration PostgreSQL v2 có policies. |
| 7 | Database Permissions | Một phần | Có hướng dẫn revoke/grant; production phải chạy bằng role runtime riêng. |
| 8 | PostgreSQL Roles | Một phần | Migration có mẫu `sky_api`; cần tạo role thật trong môi trường deploy. |
| 9 | API Versioning | Đã có | `/api/v1` và alias tương thích `/api`. |
| 10 | Pagination | Đã có | Leaderboard trả giới hạn và metadata phân trang. |
| 11 | Cursor Pagination | Đã có | Keyset cursor theo score, created_at và id. |
| 12 | Rate Limiting | Đã có | Redis counter, memory fallback cho development. |
| 13 | Request Throttling | Một phần | Có từ chối 429; chưa có adaptive slowdown. |
| 14 | Input Validation | Đã có | Zod schema và kiểm tra header/body. |
| 15 | Output Validation | Đã có | Leaderboard và auth responses được parse bằng Zod trước khi trả về. |
| 16 | Schema Validation | Đã có | Zod và PostgreSQL constraints. |
| 17 | CORS | Đã có | Allowlist từ `CORS_ORIGIN`; production không dùng wildcard. |
| 18 | CSRF Protection | Một phần | API dùng Bearer token; không dùng cookie auth cho API v2. Cần CSRF middleware nếu thêm cookie. |
| 19 | HTTPS | Một phần | Vercel cung cấp HTTPS; phải bật HTTPS termination ở reverse proxy tự host. |
| 20 | TLS | Một phần | Do Vercel/Nginx quản lý; cần kiểm tra certificate và TLS policy production. |
| 21 | HSTS | Đã có | Header HSTS được cấu hình ở `vercel.json`; chỉ dùng sau khi domain production luôn có HTTPS. |
| 22 | Bearer Token | Đã có | `Authorization: Bearer` được kiểm tra ở API v2 và Supabase Functions. |
| 23 | Access Token | Đã có | Supabase access token và JWT API v2. |
| 24 | Refresh Token | Đã có | Supabase client bật persist/auto refresh; API v2 cấp token ngắn hạn, không tự cấp refresh token. |
| 25 | Token Expiration | Đã có | JWT kiểm tra `iat`, `exp`, issuer và audience. |
| 26 | Refresh Token Rotation | Nền tảng | Supabase quản lý rotation; cần xác nhận policy trong Supabase project. |
| 27 | Session Management | Đã có | `auth_sessions` lưu jti, user và expiry. |
| 28 | Session Expiration | Đã có | Session bị từ chối khi quá `expires_at`. |
| 29 | Session Revocation | Đã có | `/api/v1/auth/logout` cập nhật `revoked_at`. |
| 30 | Nonce | Một phần | Run ticket có UUID; OAuth nonce/PKCE do Supabase client và provider quản lý. |
| 31 | Replay Attack Protection | Đã có | Game run chuyển `started` → `submitted`, optimistic version và ticket one-time. |
| 32 | Request Signature | Đã có | Legacy score run ticket HMAC; API v2 dùng JWT và session. |
| 33 | Request Integrity | Đã có | HMAC ticket, request hash idempotency và HTTPS. |
| 34 | Idempotency | Đã có | Transaction khóa `idempotency_keys` bằng `FOR UPDATE`. |
| 35 | Idempotency Key | Đã có | Header bắt buộc, giới hạn 128 ký tự, hash payload. |
| 36 | Anti-Cheat | Đã có | Điểm bị giới hạn theo thời gian run và ownership. |
| 37 | Score Validation | Đã có | Zod, PostgreSQL range check và plausibility check. |
| 38 | Game Session Validation | Đã có | Run phải thuộc user và còn trạng thái `started`. |
| 39 | Score Integrity | Đã có | Score insert cùng transaction với run state và outbox. |
| 40 | Leaderboard Integrity | Một phần | Chỉ API server ghi điểm và response schema được kiểm tra; cần quarantine/review cho dữ liệu đáng ngờ. |
| 41 | Suspicious Score Detection | Một phần | Có ngưỡng score/second; chưa có risk scoring dài hạn. |
| 42 | Bot Detection | Cần triển khai | Chưa có bot challenge hoặc behavioral model. |
| 43 | Abuse Detection | Một phần | Có 401/429, login lockout và security audit events; cần alert rules production. |
| 44 | Fraud Detection | Cần triển khai | Cần pipeline phân tích nhiều tín hiệu và quy trình review. |
| 45 | IP Rate Limiting | Đã có | Rate key có IP khi chưa xác thực. |
| 46 | Account Rate Limiting | Đã có | Rate key dùng user id khi middleware nhận diện được user; route middleware toàn cục hiện ưu tiên IP trước auth. |
| 47 | Device Rate Limiting | Cần triển khai | Không tin device id do client tự khai báo; cần cơ chế privacy-safe nếu cần. |
| 48 | Request Deduplication | Đã có | Idempotency key và unique constraints. |
| 49 | Concurrency Control | Đã có | Row locks và transaction. |
| 50 | Optimistic Locking | Đã có | `game_runs.version` tăng khi submit. |
| 51 | Pessimistic Locking | Đã có | `FOR UPDATE` cho idempotency key và game run. |
| 52 | Database Transactions | Đã có | `withTransaction` bao bọc score submission. |
| 53 | Atomic Operations | Đã có | Run, score, idempotency response và outbox commit cùng transaction. |
| 54 | SQL Injection Protection | Đã có | PostgreSQL parameterized queries. |
| 55 | XSS Protection | Đã có | Client render leaderboard bằng `textContent`; CSP headers. |
| 56 | CSP | Đã có | CSP trong `vercel.json`; còn `unsafe-inline` do legacy UI. |
| 57 | Security Headers | Đã có | Helmet và Vercel headers. |
| 58 | Secure Cookies | N/A hiện tại | API v2 dùng Bearer; nếu thêm cookie phải bật Secure, HttpOnly và SameSite. |
| 59 | HttpOnly Cookies | N/A hiện tại | Không lưu API v2 session trong cookie. |
| 60 | SameSite Cookies | N/A hiện tại | Không có cookie auth API v2. |
| 61 | Secrets Management | Đã có | `.env*` bị ignore; secrets đặt ở Vercel/GitHub Secrets. |
| 62 | Environment Variable Isolation | Đã có | Chỉ `VITE_*` và public keys được build vào client. |
| 63 | API Key Management | Một phần | Có tách public/private; cần rotation schedule và inventory. |
| 64 | Encryption at Rest | Nền tảng | Cần bật/kiểm tra encryption của Neon/Supabase, backups và artifact storage. |
| 65 | Encryption in Transit | Một phần | HTTPS của Vercel/Supabase; cần TLS policy khi tự host. |
| 66 | Database Encryption | Nền tảng | Phụ thuộc provider; cần ghi nhận bằng chứng từ database provider. |
| 67 | Password Hashing | Đã có | API v2 dùng Node scrypt; Supabase quản lý password legacy. |
| 68 | Argon2 | Cần triển khai/đánh giá | Chưa dùng Argon2; scrypt hiện là lựa chọn đang triển khai. |
| 69 | bcrypt | Không áp dụng | Không dùng bcrypt vì API đang dùng scrypt. |
| 70 | MFA | Cần triển khai | Bật MFA trong Supabase hoặc thêm MFA policy cho admin. |
| 71 | OAuth 2.0 | Đã có | Google OAuth qua Supabase. |
| 72 | OpenID Connect | Nền tảng | Supabase/provider xử lý OIDC claims; cần cấu hình provider production. |
| 73 | PKCE | Một phần | Cần xác nhận flow PKCE cho native redirect trong Supabase production. |
| 74 | Email Verification | Nền tảng | Supabase có email confirmation; cần bật theo policy production. |
| 75 | Account Recovery | Cần triển khai | Cần UI và flow reset password rõ ràng cho web/mobile. |
| 76 | Account Lockout | Đã có | Migration 003 lưu failed attempts theo email/IP và khóa 15 phút sau 5 lần sai. |
| 77 | Audit Logging | Đã có | Migration 003 lưu account registration, login success/failure, requestId và IP hash. Cần mở rộng event coverage cho admin. |
| 78 | Security Logging | Đã có | Structured request/error logs và security audit events; cần alert/redaction review production. |
| 79 | Access Logging | Đã có | Structured `http_request` log. |
| 80 | Error Logging | Đã có | Structured `api_error` log với requestId. |
| 81 | API Monitoring | Một phần | `/health` báo trạng thái database/cache breaker và request log; cần dashboard/alert production. |
| 82 | Error Monitoring | Cần triển khai | Nên nối Sentry hoặc hệ thống tương đương, không ghi secret. |
| 83 | Security Monitoring | Cần triển khai | Cần alert cho 401/403/429, replay, score anomalies và admin actions. |
| 84 | Health Check | Đã có | `/health` kiểm tra database. |
| 85 | Readiness Check | Đã có | `/ready` kiểm tra database và các migration bắt buộc. |
| 86 | Liveness Check | Đã có | `/live` không phụ thuộc database, phù hợp liveness probe. |
| 87 | Request Timeout | Đã có | Vercel `maxDuration`, Express body limit và pool timeout. |
| 88 | Connection Timeout | Đã có | PostgreSQL connection timeout 5 giây. |
| 89 | Retry Policy | Một phần | Queue/client retry có kiểm soát; không retry auth/validation. |
| 90 | Exponential Backoff | Một phần | Client pending retry có delay; cần backoff chuẩn cho worker. |
| 91 | Circuit Breaker | Đã có | Redis cache/rate-limit có breaker 3 lỗi mở 15 giây và memory fallback; RabbitMQ vẫn cần breaker riêng. |
| 92 | Graceful Degradation | Đã có | Cache/Redis có memory fallback; game vẫn chơi offline. |
| 93 | Dependency Security | Đã có | Lockfile và dependency separation. |
| 94 | Dependency Auditing | Đã có | `npm audit --omit=dev --audit-level=high` chạy trong kiểm tra. |
| 95 | Vulnerability Scanning | Một phần | CI chạy npm audit và CodeQL; container/deployed scan vẫn cần nếu dùng container. |
| 96 | SCA | Đã có | CI chạy `npm audit --omit=dev --audit-level=high`. |
| 97 | SAST | Đã có | GitHub CodeQL JavaScript workflow đã được thêm vào CI. |
| 98 | DAST | Cần triển khai | Chưa có scan endpoint đã deploy. |
| 99 | SSDLC | Một phần | Có test/CI/docs; cần threat model, review gate và release checklist chính thức. |
| 100 | Backup & Recovery | Một phần | Có backup client và runbook; cần backup database production và restore drill có bằng chứng. |

## Ưu tiên triển khai tiếp theo

Ưu tiên P0 là cấu hình database runtime role thật với RLS, xác nhận backup/restore của PostgreSQL, bật email verification và MFA cho admin, và bổ sung monitoring cho 401/403/429 cùng score anomalies. Ưu tiên P1 là account recovery, account lockout, audit event store, SAST/CodeQL và DAST staging. Ưu tiên P2 là bot detection, fraud scoring, device-aware controls và circuit breaker.

## Bằng chứng hiện có

Migration `004_player_profiles.sql` bổ sung hồ sơ người chơi dùng chung cho Web và app; RLS giới hạn mỗi tài khoản chỉ đọc/ghi hàng dữ liệu của chính mình. Client dùng offline-first và tự đồng bộ khi đăng nhập hoặc có mạng trở lại. Coin/điểm thưởng quan trọng vẫn phải được server xác nhận trước khi coi là dữ liệu kinh tế đáng tin cậy.

Các điểm đã được kiểm thử trong repository gồm API versioning, cursor pagination, JWT expiration, session revocation, idempotency, transaction score submission, anti-cheat plausibility và HTTP rate limiting. Các lệnh xác nhận hiện tại là `npm run build`, `npm run verify`, `npm test`, `npm run test:api` và `npm run test:api:integration`.

## References

[1]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Application Security Verification Standard"

[2]: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html "OWASP Authentication Cheat Sheet"

[3]: https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html "OWASP Database Security Cheat Sheet"

[4]: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html "OWASP Logging Cheat Sheet"
