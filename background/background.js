// =============================================
// background.js — v1.8.0
// Dùng alarm để đánh thức SW — không phụ thuộc sendMessage.
// =============================================

const OR_MODEL   = 'stepfun/step-3.5-flash:free';
const BATCH_KEY  = 'pending_batch';
const ALARM_NAME = 'do_summarize';

console.log('[AIS BG v1.8.0] started');

// ---- KHẮC PHỤC KẸT TRẠNG THÁI ----
// Nếu Service Worker bị trình duyệt tắt giữa lúc đang fetch API, biến lưu trong chrome.storage sẽ bị kẹt là true
// Do đó, mỗi lần khởi động lại Service worker, ta clear luôn các trạng thái đang chạy này:
chrome.storage.local.set({ 
  is_recapizing: false, 
  is_weekly_recapizing: false,
  is_summarizing: false 
});

// ---- Debug ----
function dbg(msg) {
  console.log('[AIS BG]', msg);
  const uid = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  chrome.storage.local.set({ ['dbg_' + uid]: { msg, time: Date.now() } });
}

// ---- Đăng ký alarm listener ngay khi SW khởi động ----
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    dbg('⏰ Alarm fired → processing batch');
    processBatch();
  }
});

// ---- Đăng ký alarm định kỳ theo Settings của User ----
chrome.storage.local.get(['trackingOptions'], (res) => {
  const interval = res.trackingOptions?.summarizeInterval || 10;
  chrome.alarms.get('auto_summarize', (existing) => {
    if (!existing) {
      chrome.alarms.create('auto_summarize', { periodInMinutes: interval });
    }
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.trackingOptions) {
    const oldVal = changes.trackingOptions.oldValue?.summarizeInterval || 10;
    const newVal = changes.trackingOptions.newValue?.summarizeInterval || 10;
    if (oldVal !== newVal) {
       chrome.alarms.create('auto_summarize', { periodInMinutes: newVal });
       dbg(`🔄 Đổi chu kỳ tóm tắt thành ${newVal} phút`);
    }
  }
});

// ---- KHỞI TẠO CONTEXT MENU: DỊCH & GIẢI NGHĨA ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "cognitrail-explain",
    title: "CogniTrail: Dịch & Giải nghĩa",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "cognitrail-explain") {
    const text = info.selectionText;
    const url = tab.url;
    
    // Yêu cầu Màn hình Content hiện Popup Loading
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_TRANSLATION_LOADING', text });
    
    // Chờ AI xử lý trả cứu
    const explanation = await explainVocabAI(text, url);
    if (explanation) {
      const vocabData = { text, explanation, url, time: Date.now() };
      
      // Lưu lại kho lưu trữ ngữ pháp cá nhân (English Vocab Locker)
      const allData = await storageGet(['english_vocab']);
      const vocabs = allData.english_vocab || [];
      vocabs.unshift(vocabData);
      await storageSet({ english_vocab: vocabs.slice(0, 100) }); // Giới hạn 100 từ mới nhất
      
      // Đẩy trả lại cho giao diện
      chrome.tabs.sendMessage(tab.id, { type: 'SHOW_TRANSLATION_RESULT', vocab: vocabData });
    } else {
      chrome.tabs.sendMessage(tab.id, { type: 'SHOW_TRANSLATION_ERROR' });
    }
  }
});

async function explainVocabAI(text, url) {
  const { apiKey } = await storageGet(['apiKey']);
  if (!apiKey) return null;
  
  const prompt = `Bạn là cuốn từ điển chuyên biệt cho Kĩ sư Phần mềm (Software Engineer) tên là CogniTrail Mentor.
Văn bản / Từ vựng User bôi đen: "${text}"
Ngữ cảnh (Nơi bắt gặp): ${url}

Yêu cầu: Giải nghĩa ngắn gọn (tiếng Việt), chỉ thẳng vào ngữ cảnh lập trình (Nếu có). Bắt buộc trả về câu trả lời súc tích tuyệt đối (Không dạ vâng, hỏi thăm).`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OR_MODEL, messages: [{ role: 'user', content: prompt }] })
    });
    
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (err) {
    dbg('Lỗi Explain AI: ' + err.message);
    return null;
  }
}

