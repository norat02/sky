# Sky Bird: Chuyến Bay Bầu Trời

Game arcade HTML thuần chạy trên Vercel. Game luôn chơi được offline; khi có cấu hình Supabase hợp lệ, đăng nhập, bảng xếp hạng và ghi danh điểm sẽ hoạt động online.

## Quy chuẩn giao diện

Mọi biểu tượng trong giao diện phải dùng **SVG inline hoặc SVG sprite**, không dùng emoji hoặc ký tự biểu tượng thay thế. Icon tương tác cần có `aria-label` hoặc nhãn văn bản đi kèm, trạng thái trang trí dùng `aria-hidden="true"`, và SVG phải kế thừa màu giao diện qua `currentColor` khi phù hợp.

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

Hướng dẫn chi tiết từng bước về Vercel Environment Variables, Supabase Auth và Google OAuth nằm tại [`docs/vercel-supabase-google-oauth.md`](docs/vercel-supabase-google-oauth.md).

Tại **Vercel Project → Settings → Environment Variables**, thêm các biến sau. `PUBLIC_SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` và `SUPABASE_REDIRECT_URL` dùng cho build/client; `SUPABASE_SERVICE_ROLE_KEY` và `SCORE_SIGNING_SECRET` chỉ dùng trong server runtime. Với Production phải điền domain thật; Preview/Development có thể dùng URL tương ứng của môi trường đó. Sau khi thay đổi biến, bắt buộc tạo deployment mới vì `config.js`, `robots.txt` và `sitemap.xml` được sinh trong bước build:

| Biến | Giá trị |
|---|---|
| `SUPABASE_URL` | Project URL trong Supabase, ví dụ `https://abc.supabase.co` |
| `SUPABASE_ANON_KEY` | Public anon/publishable key trong Supabase |
| `PUBLIC_SITE_URL` | Bắt buộc cho SEO production; ví dụ `https://your-domain.vercel.app/` hoặc custom domain, luôn có `/` cuối |
| `SUPABASE_REDIRECT_URL` | Tùy chọn; domain production đầy đủ, ví dụ `https://your-domain.vercel.app/` |

Vercel chạy `npm run build`. Script [`scripts/generate-config.mjs`](scripts/generate-config.mjs) sẽ tạo `config.js` từ các biến trên ngay trong quá trình build. `config.js` được ignore bởi Git và không được commit. Không bao giờ đặt `service_role` key ở trình duyệt.

Nếu triển khai bằng Vercel CLI, hãy thiết lập các biến môi trường trước khi deploy:

```bash
vercel env add PUBLIC_SITE_URL production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
vercel env add SUPABASE_REDIRECT_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add SCORE_SIGNING_SECRET production
vercel --prod
```

## Kiểm tra cấu hình sau deploy

Sau deployment, mở domain Production và kiểm tra `/<robots.txt>`, `/<sitemap.xml>`, canonical/OG URL và đăng nhập. Trong DevTools Network, request `/api/run-ticket` phải trả `200` sau khi đăng nhập; request `/api/submit-score` hợp lệ phải được server xử lý, còn ticket sai hoặc đã dùng phải bị từ chối. Nếu API trả `500 server_not_configured`, kiểm tra lại ba biến server-side và redeploy. Không dùng `vercel env pull` để commit secret vào repository; `.env`, `.env.local` và `config.js` phải tiếp tục nằm trong `.gitignore`.

## Leaderboard trực tuyến

Màn hình chính hiển thị top 5 người chơi online và nút **Bảng thiên hạ** mở top 10. Danh sách được lấy từ Supabase theo thứ tự điểm giảm dần, sau đó ưu tiên người đạt điểm sớm hơn. Sau khi một ván kết thúc, người chơi đã đăng nhập có thể nhập tên và ghi điểm; người chưa đăng nhập vẫn chơi được nhưng không thể gửi điểm online.

## Tính năng gameplay mới

