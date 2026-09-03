# Neon PostgreSQL + Vercel

## Kiến trúc

Sky Bird dùng **Neon PostgreSQL** cho `scores` và `score_runs`. Supabase chỉ còn được dùng cho Auth để xác minh Bearer token trong Vercel Functions; client không kết nối trực tiếp với Neon hoặc Supabase database.

API server lấy kết nối từ `DATABASE_URL` hoặc `NEON_DATABASE_URL`, dùng `@neondatabase/serverless` và parameterized tagged SQL. Không đưa connection string, service role key hoặc signing secret vào `config.js`.

## Khởi tạo schema

Mở Neon Console, chọn đúng database production và chạy [`neon/schema.sql`](../neon/schema.sql). Schema tạo bảng điểm, run ticket, index leaderboard và partial index cho các run chưa submit. Neon không dùng RLS của Supabase; quyền truy cập được giới hạn bằng cách không cấp database credential cho client và chỉ expose Vercel API Functions.

## Environment Variables

Thiết lập trong Vercel Project → Settings → Environment Variables → **Production**:

| Biến | Scope | Mục đích |
|---|---|---|
| `DATABASE_URL` hoặc `NEON_DATABASE_URL` | Server-only | Neon pooled connection string, có `sslmode=require` |
| `SUPABASE_URL` | Server-only | Supabase Auth issuer/API để xác minh token |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Auth service client gọi `auth.getUser` |
| `SCORE_SIGNING_SECRET` | Server-only | HMAC run ticket, tối thiểu 32 ký tự ngẫu nhiên |
| `SUPABASE_ANON_KEY` | Build/client | Supabase Auth client trong browser |
| `SUPABASE_REDIRECT_URL` | Build/client | OAuth redirect tùy chọn |
| `PUBLIC_SITE_URL` | Build | Canonical/OG/robots/sitemap URL |
| `ADMIN_EMAILS` / `ADMIN_USER_IDS` | Server-only | Allowlist admin dashboard |

Ưu tiên dùng `DATABASE_URL` để thống nhất với Vercel integrations. Chỉ đặt một trong hai biến `DATABASE_URL` và `NEON_DATABASE_URL`; nếu đặt cả hai, `DATABASE_URL` được ưu tiên.

## Kiểm tra local

Tạo `.env.local` từ `.env.example`, điền giá trị giả lập hoặc giá trị local, sau đó chạy:

```bash
npm run env:check
npm run build
npm run verify
npm test
```

`npm run env:check` chỉ báo `OK`, `MISSING` hoặc `INVALID`, không in giá trị. File `.env.local` và `config.js` không được commit.

## Deploy

Sau khi chạy schema và điền Environment Variables, tạo deployment mới:

```bash
vercel pull --environment=production
vercel deploy --prod
```

Sau deploy, kiểm tra unauthenticated requests tới `/api/run-ticket` và `/api/admin-data` phải bị từ chối. Với user đã đăng nhập, kiểm tra run ticket được ghi vào Neon, submit score lock run đúng một lần và leaderboard đọc từ Neon. Nếu API trả `server_not_configured`, kiểm tra đủ `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` và `SCORE_SIGNING_SECRET` trong đúng scope Production.

## Không migrate dữ liệu tự động khi chưa có credentials

Repository cung cấp schema và adapter nhưng không tự động copy dữ liệu từ Supabase sang Neon. Muốn migrate dữ liệu cũ cần export/import có kiểm soát, mapping UUID và kiểm tra duplicate/idempotency trước khi chuyển production traffic.