// Alarm 1 phút để kiểm tra Giờ chốt sổ recap hoặc "Đền bù" (catch-up) nếu user offline lúc đến giờ
chrome.alarms.create('check_daily', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'auto_summarize') {
    processBatch();
  } else if (alarm.name === 'check_daily') {
    const { trackingOptions, lastRecapDate, lastWeeklyRecapDate } = await storageGet(['trackingOptions', 'lastRecapDate', 'lastWeeklyRecapDate']);
    const recapTime = trackingOptions?.dailyRecapTime || '23:30';
    const weeklyDay = trackingOptions?.weeklyRecapDay !== undefined ? trackingOptions.weeklyRecapDay : 0;
    
    const d = new Date();
    const currentStr = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    const todayStr = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    
    // Nếu hôm nay chưa có recap, và giờ hiện tại >= giờ setup (bù giờ)
    if (lastRecapDate !== todayStr && currentStr >= recapTime) {
      dbg(`⏳ Đã đến giờ rảnh rỗi / Bù giờ Recap hàng ngày (${currentStr} >= ${recapTime})`);
      await storageSet({ lastRecapDate: todayStr });
      generateDailyRecap();
      
      // Kiểm tra xem hôm nay có phải là ngày chốt Weekly không
      if (d.getDay() === weeklyDay && lastWeeklyRecapDate !== todayStr) {
         await storageSet({ lastWeeklyRecapDate: todayStr });
         // Delay 40s để chờ Daily Recap chạy xong tránh nghẽn API
         setTimeout(generateWeeklyRecap, 40000);
      }
    }
  }
});

// ---- Xử lý batch ----
async function processBatch() {
  const allData = await storageGet(null);
  const pendingKeys = Object.keys(allData).filter(k => k.startsWith('log_') && allData[k]?.summarized === false);
  const messages = pendingKeys.map(k => allData[k]).sort((a, b) => a.time - b.time);
  
  if (!messages.length) {
    dbg('⚠️ No pending messages, skip processing');
    return;
  }

  dbg(`📦 Processing ${messages.length} messages`);
  await storageSet({ is_summarizing: true });

  let aiData = null;
  try {
    aiData = await callAI(messages);
  } finally {
    await storageSet({ is_summarizing: false });
  }

  if (!aiData) return;

  // Thành công -> Đánh dấu các log là đã summarize thay vì xoá
  const updates = {};
  pendingKeys.forEach(k => {
    updates[k] = { ...allData[k], summarized: true };
  });
  await storageSet(updates);

  await saveSummary(aiData.summary, messages.length, aiData.tags);
  const title = (aiData.tags && aiData.tags.length) ? '📝 ' + aiData.tags.slice(0, 2).join(', ') : '📝 Tóm tắt';
  notify(title, aiData.summary.length > 200 ? aiData.summary.slice(0, 197) + '...' : aiData.summary);
}