Game có nút **Tạm dừng/Tiếp tục** trong lúc bay, phím `P` để pause/resume và tự động tạm dừng khi người chơi chuyển tab hoặc ẩn trình duyệt. Cơ chế này ngăn game tiếp tục chạy ngoài ý muốn khi người chơi không nhìn thấy màn hình. Khi vượt qua 8 cổng liên tiếp, người chơi nhận **mốc thưởng combo** và một lá chắn bảo hộ; cơ chế này tạo thêm mục tiêu chiến thuật bên cạnh việc chỉ giữ điểm số.

Khi nhân vật chết, game có thể hiển thị một lượt **hồi sinh sau rewarded ad**. Mỗi ván chỉ được hồi sinh một lần. Code chỉ gọi `window.SKY_REWARDED_AD.show()` khi provider quảng cáo hợp lệ đã được tích hợp; nếu chưa có provider, nút bị khóa và game không giả nhận rằng người chơi đã xem quảng cáo. Google AdSense display thông thường không phải rewarded-ad API, vì vậy cần dùng một rewarded provider được phê duyệt hoặc Google Ad Manager rewarded inventory ở production.

## Xác thực điểm server-side

Thư mục [`api/`](api/) chứa hai Vercel Serverless Functions. `run-ticket` xác thực Supabase access token rồi cấp một run ticket có chữ ký HMAC; `submit-score` xác thực lại JWT, kiểm tra ticket chưa hết hạn và chưa được dùng, giới hạn tần suất gửi, giới hạn tốc độ điểm theo thời gian chơi, khóa ticket một lần và chỉ sau đó mới ghi vào Supabase. `SUPABASE_SERVICE_ROLE_KEY` chỉ được đọc bên trong Function, không bao giờ được sinh vào `config.js`.

Cấu hình thêm các biến sau trong Vercel, chỉ áp dụng cho server runtime:

```text
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-or-secret-key>
SCORE_SIGNING_SECRET=<random-secret-at-least-32-characters>
```

Sau khi cập nhật schema, cần chạy [`supabase/schema.sql`](supabase/schema.sql) trong **Supabase Dashboard → SQL Editor** để tạo `score_runs`, `scores` và các policy RLS. Kiểm tra rằng bảng đã tồn tại, RLS đang bật và policy không cho client tự `UPDATE`/`DELETE` điểm. Trên Vercel, kiểm tra **Settings → Functions** để các file `api/*.mjs` được nhận diện tự động; không đặt `api` trong Output Directory và không thêm `SUPABASE_SERVICE_ROLE_KEY`/`SCORE_SIGNING_SECRET` vào `config.js`. Sau khi nhập hoặc thay đổi biến môi trường, phải redeploy Production. Nếu chưa có hai biến server-side hoặc chưa chạy schema, game vẫn chạy offline nhưng không thể gửi điểm qua API.

> Không có cơ chế nào chống gian lận tuyệt đối khi toàn bộ mô phỏng game chạy trong trình duyệt. Serverless Function này chặn giả mạo request cơ bản, replay ticket, gửi quá nhiều lần và điểm vượt tốc độ hợp lý. Muốn đạt mức chống gian lận cao hơn, cần chuyển trạng thái game hoặc xác thực replay sang server-authoritative.

## Bảo mật và mã hóa

Website được phục vụ qua HTTPS bởi Vercel và Supabase, nên dữ liệu truyền giữa trình duyệt và các dịch vụ được mã hóa trong quá trình truyền. Không lưu mật khẩu, service-role key hoặc secret OAuth trong client. `SUPABASE_ANON_KEY` là public key và chỉ được dùng cùng Row Level Security; service-role key và `SCORE_SIGNING_SECRET` chỉ nằm trong Vercel Environment Variables.

Vercel đã được cấu hình các header `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` và `Permissions-Policy`. CSP chỉ cho phép các nguồn script, font, Supabase, Google OAuth và AdSense mà game đang sử dụng.

RLS trong [`supabase/schema.sql`](supabase/schema.sql) cho phép đọc Leaderboard công khai, nhưng chỉ tài khoản đã xác thực mới được insert điểm của chính mình. Không có policy UPDATE/DELETE cho client. Điểm cũng bị giới hạn từ `0` đến `100000`, tên người chơi từ 1 đến 10 ký tự và được kiểm tra trước khi gửi.

