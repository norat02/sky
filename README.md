# Sky Bird: Chuyến Bay Bầu Trời

Game arcade HTML thuần chạy trên Vercel. Game luôn chơi được offline; khi có cấu hình Supabase hợp lệ, đăng nhập, bảng xếp hạng và ghi danh điểm sẽ hoạt động online.

## Quy chuẩn giao diện

Mọi biểu tượng trong giao diện phải dùng **SVG inline hoặc SVG sprite**, không dùng emoji hoặc ký tự biểu tượng thay thế. Icon tương tác cần có `aria-label` hoặc nhãn văn bản đi kèm, trạng thái trang trí dùng `aria-hidden="true"`, và SVG phải kế thừa màu giao diện qua `currentColor` khi phù hợp.

## Neon PostgreSQL và Supabase Auth

Mở Neon Console và chạy file [`neon/schema.sql`](neon/schema.sql) để tạo bảng `scores` và `score_runs`. Dữ liệu điểm chỉ được truy cập qua Vercel API Functions bằng Neon server-side connection string; client không kết nối trực tiếp với Neon và không dùng RLS của Supabase cho các bảng này.

Supabase chỉ còn cung cấp Auth để đăng nhập và xác minh Bearer token. API kiểm tra identity bằng Supabase Auth rồi đọc/ghi dữ liệu điểm qua Neon. Chi tiết biến môi trường và migration nằm trong [`docs/neon-vercel.md`](docs/neon-vercel.md).

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

## Cấu trúc JavaScript

`index.html` giữ markup, CSS và JSON-LD metadata; toàn bộ executable game logic, ad loader, error handler và anti-cheat runtime nằm trong [`game.js`](game.js). `config.js` được nạp trước `game.js` và chỉ được sinh lúc build, giúp CSP có thể giới hạn script runtime về `'self'`.

Các verifier/unit test đọc cả HTML và `game.js` để bảo đảm việc tách file không làm mất coverage.

## Cấu hình local bằng `.env.local`

Tạo file local từ mẫu và không commit file này:

```bash
cp .env.example .env.local
npm run env:check
npm run build
```

Build loader JavaScript đọc `.env.local` khi chạy local và chỉ sinh các giá trị public (`PUBLIC_SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_REDIRECT_URL`) vào `config.js`. Công cụ Go [`tools/envcheck/main.go`](tools/envcheck/main.go) chỉ báo biến thiếu hoặc không hợp lệ, không in giá trị. `SUPABASE_SERVICE_ROLE_KEY` và `SCORE_SIGNING_SECRET` vẫn chỉ dành cho server runtime.

## Cấu hình Vercel

Hướng dẫn chi tiết về Neon PostgreSQL, Vercel Environment Variables và Supabase Auth nằm tại [`docs/neon-vercel.md`](docs/neon-vercel.md). Hướng dẫn OAuth cũ vẫn có tại [`docs/vercel-supabase-google-oauth.md`](docs/vercel-supabase-google-oauth.md).

Tại **Vercel Project → Settings → Environment Variables**, thêm các biến sau. `DATABASE_URL` hoặc `NEON_DATABASE_URL` dùng cho Neon server runtime; `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` chỉ dùng để xác minh Supabase Auth; `SUPABASE_ANON_KEY` và `SUPABASE_REDIRECT_URL` dùng cho Auth build/client; `SCORE_SIGNING_SECRET` chỉ dùng trong server runtime. Với Production nên điền domain thật; nếu bỏ trống `PUBLIC_SITE_URL`, build trên Vercel tự dùng `VERCEL_PROJECT_PRODUCTION_URL` hoặc `VERCEL_URL` làm fallback. Sau khi thay đổi biến, bắt buộc tạo deployment mới vì `config.js`, `robots.txt` và `sitemap.xml` được sinh trong bước build:

| Biến | Giá trị |
|---|---|
| `SUPABASE_URL` | Project URL trong Supabase, ví dụ `https://abc.supabase.co` |
| `SUPABASE_ANON_KEY` | Public anon/publishable key trong Supabase |
| `PUBLIC_SITE_URL` | Khuyến nghị cho SEO production; ví dụ `https://your-domain.vercel.app/` hoặc custom domain, luôn có `/` cuối; Vercel có fallback tự động nếu bỏ trống |
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

## Kiểm thử Playwright cho cửa hàng nhân vật

Kịch bản [`e2e/character-purchase.e2e.mjs`](e2e/character-purchase.e2e.mjs) khởi chạy static server, seed 100 coin, mua nhân vật `swift` qua UI, xác nhận số dư còn 20, xác nhận unlock và lựa chọn được lưu vào `localStorage`, kiểm tra click lặp không trừ coin lần hai, reload để kiểm tra persistence, rồi kiểm tra overflow ngang ở mobile, tablet và desktop. Chạy bằng:

```bash
npm run test:e2e:purchase
```

## Kiểm tra cấu hình sau deploy

Sau deployment, mở domain Production và kiểm tra `/<robots.txt>`, `/<sitemap.xml>`, canonical/OG URL và đăng nhập. Trong DevTools Network, request `/api/run-ticket` phải trả `200` sau khi đăng nhập; request `/api/submit-score` hợp lệ phải được server xử lý, còn ticket sai hoặc đã dùng phải bị từ chối. Nếu API trả `500 server_not_configured`, kiểm tra lại ba biến server-side và redeploy. Không dùng `vercel env pull` để commit secret vào repository; `.env`, `.env.local` và `config.js` phải tiếp tục nằm trong `.gitignore`.

## Leaderboard trực tuyến

Màn hình chính hiển thị top 5 người chơi online và nút **Bảng thiên hạ** mở top 10. Danh sách được lấy từ Supabase theo thứ tự điểm giảm dần, sau đó ưu tiên người đạt điểm sớm hơn. Sau khi một ván kết thúc, người chơi đã đăng nhập có thể nhập tên và ghi điểm; người chưa đăng nhập vẫn chơi được nhưng không thể gửi điểm online.

## Tính năng gameplay mới

Game có nút **Tạm dừng/Tiếp tục** trong lúc bay, phím `P` để pause/resume và tự động tạm dừng khi người chơi chuyển tab hoặc ẩn trình duyệt. Cơ chế này ngăn game tiếp tục chạy ngoài ý muốn khi người chơi không nhìn thấy màn hình. Người chơi có thể chọn các map hoa anh đào, mùa thu, tuyết, đêm, mưa và map mới **Cực Quang** với nền xanh-tím, sao và đom đóm phát sáng. Khi vượt qua 8 cổng liên tiếp, người chơi nhận **mốc thưởng combo** và một lá chắn bảo hộ; cơ chế này tạo thêm mục tiêu chiến thuật bên cạnh việc chỉ giữ điểm số.

Khi nhân vật chết, game có thể hiển thị một lượt **hồi sinh sau rewarded ad**. Mỗi ván chỉ được hồi sinh một lần. Code chỉ gọi `window.SKY_REWARDED_AD.show()` khi provider quảng cáo hợp lệ đã được tích hợp; nếu chưa có provider, nút bị khóa và game không giả nhận rằng người chơi đã xem quảng cáo. Google AdSense display thông thường không phải rewarded-ad API, vì vậy cần dùng một rewarded provider được phê duyệt hoặc Google Ad Manager rewarded inventory ở production.

## Xác thực điểm server-side

Thư mục [`api/`](api/) chứa hai Vercel Serverless Functions. `run-ticket` xác thực Supabase access token rồi cấp một run ticket có chữ ký HMAC; `submit-score` xác thực lại JWT, kiểm tra ticket chưa hết hạn và chưa được dùng, giới hạn tần suất gửi, giới hạn tốc độ điểm theo thời gian chơi, khóa ticket một lần và chỉ sau đó mới ghi vào Supabase. `SUPABASE_SERVICE_ROLE_KEY` chỉ được đọc bên trong Function, không bao giờ được sinh vào `config.js`.