// ---- Storage helpers (Promise) ----
function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// ---- API ----
async function callAI(messages) {
  const { apiKey, customPrompt } = await storageGet(['apiKey', 'customPrompt']);
  if (!apiKey) {
    notify('⚠️ Chưa cài API Key', 'Mở popup để nhập key.');
    return null;
  }

  const labelMap = {
    sent: '➤ Tôi gửi', draft: '✏️ Draft', copied: '📋 Copy',
    'clicked-suggestion': '💡 Gợi ý', clicked: '🖱️ Click', 'ai-response': '🤖 AI',
    'visited-page': '👁️ Đọc trang'
  };

  const formatted = messages.map(m => {
    const t = new Date(m.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return `[${t}] ${labelMap[m.status] || m.status} (${m.url}): ${m.text}`;
  }).join('\n');

  const baseInstruction = customPrompt ? customPrompt.trim() : "Hãy tóm tắt nội dung chính (3-5 ý), nêu điểm quan trọng và việc cần làm ngắn gọn.";
  
  const prompt = `System Instruction:
${baseInstruction}
---
Yêu cầu Output: Bắt buộc trả về đúng MỘT chuỗi JSON hợp lệ (không kèm theo format markdown) với cấu trúc:
{
  "summary": "Nội dung tóm tắt/nhận xét tiếng Việt ở đây",
  "tags": ["#Tag1", "#Tag2"]
}
---
Dữ liệu hoạt động:
${formatted}`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'chrome-extension://ai-chat-summarizer',
        'X-Title': 'AI Chat Summarizer'
      },
      body: JSON.stringify({
        model: OR_MODEL,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    dbg(`🌐 HTTP Status: ${res.status}`);
    const data = await res.json();
    if (data.error) { dbg(`❌ Lỗi API: ${data.error.message}`); notify('❌ Lỗi API', data.error.message); return null; }
    
    let textResult = data.choices?.[0]?.message?.content || "";
    if (textResult) {
      textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
      try {
        const parsed = JSON.parse(textResult);
        dbg('✅ Parse JSON thành công');
        return { summary: parsed.summary || textResult, tags: parsed.tags || [] };
      } catch(e) {
        dbg('⚠️ Parse JSON fail, fallback to raw text');
        return { summary: textResult.substring(0, 500), tags: [] };
      }
    }
    return null;

  } catch (err) {
    dbg(`❌ Network error: ${err.message}`);
    notify('❌ Lỗi kết nối', err.message);
    return null;
  }
}

async function testApi() {
  dbg('🧪 Running Test API...');
  await storageSet({ is_summarizing: true });
  try {
    const result = await callAI([{ text: 'Xin chào, tôi đang học code extension.', status: 'sent', time: Date.now(), url: 'test' }]);
    if (result) {
      dbg('✅ Test API Thành Công!');
      notify('✅ API hoạt động!', typeof result.summary === 'string' ? result.summary.slice(0, 150) : JSON.stringify(result));
    } else {
      dbg('❌ Test API Thất bại!');
      notify('❌ Test thất bại', 'Kiểm tra API key.');
    }
  } finally {
    await storageSet({ is_summarizing: false });
  }
}

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: '../assets/icon.png', title, message, priority: 1 });
}

async function saveSummary(summary, count, tags) {
  const { history = [] } = await storageGet(['history']);
  history.unshift({ summary, messageCount: count, tags, time: Date.now() });
  if (history.length > 50) history.pop(); // Tăng lên 50
  await storageSet({ history });
}

// ---- Message handler ----
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TEST_API') { testApi(); return; }
  if (msg.type === 'GENERATE_DAILY_RECAP') { generateDailyRecap(); return; }
  if (msg.type === 'GENERATE_WEEKLY_RECAP') { generateWeeklyRecap(); return; }
});

