# UI verification notes

- Màn hình chính desktop hiển thị bố cục hai cột trong panel: vùng chơi/cửa hàng bên trái và luật chơi, leaderboard, backup, auth bên phải.
- Card nhân vật có trạng thái `aria-label` rõ ràng: nhân vật miễn phí hiển thị đang chọn, nhân vật khóa hiển thị mua với số coin; không dùng `innerHTML` cho dữ liệu localStorage.
- Vùng luật chơi hiển thị 3 quy tắc: điều khiển và điểm, coin thưởng cuối ván, một lượt hồi sinh và server kiểm tra điểm.
- Trạng thái bảo vệ hiển thị dấu xanh cùng thông báo `lớp bảo vệ phiên đang hoạt động`.
- Dashboard admin khi chưa cấu hình Supabase vẫn giữ màn hình login, layout sạch và thông báo cấu hình; badge `chỉ đọc / bảo vệ` nằm trong app view, không ảnh hưởng login view.
- Đã kiểm thử riêng trên viewport mobile bằng Playwright: click card `swift`, số dư 100 -> 20, localStorage lưu `swift` và lựa chọn, click lặp không trừ thêm, reload vẫn khôi phục trạng thái.
