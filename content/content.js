// =============================================
// content.js — v1.6.0
// Không dùng sendMessage để gửi SUMMARIZE.
// Batch ghi vào storage → alarm đánh thức SW.
// Chỉ main frame xử lý FORCE_SUMMARIZE.
// =============================================

const IS_MAIN = window === window.top;

const INPUT_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="radio"]):not([type="checkbox"])',
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="textbox"]',
  '[role="combobox"]'
].join(', ');

const AI_RESPONSE_SELECTORS = {
  'claude.ai':             '[data-testid="chat-message-content"], .font-claude-message, [data-message-role="assistant"]',
  'chatgpt.com':           '[data-message-author-role="assistant"] .markdown',
  'chat.openai.com':       '[data-message-author-role="assistant"] .markdown',
  'gemini.google.com':     'model-response .response-content',
  'grok.com':              '[class*="message"][class*="assistant"]',
  'copilot.microsoft.com': '[class*="answer"] [class*="content"]',
  'perplexity.ai':         '[data-testid*="answer"]',
  'manus.im':              '[class*="message"][class*="content"], [class*="assistant"]'
};

const LOG_PREFIX   = 'log_';
const BATCH_KEY    = 'pending_batch';   // SW đọc key này để tóm tắt
const ALARM_NAME   = 'do_summarize';

let debounceTimer  = null;
let lastDraftText  = '';
let keystrokeCount = 0;
let draftKey       = null;
const attachedRoots  = new WeakSet();
const capturedEls    = new WeakSet();

let trackingOpts = { sent: true, draft: true, copy: true, click: true, ai: true, page: true, floatingToast: true };
chrome.storage.local.get(['trackingOptions'], (res) => {
  if (res.trackingOptions) trackingOpts = {...trackingOpts, ...res.trackingOptions};
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.trackingOptions) {
    trackingOpts = changes.trackingOptions.newValue;
  }
});

// ---- Unique key ----
function uid() { return Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

const recentTexts = new Set();

// ---- Ghi log entry trực tiếp vào storage ----
function writeLog(entry, triggerAlarm = false) {
  const textBody = (entry.text || '').trim();
  if (!textBody) return;

  const dupKey = entry.status + '|' + textBody;
  if (recentTexts.has(dupKey)) {
    dbg(`🚫 Lọc trùng (memory): "${textBody.slice(0, 30)}"`);
    return;
  }
  recentTexts.add(dupKey);
  setTimeout(() => recentTexts.delete(dupKey), 10000);

  chrome.storage.local.get(null, (allData) => {
    const now = Date.now();
    const isDuplicate = Object.keys(allData).some(k => {
      if (!k.startsWith(LOG_PREFIX)) return false;
      const log = allData[k];
      
      // Bỏ qua draft vì draft thường có text giống với sent
      if (log.status === 'draft') return false;
      
      // Lọc trùng nếu cùng trạng thái (VD: cùng là sent, ai-response) và cùng text trong 10s
      if (log.status === entry.status && log.text === textBody && (now - log.time) < 10000) {
        return true;
      }
      return false;
    });

    if (isDuplicate) {
      dbg(`🚫 Lọc trùng (storage): "${textBody.slice(0, 30)}"`);
      return;
    }

    const key = LOG_PREFIX + uid();
    chrome.storage.local.set({ [key]: entry }, () => {
      if (triggerAlarm) {
        chrome.alarms.create(ALARM_NAME, { delayInMinutes: 0.01 });
      }
    });
  });
}

// ---- Debug ----
function dbg(msg) {
  console.log('[AIS v1.6.0]', msg);
  chrome.storage.local.set({ ['dbg_' + uid()]: { msg, time: Date.now() } });
}

// ---- Dọn entries cũ (chạy lazy) ----
let pruning = false;
function pruneOld() {
  if (pruning) return;
  pruning = true;
  setTimeout(() => {
    pruning = false;
    chrome.storage.local.get(null, (all) => {
      const trim = (prefix, max) => {
        const keys = Object.keys(all).filter(k => k.startsWith(prefix)).sort().reverse();
        if (keys.length > max) chrome.storage.local.remove(keys.slice(max));
      };
      trim(LOG_PREFIX, 150);
      trim('dbg_', 60);
    });
  }, 5000);
}

// ---- Helpers ----
function getText(el) { return (el.innerText || el.textContent || el.value || '').trim(); }
function isInput(el) {
  if (!el || !el.matches) return false;
  try { return el.matches(INPUT_SELECTOR); } catch { return false; }
}
function host() { return location.hostname.replace('www.', ''); }

dbg(`✅ v1.6.0 ${IS_MAIN ? '[main]' : '[iframe]'}: ${location.hostname}`);

// Bỏ hàm triggerSummarize hoàn toàn vì không còn dùng BATCH_KEY.

// ---- Sent ----
function saveSent(text, trigger) {
  if (!trackingOpts.sent) return;
  if (!text || text.length < 2) return;
  // Xoá draft cũ
  if (draftKey) {
    chrome.storage.local.remove(draftKey);
    draftKey = null;
  }
  const entry = { text, status: 'sent', trigger, time: Date.now(), url: location.hostname, summarized: false };
  writeLog(entry, true);
  pruneOld();
  lastDraftText = '';
  dbg(`📤 SENT [${trigger}]: "${text.slice(0, 50)}"`);
  showToast('📤 Đã ghi nhận chat: ' + text.slice(0, 30) + '...');
}

// ---- Draft ----
function saveDraft(text) {
  if (!text || text.length < 2) return;
  lastDraftText = text;
  const entry = { text, status: 'draft', time: Date.now(), url: location.hostname };
  if (draftKey) {
    chrome.storage.local.set({ [draftKey]: entry });
  } else {
    draftKey = LOG_PREFIX + uid();
    chrome.storage.local.set({ [draftKey]: entry });
  }
}

// ---- Lắng nghe hiệu suất hoạt động trên trang (Focus Time) ----
let activeTimeMs = 0;
let lastActiveStamp = Date.now();
let isIdle = false;
let idleTimer = null;
const IDLE_TIMEOUT = 30000; // 30s không làm gì -> tính là idle
let domainKeystrokes = 0;

function resetIdle() {
  if (isIdle) {
    isIdle = false;
    lastActiveStamp = Date.now();
  }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    isIdle = true;
    updateActiveTime(); // cộng nốt vào tổng ngay khi idle
  }, IDLE_TIMEOUT);
}

