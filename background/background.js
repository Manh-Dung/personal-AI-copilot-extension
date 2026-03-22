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

// ---- Message handler (chỉ TEST_API) ----
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TEST_API') { testApi(); return; }
});