Cấu hình thêm các biến sau trong Vercel, chỉ áp dụng cho server runtime:

```text
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-or-secret-key>
SCORE_SIGNING_SECRET=<random-secret-at-least-32-characters>
```

Sau khi cập nhật schema, cần chạy [`neon/schema.sql`](neon/schema.sql) trong **Neon Console → SQL Editor** để tạo `score_runs` và `scores`. Neon không dùng RLS cho các bảng này; chỉ Vercel Functions có `DATABASE_URL` mới được truy cập. Kiểm tra rằng bảng đã tồn tại và không có database credential nào được đưa vào client; API không cung cấp thao tác `UPDATE`/`DELETE` cho client. Trên Vercel, kiểm tra **Settings → Functions** để các file `api/*.mjs` được nhận diện tự động; không đặt `api` trong Output Directory và không thêm `SUPABASE_SERVICE_ROLE_KEY`/`SCORE_SIGNING_SECRET` vào `config.js`. Sau khi nhập hoặc thay đổi biến môi trường, phải redeploy Production. Nếu chưa có hai biến server-side hoặc chưa chạy schema, game vẫn chạy offline nhưng không thể gửi điểm qua API.

> Không có cơ chế nào chống gian lận tuyệt đối khi toàn bộ mô phỏng game chạy trong trình duyệt. Serverless Function này chặn giả mạo request cơ bản, replay ticket, gửi quá nhiều lần và điểm vượt tốc độ hợp lý. Muốn đạt mức chống gian lận cao hơn, cần chuyển trạng thái game hoặc xác thực replay sang server-authoritative.

## Anti-cheat và khóa phiên

Game có lớp bảo vệ phía client để chặn menu chuột phải, các phím tắt phổ biến mở DevTools, phát hiện chênh lệch kích thước viewport bất thường, theo dõi script lạ được chèn vào DOM và khóa ngay phiên chơi khi phát hiện môi trường debug hoặc mã runtime bị thay đổi. Khi bị khóa, game chuyển sang trạng thái `LOCKED`, không cho bắt đầu ván mới hoặc vỗ cánh; người chơi cần đóng công cụ debug và tải lại trang. Đây chỉ là lớp phòng vệ bổ sung, không thay thế xác thực server-side. Website không thể vô hiệu hóa tuyệt đối mọi tiện ích mở rộng vì extension được trình duyệt cấp quyền riêng; cơ chế này chỉ phát hiện một số tín hiệu can thiệp rõ ràng. Script AdSense/GPT hợp lệ của game được allowlist và AdBlock vẫn đi qua fallback quảng cáo.

Leaderboard vẫn chỉ tin dữ liệu được Vercel Function xác thực bằng Supabase session, HMAC run ticket, giới hạn tốc độ, thời hạn và chống replay. Không có cơ chế chống hack tuyệt đối khi game chạy trong trình duyệt, vì người dùng có thể kiểm soát môi trường client. Các tín hiệu đáng ngờ không được dùng để tự động xóa tài khoản hoặc dữ liệu; nếu cần xử lý tài khoản, hãy ghi nhận sự kiện, khóa gửi điểm/quarantine và yêu cầu quản trị viên xem xét để tránh khóa nhầm và mất dữ liệu không thể hoàn tác.

## Bảo mật và mã hóa

Website được phục vụ qua HTTPS bởi Vercel, Neon và Supabase Auth, nên dữ liệu truyền giữa trình duyệt và các dịch vụ được mã hóa trong quá trình truyền. Không lưu mật khẩu, service-role key hoặc secret OAuth trong client. `SUPABASE_ANON_KEY` là public Auth key; service-role key, Neon connection string và `SCORE_SIGNING_SECRET` chỉ nằm trong Vercel Environment Variables.

Vercel đã được cấu hình các header `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` và `Permissions-Policy`. CSP chỉ cho phép các nguồn script, font, Supabase, Google OAuth và AdSense mà game đang sử dụng.

