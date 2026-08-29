# Cấu hình custom domain, SSL trên Vercel và rewarded video

## 1. Định dạng quảng cáo video là gì?

Đối với tính năng xem quảng cáo để hồi sinh, định dạng phù hợp là **rewarded web ad**. Đây là quảng cáo mà người chơi chủ động chọn xem để nhận một phần thưởng trong game, chẳng hạn một lượt hồi sinh. Game chỉ cấp phần thưởng sau callback xác nhận người dùng đã nhận reward.

Rewarded web ad có thể được phân phối bằng video hoặc display demand tùy nguồn quảng cáo. Vì vậy, tên “rewarded video” mô tả trải nghiệm phần thưởng; nó không có nghĩa mọi impression đều chắc chắn là một file video. Trong Google Ad Manager, hãy dùng **Rewarded ad unit** và Google Publisher Tag, không dùng Multiplex hoặc In-article làm điều kiện hồi sinh.

| Định dạng | Mục đích | Dùng cho revive |
|---|---|---|
| Rewarded web ad | Người chơi chủ động xem để nhận reward sau callback | Có |
| Display ad | Quảng cáo hiển thị thông thường | Không nên |
| Multiplex | Nhiều native ads trong một lưới, thường ở cuối nội dung | Không |
| In-article | Native ad giữa các đoạn bài viết | Không |

## 2. Chuẩn bị domain

Bạn cần có một domain đã đăng ký, ví dụ `example.com`, và quyền chỉnh DNS tại nhà cung cấp domain. Có thể dùng domain apex `example.com` hoặc subdomain `www.example.com`/`game.example.com`. Nên chọn một URL chính và redirect phiên bản còn lại về URL đó để tránh duplicate canonical.

## 3. Thêm domain trong Vercel

Trong Vercel Dashboard, mở project game, vào **Settings → Domains → Add Domain**, nhập domain cần dùng và xác nhận. Vercel có thể hiển thị chính xác DNS record cần thêm cho project; hãy ưu tiên giá trị trong dashboard thay vì sao chép giá trị từ ví dụ trên mạng.

Vercel hỗ trợ cấu hình apex domain bằng A record và subdomain bằng CNAME record. Nếu domain đang được một Vercel account khác sử dụng, Vercel có thể yêu cầu TXT record để xác minh quyền kiểm soát domain.

## 4. Cấu hình DNS

### Apex domain

Với `example.com`, tạo record tại nhà cung cấp DNS theo giá trị Vercel hiển thị, thường có dạng:

```text
Type: A
Name/Host: @
Value: <A record value shown by Vercel>
TTL: Auto hoặc 300
```

Không tự thêm nhiều A record khác nhau nếu Vercel chỉ yêu cầu một record. Xóa record cũ trỏ đến hosting trước đây nếu nó gây xung đột.

### Subdomain

Với `www.example.com` hoặc `game.example.com`, tạo CNAME:

```text
Type: CNAME
Name/Host: www hoặc game
Value: <unique Vercel CNAME target shown in dashboard>
TTL: Auto hoặc 300
```

Không đặt CNAME cho zone apex nếu nhà cung cấp DNS không hỗ trợ ALIAS/ANAME flattening. Trong trường hợp đó, dùng A record cho apex và CNAME cho `www` theo hướng dẫn Vercel.

### Nếu dùng Vercel Nameservers

Bạn có thể chuyển nameserver của domain sang nameserver do Vercel cung cấp. Trước khi chuyển, phải sao chép các DNS record hiện có như MX cho email, TXT cho SPF/DKIM/DMARC, Google verification và record của dịch vụ khác vào Vercel DNS. Nếu thiếu MX/TXT, email hoặc xác minh dịch vụ có thể ngừng hoạt động.

## 5. Kiểm tra DNS propagation

Trong Vercel, chờ trạng thái domain chuyển sang **Valid/Configured**. Có thể kiểm tra từ terminal:

```bash
dig +short example.com A
dig +short www.example.com CNAME
```

Hoặc kiểm tra trong DNS provider. DNS propagation có thể cần thời gian tùy TTL và cache resolver. Không nên tiếp tục thay đổi record liên tục trong khi đang chờ vì sẽ làm khó xác định record nào đang có hiệu lực.

## 6. SSL/HTTPS trên Vercel

Sau khi domain được thêm và DNS đã trỏ đúng, Vercel tự động yêu cầu certificate cho domain. Vercel thực hiện challenge xác minh quyền kiểm soát domain, sau đó gắn certificate vào hạ tầng HTTPS. Với domain non-wildcard, Vercel dùng Let's Encrypt theo tài liệu SSL chính thức.

Không cần tự tạo `server.key`, tự chạy Certbot hoặc tải certificate thủ công cho cấu hình thông thường. Trong Vercel, vào **Project → Settings → Domains**, mở domain và kiểm tra trạng thái SSL. Khi certificate hợp lệ, truy cập:

```text
https://example.com/
```

### Kiểm tra SSL

```bash
curl -I https://example.com/
```

Cần kiểm tra rằng request không bị redirect vòng lặp và URL cuối cùng dùng HTTPS. Có thể dùng SSL Labs hoặc DevTools Security để kiểm tra certificate chain, expiry và protocol.

Nếu SSL chưa cấp được, kiểm tra theo thứ tự: domain đã được thêm đúng project, A/CNAME đúng giá trị Vercel, không có record xung đột, DNSSEC không cấu hình sai, CAA không chặn Let's Encrypt và domain không còn gắn với Vercel account khác.

## 7. Cập nhật biến môi trường Vercel

Trong **Settings → Environment Variables**, thêm `PUBLIC_SITE_URL` cho Production:

```text
PUBLIC_SITE_URL=https://example.com/
```

Có thể thêm Supabase variables:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<public-anon-or-publishable-key>
SUPABASE_REDIRECT_URL=https://example.com/
```

Các secret server-only vẫn phải giữ riêng:

```text
SUPABASE_SERVICE_ROLE_KEY=<server-only-key>
SCORE_SIGNING_SECRET=<long-random-secret>
```

Không đưa hai secret cuối vào `config.js`, `index.html` hoặc biến `NEXT_PUBLIC_*`. Sau khi thêm biến, redeploy Production. Build của project sẽ sinh canonical URL, OG URL, OG image URL, `robots.txt` và `sitemap.xml` theo `PUBLIC_SITE_URL`.

## 8. Cập nhật Supabase OAuth

Trong Supabase, vào **Authentication → URL Configuration**:

```text
Site URL: https://example.com/
Redirect URLs:
https://example.com/
https://*.vercel.app/
```

Chỉ thêm wildcard Preview nếu chính sách project của bạn cho phép và giới hạn nó ở các URL cần thiết. Trong Google Cloud Console, Authorized JavaScript origins nên có:

```text
https://example.com
```

Authorized redirect URI của Google OAuth vẫn là callback của Supabase:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Không dùng URL callback của Vercel thay cho callback Supabase. Trong code game, `redirectTo` nên là URL production hoặc URL preview hiện tại và phải nằm trong allow list Supabase.

## 9. Kết nối rewarded ad với game

Trong Google Ad Manager, tạo ad unit dạng Rewarded, tạo line item/creative phù hợp và lấy ad unit path, ví dụ:

```text
/1234567/chimse-revive
```

Ở phía game, GPT nên được tải khi người chơi thực sự bấm hồi sinh:

```javascript
window.SKY_REWARDED_AD = {
  show: async function () {
    await window.SKY_ADS.loadGPT();
    // defineOutOfPageSlot(...REWARDED)
    // resolve(true) chỉ sau RewardedSlotGrantedEvent
  }
};
```

Không resolve thành công tại `RewardedSlotReadyEvent`, khi ad chỉ vừa sẵn sàng, hoặc khi người chơi đóng quảng cáo. Nếu AdBlock, consent chưa có, không có inventory hoặc provider trả về lỗi, game phải không cấp revive nhưng vẫn cho người chơi bỏ qua và tiếp tục luồng game over.

## 10. Checklist production

| Hạng mục | Trạng thái cần đạt |
|---|---|
| Domain | Vercel hiển thị Valid/Configured |
| DNS | Apex dùng A record hoặc cơ chế ALIAS/ANAME; subdomain dùng CNAME |
| SSL | HTTPS mở được, certificate hợp lệ, không redirect loop |
| SEO URL | `PUBLIC_SITE_URL` là domain production thật, có dấu `/` cuối |
| Supabase | Site URL và Redirect URLs chứa domain chính |
| Google OAuth | JavaScript origin và Supabase callback đúng |
| OG preview | `og:image` là URL HTTPS công khai, ảnh tồn tại, kích thước 1200×630 |
| Rewarded ad | Chỉ trao reward sau callback granted |
| AdBlock | Không làm hỏng gameplay, không giả trao reward |
| Cache | Thumbnail và asset tĩnh có Cache-Control hợp lý |

## Tài liệu tham khảo

[1]: https://vercel.com/docs/domains/working-with-domains/add-a-domain "Vercel — Adding & Configuring a Custom Domain"

[2]: https://vercel.com/docs/domains/working-with-ssl "Vercel — Working with SSL Certificates"

[3]: https://support.google.com/admanager/answer/9116812?hl=en "Google Ad Manager — Traffic rewarded ads for web"

[4]: https://developers.google.com/publisher-tag/samples/display-rewarded-ad "Google Publisher Tag — Display a rewarded ad"

[5]: https://support.google.com/adsense/answer/9189566?hl=en "Google AdSense — About Multiplex ads"
