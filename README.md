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

Nếu triển khai bằng Vercel CLI, hãy thiết lập các biến môi trường trước khi deploy:

```bash
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add SCORE_SIGNING_SECRET production
vercel --prod
```

## Leaderboard trực tuyến

Màn hình chính hiển thị top 5 người chơi online và nút **Bảng thiên hạ** mở top 10. Danh sách được lấy từ Supabase theo thứ tự điểm giảm dần, sau đó ưu tiên người đạt điểm sớm hơn. Sau khi một ván kết thúc, người chơi đã đăng nhập có thể nhập tên và ghi điểm; người chưa đăng nhập vẫn chơi được nhưng không thể gửi điểm online.

## Tính năng gameplay mới

Game có nút **Tạm dừng/Tiếp tục** trong lúc bay, phím `P` để pause/resume và tự động tạm dừng khi người chơi chuyển tab hoặc ẩn trình duyệt. Cơ chế này ngăn game tiếp tục chạy ngoài ý muốn khi người chơi không nhìn thấy màn hình.

Khi nhân vật chết, game có thể hiển thị một lượt **hồi sinh sau rewarded ad**. Mỗi ván chỉ được hồi sinh một lần. Code chỉ gọi `window.SKY_REWARDED_AD.show()` khi provider quảng cáo hợp lệ đã được tích hợp; nếu chưa có provider, nút bị khóa và game không giả nhận rằng người chơi đã xem quảng cáo. Google AdSense display thông thường không phải rewarded-ad API, vì vậy cần dùng một rewarded provider được phê duyệt hoặc Google Ad Manager rewarded inventory ở production.

## Xác thực điểm server-side

Thư mục [`api/`](api/) chứa hai Vercel Serverless Functions. `run-ticket` xác thực Supabase access token rồi cấp một run ticket có chữ ký HMAC; `submit-score` xác thực lại JWT, kiểm tra ticket chưa hết hạn và chưa được dùng, giới hạn tần suất gửi, giới hạn tốc độ điểm theo thời gian chơi, khóa ticket một lần và chỉ sau đó mới ghi vào Supabase. `SUPABASE_SERVICE_ROLE_KEY` chỉ được đọc bên trong Function, không bao giờ được sinh vào `config.js`.

Cấu hình thêm các biến sau trong Vercel, chỉ áp dụng cho server runtime:

```text
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-or-secret-key>
SCORE_SIGNING_SECRET=<random-secret-at-least-32-characters>
```

Sau khi cập nhật schema, cần chạy [`supabase/schema.sql`](supabase/schema.sql) để tạo bảng `score_runs`. Nếu chưa có hai biến server-side hoặc chưa chạy schema, game vẫn chạy offline nhưng không thể gửi điểm qua API.

> Không có cơ chế nào chống gian lận tuyệt đối khi toàn bộ mô phỏng game chạy trong trình duyệt. Serverless Function này chặn giả mạo request cơ bản, replay ticket, gửi quá nhiều lần và điểm vượt tốc độ hợp lý. Muốn đạt mức chống gian lận cao hơn, cần chuyển trạng thái game hoặc xác thực replay sang server-authoritative.

## Bảo mật và mã hóa

Website được phục vụ qua HTTPS bởi Vercel và Supabase, nên dữ liệu truyền giữa trình duyệt và các dịch vụ được mã hóa trong quá trình truyền. Không lưu mật khẩu, service-role key hoặc secret OAuth trong client. `SUPABASE_ANON_KEY` là public key và chỉ được dùng cùng Row Level Security; service-role key và `SCORE_SIGNING_SECRET` chỉ nằm trong Vercel Environment Variables.

Vercel đã được cấu hình các header `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` và `Permissions-Policy`. CSP chỉ cho phép các nguồn script, font, Supabase, Google OAuth và AdSense mà game đang sử dụng.

RLS trong [`supabase/schema.sql`](supabase/schema.sql) cho phép đọc Leaderboard công khai, nhưng chỉ tài khoản đã xác thực mới được insert điểm của chính mình. Không có policy UPDATE/DELETE cho client. Điểm cũng bị giới hạn từ `0` đến `100000`, tên người chơi từ 1 đến 10 ký tự và được kiểm tra trước khi gửi.

Các biện pháp phía client không thể ngăn người dùng sửa JavaScript hoặc giả mạo điểm. Nếu Leaderboard cần chống gian lận nghiêm ngặt, cần thêm Vercel Function dùng secret server-side để xác thực kết quả hoặc hệ thống replay/server-authoritative; tuyệt đối không đưa service-role key vào `index.html`.

## Backup/Restore mã hóa

Nút **Xuất backup** luôn tạo JSON envelope đã mã hóa bằng **AES-256-GCM**. Khóa được dẫn xuất từ mật khẩu người chơi bằng PBKDF2-HMAC-SHA-256 với salt ngẫu nhiên và 150.000 vòng lặp. Nút **Nhập backup** yêu cầu đúng mật khẩu; file bị sửa, sai schema hoặc sai mật khẩu sẽ bị từ chối. File backup tối đa 1 MB và dữ liệu sau giải mã vẫn được làm sạch trước khi merge.

Mật khẩu backup không được lưu và không thể khôi phục. Nếu mất mật khẩu, file backup không thể giải mã. Người chơi nên lưu file và mật khẩu ở hai nơi an toàn khác nhau.

## Luôn lưu dữ liệu

Sau mỗi ván, kết quả được ghi ngay vào lịch sử cục bộ trong `localStorage` với tối đa 24 ván gần nhất. Khi một ván online đã có run ticket nhưng request ghi điểm gặp timeout, lỗi mạng hoặc lỗi server, điểm được đưa vào hàng đợi cục bộ tối đa 10 mục và tự retry khi mạng trở lại, sau 30 giây nếu server tạm lỗi hoặc khi người dùng đăng nhập lại. Nếu server trả `run_already_used`, queue được xóa vì server đã khóa ticket; điều này tránh ghi trùng khi response thành công bị mất trên đường truyền. Các lỗi xác thực, ticket hết hạn và payload không hợp lệ không được retry vô hạn.

Kỷ lục cá nhân, tên hiển thị, cài đặt âm thanh, lịch sử ván và hàng đợi chờ đồng bộ được lưu cục bộ. Supabase lưu Leaderboard chính thức và các run online sau khi API server xác thực. Client không lưu service key, signing secret hoặc mật khẩu. `localStorage` không phải nơi lưu trữ chống xóa; nếu người dùng xóa dữ liệu trình duyệt, dùng chế độ riêng tư hoặc đổi thiết bị thì dữ liệu local có thể mất, còn dữ liệu đã đồng bộ lên Supabase vẫn được giữ.

## Online và offline

Khi thiếu `SUPABASE_URL` hoặc `SUPABASE_ANON_KEY`, hoặc CDN/Supabase không truy cập được, game tự chuyển sang trạng thái **chơi cục bộ**. Kỷ lục cá nhân và lịch sử ván vẫn được lưu trong `localStorage`. Khi kết nối thành công, chỉ báo mạng hiển thị **trực tuyến**, Leaderboard được tải từ Supabase và hàng đợi điểm hợp lệ sẽ được thử đồng bộ lại.

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
