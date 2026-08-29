# Chim Sẻ · 小鳥の旅

Game arcade HTML thuần chạy trên GitHub Pages. Game luôn chơi được offline; khi có cấu hình Supabase hợp lệ, bảng xếp hạng và đăng nhập sẽ hoạt động online.

## Cấu hình Supabase

Tạo một project trên [Supabase](https://supabase.com), mở **SQL Editor** và chạy file [`supabase/schema.sql`](supabase/schema.sql). Schema tạo bảng `scores`, bật Row Level Security, cho phép mọi người đọc bảng xếp hạng và chỉ cho người dùng đã đăng nhập gửi điểm.

Tại **Project Settings → API**, lấy Project URL và public anon/publishable key. Sao chép [`config.example.js`](config.example.js) thành `config.js`, sau đó điền hai giá trị này. Với website tĩnh, `config.js` là tệp cấu hình runtime được nạp bởi `index.html`; file `.env.example` chỉ là mẫu biến môi trường để dùng khi chuyển sang quy trình build.

Không dùng `service_role` key trong trình duyệt. Public anon/publishable key được thiết kế để sử dụng phía client và được bảo vệ bằng RLS.

## Đăng nhập

Trong **Authentication → Providers**, bật **Email** để sử dụng đăng ký/đăng nhập bằng email và mật khẩu. Có thể bật email confirmation theo chính sách của project.

Để bật Google, tạo OAuth Client trong Google Cloud Console, thêm Client ID và Client Secret vào provider Google của Supabase. Trong **Authentication → URL Configuration**, thêm các URL sau:

```text
https://norat02.github.io/sky/
http://localhost:8000/
```

Sau khi đăng nhập, người chơi có thể gửi điểm vào bảng thiên hạ. Nếu chưa đăng nhập, game vẫn chơi bình thường và lưu kỷ lục cá nhân trong `localStorage`.

## Online và offline

Khi `SUPABASE_URL` và `SUPABASE_ANON_KEY` chưa được khai báo, hoặc CDN/Supabase không truy cập được, game tự chuyển sang trạng thái **chơi cục bộ**. Khi kết nối thành công, chỉ báo mạng hiển thị **trực tuyến**, bảng điểm được tải từ Supabase và việc ghi danh yêu cầu tài khoản.

## Chạy cục bộ

```bash
cp config.example.js config.js
# điền cấu hình Supabase trong config.js nếu muốn thử online
python3 -m http.server 8000
```

Mở `http://localhost:8000/`. Không mở trực tiếp bằng `file://` nếu muốn kiểm thử OAuth, vì Supabase cần origin hợp lệ.

## SEO

Website cung cấp [`robots.txt`](robots.txt) và [`sitemap.xml`](sitemap.xml), đồng thời khai báo description, canonical URL và Open Graph metadata trong `index.html`.