function updateActiveTime() {
  if (isIdle || document.hidden) return;
  const now = Date.now();
  activeTimeMs += (now - lastActiveStamp);
  lastActiveStamp = now;
}

function saveDomainTimeInfo() {
  if (!IS_MAIN) return; // Chỉ tính active time ở main frame để tránh đội thời gian từ iframe
  if (!activeTimeMs && !domainKeystrokes) return;
  
  checkIntervention('time'); // Phase 3: Kiểm tra hành vi ngâm docs quá lâu

  const d = new Date();
  const dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const h = host();
  const key = `active_${dateStr}_${h}`;
  
  const addTime = activeTimeMs;
  const addKeys = domainKeystrokes;
  activeTimeMs = 0;
  domainKeystrokes = 0;
  lastActiveStamp = Date.now();
  
  chrome.storage.local.get([key], (res) => {
    const existing = res[key] || { timeMs: 0, keystrokes: 0, url: location.origin };
    existing.timeMs += addTime;
    existing.keystrokes += addKeys;
    chrome.storage.local.set({ [key]: existing });
  });
}

// Bắt đầu track Time
if (IS_MAIN) {
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetIdle, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      updateActiveTime();
      isIdle = true;
      saveDomainTimeInfo(); // Lưu luôn nếu rời tab
    } else {
      isIdle = false;
      lastActiveStamp = Date.now();
      resetIdle();
    }
  });
  resetIdle();
  setInterval(() => { updateActiveTime(); saveDomainTimeInfo(); }, 60000);
}

// ---- Typing ----
function handleTyping(el) {
  if (!isInput(el)) return;
  keystrokeCount++;
  domainKeystrokes++;
  if (keystrokeCount % 10 === 0) chrome.storage.local.set({ keystrokeCount });
  if (!trackingOpts.draft) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const draft = getText(el);
    if (draft.length < 2) return;
    dbg(`📝 DRAFT: "${draft.slice(0, 50)}"`);
    saveDraft(draft);
  }, 1000);
}