// ==== Phase 5: Long-term Memory & Token Optimization ====
async function generateDailyRecap() {
  const d = new Date();
  const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  
  const allData = await storageGet(null);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  
  let todayLogs = Object.values(allData).filter(item => item.time >= startOfDay && item.status);
  const todayTimes = Object.entries(allData).filter(([k]) => k.startsWith(`active_${dateStr}`));
  
  // 1. Tối ưu Token: Chỉ lấy 80 log quan trọng nhất nếu quá dài, deduplicate nhẹ
  if (todayLogs.length > 80) {
    todayLogs = todayLogs.slice(-80); // Lấy 80 hành vi gần nhất
  }
  
  if (!todayLogs.length && !todayTimes.length) {
    notify('Daily Insights', 'Chưa có hoạt động nào hôm nay để phân tích.');
    return;
  }
  
  let activitiesText = todayTimes.map(([k, v]) => {
    const domain = k.replace(`active_${dateStr}_`, '');
    return `- ${domain}: ${Math.round(v.timeMs/60000)}p, ${v.keystrokes} phím`;
  }).join('\n');
  
  // 2. Nén Context Window
  let logsText = todayLogs.map(m => {
    // Chỉ lấy 100 kí tự để tiết kiệm token
    const shortText = m.text.length > 100 ? m.text.slice(0, 100) + '...' : m.text;
    return `[${new Date(m.time).toLocaleTimeString('vi-VN')}] ${m.status}: ${shortText}`;
  }).join('\n');
  
  // 3. Sliding Window Memory (Knowledge Graph)
  const memory = allData.long_term_memory || { strengths: [], weaknesses: [] };
  const memoryContext = `
BỘ NHỚ DÀI HẠN HIỆN TẠI TỪ CÁC NGÀY TRƯỚC:
- Điểm mạnh hiện tại (Strengths): ${memory.strengths.join(', ') || 'Chưa có'}
- Lỗ hổng / Kẹt (Weaknesses): ${memory.weaknesses.join(', ') || 'Chưa có'}
  `;

  const prompt = `System Instruction:
Bạn là một AI Mentor khắt khe và sâu sắc. Bạn phân tích hành vi duyệt web lưu trong Log, kết hợp Bộ Nhớ Dài Hạn để xem tôi có tiến bộ không.
HÃY PHÂN TÍCH THEO 5 TRỤC DẤU VẾT NHẬN THỨC (COGNITIVE TRAILS):
1. Tiến hóa câu hỏi: Hỏi HOW (tay ngang), WHY/WHICH (bắt đầu hiểu), hay DESIGN/SCALE (làm chủ)?
2. Tần suất lặp lỗi: Có đang vướng lại một concept (state, async...) mà lẽ ra gỡ được rồi không?
3. Tỷ lệ phụ thuộc: Đang thả file nghìn dòng bắt AI tìm lỗi (Yếu), hay chỉ hỏi 1 đoạn logic/regex cốt lõi (Vững)?
4. Tư duy Refactor: Đang dùng Workaround để ép code chạy tạm (Bẫy nguy hiểm) hay tự hỏi cách tối ưu DRY/SOLID?
5. Giao tiếp Tiếng Anh (English Polish): Dò tìm các cụm từ/câu Tiếng Anh tôi đã gõ ("➤ Tôi gửi" hoặc "✏️ Draft"). Phát hiện tư duy "Vinglish", sai ngữ pháp hoặc diễn đạt lủng củng để vạch ra lỗi sai và viết lại cho sang trọng, chuẩn kĩ sư bản xứ.

LUẬT SUY LUẬN MỚI: Tuyệt đối KHÔNG đánh dấu là "learned/mastered" chỉ vì ngừng hỏi. "Mastered" chỉ đạt được khi user hỏi cách tối ưu (Refactor/Scale) hoặc chia nhỏ vấn đề tinh tế. Nếu ngừng hỏi sau khi copy một đống code tạp nham, đó là DÙNG WORKAROUND (chưa hiểu gốc) -> Ghi vào weaknesses/struggles.

${memoryContext}

DỮ LIỆU THỜI GIAN (Tập trung):
${activitiesText}

CHI TIẾT LOG SỰ KIỆN:
${logsText}

YÊU CẦU: Trả về ĐÚNG MỘT chuỗi JSON (KHÔNG bọc markdown) format như sau:
{
  "skills_practiced": ["Tên kĩ năng hôm nay"],
  "struggles": ["Lỗ hổng cốt lõi (VD: Lệ thuộc AI, Yếu kiến trúc...)"],
  "productivity_score": 8,
  "summary": "Vạch trần việc dùng workaround/học vẹt (nếu có). Gợi ý hành động thực chiến để vá lỗ hổng thay vì khen ngợi suông.",
  "best_hours": "09:00 - 11:00",
  "knowledge_graph_update": {
    "mastered": ["Kĩ năng thực sự làm chủ (Hỏi được câu HOW TO SCALE / REFACTOR)"],
    "new_weaknesses": ["Lỗi tư duy hoặc bẫy Workaround mới mắc phải"]
  },
  "english_corrections": [
    { "original": "how to fix bug memory crash out", "corrected": "How to resolve the memory leak issue?", "reason": "Dùng 'resolve' thay cho 'fix' sẽ sang hơn, và diễn đạt đúng ngữ cảnh lập trình." }
  ]
}`;

  await storageSet({ is_recapizing: true });
  notify('AI Copilot', 'Đang kết hợp Memory cũ để phân tích ngày hôm nay...');
  try {
    const { apiKey } = await storageGet(['apiKey']);
    if (!apiKey) { notify('Lỗi', 'Chưa cấu hình API Key!'); return; }
    
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OR_MODEL, messages: [{ role: 'user', content: prompt }] })
    });
    
    const data = await res.json();
    let textResult = data.choices?.[0]?.message?.content || "";
    textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsed;
    try {
      parsed = JSON.parse(textResult);
    } catch(e) {
      dbg('JSON Parse lỗi của Recap AI: ' + textResult);
      notify('Lỗi phân tích', 'AI trả về định dạng sai.');
      return;
    }

    // Cập nhật Sliding Memory
    if (parsed.knowledge_graph_update) {
      let newStrengths = new Set([...memory.strengths, ...(parsed.knowledge_graph_update.mastered || [])]);
      let newWeaknesses = new Set([...memory.weaknesses, ...(parsed.knowledge_graph_update.new_weaknesses || [])]);
      
      // Xóa điểm yếu đã được khắc phục
      if (parsed.knowledge_graph_update.mastered) {
        parsed.knowledge_graph_update.mastered.forEach(m => newWeaknesses.delete(m));
      }
      
      await storageSet({ 
        long_term_memory: { 
          strengths: Array.from(newStrengths).slice(-20), // Giữ tối đa 20 điểm mạnh nhất
          weaknesses: Array.from(newWeaknesses).slice(-10) 
        } 
      });
    }

    parsed.generatedAt = Date.now();
    await storageSet({ [`recap_${dateStr}`]: parsed });
    notify('AI Copilot', 'Đã cập nhật Memory và sinh Insight thành công!');
  } catch (err) {
    notify('Lỗi API', err.message);
  } finally {
    await storageSet({ is_recapizing: false });
  }
}

