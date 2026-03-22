# 🧠 CogniTrail: Personal AI Mentor (Browser Extension)
*Trợ lý ảo cá nhân thấu hiểu thói quen, được nâng cấp và lột xác hoàn toàn từ nền tảng "AI Chat Summarizer".*

Khác với các công cụ theo dõi thời gian (Time Tracker) thông thường vốn nông cạn và dễ bị đánh lừa, **CogniTrail** là một **Hệ Thống Phản Hồi Động (Dynamic Feedback Loop System)**. Nó hoạt động như một vị Cố vấn (Mentor) khắt khe ngay trên trình duyệt, sẵn sàng "bắt bài" sự lười biếng, vạch trần các lỗ hổng kiến thức và ép bạn học đúng phương pháp.

---

## 🎯 Điểm Đột Phá: AI Đọc "Dấu Vết Nhận Thức" (Cognitive Trails)

CogniTrail không quan tâm bạn nhắn bao nhiêu câu chat, nó quan tâm đến **Cách bạn giải quyết vấn đề**. AI (thông qua LLM) được huấn luyện để mổ xẻ logs của bạn theo **4 Trục Nhận Thức**:

1. **Sự tiến hóa câu hỏi:** Nhận diện việc bạn đang hỏi ở mức `HOW` (tay ngang, copy/paste) hay đã nâng cấp lên `WHY` (hỏi bản chất) và `SCALE` (tư duy cấu trúc).
2. **Tần suất lặp lỗi:** Bạn vướng lại một concept (VD: state management) ở nhiều dự án? AI lập tức tống nó vào rổ `Weaknesses` (Điểm yếu cốt lõi).
3. **Tỷ lệ phụ thuộc (Dependency Ratio):** Quăng cả ngàn dòng code cho AI sửa giúp? AI sẽ đánh giá bạn "Quá lệ thuộc" và ép bạn học kỹ năng **Divide & Conquer** (Chia để trị).
4. **Tư duy Refactor:** Phân biệt rõ việc bạn giải quyết xong vấn đề thật sự, hay chỉ lượm lặt **Workaround** (sửa chắp vá ép code chạy tạm).

---

## 🚀 Các Tính Năng Đỉnh Cao (v1.8.0)

### 1. ⌨️ Mắt thần đo lường làm việc thực tế (Keystrokes & Active Focus)
* **Bắt bệnh Tutorial Hell:** Nếu bạn ngâm mình trên trang ReactJS Docs hơn 5 phút nhưng **số phím gõ bằng 0**, AI hiểu bạn chỉ đang đọc chay và lặn ngụp trong mớ lý thuyết. Nó lập tức gợi ý bạn mở IDE lên thực hành.
* **Đo lường Active Time:** Loại bỏ hoàn toàn thời gian bạn treo máy (Idle) hoặc đi vệ sinh. Chỉ tính giây nào chuột lăn, phím gõ. Giúp bạn tìm ra "Best Hours" (Khung giờ vàng năng suất nhất) trong ngày.

### 2. ⚡ Real-time Mentor Intervention (Nhắc nhở tức thời bằng Shadow DOM)
AI can thiệp trực tiếp vào màn hình web của bạn bằng các Popup xịn xò (kháng CSS website):
* **Bẫy Học Vẹt:** Nếu bạn bôi đen và nhấn Copy đoạn code `> 3 lần` trong vòng `3 phút` trên StackOverflow, hệ thống cảnh báo và ép bạn dùng **Feynman Technique** (Viết lại logic bằng ngôn ngữ của riêng bạn).
* **Bẫy Áp Lực Lý Thuyết:** Nếu ngồi đọc Docs quá lâu mà không gõ code, Mentor sẽ yêu cầu bạn dùng **Reverse Engineering** (Tải source mẫu về đập đi xây lại).

### 3. 📅 Daily & Weekly Analytics (Long-term Knowledge Graph)
Không tóm tắt lắt nhắt, CogniTrail gom dữ liệu để tổng kết vào lúc bạn rảnh rỗi.
* **Daily Insight:** Chốt sổ mỗi đêm (ví dụ 23:30). Chỉ ra Kỹ năng nạp được hôm nay, Lỗ hổng hớ hênh nhất và Lời khuyên cho ngày mai.
* **Weekly Analytics:** Tổng kết 7 bản Daily Recap. Báo cáo "Trend Năng Suất" và những bài học mang tính nền tảng.
* **Bộ não trượt (Sliding Window Memory):** AI có trí nhớ dài hạn. Lỗi nào bạn mắc tuần trước nhưng tuần này hết bị, AI tự động chuyển từ `Weakness` sang `Mastered` và chúc mừng bạn.

### 4. 🎛 Tối ưu Token LLM & Quản trị Dữ liệu Gọn gàng
* **Context Window Compression:** Extension tự động nén log, cắt chuỗi dài >100 ký tự và chỉ gửi tối đa 80 hành động gần nhất tới AI API. Vừa đủ context, vừa siêu tiết kiệm Token (chạy chi phí api rất rẻ).
* **Quản trị Data File:** Khả năng Import và Export toàn bộ cấu trúc dữ liệu JSON để bạn mang sang máy khác học tiếp.
* **Log Filter UI:** Xóa và lọc trực tiếp từng thao tác rác không muốn AI ngó qua trong Tab Quản trị. Đặc biệt bổ sung tính năng **Bỏ qua (Skip)** vĩnh viễn các hành động lặp lại không mong muốn (kèm Tab "Đã ẩn" để dễ dàng khôi phục).

---

## 📦 Hướng Dẫn Cài Đặt (Local Install)

1. Kéo mã nguồn về máy tính (`git clone`).
2. Mở trình duyệt Chrome, gõ `chrome://extensions/` và bật chế độ **Developer mode** ở góc phải trên.
3. Bấm **Load unpacked**, trỏ folder tìm đến thư mục dự án này.
4. Mở Popup extension, chọn Tab **🔑 Cài API** để lấy khoá OpenRouter hoàn toàn miễn phí (được hướng dẫn chi tiết tận tình trong đó).

## 🤝 Quyền Lợi Cấp Cho Extension (Permissions)
- `activeTab` & `scripting`: Xuyên tẩu vào trang web để bơm Popup Shadow DOM và đếm số phím gõ.
- `storage`: Lưu tạm lịch sử hoạt động vào local Chrome (Hoàn toàn mã nguồn mở, không có server thu thập trộm).
- `alarms`: Xử lý ngầm theo chu kỳ giờ bạn thiết lập, tính toán Catch-up khi bạn lỡ offline, không tốn tài nguyên RAM. 
- `notifications`: Đẩy tin nhắn báo việc kết thúc tác vụ Recap hoặc AI trả về kĩ năng mới.

---
*Vì một hành trình trở thành Kỹ sư phần mềm thay vì vị trí Xếp hình Code (Stack Overflow Copy-paster).*
