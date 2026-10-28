# DMARC cho domain norat.click

Tài liệu này giải thích báo cáo DMARC tổng hợp mà Google gửi về, và cách dùng
code trong repository để đọc các báo cáo đó + kiểm tra cấu hình mail của domain.

## 1. Báo cáo trong file đính kèm

File `google.com!norat.click!1792886400!1792972799.zip` là **báo cáo DMARC tổng hợp**
(aggregate report) do Google gửi tới địa chỉ `rua` của domain. Nó **không** liên
quan tới AdSense.

Tên file của Google có dạng `google.com!<domain>!<begin>!<end>.zip`, trong đó
`begin`/`end` là Unix timestamp theo giây:

```text
1792886400 → 2026-10-25T00:00:00Z
1792972799 → 2026-10-25T23:59:59Z
```

Nội dung sau khi giải nén là một file XML:

```xml
<policy_published>
  <domain>norat.click</domain>
  <adkim>r</adkim> <aspf>r</aspf>
  <p>none</p> <sp>none</sp> <pct>100</pct>
</policy_published>
<record>
  <row>
    <source_ip>165.173.182.52</source_ip>
    <count>1</count>
    <policy_evaluated>
      <disposition>none</disposition> <dkim>pass</dkim> <spf>pass</spf>
    </policy_evaluated>
  </row>
  <identifiers><header_from>norat.click</header_from></identifiers>
  <auth_results>
    <dkim><domain>norat.click</domain><result>pass</result><selector>zmail</selector></dkim>
    <spf><domain>norat.click</domain><result>pass</result></spf>
  </auth_results>
</record>
```

### Đọc nhanh

| Trường | Giá trị | Ý nghĩa |
|---|---|---|
| `org_name` | `google.com` | Google là bên **nhận** email và gửi phản hồi DMARC. |
| `source_ip` | `165.173.182.52` | IP đã gửi email. Reverse DNS: `sender5-of-o52.zoho.com` → **Zoho Mail**. |
| `count` | `1` | Một tin trong cửa sổ 2026-10-25 (UTC). |
| `dkim` / `spf` | `pass` / `pass` | Cả hai đều **căn chỉnh** (aligned). |
| `selector` | `zmail` | Selector DKIM của Zoho. |
| `disposition` | `none` | Bên nhận không quarantine, không reject. |
| `p` / `pct` | `none` / `100` | Chính sách DMARC đang publish ở chế độ **chỉ quan sát**. |

### Kết luận

**Mail của domain đang hoạt động bình thường và không có dấu hiệu giả mạo.**
Cả SPF lẫn DKIM đều pass, nên bản thân báo cáo này là tin tốt.

Điểm cần xử lý là **chính sách đang để ở `p=none`** — nghĩa là nếu có kẻ giả mạo
`norat.click`, bên nhận vẫn nhận và hiển thị email. Xem mục 4.

## 2. Cấu hình DNS hiện tại

Kiểm tra trực tiếp:

```bash
npm run audit:domain-email -- norat.click
```

Kết quả:

| Bản ghi | Giá trị |
|---|---|
| MX | `mx.zoho.com`, `mx2.zoho.com`, `mx3.zoho.com` |
| SPF | `v=spf1 include:zohomail.com ~all` |
| DKIM | `zmail._domainkey.norat.click` (khoá thật) |
| DKIM đã thu hồi | `default`, `google`, `selector1`, `selector2`, `mail`, `dkim` — đều là `v=DKIM1; p=` (khoá rỗng) |
| DMARC | `v=DMARC1; p=none; rua=mailto:norat22022012@gmail.com; ruf=mailto:norat22022012@gmail.com; sp=none; adkim=r; aspf=r` |

Hai điểm đáng lưu ý:

1. **`p=none`** — chỉ quan sát, không chặn.
2. **`~all` trong SPF** — softfail. Nên đổi thành `-all` khi việc gửi ổn định.
3. Sáu selector DKIF còn lại có khoá rỗng (`p=`). Đó là **khoá đã thu hồi**, không
   phải khoá hoạt động — công cụ audit phân biệt rõ hai loại này.