Neon không cấp quyền database cho client. Leaderboard được đọc qua API server; chỉ request đã xác thực và có run ticket hợp lệ mới được insert điểm. Không có endpoint client cho UPDATE/DELETE. Điểm cũng bị giới hạn từ `0` đến `100000`, tên người chơi từ 1 đến 10 ký tự và được kiểm tra trước khi gửi.

Các biện pháp phía client không thể ngăn người dùng sửa JavaScript hoặc giả mạo điểm. Nếu Leaderboard cần chống gian lận nghiêm ngặt, cần thêm Vercel Function dùng secret server-side để xác thực kết quả hoặc hệ thống replay/server-authoritative; tuyệt đối không đưa service-role key vào `index.html`.

## Backup/Restore mã hóa

Nút **Xuất backup** luôn tạo JSON envelope đã mã hóa bằng **AES-256-GCM**. Khóa được dẫn xuất từ mật khẩu người chơi bằng PBKDF2-HMAC-SHA-256 với salt ngẫu nhiên và 150.000 vòng lặp. Bên trong plaintext trước khi mã hóa, backup được gắn **watermark ẩn 5 lớp** bằng chuỗi SHA-256 liên kết với payload, salt, IV và định danh format. Vì watermark nằm bên trong ciphertext, người không có mật khẩu không thể đọc hoặc nhận biết nội dung watermark từ file JSON; envelope bên ngoài chỉ thấy metadata mã hóa và ciphertext.

Khi giải mã, ứng dụng bắt buộc kiểm tra đủ 5 lớp và đối chiếu toàn bộ chuỗi watermark với payload cùng salt/IV của chính file đó. File thiếu watermark, watermark sai, sửa ciphertext, sai schema hoặc sai mật khẩu đều bị từ chối trước khi restore; không có dữ liệu nào được merge vào localStorage. Đây là thay đổi tương thích có chủ ý: backup cũ chưa có watermark 5 lớp sẽ không được restore, nên người chơi cần xuất lại backup sau khi nâng cấp.

Từ schema backup v2, file chỉ chứa dữ liệu cá nhân và lịch sử cục bộ; **không xuất `pendingScores`, run ticket hoặc dữ liệu có thể dùng để gửi điểm online**. Khi restore, client cũng không nhập hàng đợi điểm từ file. File backup tối đa 1 MB và dữ liệu sau giải mã vẫn được làm sạch trước khi merge.

Mật khẩu backup không được lưu và không thể khôi phục. Nếu mất mật khẩu, file backup không thể giải mã. Người chơi nên lưu file và mật khẩu ở hai nơi an toàn khác nhau. Watermark giúp phát hiện file không đúng format hoặc bị thay thế, nhưng không phải chữ ký chống chối bỏ: người sở hữu mật khẩu và mã chạy phía client vẫn có thể tự tạo một file mới hợp lệ. Watermark cũng không được dùng làm secret duy nhất. Dữ liệu local không có quyền ghi vào Leaderboard: điểm online chỉ được chấp nhận khi Vercel Function kiểm tra Bearer session, run ticket HMAC, thời gian chạy, giới hạn điểm và trạng thái ticket chưa dùng.

## Luôn lưu dữ liệu

Sau mỗi ván, kết quả được ghi ngay vào lịch sử cục bộ trong `localStorage` với tối đa 24 ván gần nhất. Khi một ván online đã có run ticket nhưng request ghi điểm gặp timeout, lỗi mạng hoặc lỗi server, điểm được đưa vào hàng đợi cục bộ tối đa 10 mục và tự retry khi mạng trở lại, sau 30 giây nếu server tạm lỗi hoặc khi người dùng đăng nhập lại. Nếu server trả `run_already_used`, queue được xóa vì server đã khóa ticket; điều này tránh ghi trùng khi response thành công bị mất trên đường truyền. Các lỗi xác thực, ticket hết hạn và payload không hợp lệ không được retry vô hạn.