// ==== Phase 7: Weekly Analytics ====
async function generateWeeklyRecap() {
  const d = new Date();
  const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  
  const allData = await storageGet(null);
  
  // Lấy ra tất cả recap hằng ngày
  const dailyRecaps = Object.entries(allData)
    .filter(([k]) => k.startsWith('recap_') && !k.startsWith('recap_weekly_'))
    .sort((a,b) => b[1].generatedAt - a[1].generatedAt) // mới nhất trước
    .slice(0, 7) // Chỉ lấy 7 ngày gần nhất
    .map(([k, v]) => v);
    
  if (dailyRecaps.length === 0) {
    notify('Weekly Insights', 'Không đủ dữ liệu của các ngày qua để tổng hợp tuần.');
    return;
  }
  
  const recapsText = dailyRecaps.map((r, i) => {
    return `Ngày ${i+1}:\n- Học: ${r.skills_practiced?.join(', ')}\n- Lỗi vướng: ${r.struggles?.join(', ')}\n- Nhận xét: ${r.summary}`;
  }).join('\n\n');

  const memory = allData.long_term_memory || { strengths: [], weaknesses: [] };
  
  const prompt = `System Instruction:
Bạn là một AI Mentor. Nhiệm vụ của bạn là đọc BÁO CÁO 7 NGÀY GẦN NHẤT của tôi và Bộ Não Dài Hạn để TỔNG KẾT TUẦN (Weekly Analytics).
Hãy đưa ra 1 bức tranh toàn cảnh: Tôi đang đi đúng hướng không? Có kĩ năng nào tôi học rất tốt trong tuần này không? Có lỗ hổng nào hổng mãi không vá được không?

[BỘ NÃO DÀI HẠN]
Strengths: ${memory.strengths.join(', ')}
Weaknesses: ${memory.weaknesses.join(', ')}

[BÁO CÁO 7 NGÀY QUA]
${recapsText}

YÊU CẦU: Trả về ĐÚNG MỘT chuỗi JSON (KHÔNG bọc markdown) format như sau:
{
  "weekly_skills": ["Những kĩ năng nổi bật tóm gọn"],
  "core_weakness": "Điểm yếu cốt lõi làm mất nhiều thời gian nhất tuần qua",
  "summary": "Đánh giá chi tiết (khắt khe) toàn cảnh tuần, chỉ ra xu hướng (tốt lên hay lặp lại lỗi cũ). Đề xuất mục tiêu CỤ THỂ cho tuần tới.",
  "productivity_trend": "Tăng / Giảm / Đi ngang"
}`;

  await storageSet({ is_weekly_recapizing: true });
  notify('AI Copilot', 'Đang nghiền ngẫm dữ liệu 7 ngày qua để chốt sổ Tuần...');
  
  try {
    const { apiKey } = await storageGet(['apiKey']);
    if (!apiKey) return;
    
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OR_MODEL, messages: [{ role: 'user', content: prompt }] })
    });
    
    const data = await res.json();
    let textResult = data.choices?.[0]?.message?.content || "";
    textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(textResult);
    parsed.generatedAt = Date.now();
    await storageSet({ [`recap_weekly_${dateStr}`]: parsed });
    notify('AI Copilot', 'Đã chốt sổ Weekly Insight thành công!');
  } catch (err) {
    notify('Lỗi API Weekly', err.message);
  } finally {
    await storageSet({ is_weekly_recapizing: false });
  }
}
