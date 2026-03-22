// =============================================
// background.js — v1.6.0
// Dùng alarm để đánh thức SW — không phụ thuộc sendMessage.
// =============================================

const OR_MODEL   = 'stepfun/step-3.5-flash:free';
const BATCH_KEY  = 'pending_batch';
const ALARM_NAME = 'do_summarize';

console.log('[AIS BG v1.6.0] started');

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

// ---- Đăng ký alarm định kỳ 10 phút ----
chrome.alarms.get(ALARM_NAME, (existing) => {
  if (!existing) {
    chrome.alarms.create('auto_summarize', { periodInMinutes: 10 });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'auto_summarize') processBatch();
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
});

// ---- Daily Recap Engine (Phase 2) ----
async function generateDailyRecap() {
  const d = new Date();
  const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  
  const allData = await storageGet(null);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  
  const todayLogs = Object.values(allData).filter(item => item.time >= startOfDay && item.status);
  const todayTimes = Object.entries(allData).filter(([k]) => k.startsWith(`active_${dateStr}`));
  
  if (!todayLogs.length && !todayTimes.length) {
    notify('Daily Insights', 'Chưa có hoạt động nào hôm nay để phân tích.');
    return;
  }
  
  let activitiesText = todayTimes.map(([k, v]) => {
    const domain = k.split('_').slice(2).join('_');
    return `- ${domain}: ${Math.round(v.timeMs/60000)} phút, ${v.keystrokes} phím gõ`;
  }).join('\n');
  
  let logsText = todayLogs.map(m => {
    return `- [${new Date(m.time).toLocaleTimeString('vi-VN')}] ${m.status}: ${m.text.slice(0, 150)}`;
  }).join('\n');
  if(logsText.length > 5000) logsText = logsText.slice(0, 5000) + '... (cắt bớt)';
  
  const prompt = `System Instruction:
Bạn là một AI Mentor cá nhân xuất sắc về phương pháp học tập. Nhiệm vụ của bạn là phân tích dữ liệu hành vi trượt web, tìm kiếm, gõ code của tôi hôm nay để nhận diện điểm mạnh và lỗ hổng kiến thức.
DỮ LIỆU THỜI GIAN THEO DOMAIN (Tính độ tập trung):
${activitiesText}

CHI TIẾT LOG SỰ KIỆN (Nội dung đã đọc, search, copy):
${logsText}

YÊU CẦU: Trả về ĐÚNG MỘT chuỗi JSON (KHÔNG bọc markdown) format chuẩn hoá:
{
  "skills_practiced": ["Tên kĩ năng/công cụ 1"],
  "struggles": ["Khái niệm/Lỗi đang bị mắc kẹt 1"],
  "productivity_score": 8,
  "summary": "Nhận xét chi tiết (3-4 câu) chỉ ra chính xác mình đang yếu, đang kẹt ở tư duy nào và đưa ra lời khuyên thực chiến ngày mai dựa trên Kỹ Thuật Feynman hoặc Reverse Engineering thay vì cày Tutorial.",
  "best_hours": "khoảng thời gian tập trung nhất"
}`;

  await storageSet({ is_recapizing: true });
  notify('AI Copilot', 'Đang nghiền ngẫm hoạt động ngày hôm nay của bạn...');
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
    
    try {
      const parsed = JSON.parse(textResult);
      parsed.generatedAt = Date.now();
      await storageSet({ [`recap_${dateStr}`]: parsed });
      notify('AI Copilot', 'Đã phân tích xong Insight trong ngày!');
    } catch(e) {
      dbg('JSON Parse lỗi của Recap AI: ' + textResult);
      notify('Lỗi phân tích', 'AI trả về định dạng sai.');
    }
  } catch (err) {
    notify('Lỗi API', err.message);
  } finally {
    await storageSet({ is_recapizing: false });
  }
}