Các biện pháp phía client không thể ngăn người dùng sửa JavaScript hoặc giả mạo điểm. Nếu Leaderboard cần chống gian lận nghiêm ngặt, cần thêm Vercel Function dùng secret server-side để xác thực kết quả hoặc hệ thống replay/server-authoritative; tuyệt đối không đưa service-role key vào `index.html`.

## Backup/Restore mã hóa

Nút **Xuất backup** luôn tạo JSON envelope đã mã hóa bằng **AES-256-GCM**. Khóa được dẫn xuất từ mật khẩu người chơi bằng PBKDF2-HMAC-SHA-256 với salt ngẫu nhiên và 150.000 vòng lặp. AES-GCM phát hiện file bị sửa, sai schema hoặc sai mật khẩu nên file hỏng sẽ bị từ chối. Từ schema backup v2, file chỉ chứa dữ liệu cá nhân và lịch sử cục bộ; **không xuất `pendingScores`, run ticket hoặc dữ liệu có thể dùng để gửi điểm online**. Khi restore, client cũng không nhập hàng đợi điểm từ file. File backup tối đa 1 MB và dữ liệu sau giải mã vẫn được làm sạch trước khi merge.

Mật khẩu backup không được lưu và không thể khôi phục. Nếu mất mật khẩu, file backup không thể giải mã. Người chơi nên lưu file và mật khẩu ở hai nơi an toàn khác nhau. Lưu ý rằng người dùng sở hữu mật khẩu vẫn có thể tự tạo một file backup hợp lệ với dữ liệu local mới; điều này không thể bị ngăn tuyệt đối trong ứng dụng chạy trên trình duyệt. Tuy nhiên, dữ liệu local không có quyền ghi vào Leaderboard: điểm online chỉ được chấp nhận khi Vercel Function kiểm tra Bearer session, run ticket HMAC, thời gian chạy, giới hạn điểm và trạng thái ticket chưa dùng.

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

## Rewarded ads và hồi sinh

Hướng dẫn đầy đủ về custom domain, SSL/HTTPS trên Vercel và định dạng rewarded video nằm tại [`docs/vercel-domain-ssl-rewarded-video.md`](docs/vercel-domain-ssl-rewarded-video.md).

Tính năng hồi sinh dùng hook `window.SKY_REWARDED_AD.show()`. AdSense được lazy-load sau khi trang ổn định, idle callback hoặc tương tác đầu tiên; GPT chỉ được tải khi provider rewarded gọi `window.SKY_ADS.loadGPT()`. **Mã cần lấy không phải mã định dạng video trong file JSON**, mà là **Ad unit path** của Google Ad Manager, thường có dạng `/123456789/sky_rewarded`. Vào Google Ad Manager → **Inventory → Ad units** → chọn hoặc tạo ad unit → sao chép trường **Ad unit path**. Chọn inventory/format **Rewarded**; nếu dùng GPT thì provider gọi `googletag.defineOutOfPageSlot(adUnitPath, googletag.enums.OutOfPageFormat.REWARDED)`. Sau đó gắn path vào code provider và chỉ gọi `window.SKY_REWARDED_AD.show()` sau khi có `RewardedSlotReadyEvent`; chỉ hồi sinh sau `RewardedSlotGrantedEvent`. AdSense display thông thường, Multiplex và In-article không cung cấp API rewarded. Cần cấu hình consent và tuân thủ chính sách của Google; không coi việc mở hoặc đóng quảng cáo là đã xem xong. Xem [`docs/google-rewarded-ad-notes.md`](docs/google-rewarded-ad-notes.md) và [`docs/vercel-domain-ssl-rewarded-video.md`](docs/vercel-domain-ssl-rewarded-video.md).

## Kiểm thử E2E

