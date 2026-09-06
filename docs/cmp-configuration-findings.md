# Hướng dẫn CMP Google AdSense — EEA/UK

Ngày tra cứu: 06/09/2026.

Nguồn 1: https://support.google.com/adsense/answer/7670013?hl=vi — Theo Chính sách đồng ý của Google, publisher phải công bố thông tin nhất định và xin đồng ý khi pháp luật yêu cầu đối với cookie/local storage và việc thu thập, chia sẻ, sử dụng dữ liệu cá nhân cho quảng cáo cá nhân hóa tại EEA, UK và Switzerland. Quy trình Google nêu: chọn nhà cung cấp công nghệ quảng cáo (ATP), thiết lập quy trình thu thập đồng ý bằng Google CMP, CMP bên thứ ba hoặc dialog riêng; truyền tín hiệu cá nhân hóa quảng cáo và tín hiệu đồng ý IAB TCF.

Nguồn 2: https://support.google.com/adsense/answer/10960768?hl=vi — Trong AdSense: thêm website vào tài khoản, mở Privacy & messaging, tạo European regulations message, chọn site, chọn ngôn ngữ mặc định và ngôn ngữ bổ sung, quyết định hiển thị lựa chọn Không đồng ý, tùy chọn Đóng (không đồng ý), đặt tên thông báo, kiểm tra mọi ngôn ngữ rồi publish. Trang Privacy Policy cần được nhập trong phần cấu hình theo hướng dẫn của AdSense.

Nguồn 3: https://support.google.com/adsense/answer/13554116?hl=vi — Khi phân phát quảng cáo được cá nhân hóa cho người dùng EEA/UK/Switzerland, Google yêu cầu CMP được Google chứng nhận và tích hợp IAB TCF; trang nêu mốc EEA/UK từ 16/01/2024 và Switzerland từ 31/07/2024.

Trạng thái repository: hiện có nội dung Privacy Policy mô tả CMP và consent nhưng chưa có CMP script/config runtime thực tế trong mã nguồn. Không được coi là đã tuân thủ đầy đủ cho tới khi bật một CMP thực tế, cấu hình domain/ATP/purposes, publish message, kiểm tra consent signal trước khi tải quảng cáo và xác minh bằng công cụ kiểm tra của Google.
