# Thiết kế kỹ thuật: watermark ẩn cho backup mã hóa

## Phạm vi

Tài liệu này mô tả pipeline backup/restore cục bộ của Sky Bird. Mục tiêu là làm cho một file backup chỉ được restore khi nó đi qua đầy đủ chuỗi mã hóa, kiểm tra toàn vẹn và xác thực watermark. Watermark không được hiển thị trong giao diện và không nằm ở JSON envelope bên ngoài.

## Pipeline xuất backup

Ứng dụng tạo payload schema v2 chỉ gồm dữ liệu local được phép backup. Các trường nhạy cảm với đồng bộ online như `pendingScores`, run ticket và dữ liệu có thể dùng để gửi điểm không được đưa vào payload.

Sau đó ứng dụng tạo salt 16 byte và IV 12 byte bằng `crypto.getRandomValues`. Payload lõi được chuẩn hóa từ `app`, `schemaVersion` và `data`; `exportedAt` không được dùng làm đầu vào watermark để thời gian xuất khác nhau không làm hỏng kiểm tra nội dung.

Watermark gồm năm lớp nối tiếp. Mỗi lớp nhận kết quả lớp trước cùng một context khác nhau, sau đó được biến đổi sang biểu diễn riêng trước khi chuyển sang lớp kế tiếp:

| Lớp | Đầu vào chính | Biểu diễn |
|---|---|---|
| 1 | Prefix nội bộ và payload lõi | SHA-256 hex 64 ký tự |
| 2 | Lớp 1 và salt | Digest nhị phân chuyển sang Base64URL không padding |
| 3 | Lớp 2 đảo chiều và IV | Digest chuyển Base64URL rồi đảo chiều, có tag nội bộ |
| 4 | Lớp 3 và định danh backup | Digest hex được chia thành các nhóm cố định |
| 5 | Lớp 4 và context cuối | Digest Base64URL có lớp bọc nội bộ |

Các biến đổi này không phải là khóa bí mật. Chúng tạo ra cấu trúc watermark khác nhau và làm việc nhận diện/sửa thủ công khó hơn, còn tính chống sửa thật sự đến từ AES-GCM authentication tag và việc đối chiếu lại toàn bộ năm lớp sau giải mã.

Cuối cùng, object watermark được đặt vào plaintext payload cùng `app`, `schemaVersion` và `data`. Toàn bộ payload được mã hóa bằng AES-256-GCM với khóa dẫn xuất từ password qua PBKDF2-HMAC-SHA-256, salt ngẫu nhiên và 150.000 vòng lặp. Envelope xuất ra chỉ chứa metadata mã hóa, salt, IV và ciphertext.

## Pipeline nhập và restore

Restore không sử dụng dữ liệu trước khi giải mã thành công. Ứng dụng kiểm tra format envelope, dẫn xuất khóa từ password, gọi AES-GCM decrypt rồi parse JSON. Nếu password sai hoặc ciphertext bị đổi, AES-GCM ném lỗi.

Khi plaintext đã giải mã, ứng dụng tái tạo watermark từ payload lõi và chính salt/IV của envelope. Cả năm lớp được so sánh bằng hàm so sánh thời gian không phụ thuộc nội dung. Thiếu watermark, sai version, sai số lớp, sai một byte hoặc thay đổi payload đều làm validation thất bại.

Ngoài validation nội dung, object chỉ được phép đi vào `restoreBackupData` nếu chính object đó đã được đánh dấu là kết quả của một lần `decryptBackup` thành công. Ứng dụng dùng `WeakSet` trong runtime để giữ dấu xác thực này. Vì vậy, một tool không thể lấy object tự tạo rồi gọi thẳng hàm restore để bỏ qua pipeline.

Khi validation thất bại, ứng dụng không ghi `best`, history, tên, map, character hay setting nào vào localStorage. UI chỉ hiển thị lỗi chung kiểu “sai mật khẩu hoặc backup bị hỏng”, không tiết lộ lớp nào thất bại.

## Mô phỏng tấn công

Kịch bản [`e2e/backup-attack.e2e.mjs`](../e2e/backup-attack.e2e.mjs) chạy trong Chromium và mô phỏng tool ngoài ứng dụng có password hợp lệ:

1. Tạo backup hợp lệ bằng pipeline thật.
2. Giải mã ciphertext, đổi điểm và sửa lớp cuối watermark.
3. Mã hóa lại payload đã sửa với AES-GCM hợp lệ để loại trừ khả năng test chỉ bắt lỗi authentication tag.
4. Xác nhận `decryptBackup` vẫn từ chối vì watermark không khớp.
5. Xóa hoàn toàn watermark, mã hóa lại và xác nhận tiếp tục bị từ chối.
6. Đổi một byte ciphertext gốc và xác nhận AES-GCM từ chối.
7. Gọi trực tiếp restore với object đã sửa và xác nhận `WeakSet` chặn đường bypass.
8. So sánh localStorage trước/sau để bảo đảm file bị vô hiệu hóa không làm thay đổi dữ liệu local.

Chạy riêng:

```bash
npm run build
node e2e/backup-attack.e2e.mjs
```

Chạy toàn bộ:

```bash
npm run verify
npm test
npm run test:e2e:admin
npm run test:e2e:backup
npm run test:e2e:backup:attack
```

## Mô hình mối đe dọa và giới hạn

Thiết kế này bảo vệ trước file bị hỏng, bị thay thế, bị chỉnh sửa ciphertext, bị xóa watermark và payload được mã hóa lại nhưng watermark sai. Nó cũng ngăn đường gọi restore trực tiếp trong cùng runtime nếu object chưa được decrypt xác thực.

Thiết kế này không thể biến JavaScript phía client thành một hệ thống có secret tuyệt đối. Người có mã nguồn, password và quyền điều khiển browser vẫn có thể phân tích hoặc sửa logic client để tạo file mới. Nếu cần chống giả mạo ở mức máy chủ, watermark hoặc chữ ký phải được tạo/xác minh bằng secret server-side; khi đó backup sẽ phụ thuộc vào server và không còn là backup local hoàn toàn offline.
