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

let trackingOpts = { sent: true, draft: true, copy: true, click: true, ai: true, page: true };
chrome.storage.local.get(['trackingOptions'], (res) => {
  if (res.trackingOptions) trackingOpts = res.trackingOptions;
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

// ---- Typing ----
function handleTyping(el) {
  if (!isInput(el)) return;
  keystrokeCount++;
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
