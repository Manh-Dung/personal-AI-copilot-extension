# Triết lý và Lộ trình Phát triển: Từ "Chat Summarizer" đến "Personal AI Copilot"

Dựa trên tầm nhìn của bạn, mục tiêu không chỉ là "tóm tắt" nữa, mà là xây dựng một **Hệ Thống Phản Hồi Cá Nhân (Personal Feedback Loop)** chạy ngầm trên trình duyệt. Tool này sẽ đóng vai trò như một người quan sát (Observer) và người đánh giá/huấn luyện viên (Coach), giúp bạn nhận diện chính mình và tối ưu hóa theo 3 trục: **Nhận thức, Hành vi và Vận hành**.

Dưới đây là thiết kế kiến trúc và định hướng phát triển tiếp theo cho dự án:

## 1. Mở rộng Trục Thu Thập Liệu (Input / Mức độ Vận hành)

Hiện tại tool đã bắt được `sent`, `draft`, `copy`, `click`, và `visited-page`. Tuy nhiên, để AI đánh giá được thói quen và thời gian hoạt động tốt nhất, cần bổ sung:

- **Time Tracking & Focus Detection:**
  - Theo dõi thời gian active trên từng tab/domain. Xác định khi nào bạn rơi vào trạng thái "Deep Work" (ví dụ: code trên editor online, tra cứu doc liên tục) và khi nào rơi vào "Distraction" (Facebook, YouTube vô định).
  - Thu thập nhịp độ gõ phím (Keystroke dynamics - đang có sơ bộ ở biến `keystrokeCount` nhưng cần đưa vào timeline) để biết "giây phút nào trong ngày bạn gõ code/gõ text năng suất nhất".
- **Phân loại Context (Tagging ngầm):** 
  - Thay vì chỉ tóm tắt text, mỗi 10 phút background script cần gắn nhãn (Label) các log theo dạng: `Learning`, `Debugging`, `Entertainment`, `Researching`.

## 2. Trục Đánh Giá / Tổng hợp (Khám phá "Khoảng trống kiến thức" - Nhận thức)

Không chỉ tóm tắt từng đoạn chat, chúng ta cần một cơ chế **End-of-day / End-of-week Recap** (Tổng hợp Cuối ngày/Cuối tuần):

- **Cronjob theo ngày:** 
  - Cuối ngày, gom toàn bộ log trong ngày gửi cho AI với hệ Prompt chuyên biệt: *"Phân tích hành vi hôm nay: Người dùng đã học được khái niệm mới nào? Từ khoá nào được search lặp đi lặp lại (dấu hiệu của việc đang kẹt/yếu ở đâu)? Ưu điểm và điểm trừ trong ngày?"*.
  - **Nhận diện Knowledge Gap:** Nếu dữ liệu cho thấy bạn search về "Flutter BLoC architecture" rất nhiều, copy code nhiều nhưng xoá (erased) cũng nhiều -> Dấu hiệu bạn chưa hiểu sâu. Tool sẽ ghi chú lại "Lỗ hổng kiến thức hiện tại: BLoC Workflow".

## 3. Trục Khuyến nghị Thực chiến & Tâm lý (Tính cách & Vòng lặp)

Áp dụng 3 trục thực tế mà bạn đã đề cập, chúng ta phát triển tính năng **Dynamic Intervention (Can thiệp Động)** ngay trên trình duyệt:

- **Can thiệp phương pháp học (Reverse Engineering / Micro-learning):**
  - Tool phát hiện bạn đang đọc 1 document lý thuyết rất dài (thời gian ở lại trang > 10 phút, copy paste lý thuyết). Tool có thể popup (hoặc inject một UI nhỏ vào góc màn hình): *"Bạn đang đọc lý thuyết khá lâu. Hãy thử Reverse Engineering: Clone repo X và dùng console.log để xem flow nó chạy thay vì đọc tiếp."*
- **Áp dụng Kỹ thuật Feynman:**
  - Nếu AI thấy bạn hay hỏi ChatGPT/Claude để xin lời giải (code copy/paste liên tục), tool sẽ nhắc nhở: *"Hãy thử áp dụng kĩ thuật Feynman: Bạn có thể tự giải thích lại đoạn code vừa copy đang hoạt động ra sao trong 3 nòng không?"*. Tool thậm chí có thể mở một popup text box ép bạn gõ vào vài dòng.
