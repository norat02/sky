# Báo cáo Security Audit: Hệ thống Backup/Restore mã hóa

**Dự án:** Sky Bird (`norat02/sky`)

**Phạm vi:** Backup JSON local, AES-GCM, PBKDF2, watermark 5 lớp, xác minh tamper, restore vào `localStorage`, test tự động, CSP và dependency trực tiếp liên quan.

**Ngày kiểm tra:** 29/08/2026

**Phương pháp:** Review mã nguồn tĩnh, kiểm tra cấu hình, chạy unit test, Playwright E2E, attack simulation và `npm audit`. Báo cáo này là audit kỹ thuật có mục tiêu; không phải penetration test độc lập, chứng nhận compliance hoặc cam kết chống lại máy đã bị chiếm quyền.

## 1. Kết luận điều hành

Hệ thống backup hiện đáp ứng tốt mục tiêu **bảo mật dữ liệu local trước file bị sửa hoặc sai mật khẩu**. Payload được mã hóa bằng AES-256-GCM, khóa được dẫn xuất từ password bằng PBKDF2-HMAC-SHA-256 với salt ngẫu nhiên, và restore yêu cầu watermark 5 lớp hợp lệ. Test tấn công đã xác nhận các trường hợp sửa ciphertext, xóa watermark và sửa plaintext rồi mã hóa lại bằng AES-GCM hợp lệ đều bị từ chối.

Đánh giá tổng thể: **Chấp nhận có điều kiện cho backup cá nhân offline**. Không phát hiện lỗi Critical/High trong phạm vi audit. Rủi ro còn lại chủ yếu là rủi ro kiến trúc client-side: JavaScript cùng origin có thể đọc localStorage, password có thể bị lấy khi người dùng nhập nếu browser/runtime bị kiểm soát, và watermark không phải một secret server-side.

> **Kết luận ngắn:** AES-GCM đang bảo vệ confidentiality và authenticated integrity đúng hướng; watermark bổ sung tamper-evidence; nhưng không thể biến mã JavaScript công khai thành một môi trường tin cậy tuyệt đối.

## 2. Phạm vi tài sản và luồng được audit

Các tài sản cần bảo vệ gồm lịch sử ván, kỷ lục cá nhân, tên hiển thị, setting local, tính toàn vẹn của file backup và việc không ghi dữ liệu giả mạo vào localStorage khi restore.

Luồng chính được kiểm tra là:

```text
local state
    -> backupPayload()
    -> createBackupWatermark()
    -> AES-256-GCM encrypt
    -> JSON envelope
    -> password + decrypt
    -> validateBackupWatermark()
    -> validatedBackupObjects WeakSet
    -> restoreBackupData()
```

Review xác nhận payload schema v2 không đưa `pendingScores`, run ticket hoặc dữ liệu có thể dùng để gửi điểm online vào backup. Service-role key, signing secret, OAuth secret và password không thuộc payload backup.

## 3. Ma trận phát hiện

| ID | Phát hiện | Mức độ | Trạng thái | Ảnh hưởng |
|---|---|---:|---|---|
| F-01 | Password là nguồn bí mật duy nhất ở phía client | Medium | Chấp nhận có điều kiện | Password yếu có thể bị brute-force; password mất thì không restore được |
| F-02 | Watermark không phải secret mật mã | Medium | Đã giảm thiểu | Người có source/runtime có thể phân tích hoặc tái tạo logic client |
| F-03 | `localStorage` và runtime browser không phải trust boundary | Medium | Chấp nhận có điều kiện | XSS/extension/malware có thể đọc dữ liệu hoặc can thiệp password/runtime |
| F-04 | CSP còn `unsafe-inline` và phụ thuộc CDN module | Low–Medium | Cần cải thiện | Giảm hiệu quả của CSP và tăng supply-chain exposure |
| F-05 | `WeakSet` bảo vệ đường restore trong runtime, không bảo vệ persistence | Low | Đã triển khai | Reload hoặc patch client có thể bỏ qua lớp defense-in-depth này |
| F-06 | Backup cũ không có watermark mới sẽ bị từ chối | Low | Có chủ ý | Có thể gây nhầm là file hỏng nếu không có migration message |

Không có phát hiện Critical hoặc High trong phạm vi code và test được kiểm tra.

## 4. Đánh giá mật mã

### 4.1 Điểm đạt

