# Changelog

Tất cả những thay đổi nổi bật của dự án **AI Chat Summarizer** (đang tiến hoá thành hệ thống **Personal AI Copilot / Mentor**) sẽ được tài liệu hoá tại đây.

Hiển thị theo định dạng Semantic Versioning.

## [1.6.0] - 2026-03-22 (The "AI Mentor" Evolution)
Thực hiện quá trình "Lột xác" công cụ từ một Extension tự động ghi chép log trò chuyện đơn thuần trở thành một Người cố vấn (Tutor ảo) bám sát các luồng nhận thức và thói quen làm việc thực tế.

### Thêm mới (Added)
- **Phase 1: Active Focus Tracking.** Thêm hệ thống đo lường thời gian tập trung thực (Active Time) dựa trên mức độ cuộn chuột, tương tác phím. Máy tự chuyển trạng thái treo (Idle) sau 30 giây không hoạt động.
- **Phase 1: Keystrokes Mapping.** Ghi nhận nhịp độ gõ phím trên từng domain để xác định User đang tư duy code (gõ nhiều) hay đang lọt hố "Tutorial Hell" (chỉ đọc).
- **Phase 2: AI Report Engine (Dashboard).** Thêm giao diện Dashboard độc lập (`dashboard.html`) với tính năng tóm tắt Daily Recap từ AI dưới chuẩn JSON, bóc tách "Kĩ năng rèn luyện", "Điểm yếu" và tìm ra "Best Hours" trong ngày.
- **Phase 3: Real-time Mentor Intervention.** 
  - Inject trực tiếp Popup UI (Shadow DOM) vào góc phải màn hình các trang như StackOverflow, GitHub, Docs.
  - Phát hiện "Học vẹt": Sao chép code > 3 lần / 3 phút sẽ kích hoạt màn nhắc nhở dùng *Kỹ thuật Feynman*.
  - Cảnh báo "Bẫy Tutorial": Ngâm một trang chuyên ngành quá 5 phút mà ít gõ code sẽ được khuyên dùng *Reverse Engineering* (bóc tách source code).
- **Phase 4: Advanced Data & UI.**
  - **Quản trị Log:** Popup trang bị sẵn nút Filter (Đã Gửi, Đã Copy, Text AI, Đọc Trang) và biểu tượng (x) để xoá log rác linh hoạt.
  - **Import & Export Data JSON:** Không chỉ kết xuất, giờ bạn đã có thể Restore (nhập lại) lịch sử học tập lên thiết bị khác.
  - Tab chuyên biệt **🔑 Cài API** hướng dẫn thiết lập OpenRouter siêu nhanh.
- **Phase 5: Cognitive Trails Engine (AI Prompt nâng cao - Dấu Vết Nhận Thức).** 
  - AI không còn đánh giá User ngây thơ. Nó được dạy để quét qua 4 trục: Sự tiến hóa câu hỏi (Từ HOW đến WHY/SCALE), Tần suất lặp lỗi, Tỷ lệ phụ thuộc code raw, và Tư duy Refactor.
  - **Sliding Window Memory (Bộ não Long-term):** Lưu trữ lại mảng Kỹ năng đã nắm vững (`mastered`) và Điểm yếu lặp lại nhiều lần (`weaknesses`) bằng mảng Object `long_term_memory`, để liên kết sang bài đánh giá của ngày tiếp theo.

### Thay đổi / Tối ưu hoá (Changed & Optimized)
- **Kiến trúc Folder:** Chia lại cấu trúc gốc thành `/popup`, `/content`, `/background`, `/assets` và `/docs` giúp code dễ review và scale hơn về sau.
- **Context Window Compression:** Nén độ dài các Log cũ lại mức tối đa 100 kí tự và chỉ nhồi 80 hành động gần nhất vào API để cản đà đốt Token của AI Model, đồng thời giữ focus tốt cho Context.
- Thay đổi `triggerSummarize` bằng cơ chế dọn Storage trễ (Lazy Pruning) và uỷ thác batch xử lý cho Browser Alarms API. Đảm bảo Backend Service Worker hoạt động cực kì mượt mà, không tốn ram ngầm.

---

## [1.5.0] - Prior to 2026-03-22
### Thêm mới (Added)
- Core: Giám sát toàn thời gian tất cả lệnh chat từ người dùng (Draft / Sent), tự động ghi nhận Clipboard (Copy text).
- Mở rộng phạm vi chụp bắt phản hồi từ các bot như ChatGPT, Gemini, Claude, Grok, Perplexity, Copilot.
- Gửi dữ liệu theo chu kỳ qua API OpenRouter để sinh chuỗi Tóm tắt văn bản.

*(Quá trình cập nhật nhật ký Changelog bắt đầu từ bản [1.6.0])*
