# Báo cáo Security Audit: Backup/Restore mã hóa

**Dự án:** Sky Bird (`norat02/sky`)

**Phạm vi:** Luồng tạo backup JSON, mã hóa/giải mã, watermark 5 lớp, xác minh toàn vẹn, restore vào localStorage, test tự động, cấu hình CSP và dependency liên quan.

**Ngày audit:** 29/08/2026

**Phương pháp:** Review mã nguồn tĩnh, kiểm tra cấu hình repository, chạy unit/E2E/attack simulation, kiểm tra dependency audit và đối chiếu với hướng dẫn OWASP/MDN. Đây là audit kỹ thuật có mục tiêu, không phải penetration test độc lập hoặc chứng nhận compliance.

## 1. Tóm tắt điều hành

Hệ thống hiện có nền tảng tốt cho backup cục bộ: dữ liệu được mã hóa bằng AES-256-GCM, khóa được dẫn xuất từ password bằng PBKDF2-HMAC-SHA-256 với salt ngẫu nhiên, ciphertext có authentication tag, và restore yêu cầu watermark 5 lớp hợp lệ. Các test hiện có mô phỏng cả việc sửa ciphertext, xóa watermark và sửa plaintext rồi mã hóa lại bằng AES-GCM hợp lệ.

Kết luận tổng thể là **có thể chấp nhận cho dữ liệu local không có yêu cầu compliance cao**, với điều kiện người dùng bảo vệ password backup và đội phát triển hiểu rõ rằng mã JavaScript phía client không thể giữ một secret tuyệt đối trước người có quyền điều khiển browser. Không phát hiện secret rõ ràng bị commit trong review hiện tại và `npm audit --omit=dev --audit-level=high` trả về 0 vulnerability.

Rủi ro đáng chú ý nhất là mô hình client-side: XSS, extension độc hại hoặc malware trên máy người dùng có thể đọc localStorage, can thiệp vào runtime hoặc lấy password khi người dùng nhập. Watermark là cơ chế phát hiện sai format/tamper, không phải chữ ký mật mã server-side.

## 2. Ma trận phát hiện

| ID | Phát hiện | Mức độ | Trạng thái | Khuyến nghị |
|---|---|---:|---|---|
| F-01 | Bảo mật backup phụ thuộc vào password người dùng và runtime client | Trung bình | Chấp nhận có điều kiện | Chính sách password, KDF calibration và hướng dẫn lưu password an toàn |
| F-02 | Watermark không phải secret và không chống được người sửa JavaScript | Trung bình | Đã giảm thiểu | Nếu cần chống giả mạo mạnh, dùng server-side signature/key |
| F-03 | localStorage/XSS là ranh giới tin cậy của ứng dụng | Trung bình | Chấp nhận có điều kiện | Giảm CSP `unsafe-inline`, self-host/pin dependency, kiểm thử XSS |
| F-04 | Cơ chế WeakSet chỉ bảo vệ đường restore trong runtime hiện tại | Thấp | Đã triển khai | Giữ như defense-in-depth; không coi là cơ chế lưu trữ bền vững |
| F-05 | CSP vẫn cho phép `unsafe-inline` và CDN script `esm.sh` | Thấp–Trung bình | Cần cải thiện | Chuyển script inline sang file hoặc nonce/hash, pin dependency |
| F-06 | Backup phiên bản cũ không tương thích watermark mới | Thấp | Có chủ ý | Hiển thị migration message và xuất backup mới |

## 3. Phạm vi dữ liệu và tài sản cần bảo vệ

Payload backup schema v2 chỉ nên chứa dữ liệu local cần thiết như kỷ lục, tên hiển thị, setting, nhân vật, map và lịch sử ván. Review xác nhận pipeline không đưa `pendingScores`, run ticket hoặc dữ liệu có thể dùng để gửi điểm online vào backup. Service-role key, signing secret, password và OAuth client secret không thuộc payload backup.

Các tài sản chính gồm tính bí mật của lịch sử local, tính toàn vẹn của backup, tính đúng đắn của dữ liệu sau restore và khả năng không biến một file backup đã sửa thành dữ liệu hợp lệ được merge vào localStorage.

## 4. Kiểm tra thiết kế mật mã

### 4.1 Điểm đạt

Ứng dụng sử dụng AES-GCM với khóa 256 bit do Web Crypto API tạo và sử dụng IV 12 byte ngẫu nhiên cho mỗi lần encrypt. AES-GCM cung cấp cả confidentiality và authenticated integrity; nếu ciphertext, IV hoặc authentication tag không còn tương ứng, decrypt thất bại. Salt PBKDF2 cũng được sinh ngẫu nhiên và được lưu trong envelope vì salt không cần bí mật.