## 3. Tool trong repository

### 3.1 `server/dmarc-report.mjs`

Parser DMARC aggregate report, **không phụ thuộc ngoài**:

- Bộ đọc XML tự viết, chỉ hỗ trợ đúng tập con XML mà DMARC dùng.
- **Từ chối mọi `DOCTYPE` và `ENTITY`** → chặn XXE và "billion laughs" vì không
  có bảng entity để khai triển.
- Giới hạn kích thước đầu vào, độ sâu lồng và số node.
- Bộ đọc ZIP tự viết: chỉ đọc entry trong RAM, **không ghi file ra đĩa**, chỉ hỗ trợ
  `stored` và `deflate`, có giới hạn số entry và tổng dung lượng.
- Bản parse lỗi **fail-closed**: XML hỏng, không phải XML, ZIP hỏng, ZIP không chứa
  XML đều trả về lỗi thay vì trả về cây rỗng.

API chính:

```js
parseDmarcReport(xmlText)            // từ XML
parseDmarcReportFile(bufferOrString) // từ ZIP hoặc XML
summarizeDmarcReport(report)         // verdict + khả năng siết chính sách
readZipEntries(buffer)                // đọc entry trong ZIP
```

### 3.2 `scripts/check-dmarc-report.mjs`

Đọc báo cáo Google tải về và in kết quả:

```bash
npm run check:dmarc-report -- ~/Downloads/google.com!norat.click!1792886400!1792972799.zip
npm run check:dmarc-report -- report.xml
cat report.zip | npm run check:dmarc-report -- -
```

```text
DMARC aggregate report — google.com!norat.click!1792886400!1792972799.zip

  Reported by   : google.com <noreply-dmarc-support@google.com>
  Report id     : 15009049095792059605
  Date range    : 2026-10-25T00:00:00.000Z → 2026-10-25T23:59:59.000Z
  Domain        : norat.click
  Published DMARC: p=none sp=none pct=100 adkim=r aspf=r

  Records       : 1 (1 message)
  Fully aligned : 1
  Source IPs    : 165.173.182.52

  · 165.173.182.52 (1) — aligned
      dkim=pass spf=pass disposition=none header_from=norat.click
      dkim auth: norat.click result=pass selector=zmail
      spf auth : norat.click result=pass

  Verdict       : aligned
  → Alignment is clean. The policy can move from p=none to p=quarantine.
```

Exit code 1 nếu có bản ghi fail alignment hoặc không parse được — dùng được làm gate.

### 3.3 `scripts/audit-domain-email.mjs`

Kiểm tra DNS trực tiếp (qua DNS-over-HTTPS) và đề xuất bản ghi DMARC:

```bash
npm run audit:domain-email -- norat.click --suggest
```

```text
Suggested DMARC record (none → quarantine):

  Name  : _dmarc.norat.click
  Type  : TXT
  Value : v=DMARC1; p=quarantine; rua=mailto:norat22022012@gmail.com; pct=100; adkim=r; aspf=r; sp=none
```

### 3.4 `scripts/test-dmarc-report.mjs`

Chạy trong `npm test` và trong CI. Bao gồm các ca:

- Parse đúng báo cáo thật.
- **XXE bị chặn** (`<!ENTITY xxe SYSTEM "file:///etc/passwd">`).
- **Billion laughs bị chặn**.
- XML hỏng, XML không hợp lệ, ZIP hỏng, ZIP không có XML → fail closed.
- Phân loại đúng: aligned / partial (một trong hai fail) / failing (cả hai fail).
- Chỉ siết được chính sách khi **mọi** bản ghi đều căn chỉnh.

## 4. Lộ trình siết chính sách DMARC

Báo cáo cho thấy căn chỉnh đang sạch, nên có thể siết theo thang:

```text
p=none  (monitor)  →  p=quarantine  →  p=reject
```