Ứng dụng sử dụng AES-GCM với khóa 256 bit, IV 12 byte tạo ngẫu nhiên bằng `crypto.getRandomValues`, và ciphertext có authentication tag do Web Crypto quản lý. Authenticated encryption là lựa chọn phù hợp vì vừa bảo vệ confidentiality vừa phát hiện thay đổi dữ liệu [1]. OWASP cũng khuyến nghị AES với khóa đủ mạnh, authenticated mode như GCM/CCM và CSPRNG cho chức năng bảo mật [1].

Khóa AES được dẫn xuất từ password bằng PBKDF2-HMAC-SHA-256 với 150.000 vòng lặp và salt ngẫu nhiên. PBKDF2 được thiết kế cho password material entropy tương đối thấp; chi phí lặp làm tăng chi phí dictionary attack [3]. Salt và IV được lưu trong envelope là bình thường vì chúng không cần giữ bí mật.

### 4.2 Rủi ro và khuyến nghị

PBKDF2 không thể bù cho password yếu. Nên bổ sung password policy rõ ràng, khuyến nghị passphrase dài, không lưu password và cảnh báo rằng mất password đồng nghĩa mất backup. Nên tiếp tục dùng benchmark để calibrate số vòng theo thiết bị; nếu chuyển sang Argon2id/scrypt, chỉ dùng implementation browser đã được kiểm duyệt, không tự viết KDF.

Backup được mã hóa ở client nên password có thể bị quan sát bởi mã độc, extension hoặc hook runtime tại thời điểm người dùng nhập. Đây là giới hạn kiến trúc, không phải lỗi của AES-GCM. Nếu yêu cầu bảo mật cao hơn, cần chuyển một phần trust sang server-side key management hoặc server-side signature.

## 5. Đánh giá watermark 5 lớp

Watermark được tạo từ payload lõi và context của envelope. Năm lớp dùng các biểu diễn khác nhau: SHA-256 hex, Base64URL, biến đổi đảo chiều có tag, grouped-hex và Base64URL có tag. Watermark được đặt trong plaintext payload trước khi AES-GCM mã hóa; do đó JSON envelope bên ngoài chỉ chứa metadata, salt, IV và ciphertext.

Khi decrypt, ứng dụng tái tạo watermark từ payload, salt và IV, sau đó so sánh đủ năm lớp. Thiếu watermark, sai version, sai số lớp, thay đổi payload hoặc thay đổi một lớp đều bị từ chối. Watermark giúp phát hiện payload được mã hóa lại nhưng không còn khớp; AES-GCM chịu trách nhiệm chính cho authenticated integrity của ciphertext.

Các biểu diễn nhiều lớp chỉ là **obfuscation và tamper-evidence**, không phải khóa bí mật. Vì source và JavaScript chạy phía client, người có quyền đọc source hoặc điều khiển browser vẫn có thể phân tích công thức. Nếu cần ngăn người có password tạo file giả, watermark phải được bổ sung HMAC/EdDSA bằng khóa chỉ tồn tại server-side; khi đó restore sẽ không còn offline hoàn toàn.

## 6. Đánh giá restore và cơ chế vô hiệu hóa

Restore có hai lớp kiểm soát. `decryptBackup` phải vượt qua format validation, AES-GCM authentication và watermark validation. Sau đó object đã xác thực được đánh dấu trong `validatedBackupObjects`, một `WeakSet` chỉ tồn tại trong page runtime. `restoreBackupData` từ chối object không thuộc tập đã xác thực, kể cả khi object đó có hình dạng giống payload hợp lệ.

Khi validation thất bại, exception xảy ra trước thao tác ghi `best`, history, name, mute, character hoặc map. Hành vi “tự hủy” hiện được triển khai an toàn dưới dạng **tự động vô hiệu hóa file và từ chối restore**, không xóa file gốc. Giữ file gốc giúp điều tra và tránh mất dữ liệu không thể hoàn tác.

`WeakSet` là defense-in-depth chứ không phải boundary độc lập. Nó không thể bảo vệ nếu attacker patch JavaScript trước khi chạy, thay thế bundle, hoặc kiểm soát toàn bộ browser runtime.

## 7. Kịch bản tấn công đã kiểm thử