Kỷ lục cá nhân, tên hiển thị, cài đặt âm thanh, lịch sử ván và hàng đợi chờ đồng bộ được lưu cục bộ. Supabase lưu Leaderboard chính thức và các run online sau khi API server xác thực. Client không lưu service key, signing secret hoặc mật khẩu. `localStorage` không phải nơi lưu trữ chống xóa; nếu người dùng xóa dữ liệu trình duyệt, dùng chế độ riêng tư hoặc đổi thiết bị thì dữ liệu local có thể mất, còn dữ liệu đã đồng bộ lên Supabase vẫn được giữ.

## Online và offline

Khi thiếu `SUPABASE_URL` hoặc `SUPABASE_ANON_KEY`, hoặc CDN/Supabase không truy cập được, game tự chuyển sang trạng thái **chơi cục bộ**. Kỷ lục cá nhân và lịch sử ván vẫn được lưu trong `localStorage`. Khi kết nối thành công, chỉ báo mạng hiển thị **trực tuyến**, Leaderboard được tải từ Supabase và hàng đợi điểm hợp lệ sẽ được thử đồng bộ lại.

## Kiểm thử watermark backup

Test unit kiểm tra roundtrip, sai mật khẩu, sửa ciphertext, thiếu watermark và watermark bị thay đổi. Test Playwright kiểm tra backup thực tế trong trình duyệt, xác nhận có đúng 5 lớp sau giải mã và các marker watermark không lộ ra trong envelope JSON:

```bash
npm test
npm run build
node e2e/backup-watermark.e2e.mjs
```

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


## Khu vực quản trị

Trang quản trị nằm tại [`/admin`](admin.html) và chỉ hiển thị dữ liệu sau khi tài khoản Supabase được xác thực. Dashboard hiện có thống kê tổng số điểm, số ván online, số ván đã nộp và kỷ lục hệ thống; bảng điểm gần đây hỗ trợ tìm theo tên hoặc user ID và không có thao tác xóa/sửa trực tiếp.

Quyền quản trị được kiểm tra ở server-side trong [`api/admin-data.mjs`](api/admin-data.mjs). Tài khoản được cấp quyền nếu thỏa một trong các điều kiện sau: `user.app_metadata.role` là `admin`, `user.app_metadata.is_admin` là `true`, email có trong `ADMIN_EMAILS`, hoặc UUID có trong `ADMIN_USER_IDS`. Các danh sách nhiều giá trị phân tách bằng dấu phẩy.

### Cấu hình `ADMIN_EMAILS` trên Vercel