| Bước | Giá trị | Thời gian chờ | Điều kiện đi lên bước sau |
|---|---|---|---|
| 1 | `p=none; pct=100` | hiện tại | Mọi báo cáo đều `aligned`, không có `failing`. |
| 2 | `p=quarantine; pct=100` | ≥ 7 ngày | Không có bản ghi nào bị quarantine nhầm. |
| 3 | `p=reject; pct=100` | ≥ 7 ngày | Không có bản ghi nào bị reject nhầm. |

Sau mỗi bước, chạy lại:

```bash
npm run audit:domain-email -- norat.click
```

và kiểm tra báo cáo mới gửi về `rua` để xác nhận vẫn `aligned`.

### Nội dung bản ghi đề xuất

```dns
_dmarc.norat.click.  IN TXT  "v=DMARC1; p=quarantine; rua=mailto:norat22022012@gmail.com; pct=100; adkim=r; aspf=r; sp=none"
```

Lưu ý:

- `rua` phải là **địa chỉ có thể nhận thư** và nên là địa chỉ bạn thật sự mở.
  Địa chỉ `norat22022012@gmail.com` nằm ngoài domain `norat.click`, nên bản thân nó
  **không** được xác thực bằng DMARC — điều này bình thường và được Google chấp nhận,
  nhưng hãy cân nhắc dùng một địa chỉ trên chính domain để nhận báo cáo.
- `ruf` (báo cáo giả lập) không bắt buộc; có thể bỏ để giảm nhiễu.
- `sp=none` có nghĩa subdomain không có chính sách riêng → kế thừa chính sách của
  domain chính. Nếu mọi subdomain đều dùng Zoho thì có thể đặt `sp=quarantine`.
- `adkim=r` / `aspf=r` là **relaxed alignment**. Đổi sang `s` (strict) mạnh hơn nhưng
  dễ vỡ với các dịch vụ gửi có nhiều lớp chuyển tiếp — chỉ siết sau khi đã ổn định.

### SPF

```dns
norat.click.  IN TXT  "v=spf1 include:zohomail.com -all"
```

Đổi `~all` → `-all` **chỉ khi** đã chắc chắn mọi thư đi ra đều qua Zoho. Nếu còn
dịch vụ khác gửi hộ (CRM, hệ thống báo cáo, script), phải `include:` thêm trước.

### DKIM

Chỉ `zmail._domainkey.norat.click` là khoá hoạt động. Sáu selector còn lại có
`v=DKIM1; p=` (khoá rỗng = đã thu hồi) — có thể xoá cho gọn, nhưng vô hại nếu để.

## 5. Quy trình vận hành

Google gửi báo cáo tổng hợp theo chu kỳ mặc định là **24 giờ**, vào địa chỉ trong
`rua`. Một báo cáo có thể chứa nhiều `<record>`.

```bash
# 1. Tải báo cáo mới từ hộp thư rua
# 2. Đọc nó
npm run check:dmarc-report -- "google.com!norat.click!<begin>!<end>.zip"
# 3. Nếu có bản ghi fail, tìm IP đó và sửa đúng dịch vụ gửi
# 4. Kiểm tra lại trạng thái domain
npm run audit:domain-email -- norat.click
```

Khi báo cáo vẫn `aligned` trong vài chu kỳ liên tiếp, siết `p` lên bước tiếp theo.

## 6. Checklist

- [ ] Đọc báo cáo đính kèm bằng `npm run check:dmarc-report`.
- [ ] Xác nhận mọi bản ghi `aligned`.
- [ ] Đổi DMARC `p=none` → `p=quarantine; pct=100`.
- [ ] Chờ ≥ 7 ngày, kiểm tra lại không có bản ghi fail.
- [ ] Đổi SPF `~all` → `-all` (sau khi chắc chắn mọi nguồn gửi đã được khai báo).
- [ ] Cân nhắc `rua` trên chính domain `norat.click`.
- [ ] Chờ ≥ 7 ngày rồi siết tiếp `p=reject`.
- [ ] Xoá các selector DKIM rỗng nếu muốn dọn DNS.

## 7. Liên quan

Báo cáo này **không** phải của AdSense. Phần AdSense nằm ở
[`docs/adsense-crawler-vi.md`](adsense-crawler-vi.md).