[`e2e/backup-attack.e2e.mjs`](../e2e/backup-attack.e2e.mjs) mô phỏng tool ngoài có password hợp lệ. Kịch bản giải mã backup, sửa điểm và lớp watermark cuối, rồi mã hóa lại bằng AES-GCM hợp lệ để kiểm tra riêng watermark; kết quả bị từ chối. Nó cũng xóa watermark hoàn toàn, sửa một byte ciphertext, gọi trực tiếp restore với object chưa xác thực và so sánh localStorage trước/sau.

| Kịch bản | Kết quả |
|---|---|
| Sửa payload và watermark rồi mã hóa lại hợp lệ | Bị `decryptBackup` từ chối |
| Xóa toàn bộ watermark rồi mã hóa lại | Bị từ chối |
| Sửa một byte ciphertext | AES-GCM từ chối |
| Gọi thẳng restore bằng object do tool tạo | `WeakSet` từ chối |
| File bị vô hiệu hóa | localStorage không thay đổi |

## 8. Browser storage, CSP và dependency

OWASP cảnh báo localStorage có thể được JavaScript cùng origin đọc hoặc sửa, và XSS có thể lấy dữ liệu trong storage [2]. Vì vậy localStorage chỉ nên chứa dữ liệu không được coi là trust boundary; password backup, service-role key và signing secret không được lưu tại đó. Session token cũng không nên được xem là an toàn nếu nằm trong localStorage [2].

CSP hiện có các header tốt như `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `X-Frame-Options: DENY`, `nosniff`, Referrer Policy và Permissions Policy. Tuy nhiên `script-src` vẫn có `unsafe-inline` và cho phép `https://esm.sh`. Khuyến nghị chuyển inline script sang file static hoặc CSP nonce/hash, pin dependency theo version/digest và self-host module quan trọng khi khả thi.

`npm audit --omit=dev --audit-level=high` trong lần audit này trả về **0 vulnerabilities**. Đây là kết quả tại thời điểm kiểm tra, không thay thế việc audit dependency định kỳ.

## 9. Bằng chứng kiểm thử

Các lệnh sau đã chạy thành công:

```text
npm run verify                    PASS
npm test                          PASS
npm run test:e2e:admin            PASS
npm run test:e2e:backup           PASS
npm run test:e2e:backup:attack    PASS
npm audit --omit=dev --audit-level=high   0 vulnerabilities
```

## 10. Khuyến nghị theo ưu tiên

| Ưu tiên | Khuyến nghị | Lý do |
|---|---|---|
| P0 | Không lưu password backup, service-role key hoặc signing secret ở client/localStorage | Giảm rủi ro lộ secret trực tiếp |
| P1 | Giảm `unsafe-inline`, pin/self-host CDN module và thêm XSS regression tests | Giảm khả năng script lạ đọc localStorage/password |
| P1 | Password policy và hướng dẫn passphrase dài | Giảm dictionary attack và mất quyền restore |
| P2 | Calibrate PBKDF2 bằng benchmark, đánh giá KDF memory-hard đã được kiểm duyệt | Tăng chi phí brute-force |
| P2 | Nếu cần chống giả mạo mạnh, thêm server-side signature/key | Không phụ thuộc vào secret nằm trong client |
| P2 | Thêm migration UX cho backup cũ không có watermark | Giải thích rõ lý do file bị từ chối |
| P3 | Chạy `npm audit` và kiểm tra CDN integrity định kỳ | Giảm supply-chain drift |

## 11. Kết luận

Trong phạm vi audit, không phát hiện lỗi nghiêm trọng làm bypass AES-GCM hoặc cho phép backup bị chỉnh sửa đi qua pipeline restore. Attack simulation xác nhận file bị sửa, thiếu watermark hoặc có watermark sai đều bị vô hiệu hóa và không ghi dữ liệu vào localStorage.

Hệ thống phù hợp với backup cá nhân offline dùng password mạnh. Không nên mô tả nó là chống giả mạo tuyệt đối: một người kiểm soát browser hoặc mã JavaScript client vẫn có thể quan sát password, patch runtime hoặc tạo logic mới. Với yêu cầu bảo mật cao hơn, cần server-side key/signature và mô hình trust không phụ thuộc hoàn toàn vào client.

## Tài liệu tham chiếu

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html "OWASP Cryptographic Storage Cheat Sheet"
[2]: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html "OWASP HTML5 Security Cheat Sheet"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey "MDN SubtleCrypto deriveKey"