Khóa được dẫn xuất từ password bằng PBKDF2-HMAC-SHA-256 với 150.000 vòng lặp. Đây là lựa chọn phù hợp với Web Crypto hiện tại và làm tăng chi phí brute-force so với hash password một lần. OWASP khuyến nghị dùng thuật toán đối xứng mạnh, authenticated mode như GCM và nguồn ngẫu nhiên an toàn cho dữ liệu nhạy cảm [1]. MDN mô tả PBKDF2 là KDF phù hợp cho password entropy tương đối thấp và chi phí lặp làm tăng độ khó của dictionary attack [3].

### 4.2 Điểm cần lưu ý

Không có KDF nào có thể bù cho password yếu. Vì password không được lưu, mất password đồng nghĩa mất khả năng giải mã. Nên bổ sung thông báo rõ về độ dài/tính ngẫu nhiên của password, cân nhắc benchmark để tăng số vòng theo thiết bị, hoặc chuyển sang Argon2id/scrypt nếu có một implementation được kiểm duyệt và tương thích browser. Không tự viết thuật toán mã hóa hoặc KDF mới.

KDF và encryption hiện nằm trong JavaScript client. Người có quyền debug browser có thể hook API, lấy password tại thời điểm người dùng nhập hoặc thay đổi hàm restore. Đây là giới hạn kiến trúc chứ không phải lỗi AES-GCM.

## 5. Đánh giá watermark 5 lớp

Watermark được tính từ payload lõi và context của envelope, sau đó trải qua năm dạng biểu diễn khác nhau: hex, Base64URL, biến đổi đảo chiều có tag, grouped-hex và Base64URL có tag. Watermark được đặt bên trong plaintext rồi mới mã hóa, nên envelope bên ngoài không hiển thị marker watermark.

Cơ chế xác minh tái tạo toàn bộ watermark từ payload, salt và IV rồi so sánh từng lớp. Thiếu watermark, sai version, sai số lớp, thay đổi payload hoặc thay đổi một lớp đều bị từ chối. AES-GCM xử lý tamper ciphertext; watermark xử lý payload được mã hóa lại nhưng nội dung watermark không còn khớp.

Điểm cần phân biệt là các dạng biến đổi này là **obfuscation/tamper evidence**, không phải secret. Vì mã nguồn client công khai, một tool có thể đọc công thức nếu có quyền đọc repository hoặc runtime. Muốn watermark không thể giả mạo trước người có password và quyền điều khiển client, cần một chữ ký HMAC/EdDSA với khóa chỉ có ở server; giải pháp đó sẽ làm backup phụ thuộc server và không còn restore offline hoàn toàn.

## 6. Đánh giá restore và tự vô hiệu hóa

Restore hiện có hai lớp bảo vệ. Thứ nhất, `decryptBackup` phải giải mã AES-GCM và xác minh năm lớp watermark. Thứ hai, object chỉ được truyền vào `restoreBackupData` nếu đã được ghi nhận trong `WeakSet` sau một lần decrypt hợp lệ. Một object do tool tự tạo hoặc object đã sửa sau decrypt sẽ không qua được đường restore trực tiếp.

Khi validation thất bại, code ném lỗi trước các thao tác ghi `best`, history, tên, setting, map hoặc character. Hành vi hiện tại là **vô hiệu hóa và từ chối restore**, không xóa file gốc. Đây là lựa chọn an toàn hơn “tự hủy” vì giữ lại bằng chứng và tránh mất dữ liệu không thể hoàn tác.

`WeakSet` chỉ tồn tại trong một page runtime. Nó không bảo vệ khỏi việc người dùng sửa cả ứng dụng hoặc reload với mã đã bị patch; vì vậy nó chỉ là defense-in-depth, không phải boundary bảo mật độc lập.

## 7. Kịch bản tấn công đã kiểm tra

Kịch bản [`e2e/backup-attack.e2e.mjs`](../e2e/backup-attack.e2e.mjs) mô phỏng tool ngoài có password hợp lệ. Tool giải mã payload, sửa điểm và lớp cuối watermark, sau đó mã hóa lại bằng AES-GCM hợp lệ. Decrypt của ứng dụng vẫn từ chối vì watermark không khớp. Test cũng xóa hoàn toàn watermark, sửa một byte ciphertext và gọi trực tiếp restore với object chưa được validation. Tất cả trường hợp đều bị chặn và localStorage không thay đổi.

