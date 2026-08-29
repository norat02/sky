# Chim Sẻ · 小鳥の旅

Game arcade HTML thuần chạy trên Vercel. Game luôn chơi được offline; khi có cấu hình Supabase hợp lệ, đăng nhập, bảng xếp hạng và ghi danh điểm sẽ hoạt động online.

## Supabase Database và RLS

Tạo một project trên [Supabase](https://supabase.com), mở **SQL Editor** và chạy file [`supabase/schema.sql`](supabase/schema.sql). Schema tạo bảng `scores`, bật Row Level Security, cho phép mọi người đọc bảng xếp hạng và chỉ cho người dùng đã đăng nhập gửi điểm với `user_id` của chính họ.

Nếu bảng `scores` đã được tạo từ phiên bản Neon cũ, vẫn cần chạy lại phần `alter table`, index và policy trong schema để bổ sung `user_id` và quyền RLS tương ứng.

## Email và Google OAuth

Trong **Authentication → Providers**, bật **Email** để sử dụng đăng ký/đăng nhập bằng email và mật khẩu. Có thể bật email confirmation theo chính sách của project.

Để bật Google, tạo OAuth Client loại **Web application** trong Google Cloud Console. Đặt URL ứng dụng Vercel vào **Authorized JavaScript origins**. Đặt callback của Supabase theo dạng sau vào **Authorized redirect URIs**:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Trong Supabase, thêm các URL sau tại **Authentication → URL Configuration**:

```text
https://your-production-domain.vercel.app/
https://*-<team-or-account-slug>.vercel.app/**
http://localhost:3000/**
```

Thay `your-production-domain.vercel.app` bằng domain Vercel thật. Ứng dụng truyền `redirectTo` động theo domain đang mở; nếu muốn cố định một domain production, điền `SUPABASE_REDIRECT_URL` trong biến môi trường Vercel.

## Cấu hình Vercel

Tại **Vercel Project → Settings → Environment Variables**, thêm các biến sau cho **Production**, **Preview** và **Development**:

| Biến | Giá trị |
|---|---|
| `SUPABASE_URL` | Project URL trong Supabase, ví dụ `https://abc.supabase.co` |
| `SUPABASE_ANON_KEY` | Public anon/publishable key trong Supabase |
| `SUPABASE_REDIRECT_URL` | Tùy chọn; domain production đầy đủ, ví dụ `https://your-domain.vercel.app/` |

Vercel chạy `npm run build`. Script [`scripts/generate-config.mjs`](scripts/generate-config.mjs) sẽ tạo `config.js` từ các biến trên ngay trong quá trình build. `config.js` được ignore bởi Git và không được commit. Không bao giờ đặt `service_role` key ở trình duyệt.

Nếu triển khai bằng Vercel CLI:

```bash
vercel
vercel --prod
```

## Leaderboard trực tuyến

Màn hình chính hiển thị top 5 người chơi online và nút **Bảng thiên hạ** mở top 10. Danh sách được lấy từ Supabase theo thứ tự điểm giảm dần, sau đó ưu tiên người đạt điểm sớm hơn. Sau khi một ván kết thúc, người chơi đã đăng nhập có thể nhập tên và ghi điểm; người chưa đăng nhập vẫn chơi được nhưng không thể gửi điểm online.

## Online và offline

Khi thiếu `SUPABASE_URL` hoặc `SUPABASE_ANON_KEY`, hoặc CDN/Supabase không truy cập được, game tự chuyển sang trạng thái **chơi cục bộ**. Kỷ lục cá nhân vẫn được lưu trong `localStorage`. Khi kết nối thành công, chỉ báo mạng hiển thị **trực tuyến**, Leaderboard được tải từ Supabase và các nút đăng nhập hoạt động.

## Chạy cục bộ

```bash
cp config.example.js config.js
# điền cấu hình Supabase trong config.js nếu muốn thử online
npm run build
python3 -m http.server 3000
```

Mở `http://localhost:3000/`. Không mở trực tiếp bằng `file://` nếu muốn kiểm thử OAuth, vì Supabase cần origin hợp lệ.

## SEO

Website cung cấp [`robots.txt`](robots.txt) và [`sitemap.xml`](sitemap.xml), đồng thời khai báo description, canonical URL và Open Graph metadata trong `index.html`.