// ---- Click ----
function handleClick(e) {
  if (!trackingOpts.click) return;
  const el = e.target;
  if (!el || isInput(el)) return;
  const text = (el.innerText || el.textContent || '').trim();
  if (text.length < 3 || text.length > 400) return;
  if (el.closest?.('nav,header,footer,aside,[role="navigation"],[role="toolbar"],[role="menubar"]')) return;
  const isSuggest = el.closest?.('[role="listbox"],[role="menu"],[class*="suggest"],[class*="autocomplete"],[class*="chip"],[class*="prompt"],[class*="example"],[class*="starter"]');
  const status  = isSuggest ? 'clicked-suggestion' : 'clicked';
  const entry   = { text, status, trigger: isSuggest ? 'suggestion' : 'click', time: Date.now(), url: location.hostname, summarized: false };
  writeLog(entry, true);
  pruneOld();
  dbg(`🖱️ ${status}: "${text.slice(0, 50)}"`);
}

// ---- AI Response ----
const aiTimers = new WeakMap();
const aiCapturedText = new WeakMap();

function processAILive(el, isInitialLoad = false) {
  if (!trackingOpts.ai) return;
  const currentText = getText(el);
  
  // Đánh dấu lúc mới load trang để không bắt lại các tin cũ (ngăn flood log)
  if (isInitialLoad) {
    aiCapturedText.set(el, currentText);
    return;
  }

  // Quá ngắn thì bỏ qua
  if (currentText.length < 30) return;
  
  // Nếu nội dung không thay đổi so với lần capture gần nhất, bỏ qua
  if (aiCapturedText.get(el) === currentText) return;

  // Hủy bộ đếm chờ ghi cũ mỗi khi chữ tiếp tục mọc thêm
  if (aiTimers.has(el)) {
    clearTimeout(aiTimers.get(el));
  }

  // Đặt bộ chờ 3 giây: Đủ 3 giây mà AI không gõ chữ nào nữa => Chắc chắn đã gõ xong đứt điểm
  const timer = setTimeout(() => {
    const finalText = getText(el);
    // Double check lần cuối để tránh log trùng
    if (aiCapturedText.get(el) === finalText) return;
    
    // Ghi nhận nội dung hoàn chỉnh
    aiCapturedText.set(el, finalText);
    dbg(`🤖 AI Response hoàn chỉnh (${finalText.length}c)`);
    writeLog({ text: finalText, status: 'ai-response', trigger: 'screen', time: Date.now(), url: location.hostname, summarized: false }, true);
    showToast('🤖 AI phản hồi: ' + finalText.slice(0, 30) + '...');
  }, 3500);

  aiTimers.set(el, timer);
}