Các test đã chạy trong audit:

```text
npm run verify                    PASS
npm test                          PASS
npm run test:e2e:admin            PASS
npm run test:e2e:backup           PASS
npm run test:e2e:backup:attack    PASS
npm audit --omit=dev --audit-level=high   0 vulnerabilities
```

## 8. Client storage, XSS và CSP

Dữ liệu localStorage không nên được xem là ranh giới xác thực. OWASP cảnh báo JavaScript cùng origin có thể đọc hoặc sửa localStorage, và XSS có thể lấy toàn bộ dữ liệu tại đó [2]. Vì vậy password backup không được lưu vào localStorage; session identifier cũng không nên được coi là an toàn nếu bị lưu ở đó.

Repository hiện có CSP với `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `X-Frame-Options: DENY`, `nosniff`, Referrer Policy và Permissions Policy. Đây là các lớp phòng vệ tốt. Tuy nhiên CSP vẫn có `script-src 'unsafe-inline'` và cho phép tải module từ `https://esm.sh`; điều này làm giảm khả năng CSP ngăn một số lỗi injection và tạo phụ thuộc vào CDN bên ngoài.

Khuyến nghị ưu tiên chuyển JavaScript inline sang file static, hoặc dùng CSP nonce/hash cho script cần thiết. Nên pin dependency theo version/digest và self-host thư viện quan trọng khi khả thi. Cần giữ E2E kiểm tra rằng password, service-role key và token không xuất hiện trong DOM, download filename, log hoặc error message.

## 9. Quản lý lỗi và rò rỉ thông tin

UI đang dùng thông báo tổng quát như “sai mật khẩu hoặc backup bị hỏng”, không tiết lộ watermark layer nào thất bại. Đây là lựa chọn phù hợp vì không giúp attacker phân biệt loại lỗi. Không nên log plaintext payload, password, key, ciphertext đầy đủ hoặc stack trace chứa input backup trong production.

Nên bổ sung telemetry tối thiểu không chứa dữ liệu nhạy cảm nếu cần theo dõi tỷ lệ backup lỗi: chỉ ghi mã lỗi phân loại, kích thước file, version format và thời gian xử lý; không ghi nội dung file hoặc password.

## 10. Khuyến nghị theo ưu tiên

| Ưu tiên | Hành động | Mục tiêu |
|---|---|---|
| P0 | Không lưu password backup, service-role key hoặc signing secret ở client/localStorage | Bảo vệ secret căn bản |
| P1 | Giảm `unsafe-inline`, pin/self-host module CDN và chạy kiểm thử XSS | Giảm rủi ro code injection đọc localStorage/password |
| P1 | Thêm password policy rõ ràng và cảnh báo mất password | Giảm brute-force và mất dữ liệu do quên password |
| P2 | Benchmark và calibrate PBKDF2; đánh giá Argon2id/scrypt đã được kiểm duyệt | Tăng chi phí dictionary attack |
| P2 | Nếu cần chống giả mạo mạnh, thiết kế server-side signature | Không phụ thuộc secret trong client |
| P2 | Thêm migration UX cho backup cũ không có watermark | Tránh người dùng tưởng file bị hỏng không lý do |
| P3 | Chạy audit dependency định kỳ và kiểm tra integrity của CDN | Giảm supply-chain drift |

## 11. Kết luận

Không phát hiện lỗi nghiêm trọng làm mất tác dụng AES-GCM hoặc cho phép file bị sửa đi qua pipeline restore trong phạm vi test hiện tại. Cơ chế watermark và attack simulation hoạt động đúng mục tiêu: file bị chỉnh sửa, thiếu watermark hoặc có watermark sai bị vô hiệu hóa và không ghi dữ liệu vào localStorage.

Rủi ro còn lại chủ yếu đến từ kiến trúc browser client: XSS, extension, malware hoặc người có quyền điều khiển runtime có thể quan sát password và sửa mã. Do đó, hệ thống phù hợp với backup cá nhân offline có password mạnh, nhưng không nên được mô tả là chống giả mạo tuyệt đối hoặc tương đương với một hệ thống backup có khóa server-side.

## Tài liệu tham chiếu

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html "OWASP Cryptographic Storage Cheat Sheet"
[2]: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html "OWASP HTML5 Security Cheat Sheet"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey "MDN SubtleCrypto deriveKey"
