# 🧠 CogniTrail: Personal AI Mentor (Browser Extension)
*Trợ lý ảo cá nhân thấu hiểu thói quen, được nâng cấp từ nền tảng "AI Chat Summarizer".*

## 💡 Triết Lý Cốt Lõi
Extension này không chỉ dùng để tóm tắt các đoạn chat nhảm nhí hay nhật ký truy cập mạng. Nó là một **Hệ Thống Động (Dynamic Feedback Loop System)** được thiết kế để giải quyết "khoảng trống nhận thức", theo dõi "thói quen tâm lý" và "vận hành" quá trình phát triển của bạn thông qua 3 trục:

1. **Trục Nhận thức (Khoảng trống kiến thức):** Bằng cách ghi lại những từ khoá bạn hay tìm kiếm, những lỗi (bugs) khiến bạn dừng lại trên StackOverflow quá lâu, AI sẽ nhận diện lỗ hổng kiến thức để lưa ra nhắc nhở lấp đày. Bỏ qua việc lan man đọc Tutorial dài từ con số không, tập trung học bằng Reverse Engineering.
2. **Trục Hành vi & Tâm lý (Tính cách):** Hệ thống ghi lại lịch sử phím gõ, lịch sử chuột nhấp, và sự tập trung theo tên miền (Focus Tracking). Nếu bạn là người nghi ngờ/hay thắc mắc -> hệ thống gợi nhắc **Kỹ thuật Feynman**. Nếu bạn là người thực dụng ngắn hạn (Short-attention) -> hệ thống đề xuất **Micro-learning** (cắt ngang chuỗi đọc lý thuyết dài để thay bằng việc thực thi thử nghiệm).
3. **Trục Vận hành (Vòng lặp Đầu vào - Output - Debug):** Lọc nhiễu -> Thực chiến -> Tối ưu lại. Background worker của Chrome Extensioh tự động phân tích mỗi 10 phút, tổng hợp cuối ngày nhằm biến một Extension thụ động thành 1 AI Mentor trực quan qua Bảng thống kê (Dashboard).

---

## 🚀 Các Tính Năng Hiện Tại (Phase 1)
- [x] **Event Logger Đa Giác Quan:** Ngầm ghi nhận các sự kiện quan trọng trong ngày: tin nhắn nháp (Draft), tin nhắn gửi (Sent), nhấp chọn AI gợi ý (Click-suggest), nội dung copy, và văn bản dài bạn đã đọc (Visited Page Context).
- [x] **Focus Time Tracking:** Tính năng đếm giờ làm việc hiệu quả dựa vào thao tác thực sự (`keydown`, `mousemove`, `scroll`). Bỏ qua thời gian bạn treo tab không làm gì qua cơ chế Idle Detection.
- [x] **AI Dashboard:** Thống kê trực quan lại bằng biểu đồ các website mà bạn tập trung cao độ nhất (ví dụ Code Playground, Github, IDE Platform). Đánh dấu rõ những phiên làm việc bạn gõ phím bao nhiêu lần trên các trang đó để tối ưu hoá "Khung giờ vàng".
- [x] **Local AI Prompt:** Thoải mái tự điền API Key (OpenRouter/OpenAI/Claude) và tuỳ biến System Prompt. Không thu thập dữ liệu về server ngoài, hoàn toàn mã nguồn mở và cục bộ trình duyệt.

---

## 🛠️ Hướng Rẽ Công Nghệ & Tương Lai (Phase 2 & 3)
* **Weekly/Daily Growth Snapshot:** Job chạy ngầm cuối ngày tự báo cáo với AI (VD: "*Hôm nay bạn tập trung phần lớn vào JavaScript nhưng thấy bạn kẹt ở hàm Async rất nhiều. Dấu hiệu là copy paste lặp lại.*").
* **In-screen Intervention:** Pop-up nhắc nhở ngay màn hình: *"Đừng đọc nữa, mở tab code ra bấm console.log nghiệm chứng đi!"*

## 📦 Cài Đặt (Local Install)
1. Kéo mã nguồn về thư mục cục bộ (`git clone...`).
2. Truy cập thanh url `chrome://extensions/` - bật `Developer mode` ở góc phải trên.
3. Bấm **Load unpacked**, trỏ folder chứa các files này.
4. (Bắt buộc) Click biểu tượng Extension -> Mở tab `Cài đặt` -> Nhập OpenRouter API Key để cấp não cho AI.

## 🤝 Quyền Lợi Sử Dụng (Permissions)
- `activeTab` & `scripting`: Để chèn logic đếm thời gian và bắt event DOM vào trang thái hoạt động.
- `storage`: Lưu tạm lịch sử hoạt động vào local Chrome (sẽ xoá cronjob tự động sau 10s đối với trùng lặp và clear bớt log cũ).
- `alarms`: Đánh thức background worker tự đi tóm tắt & tính toán (để không tốn RAM chạy ngầm liên tục). 
- `notifications`: Đẩy tin nhắn Notification động viên/vòng lặp phản hồi ra màng hình Desktop.