- **Phá vỡ bế tắc (Debug Focus):**
  - Nếu số lượng keystroke/draft bị xoá liên tục, hoặc click quanh quẩn 1 trang StackOverflow quá 20 phút -> Dấu hiệu mệt mỏi não bộ. Popup khuyên bạn: *"Dừng lại 5 phút. Hãy gạch bỏ các chi tiết rườm rà (Lọc nhiễu), xác định đúng input/output đang sai ở đâu."*

---

## 🚀 Kế Hoạch Triển Khai (Phase-by-Phase)

### Phase 1: Nâng cấp Data Collection & Nhật ký Hành vi
- Tích hợp Time Tracking: Ghi nhận thời gian tồn tại thực sự (Active Time) trên mỗi domain `visited-page`.
- Cấu trúc lại Storage: Lưu data theo cấu trúc chuỗi thời gian (Time-series) rõ rệt hơn để dễ vẽ biểu đồ hoạt động.
- Tạo UI Dashboard mới (trang `dashboard.html` riêng thay vì popup hẹp) để vẽ biểu đồ: Thời gian làm việc hiệu quả nhất trong ngày là mấy giờ? (Phân tích dựa vào keystroke/sent/focus). Đoạn nào học, đoạn nào giải trí.

### Phase 2: Xây dựng AI Report Engine (Daily/Weekly Insights)
- Thêm một Alarm báo thức vào cuối ngày (VD: 23:00).
- Dùng toàn bộ raw data trong ngày đẩy lên AI (dùng prompt thiết kế riêng) để sinh ra **Daily Insight JSON** chứa:
  - `skills_practiced`: (VD: Dart, Extension).
  - `struggles`: (VD: Asynchronous Javascript, Debugging).
  - `productivity_score` & `best_hours`.
  - Dữ liệu này được lưu lại để tạo Knowledge Graph cá nhân.

### Phase 4: Quản lý Dữ liệu Cá nhân & Onboarding UI
- **Tách riêng Tab API Guide**: Hướng dẫn user chưa biết code cách lấy API Key OpenRouter/Gemini.
- **Log Management**: Lọc Log theo loại (Chỉ xem Copy, chỉ xem Phản hồi AI, v.v.), chức năng xóa từng log lẻ.
- **Đồng bộ Data (Import/Export)**: Cung cấp tính năng tải file JSON của bộ nhớ lên thiết bị khác (Import) thay vì chỉ Export.

### Phase 5: Xây dựng Bộ Nhớ Dài Hạn (Long-term Knowledge Graph) & Tối Ưu Token API
- **Cách AI tối ưu Token:**
  - *Context Window Compression*: Không gửi nguyên văn (Raw String) hàng nghìn dòng. Sẽ cắt tỉa/rút gọn text.
  - *Sliding Window Memory*: Tạo 1 biến lưu trữ `long_term_memory`. Thay vì phân tích lại từ đầu mỗi ngày, AI lấy phân tích ngày hôm qua (đã tóm gọn) + raw data hôm nay = Phân tích ngày mới.
- **Cơ chế Suy Luận Vòng Lặp Học Tập (Cognitive Trails):**
  - AI không được phép đánh giá User "đã hiểu" chỉ vì họ ngừng tra cứu một lỗi.
  - Phân tích độ sâu qua 4 trục Dấu vết Nhận thức:
    1. *Tiến hoá câu hỏi:* Đi từ How (thợ gõ) -> Why/Which (Bản chất) -> Design/Scale (Làm chủ).
    2. *Tần suất lặp lỗi:* Bắt bài việc lặp lại một mẫu lỗi ở nhiều project khác nhau.
    3. *Dependency Ratio:* Đánh giá qua việc quăng raw file dài hay tự bóc tách logic.
    4. *Tư duy Refactor:* Hỏi cách làm code DRY/SOLID sẽ được tính là Mastered. Dùng Workaround để ép chạy tạm tính là Weakness.
  - *Knowledge Graph Mapping:* JSON đầu ra cập nhật điểm yếu vào bộ não AI. Nhắc nhở nếu đâm đầu lại vào Workaround.

## Lời kết

Việc đưa các ý tưởng về phương pháp học (Feynman, Micro-learning, Feedback loop) vào một công cụ dạng Extension là một bước đi cực kì thông minh và có tính tự động cao. Nó biến Extension của bạn từ một "thư ký ghi chép định kỳ" thành một **"Mentor ảo"** theo dõi bạn tận răng.

Bạn thấy định hướng chia Phase như trên đã khớp với kỳ vọng của bạn chưa? Bạn muốn ưu tiên triển khai tính năng nào trước (ví dụ làm cái Dashboard phân tích ngày/tuần trước, hay làm phần Tracking thời gian/nhịp độ trước)?