Bộ test [`e2e/game.e2e.mjs`](e2e/game.e2e.mjs) dùng Playwright với Chromium và mock Supabase/rewarded-ad provider, nên không sử dụng tài khoản production hoặc tạo dữ liệu thật. Test xác nhận Settings có ít nhất 100 locale, chọn được Trung/Hindi, locale chưa dịch có fallback, payload điểm gửi đúng run ticket và rewarded ad chưa hoàn tất không được hồi sinh. Test bao phủ mở Settings và đổi tiếng Nhật, đăng nhập email, bắt đầu chơi, quảng cáo trả về `false` không được hồi sinh, quảng cáo được cấp reward mới hồi sinh, kết thúc ván, gửi điểm và tải Leaderboard online. Bộ kiểm thử [`scripts/test-security-rewarded.mjs`](scripts/test-security-rewarded.mjs) kiểm tra HMAC run ticket, ticket khác người dùng, sửa payload, validation điểm/tên, AdBlock/incomplete-ad guard và việc backup không chứa hàng đợi điểm online.

Chạy các kiểm tra logic bằng:

```bash
npm test
```

Chạy thêm luồng trình duyệt E2E bằng:

```bash
npm run test:e2e
```

Có thể chỉ định Chromium khác bằng `CHROMIUM_PATH=/path/to/chromium npm run test:e2e`. Khi kiểm thử production thật, cần dùng project Supabase staging, tài khoản test riêng, ad test unit của Google và tuyệt đối không click quảng cáo thật trong quá trình tự động hóa.

## Đa ngôn ngữ

Game có bản dịch đầy đủ cho `vi`, `en`, `ja`, `zh` (Trung giản thể) và `hi` (Hindi). Settings hiện cung cấp hơn 100 locale; các locale chưa có bản dịch biên tập riêng dùng bộ chuỗi tiếng Anh làm fallback, vẫn giữ đúng định dạng, phát hiện browser/IP và lựa chọn thủ công. Lần đầu mở game, ứng dụng ưu tiên mã quốc gia do Vercel cung cấp qua `/api/locale`, sau đó fallback sang `navigator.language`. Người chơi có thể mở **Cài đặt**, đổi ngôn ngữ thủ công và lựa chọn được lưu trong trình duyệt; lựa chọn thủ công được ưu tiên hơn tự động nhận diện IP. Các khóa localStorage cũ được giữ nguyên để không làm mất dữ liệu khi đổi thương hiệu hoặc locale.

## SEO

Website cung cấp [`robots.txt`](robots.txt) và [`sitemap.xml`](sitemap.xml), đồng thời khai báo description, keywords, robots directive, canonical URL, Open Graph metadata, Twitter Card, structured data `VideoGame` và [`og-image.png`](og-image.png) trong `index.html`. Khi deploy Vercel, đặt `PUBLIC_SITE_URL=https://domain-cua-ban.vercel.app/`; bước build sẽ sinh lại `config.js`, `robots.txt` và `sitemap.xml` theo domain đó, đồng thời thay URL tĩnh trong metadata OG/canonical. Không dùng domain mẫu khi deploy production.

### PageSpeed

Loader AdSense không còn nằm trực tiếp trong phần `<head>` dưới dạng script bên thứ ba blocking. Bootstrap nhỏ chỉ tạo request sau `load` + idle delay hoặc tương tác người dùng. Provider Google Ad Manager/GPT nên gọi `window.SKY_ADS.loadGPT()` ngay trước khi mở rewarded ad, không tải GPT khi game chưa yêu cầu. Cách này giảm request và công việc main-thread ở lần render đầu, nhưng cần đo lại trên Preview/Production vì quảng cáo thật vẫn có thể ảnh hưởng TBT sau tương tác.

Để tối ưu hiệu suất, nên đo cả Mobile và Desktop bằng PageSpeed Insights sau mỗi production deployment. Game hiện tải canvas và script inline, Google Fonts, Supabase module và AdSense; cần theo dõi LCP, INP và CLS, đặc biệt khi bật quảng cáo. Không tải Supabase hoặc quảng cáo trước khi cần nếu chế độ offline/initial render không yêu cầu. Giữ thumbnail và tài nguyên tĩnh có cache trên Vercel, hạn chế thêm thư viện JavaScript, dùng font fallback nhanh và tránh layout thay đổi khi modal/quảng cáo xuất hiện. Mục tiêu Core Web Vitals tham khảo là LCP ≤ 2,5 giây, INP < 200 ms và CLS < 0,1.