function setupAIObserver() {
  if (!IS_MAIN) return;
  const h = host();
  let sel = null;
  for (const [domain, s] of Object.entries(AI_RESPONSE_SELECTORS)) {
    if (h.includes(domain)) { sel = s; break; }
  }
  if (!sel) return;
  dbg(`🎯 AI observer: ${h}`);
  
  // Quét các đoạn chat cũ đã sinh ra từ trước lúc vào web
  document.querySelectorAll(sel).forEach(el => processAILive(el, true));
  
  let t = null;
  new MutationObserver(() => {
    clearTimeout(t);
    // Mỗi khi file DOM bị sửa đổi (khi AI giật ra 1 chữ), cập nhật lại
    t = setTimeout(() => document.querySelectorAll(sel).forEach(el => processAILive(el)), 600);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

// ---- Copy ----
function handleCopy() {
  if (!trackingOpts.copy) return;
  const text = window.getSelection()?.toString().trim();
  if (!text || text.length < 5) return;
  dbg(`📋 COPIED: "${text.slice(0, 50)}"`);
  const entry = { text, status: 'copied', trigger: 'copy', time: Date.now(), url: location.hostname, summarized: false };
  writeLog(entry, true);
  pruneOld();
  
  showToast('📋 Copied: ' + text.slice(0, 30) + '...');
  checkIntervention('copy'); // Phase 3
}

// ==== UI TOAST ====
function showToast(msg) {
  if (!trackingOpts.floatingToast || !IS_MAIN) return;
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', top: '20px', right: '20px', zIndex: '2147483647', pointerEvents: 'none' });
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .ais-toast { background: rgba(15,15,20,0.95); border-left: 3px solid #3b82f6; color: #fff; padding: 10px 16px; border-radius: 4px; font-family: -apple-system, sans-serif; font-size: 13px; transform: translateX(120%); opacity: 0; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
      .ais-toast.show { transform: translateX(0); opacity: 1; }
    </style>
    <div class="ais-toast">${msg}</div>
  `;
  setTimeout(() => shadow.querySelector('.ais-toast').classList.add('show'), 50);
  setTimeout(() => {
    shadow.querySelector('.ais-toast').classList.remove('show');
    setTimeout(() => host.remove(), 500);
  }, 3000);
}

// ==== Phase 3: REAL-TIME MENTOR INTERVENTION ====
let pageCopies = 0;
let copyResetTimer = null;
let interventionShown = false;

function checkIntervention(triggerType) {
  if (interventionShown || !IS_MAIN) return;

  if (triggerType === 'copy') {
    pageCopies++;
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => { pageCopies = 0; }, 180000); // Reset sau 3 phút
    if (pageCopies >= 3) {
      showMentorPopup(
        '⚠️ Dấu hiệu Học vẹt', 
        'Bạn đang sao chép code liên tục 3 lần trong thời gian ngắn.<br>Hãy dừng lại 1 phút dùng <b>Kỹ thuật Feynman</b>: Tự giải thích 3 dòng code bạn vừa copy xem nó xử lý vấn đề gì trước khi dán vào IDE!',
        'feynman'
      );
      pageCopies = 0;
    }
  } else if (triggerType === 'time') {
    // Nếu activeTimeMs > 5 phút (300k ms) & phím gõ <= 15
    if (activeTimeMs > 300000 && domainKeystrokes <= 15) {
      const isDoc = window.location.hostname.includes('docs') || window.location.hostname.includes('stackoverflow') || window.location.hostname.includes('github') || window.location.hostname.includes('medium');
      if (isDoc) {
        showMentorPopup(
          '💡 Thử Nghiệm Thực Tế',
          'Bạn đang ngâm một tài liệu khá lâu mà không gõ phím. Đừng vướng bẫy Tutorial!<br>Hãy <b>Reverse Engineering</b>: Tải repo/code chạy thử và sửa tham số xem điều gì gãy thay vì tiếp tục đọc.',
          'reverse'
        );
      }
    }
  }
}

function showMentorPopup(title, msg, type) {
  interventionShown = true;
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483647' });
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .ais-mentor {
        background: #1a1525; border-left: 4px solid ${type === 'feynman' ? '#f87171' : '#c084fc'};
        color: #eedbff; font-family: -apple-system, sans-serif; padding: 16px; border-radius: 6px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 320px;
        transform: translateX(350px); opacity: 0; transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      .ais-mentor.show { transform: translateX(0); opacity: 1; }
      .ais-title { font-weight: 600; font-size: 14px; margin-bottom: 8px; display: flex; align-items:center; justify-content:space-between; }
      .ais-msg { font-size: 13px; line-height: 1.5; color: #d1d5db; }
      .ais-close { cursor: pointer; color: #888; font-size: 18px; font-weight: bold; background:none; border:none; padding:0; outline:none; }
      .ais-close:hover { color: #fff; }
      b { color: #fff; }
    </style>
    <div class="ais-mentor">
      <div class="ais-title"><span>${title}</span><button class="ais-close" id="btn-close">&times;</button></div>
      <div class="ais-msg">${msg}</div>
    </div>
  `;
  
  setTimeout(() => shadow.querySelector('.ais-mentor').classList.add('show'), 100);
  
  const cls = () => {
    shadow.querySelector('.ais-mentor').classList.remove('show');
    setTimeout(() => host.remove(), 500);
  };
  shadow.getElementById('btn-close').onclick = cls;
  setTimeout(() => { if (host.isConnected) cls(); }, 20000); // 20s tự tắt
}

// ---- Thấu hiểu điều bạn thấy (Capture Page Context) ----
function capturePageContext() {
  if (!trackingOpts.page) return;
  if (!IS_MAIN) return;
  const title = document.title || '';
  const descTag = document.querySelector('meta[name="description"]');
  const desc = descTag ? descTag.content : '';
  const mainText = document.body ? document.body.innerText.substring(0, 800).replace(/\n+/g, ' ') : '';
  
  if (title.length < 3 && mainText.length < 10) return;
  const pageInfo = `Tiêu đề: ${title}. Mô tả: ${desc}. Noi dung (mẫu): ${mainText}...`;
  dbg(`👁️ Đang xem trang: "${title.slice(0, 40)}"`);

  const entry = { text: pageInfo, status: 'visited-page', trigger: 'auto-read', time: Date.now(), url: location.hostname, summarized: false };
  writeLog(entry, false); // Không cần đánh thức AI ngay, đợi mẻ batch
}

// ---- Keyboard ----
function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && isInput(e.target)) {
    saveSent(getText(e.target), 'enter');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') setTimeout(handleCopy, 50);
}

function handleBlur(e) {
  const el = e.target;
  if (!isInput(el) || lastDraftText.length < 2) return;
  setTimeout(() => {
    if (getText(el).length < 2 && draftKey) {
      dbg(`🗑️ ERASED: "${lastDraftText.slice(0, 50)}"`);
      chrome.storage.local.set({ [draftKey]: { text: lastDraftText, status: 'erased', time: Date.now(), url: location.hostname } });
      draftKey = null;
      lastDraftText = '';
    }
  }, 400);
}

function handleFocus(e) {
  if (isInput(e.target)) {
    const el = e.target;
    dbg(`🎯 Focus: <${el.tagName?.toLowerCase()}> role="${el.getAttribute?.('role') || ''}"`);
  }
}

// ---- Attach ----
function attachToRoot(root) {
  if (attachedRoots.has(root)) return;
  attachedRoots.add(root);
  dbg(`🔌 Attach: ${root === document ? 'document' : 'shadow-root'}`);
  const SKIP = ['Arrow','Tab','Caps','Shift','Control','Alt','Meta','Escape','Page','Home','End','F'];
  root.addEventListener('input',          (e) => handleTyping(e.target), true);
  root.addEventListener('keyup',          (e) => { if (!SKIP.some(k => e.key.startsWith(k))) handleTyping(e.target); }, true);
  root.addEventListener('keydown',        handleKeydown, true);
  root.addEventListener('blur',           handleBlur, true);
  root.addEventListener('focus',          handleFocus, true);
  root.addEventListener('compositionend', (e) => handleTyping(e.target), true);
  root.addEventListener('copy',           handleCopy, true);
  root.addEventListener('click',          handleClick, true);
}

function walkShadow(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.shadowRoot) { attachToRoot(node.shadowRoot); walkShadow(node.shadowRoot); }
  }
}

function scan() {
  attachToRoot(document);
  if (IS_MAIN) walkShadow(document);
  dbg(`🔍 Scan: ${document.querySelectorAll(INPUT_SELECTOR).length} inputs`);
}

scan();
setTimeout(scan, 2000);
setTimeout(setupAIObserver, 2500);

// Chờ người dùng dừng lại ở trang web trên 15 giây mới trích xuất bối cảnh (Context)
if (IS_MAIN) {
  setTimeout(capturePageContext, 15000);
}

// Send button
document.addEventListener('click', (e) => {
  const el  = e.target;
  const al  = (el.getAttribute?.('aria-label') || '').toLowerCase();
  const dt  = (el.getAttribute?.('data-testid') || '').toLowerCase();
  const hit = al.includes('send') || al.includes('gửi') || dt.includes('send') ||
              el.closest?.('[aria-label*="send" i],[data-testid*="send" i]');
  if (!hit) return;
  for (const input of document.querySelectorAll(INPUT_SELECTOR)) {
    const msg = getText(input);
    if (msg.length > 1) { saveSent(msg, 'button'); break; }
  }
}, true);

// Throttled shadow scan
let shadowTimer = null;
new MutationObserver((mutations) => {
  if (!IS_MAIN) return;
  if (!mutations.some(m => m.addedNodes.length)) return;
  clearTimeout(shadowTimer);
  shadowTimer = setTimeout(() => walkShadow(document), 1500);
}).observe(document.documentElement, { childList: true, subtree: true });

// ---- Lệnh từ popup — CHỈ main frame xử lý ----
if (IS_MAIN) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'FORCE_SUMMARIZE') {
      dbg(`⚡ FORCE_SUMMARIZE`);
      // Thêm draft hiện tại nếu có
      if (lastDraftText.length > 1) {
        writeLog({ text: lastDraftText, status: 'draft', trigger: 'manual', time: Date.now(), url: location.hostname, summarized: false }, true);
        lastDraftText = '';
      } else {
        // Đánh thức Background xử lý củng cố
        chrome.alarms.create(ALARM_NAME, { delayInMinutes: 0.01 });
      }
    }

    if (msg.type === 'CLEAR_LOG') {
      lastDraftText = ''; keystrokeCount = 0; draftKey = null;
      chrome.storage.local.get(null, (all) => {
        const keys = Object.keys(all).filter(k => k.startsWith(LOG_PREFIX) || k.startsWith('dbg_'));
        if (keys.length) chrome.storage.local.remove(keys);
        chrome.storage.local.set({ keystrokeCount: 0 });
      });
    }
  });
}
