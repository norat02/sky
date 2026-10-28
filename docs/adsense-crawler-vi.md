# AdSense: cho bot Google đọc được website

Tài liệu này giải thích nguyên nhân bot quảng cáo của Google không đọc được
trang `sky.norat.click`, và cách code trong repository đã sửa.

## 1. Bot nào cần đọc trang

| Bot | Token trong `robots.txt` | Mục đích |
|---|---|---|
| Mediapartners-Google | `Mediapartners-Google` | Crawler quảng cáo chính của AdSense. Ghé trang để biết nội dung rồi chọn quảng cáo phù hợp. |
| Google-Display-Ads-Bot | `Google-Display-Ads-Bot` | Xác minh website khi bạn thêm site vào AdSense. |
| AdsBot-Google | `AdsBot-Google` | Kiểm tra chất lượng quảng cáo (landing page, layout). |
| AdsBot-Google-Mobile | `AdsBot-Google-Mobile` | Bản mobile của AdsBot. |
| Googlebot | `Googlebot` | Crawler tìm kiếm. Không trực tiếp sinh doanh thu AdSense nhưng vẫn nên cho qua. |

Nguồn: [Google special-case crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-special-case-crawlers)
và [AdSense ads crawler](https://support.google.com/adsense/answer/99376).

Điểm quan trọng: đây là **special-case crawler**. Theo tài liệu Google, chúng **bỏ qua**
nhóm `User-agent: *` trong `robots.txt` và chỉ tuân theo luật viết đúng cho token của
mình. Vì vậy `robots.txt` cần một nhóm `Allow: /` riêng cho từng token — nếu sau này
thêm `Disallow: /` vào nhóm `*`, các bot này vẫn không bị chặn nhầm.

## 2. Trạng thái trước khi sửa

Kiểm tra trực tiếp trên bản deploy:

```bash
node scripts/check-adsense-crawl.mjs --url https://sky.norat.click
```

Kết quả trước khi sửa:

```text
robots.txt
  [FAIL] Mediapartners-Google allowed
  [FAIL] Google-Display-Ads-Bot allowed
  [FAIL] AdsBot-Google-Mobile allowed
  [FAIL] AdsBot-Google allowed
  [FAIL] Googlebot allowed
...
  [FAIL] Mediapartners-Google: ad unit present
  [FAIL] Mediapartners-Google: publisher id present — missing
  [FAIL] Mediapartners-Google: slot id filled — empty — set ADSENSE_AD_SLOT
```

Ba nguyên nhân độc lập:

1. **`robots.txt` không có nhóm cho bot quảng cáo.** File cũ chỉ có `User-agent: *`.
2. **Trang không có mã quảng cáo nào.** `adsense.js` được nạp sau khi có consent,
   nhưng không tồn tại phần tử `<ins class="adsbygoogle">` nào — tức là bot không
   thấy đơn vị quảng cáo để lấy nội dung trang.
3. **Consent gate chặn bot.** `consent-gate.js` chỉ nạp `adsense.js` khi
   `SKY_CONSENT.canRequestAds()` trả về true. Với bot không có cookie, không có
   quyết định TCF nào được lưu, nên `adsense.js` không bao giờ được nạp.

Ngoài ra, nếu trang chạy sau Cloudflare hoặc WAF khác, phải cho các bot Google
đi qua — xem [Fix AdSense crawler issues](https://support.google.com/adsense/answer/2381908).
Cloudflare cho phép bypass bằng User-Agent và Verified Bot, nhưng **không** dựa
vào User-Agent đơn thuần (bot giả mạo được).

## 3. Code đã thêm

### 3.1 `server/adsense-crawler.mjs` — nhận diện bot

Một nguồn sự thật duy nhất cho danh sách bot:

- `ADSENSE_CRAWLER_TOKENS` — các bot quảng cáo.
- `GOOGLE_CRAWLER_TOKENS` — bot tìm kiếm.
- `ROBOTS_ALLOWED_TOKENS` — những token bắt buộc có trong `robots.txt`.
- `isAdsenseCrawler(userAgent)`, `isGoogleCrawler(userAgent)`, `crawlerKind(userAgent)`.
- `adsenseCrawlerMiddleware` — middleware Express gắn `req.skyCrawler` và header
  `X-Sky-Crawler` để log phân biệt bot với người dùng thật.

Module này **không dùng API của Node**, nên có thể dùng lại ở môi trường trình
duyệt.

### 3.2 `consent-gate.js` — bot không bị chặn bởi consent

```js
var isCrawler = isAdsenseCrawler(navigator.userAgent);
...
if (window.__SKY_E2E__) publish('granted', 'non-personalized');
else if (isCrawler) publish('granted', 'non-personalized');
else { loadCmp(); watchTcfApi(); }
```

Lý do an toàn:

- Bot không có cookie jar, không có dữ liệu cá nhân nào.
- Bot không phải người dùng EEA/UK/CH, nên TCF không áp dụng với bot.
- Banner CMP **không** hiện với bot.
- Quyết định chỉ nằm trong RAM, **không** ghi vào `localStorage` hay cookie — nên
  người thật không bao giờ thừa hưởng consent của bot.
- Chế độ là `non-personalized`, không cá nhân hóa.

Danh sách token trong `consent-gate.js` được kiểm tra đồng bộ với
`server/adsense-crawler.mjs` trong `scripts/test-adsense-crawler.mjs`.

### 3.3 `index.html` — mã quảng cáo tĩnh

Đơn vị quảng cáo nằm **trực tiếp trong HTML**, không sinh bằng JavaScript:

```html
<!-- SKY_ADSENSE_SLOT:START -->
<div id="skyAdHost" class="skyAdHost" hidden>
  <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-2855538220391010"
       data-ad-slot="" data-ad-format="auto" data-full-width-responsive="true"></ins>
</div>
<!-- SKY_ADSENSE_SLOT:END -->
```

Nhờ vậy bot đọc được mã quảng cáo **ngay cả khi không thực thi JavaScript**.

`ui.js` chuyển `#skyAdHost` vào trong `.home-primary` của màn hình chính để hiển thị,
và xoá phần tử `<ins>` nếu chưa cấu hình slot id.

### 3.4 `scripts/generate-config.mjs` — chèn slot id lúc build

Block `SKY_ADSENSE_SLOT` được **sinh lại từ đầu** mỗi lần build, nên build là
idempotent (chạy hai lần cho kết quả giống nhau).

```bash
ADSENSE_AD_SLOT="1234567890" npm run build
```

- Có `ADSENSE_AD_SLOT` → `data-ad-slot="1234567890"`, bỏ thuộc tính `hidden`.
- Không có → `data-ad-slot=""` + `hidden`; client sẽ gỡ phần tử `<ins>` rỗng nên
  không có request quảng cáo hỏng nào được gửi đi.

Cùng file này sinh `robots.txt` với nhóm `Allow: /` riêng cho từng token, lấy danh
sách từ `ROBOTS_ALLOWED_TOKENS` — không thể lệch với code nhận diện bot.

### 3.5 `game.js` — đẩy ad unit khi `adsense.js` sẵn sàng

```js
function pushAdSlots(){
  var slots=document.querySelectorAll('ins.adsbygoogle');
  for(var i=0;i<slots.length;i++){
    if(!slots[i].getAttribute('data-ad-slot'))continue;
    try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}
  }
}
```

Được gọi ngay trong `.then()` sau khi `adsense.js` nạp xong. Với bot, request quảng
cáo khởi động ngay thay vì chờ sự kiện `load`.

### 3.6 `scripts/check-adsense-crawl.mjs` — công cụ kiểm tra

Tải trang **đúng user agent của từng bot** rồi báo cáo bot thấy được gì:
kiểm tra `robots.txt`, `ads.txt`, và mã quảng cáo trong HTML.

```bash
npm run check:adsense-crawl -- --url https://sky.norat.click
```

Exit code khác 0 nếu bot không đọc được mã quảng cáo — dùng được làm release gate.

### 3.7 `scripts/test-adsense-crawler.mjs` — test tĩnh

Chạy trong `npm test` và trong CI. Kiểm tra:

- Nhận diện đúng với user agent thật của Google.
- Danh sách token ở `consent-gate.js` không lệch với `server/adsense-crawler.mjs`.
- `robots.txt` cho phép mọi token bắt buộc và không chặn bot quảng cáo.
- `index.html` có đúng một đơn vị quảng cáo với publisher id hợp lệ.
- CSP cho phép `pagead2.googlesyndication.com`, `securepubads.g.doubleclick.net`.
- `ads.txt` ủy quyền publisher id.

## 4. Cấu hình cần thiết

### 4.1 Lấy ad slot id

Trong AdSense Dashboard:

1. **Quảng cáo** → **Tổng quan các đơn vị quảng cáo**.
2. Tạo đơn vị quảng cáo mới (loại *Hiển thị quảng cáo* / Display).
3. Chọn kích thước **Responsive display ad** — đúng với `data-ad-format="auto"`
   và `data-full-width-responsive="true"` trong markup.
4. Sao chép **Đơn vị quảng cáo** (ad unit id), dạng số.

### 4.2 Đặt biến môi trường

Thêm vào **Vercel → Project → Settings → Environment Variables** (áp dụng cho
Production, Preview và Development):

| Tên biến | Giá trị | Ghi chú |
|---|---|---|
| `ADSENSE_AD_SLOT` | `1234567890` | Chỉ số của ad unit. Không có giá trị → không hiện quảng cáo. |
| `ADSENSE_PUBLISHER_ID` | `ca-pub-2855538220391010` | Đã có sẵn, giữ nguyên nếu không đổi account. |

Hoặc khi build cục bộ, ghi vào `.env.local` (file này bị gitignore):

```bash
ADSENSE_AD_SLOT="1234567890"
```

Sau đó rebuild và kiểm tra lại:

```bash
npm run build
npm run check:adsense-crawl -- --url http://127.0.0.1:4173
```

### 4.3 Xác nhận trên domain thật

Sau khi deploy, chạy:

```bash
npm run check:adsense-crawl -- --url https://sky.norat.click
```

Tất cả phải là `[OK  ]`, đặc biệt là `slot id filled`.

## 5. Xử lý sự cố

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| `ad unit present` = FAIL | Bản deploy cũ, hoặc build không chạy `generate-config.mjs` | Rebuild và deploy lại. |
| `slot id filled` = FAIL | Chưa đặt `ADSENSE_AD_SLOT` | Đặt biến rồi rebuild. |
| `robots.txt` = FAIL | `robots.txt` bị ghi đè bởi CDN hoặc deploy cũ | Kiểm tra `vercel.json` không có route ghi đè `/robots.txt`. |
| Bot bị 403/503 | WAF hoặc Cloudflare chặn IP bot | Cho phép các bot Google trong WAF. Google công bố dải IP: `https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot`. |
| Bot tải trang nhưng không thấy quảng cáo | `adsense.js` bị CSP chặn | Kiểm tra CSP trong `vercel.json` có `pagead2.googlesyndication.com` và `securepubads.g.doubleclick.net`. |
| AdSense báo "Không tìm thấy mã quảng cáo" | Slot id sai hoặc thuộc tính `data-ad-client` không khớp account | Đối chiếu `ca-pub-...` với account AdSense đang dùng. |
| Không hiện quảng cáo cho người dùng thật | Consent chưa được cấp, hoặc ad unit nằm trong vùng `display:none` | Ad unit nằm trong panel màn hình chính, chỉ hiện ở đó. |

## 6. Checklist

- [ ] Đã tạo ad unit loại responsive display trong AdSense Dashboard.
- [ ] Đã đặt `ADSENSE_AD_SLOT` trong Vercel Environment Variables.
- [ ] `npm run build` chạy lại và `index.html` có `data-ad-slot` không rỗng.
- [ ] `npm run check:adsense-crawl -- --url https://sky.norat.click` báo `[OK  ]` hết.
- [ ] `ads.txt` đã có dòng ủy quyền đúng publisher id.
- [ ] `privacy-policy.html` và `terms-of-use.html` đã nêu Google AdSense và cơ chế opt-out.
- [ ] Không có bot nào bị WAF/Cloudflare chặn.
- [ ] Trong AdSense Dashboard, mục **Trang của tôi** không còn báo thiếu mã quảng cáo.

## 7. Ghi chú về chính sách

Bot được phép bỏ qua consent, nhưng **người dùng thật thì không**: mọi lượt truy cập
của người dùng ở EEA/UK/CH vẫn phải qua CMP của Google và TCF như hiện tại. Việc
thay đổi không liên quan tới dữ liệu cá nhân của người dùng.

Quảng cáo phải dễ nhận biết là quảng cáo, không được lừa người dùng, và tuyệt đối
không được yêu cầu người dùng nhấp vào quảng cáo. Các quy tắc này đã được viết
trong `privacy-policy.html` và `terms-of-use.html` — xem
[`docs/adsense-policy-findings.md`](adsense-policy-findings.md).
