# Cấu hình Vercel, Supabase và Google OAuth

## 1. Biến môi trường trên Vercel

Mở **Vercel → Project → Settings → Environment Variables** và tạo các biến sau. Chọn đúng môi trường **Production**, **Preview** và **Development** tùy nhu cầu.

| Biến | Bắt buộc | Phạm vi | Giá trị |
|---|---:|---|---|
| `DATABASE_URL` hoặc `NEON_DATABASE_URL` | Có cho API | Server-only | Neon pooled connection string, có `sslmode=require`. |
| `SUPABASE_URL` | Có cho Auth | Client + Server | Supabase Auth project URL, dạng `https://<project-ref>.supabase.co`. |
| `SUPABASE_ANON_KEY` | Có | Client | Public anon/publishable key. Biến này có thể xuất hiện trong client và phải được bảo vệ bằng RLS. |
| `SUPABASE_REDIRECT_URL` | Không | Build/client | URL Production, ví dụ `https://game.example.com/` hoặc `https://your-project.vercel.app/`. Nếu bỏ trống, ứng dụng dùng origin hiện tại. |
| `SUPABASE_SERVICE_ROLE_KEY` | Có cho API | Server-only | Service-role key của Supabase. Không bao giờ đưa vào `config.js`, `index.html` hoặc log client. |
| `SCORE_SIGNING_SECRET` | Có cho API | Server-only | Chuỗi ngẫu nhiên tối thiểu 32 ký tự dùng ký run ticket. |

Có thể tạo secret an toàn bằng:

```bash
openssl rand -base64 48
```

Vercel chạy `npm run build`. Script `scripts/generate-config.mjs` chỉ đưa các biến public vào `config.js`. Các biến server-only được đọc trực tiếp bởi Vercel Functions.

## 2. Neon Database và Supabase Auth

Supabase chỉ dùng cho Auth. Trong Neon Console, chạy [`neon/schema.sql`](../neon/schema.sql) để tạo `scores` và `score_runs`. Neon không cấp quyền database cho client; việc đọc Leaderboard và ghi điểm đều đi qua Vercel API server.

Trong **Authentication → Providers**:

1. Bật **Email** nếu muốn đăng ký/đăng nhập bằng email và mật khẩu.
2. Bật **Google** sau khi tạo Google OAuth Client.
3. Xác định có bật email confirmation hay không. Nếu bật, người dùng phải xác nhận email trước khi đăng nhập đầy đủ.

## 3. Google Cloud OAuth

Trong Google Cloud Console, tạo **OAuth Client ID → Web application**.

Thêm domain Vercel Production và các domain Preview cần thiết vào **Authorized JavaScript origins**:

```text
https://your-project.vercel.app
https://your-production-domain.example
```

Thêm callback Supabase sau vào **Authorized redirect URIs**:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Không dùng URL `/api/auth/callback` của Vercel cho callback Google trong cấu hình Supabase này; callback OAuth của Google phải trỏ về Supabase Auth.

## 4. Supabase URL Configuration

Trong **Authentication → URL Configuration**:

- Đặt **Site URL** là URL Production có dấu `/` ở cuối.
- Thêm URL Production vào **Redirect URLs**.
- Thêm URL localhost dùng khi phát triển.
- Thêm các URL Preview theo allow-list của project nếu cần kiểm thử OAuth trên Preview.

Ví dụ:

```text
https://your-project.vercel.app/
https://your-production-domain.example/
http://localhost:3000/**
```

Ứng dụng truyền `redirectTo` theo origin đang mở hoặc dùng `SUPABASE_REDIRECT_URL` nếu biến này tồn tại. Khi đổi domain production, phải cập nhật cả Vercel, Supabase và Google Cloud Console.

## 5. Kiểm tra sau deploy

Sau khi deploy, kiểm tra các URL sau:

```text
https://your-domain.example/
https://your-domain.example/api/locale
```

Sau đó kiểm thử lần lượt: mở game ở chế độ offline; đăng ký email; đăng nhập email; đăng nhập Google; đăng xuất; bắt đầu một ván; gửi điểm; tải Leaderboard; chuyển mạng offline rồi online; và kiểm tra queue được retry.

Nếu Google trả lỗi `redirect_uri_mismatch`, đối chiếu chính xác callback Supabase trong Google Cloud. Nếu Supabase trả lỗi redirect không được phép, thêm origin/URL hiện tại vào **Authentication → URL Configuration → Redirect URLs**.

## 6. An toàn production

Không commit `.env`, `config.js`, service-role key hoặc Google client secret. Chỉ public anon/publishable key được phép xuất hiện ở client. Không tin điểm số từ client; API phải xác thực JWT, run ticket, rate limit và schema trước khi ghi database.

Locale theo IP chỉ là gợi ý giao diện, không dùng cho phân quyền hoặc quyết định bảo mật. Nếu Vercel không cung cấp country header, ứng dụng fallback sang `navigator.language`, rồi dùng English nếu không nhận diện được. Database runtime của API là Neon; Supabase không còn là database của game.