`ADMIN_EMAILS` là biến **server-side**, không được thêm tiền tố `PUBLIC_` và không được đưa vào `config.js`. Vercel mã hóa biến môi trường khi lưu, nhưng giá trị vẫn có thể được xem bởi người có quyền truy cập project, vì vậy chỉ cấp quyền Vercel cần thiết cho thành viên quản trị. Tham khảo [Vercel Environment Variables](https://vercel.com/docs/environment-variables).

1. Mở **Vercel Dashboard**, chọn đúng project đang deploy repository `norat02/sky`, sau đó vào **Settings → Environment Variables**.
2. Nhập tên biến chính xác là `ADMIN_EMAILS`. Ở ô giá trị, nhập email đã tồn tại trong **Supabase → Authentication → Users**, ví dụ `admin@example.com`. Nếu có nhiều admin, phân tách bằng dấu phẩy, chẳng hạn `owner@example.com, moderator@example.com`.
3. Chọn environment áp dụng. Chọn **Production** cho domain thật. Chọn thêm **Preview** nếu cần test trên deployment preview. Nếu hai môi trường dùng danh sách khác nhau, tạo giá trị riêng cho từng environment thay vì gộp tài khoản preview vào Production.
4. Nhấn **Save**, sau đó tạo deployment mới bằng cách push commit mới lên nhánh production hoặc chọn **Redeploy** deployment. Thay đổi biến môi trường **không áp dụng ngược cho deployment cũ**; Vercel chỉ đưa giá trị mới vào deployment mới.
5. Không đặt `ADMIN_EMAILS` trong `config.js`, `index.html`, `admin.html`, GitHub Actions log hoặc file public. Có thể cấu hình thêm `ADMIN_USER_IDS` bằng UUID Supabase nếu muốn phân quyền ổn định hơn email; khi dùng cả hai, chỉ cần một điều kiện khớp.

Giá trị mẫu trong Vercel:

```text
ADMIN_EMAILS=admin@example.com
ADMIN_USER_IDS=
```

Để tránh lỗi do khoảng trắng, nên nhập theo dạng `admin@example.com,moderator@example.com`. Mã nguồn tự trim khoảng trắng và so sánh email không phân biệt hoa thường.

### Cấu hình tài khoản trong Supabase

Tạo hoặc xác nhận tài khoản tại **Authentication → Users** trước. Cách đơn giản nhất là dùng email trong `ADMIN_EMAILS`. Cách thay thế là dùng **user UUID** trong `ADMIN_USER_IDS`. Mã nguồn cũng chấp nhận `app_metadata.role = admin` hoặc `app_metadata.is_admin = true`; không dùng `user_metadata` để cấp quyền, vì metadata này có thể do người dùng tự chỉnh sửa. Nếu chỉnh `app_metadata`, hãy refresh phiên đăng nhập hoặc đăng xuất/đăng nhập lại để access token nhận claim mới.

Nếu dùng Google OAuth, thêm URL đầy đủ của trang admin, ví dụ `https://your-domain.vercel.app/admin`, vào **Supabase → Authentication → URL Configuration → Redirect URLs**. Sau đó đăng nhập tại `/admin` và kiểm tra email hiển thị trên dashboard.

### Checklist xác minh sau cấu hình

Mở `/admin` ở deployment mới và thử lần lượt bằng một tài khoản không có trong allowlist, một tài khoản có email trong `ADMIN_EMAILS`, và nếu có thể một tài khoản được cấp qua `app_metadata`. Kết quả đúng là tài khoản thường không được trả dữ liệu và endpoint `/api/admin-data` trả `403`; tài khoản admin thấy dashboard và endpoint trả `200`; request không có hoặc có Bearer token không hợp lệ trả `401`. Có thể xem chi tiết request trong **Vercel → Deployments → Functions/Runtime Logs**. Không ghi access token hoặc service role key vào log.

### Cấu hình Google OAuth cho `/admin`

Luồng đăng nhập Google của trang admin có hai loại URL khác nhau: Google nhận callback tại Supabase, còn Supabase quyết định URL cuối cùng mà người dùng được phép quay về. Cấu hình đủ cả hai nơi là bắt buộc. Tham khảo [Supabase Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google) và [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

#### 1. Tạo OAuth Client trên Google Cloud

Mở [Google Auth Platform](https://console.cloud.google.com/auth/overview), chọn đúng Google Cloud project, cấu hình Branding/consent screen nếu Google yêu cầu, sau đó vào **Clients → Create client → Web application**. Lưu lại **Client ID** và **Client Secret**.

Trong **Authorized JavaScript origins**, thêm origin không có path. Với production, dùng `https://your-domain.vercel.app`; với local, dùng đúng origin nơi bạn chạy web, ví dụ `http://127.0.0.1:4173` hoặc `http://localhost:3000`. Không nhập `/admin` vào JavaScript origin.

Trong **Authorized redirect URIs**, không nhập URL trang admin. Hãy nhập callback của chính project Supabase:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Có thể lấy callback URL này ngay tại trang Google provider trong Supabase Dashboard. Đây là điểm thường bị nhầm: Google redirect về Supabase callback trước, sau đó Supabase mới redirect tiếp về `/admin`.

#### 2. Bật Google provider trong Supabase

Vào **Supabase Dashboard → Authentication → Providers → Google**, bật Google, dán **Client ID** và **Client Secret** từ Google Cloud rồi lưu. Không commit Client Secret vào repository và không đặt nó trong `config.js`; secret này chỉ được lưu ở Supabase.

#### 3. Cấu hình URL Configuration của Supabase

Vào **Authentication → URL Configuration**. Đặt **Site URL** là URL gốc production, có dấu `/` cuối:

```text
https://your-domain.vercel.app/
```

Trong **Redirect URLs**, thêm các URL mà code admin thực sự gửi ở `redirectTo`:

```text
https://your-domain.vercel.app/admin
https://your-domain.vercel.app/admin.html
http://127.0.0.1:4173/admin
http://localhost:3000/admin
```

`admin.html` nên được giữ lại nếu bạn có lúc mở URL đầy đủ thay vì URL clean `/admin`. Với Vercel Preview, có thể thêm wildcard theo team/account slug:

```text
https://*-<team-or-account-slug>.vercel.app/**
```

Trong production, ưu tiên URL cụ thể thay vì wildcard rộng. Redirect URL trong Supabase phải khớp allowlist; khác domain, khác path hoặc thiếu protocol đều có thể làm OAuth bị từ chối. Nếu dùng email confirmation hoặc password reset với `redirectTo`, kiểm tra thêm template email để dùng `{{ .RedirectTo }}` khi cần.

#### 4. Kiểm tra flow trên trang admin

Sau khi lưu cấu hình, redeploy Vercel để các biến môi trường mới có hiệu lực. Mở `https://your-domain.vercel.app/admin`, nhấn **Tiếp tục với Google**, hoàn tất consent và xác nhận trình duyệt quay lại đúng `/admin`. Sau khi quay lại, email phải xuất hiện ở góc phải và dashboard chỉ hiển thị nếu email đó có trong `ADMIN_EMAILS`, UUID có trong `ADMIN_USER_IDS`, hoặc user có `app_metadata` admin.

Nếu gặp lỗi `redirect_uri_mismatch`, sửa **Authorized redirect URIs** trên Google Cloud về callback Supabase, không sửa thành `/admin`. Nếu gặp lỗi redirect không được phép từ Supabase, bổ sung URL `/admin` tương ứng trong **Authentication → URL Configuration**. Nếu đăng nhập thành công nhưng nhận `403`, kiểm tra email thực tế trong session, dấu cách trong `ADMIN_EMAILS`, environment của deployment và việc đã redeploy sau khi lưu biến.

Service role key vẫn chỉ được đọc bởi Vercel Function; trình duyệt chỉ gửi access token của phiên Supabase. Các biến bắt buộc server-side gồm:

```text
SUPABASE_SERVICE_ROLE_KEY=...
SCORE_SIGNING_SECRET=...
ADMIN_EMAILS=admin@example.com
ADMIN_USER_IDS=
```


## Playwright E2E cho trang admin

Kịch bản [`e2e/admin.e2e.mjs`](e2e/admin.e2e.mjs) kiểm tra title, `noindex`, form email/mật khẩu, nút Google OAuth, liên kết quay lại game, responsive desktop/mobile và trạng thái `401` của `/api/admin-data` trên deployment từ xa. Khi chạy local, test tự khởi động static server và dùng `/admin.html`; khi chạy trên Vercel, test dùng URL clean `/admin`.

Chạy smoke test local:

```bash
npm ci
npm run build
npm run test:e2e:admin
```

Chạy trên Vercel Preview hoặc Production:

```bash
ADMIN_E2E_BASE_URL=https://your-domain.vercel.app npm run test:e2e:admin
```

Để kiểm tra dashboard bằng một tài khoản admin test qua Email/Password, truyền biến môi trường ở shell hoặc CI secret, không commit chúng vào repository:

```bash
ADMIN_E2E_BASE_URL=https://your-domain.vercel.app \
ADMIN_E2E_EMAIL=admin@example.com \
ADMIN_E2E_PASSWORD='your-test-password' \
ADMIN_E2E_EXPECT_ADMIN=1 \
npm run test:e2e:admin
```

Test không in mật khẩu ra log. Nếu không truyền email/mật khẩu, test chỉ chạy smoke UI và kiểm tra unauthenticated API. Việc hoàn tất OAuth Google thực tế thường cần browser session/consent của người dùng; test vẫn kiểm tra nút OAuth và URL redirect phải được cấu hình theo phần Google OAuth bên trên.


## Benchmark mã hóa backup

Benchmark [`scripts/benchmark-backup.mjs`](scripts/benchmark-backup.mjs) chạy trực tiếp trong Chromium bằng Web Crypto, nên đo đúng luồng `encryptBackup`/`decryptBackup` của ứng dụng thay vì một bản mô phỏng Node.js. Mỗi lần đo bao gồm việc tạo và xác minh watermark 5 lớp; một vòng warm-up được loại khỏi thống kê. Payload mặc định là backup schema v2 với 24 bản ghi lịch sử.

Chạy benchmark mặc định 20 vòng:

```bash
npm ci
npm run build
npm run benchmark:backup
```

Có thể thay đổi số vòng bằng biến môi trường:

```bash
BENCHMARK_ITERATIONS=50 npm run benchmark:backup
```

Kết quả in ra JSON gồm thời gian `average`, `median`, `p95`, `min`, `max` theo mili-giây cho cả mã hóa và giải mã, cùng kích thước ciphertext. `median` phản ánh vòng điển hình; `p95` dùng để nhận biết đuôi chậm do thiết bị hoặc scheduler trình duyệt. Kết quả phụ thuộc CPU, Chromium, tải máy và kích thước payload nên chỉ nên so sánh giữa các lần chạy cùng môi trường.

## Roster nhân vật và coin

Toàn bộ sáu map cũ (`sakura`, `autumn`, `snow`, `night`, `rain`, `aurora`) vẫn được giữ nguyên ID và giao diện. Roster hiện có chín nhân vật. Sẻ miễn phí; các nhân vật khác mở khóa bằng coin kiếm được khi nhặt coin trong ván hoặc đạt điểm khi kết thúc ván. Mỗi nhân vật có cả ưu điểm và nhược điểm, tác động tới tốc độ, khoảng khe, lực rơi, hitbox hoặc hệ số coin.

| Nhân vật | Ưu điểm | Nhược điểm | Giá |
|---|---|---|---:|
| Sẻ | Dễ điều khiển | Không có bonus | Miễn phí |
| Én | Bay nhanh hơn | Khe hẹp hơn | 30 coin |
| Quạ | Khe rộng hơn | Rơi nhanh hơn | 45 coin |
| Bồ câu | Khe rộng hơn | Coin ít hơn | 60 coin |
| Chim cắt | Rất nhanh, nhiều coin | Khe hẹp và rơi mạnh | 80 coin |
| Cú mèo | Rơi chậm, dễ giữ độ cao | Bay chậm, ít coin | 100 coin |
| Diều hâu | Nhiều coin, lực vỗ mạnh | Hitbox lớn, tốc độ cao | 120 coin |
| Hạc | Khe rất rộng | Chậm, hitbox lớn | 150 coin |
| Bói cá | Hệ số coin cao | Khe hẹp hơn | 180 coin |

Coin và danh sách nhân vật mở khóa được lưu offline bằng `chimse.coins` và `chimse.unlocked-characters`. Khi restore backup, ứng dụng chỉ nhận ID nhân vật có trong roster hiện tại.

## Kiểm thử XSS localStorage

Chạy mô phỏng XSS an toàn bằng Playwright:

```bash
npm run test:e2e:characters-xss
```

Test đặt marker giả vào localStorage, reload ứng dụng, theo dõi request exfiltration và kiểm tra DOM. Test đạt khi payload không thực thi, không có request gửi ra endpoint giả và ciphertext backup không xuất hiện trong giao diện. Kịch bản không gửi dữ liệu thật ra ngoài.
