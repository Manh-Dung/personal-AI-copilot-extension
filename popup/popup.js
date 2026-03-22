// =============================================
// popup.js — v1.8.0
// Đọc log theo prefix key thay vì key 'log'
// =============================================

const LOG_PREFIX = 'log_';
const DBG_PREFIX = 'dbg_';

const apiKeyInput  = document.getElementById('apiKey');
const saveKeyBtn   = document.getElementById('saveKey');
const summarizeBtn = document.getElementById('summarizeNow');
const clearLogBtn  = document.getElementById('clearLog');
const testApiBtn   = document.getElementById('testApi');
const panelLog     = document.getElementById('panel-log');
const panelHistory = document.getElementById('panel-history');
const panelSettings= document.getElementById('panel-settings');
const panelDebug   = document.getElementById('panel-debug');
const customPromptInput= document.getElementById('customPrompt');
const savePromptBtn= document.getElementById('savePrompt');
const exportDataBtn= document.getElementById('exportData');
const importDataBtn= document.getElementById('importDataBtn');
const importFileInp= document.getElementById('importFile');
const chkSent = document.getElementById('chk_sent');
const chkDraft = document.getElementById('chk_draft');
const chkCopy = document.getElementById('chk_copy');
const chkClick = document.getElementById('chk_click');
const chkAi = document.getElementById('chk_ai');
const chkPage = document.getElementById('chk_page');

const summarizeIntervalInp = document.getElementById('summarizeInterval');
const dailyRecapTimeInp = document.getElementById('dailyRecapTime');
const weeklyRecapDaySel = document.getElementById('weeklyRecapDay');
const chkFloatingToast = document.getElementById('chk_floating_toast');

const saveTrackingBtn = document.getElementById('saveTracking');
const emptyLog     = document.getElementById('emptyLog');
const emptyHistory = document.getElementById('emptyHistory');
const emptyIgnored = document.getElementById('emptyIgnored');
const emptyDebug   = document.getElementById('emptyDebug');
const dotApi       = document.getElementById('dotApi');
const lblApi       = document.getElementById('lblApi');
const keystrokeLbl = document.getElementById('keystrokeCount');
const logCountLbl  = document.getElementById('logCount');
const spinnerSummarizing = document.getElementById('spinnerSummarizing');
const tabOnboard     = document.querySelector('.tab[data-tab="onboard"]');

// ---- Đọc tất cả entries từ storage ----
function loadAll(cb) {
  chrome.storage.local.get(null, (all) => {
    const logEntries = Object.entries(all)
      .filter(([k]) => k.startsWith(LOG_PREFIX))
      .map(([k, v]) => ({ storageKey: k, ...v }))
      .filter(Boolean)
      .sort((a, b) => (b.time || 0) - (a.time || 0)); // mới nhất trước

    const debugEntries = Object.entries(all)
      .filter(([k]) => k.startsWith(DBG_PREFIX))
      .map(([, v]) => v)
      .filter(Boolean)
      .sort((a, b) => (b.time || 0) - (a.time || 0));

    cb({
      logEntries,
      debugEntries,
      history:        all.history || [],
      apiKey:         all.apiKey || '',
      customPrompt:   all.customPrompt || '',
      trackingOptions: all.trackingOptions || { sent:true, draft:true, copy:true, click:true, ai:true, page:true, floatingToast:true, summarizeInterval:10, dailyRecapTime:'08:00', weeklyRecapDay:0 },
      keystrokeCount: all.keystrokeCount || 0,
      is_summarizing: all.is_summarizing || false,
      ignored_items:  all.ignored_items || []
    });
  });
}

// ---- Init ----
let currentLogData = [];
let currentFilter = 'all';
let currentIgnoredData = [];

loadAll((data) => {
  if (data.apiKey) apiKeyInput.value = data.apiKey;
  if (data.customPrompt) customPromptInput.value = data.customPrompt;
  if (data.trackingOptions) {
    chkSent.checked = data.trackingOptions.sent !== false;
    chkDraft.checked = data.trackingOptions.draft !== false;
    chkCopy.checked = data.trackingOptions.copy !== false;
    chkClick.checked = data.trackingOptions.click !== false;
    chkAi.checked = data.trackingOptions.ai !== false;
    chkPage.checked = data.trackingOptions.page !== false;
    chkFloatingToast.checked = data.trackingOptions.floatingToast !== false;
    
    if (data.trackingOptions.summarizeInterval) {
      summarizeIntervalInp.value = data.trackingOptions.summarizeInterval;
    }
    if (data.trackingOptions.dailyRecapTime) {
      dailyRecapTimeInp.value = data.trackingOptions.dailyRecapTime;
    }
    if (data.trackingOptions.weeklyRecapDay !== undefined) {
      weeklyRecapDaySel.value = data.trackingOptions.weeklyRecapDay;
    }
  }
  updateApiStatus(data.apiKey);
  spinnerSummarizing.style.display = data.is_summarizing ? 'flex' : 'none';
  
  currentIgnoredData = data.ignored_items;
  currentLogData = data.logEntries.filter(e => !currentIgnoredData.some(i => i.status === e.status && i.text === e.text));
  renderLog(currentLogData);
  renderHistory(data.history);
  renderIgnored(currentIgnoredData);
  renderDebug(data.debugEntries);
  keystrokeLbl.textContent = data.keystrokeCount;
  logCountLbl.textContent  = currentLogData.length;
});

// ---- Lưu API key ----
saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  chrome.storage.local.set({ apiKey: key }, () => {
    saveKeyBtn.textContent = '✓';
    updateApiStatus(key);
    setTimeout(() => (saveKeyBtn.textContent = 'Lưu'), 1500);
  });
});

// ---- Lưu Custom Prompt ----
savePromptBtn.addEventListener('click', () => {
  const promptText = customPromptInput.value.trim();
  chrome.storage.local.set({ customPrompt: promptText }, () => {
    savePromptBtn.textContent = '✓ Đã Lưu';
    setTimeout(() => (savePromptBtn.textContent = 'Lưu Prompt'), 1500);
  });
});

// ---- Lưu Tracking Options ----
saveTrackingBtn.addEventListener('click', () => {
  let interval = parseInt(summarizeIntervalInp.value, 10);
  if (isNaN(interval) || interval < 5) interval = 5;
  summarizeIntervalInp.value = interval;

  const opts = {
    sent: chkSent.checked, draft: chkDraft.checked,
    copy: chkCopy.checked, click: chkClick.checked,
    ai: chkAi.checked, page: chkPage.checked,
    floatingToast: chkFloatingToast.checked,
    summarizeInterval: interval,
    dailyRecapTime: dailyRecapTimeInp.value,
    weeklyRecapDay: parseInt(weeklyRecapDaySel.value, 10) || 0
  };
  chrome.storage.local.set({ trackingOptions: opts }, () => {
    alert('Đã lưu! ' + (opts.summarizeInterval !== 10 ? 'Chu kỳ tóm tắt có thể cần bạn tải lại trang web để áp dụng.' : ''));
  });
});

// ---- Xuất Dữ liệu ----
exportDataBtn.addEventListener('click', () => {
  chrome.storage.local.get(null, (all) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(all, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "ais_export_" + Date.now() + ".json");
    dlAnchorElem.click();
  });
});

// ---- Tabs ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const tabName = tab.dataset.tab;
    document.getElementById('panel-' + tabName).classList.add('active');
    // Bỏ tự động reload liên tục với DOM nặng, chỉ reload loadAll khi nhảy tab
    if (tabName !== 'onboard') {
      loadAll((data) => {
        currentIgnoredData = data.ignored_items;
        currentLogData = data.logEntries.filter(e => !currentIgnoredData.some(i => i.status === e.status && i.text === e.text));
        renderLog(currentLogData);
        renderHistory(data.history);
        renderIgnored(currentIgnoredData);
        renderDebug(data.debugEntries);
        keystrokeLbl.textContent = data.keystrokeCount;
        logCountLbl.textContent  = data.logEntries.length;
      });
    }
  });
});

// ---- Filter Log ----
document.querySelectorAll('.tag-filter').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tag-filter').forEach(b => b.classList.remove('active', 'btn-red'));
    e.target.classList.add('active', 'btn-red');
    currentFilter = e.target.dataset.filter;
    renderLog(currentLogData);
  });
});

// ---- Bỏ qua log & Xoá log lẻ ----
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('del-log-btn')) {
    const key = e.target.dataset.key;
    chrome.storage.local.remove(key, () => {
      e.target.closest('.log-item').remove();
      currentLogData = currentLogData.filter(i => i.storageKey !== key);
      logCountLbl.textContent = currentLogData.length;
    });
  } else if (e.target.classList.contains('skip-log-btn')) {
    const key = e.target.dataset.key;
    const logItem = currentLogData.find(i => i.storageKey === key);
    if (!logItem) return;
    
    if (confirm(`Bạn có chắc muốn bỏ qua CẢ TRONG TƯƠNG LAI với hành động\n[${logItem.status}] "${logItem.text.slice(0, 50)}..." không?`)) {
      chrome.storage.local.get(['ignored_items'], (res) => {
        const ignored = res.ignored_items || [];
        const isExist = ignored.find(i => i.status === logItem.status && i.text === logItem.text);
        if (!isExist) {
          ignored.push({ status: logItem.status, text: logItem.text });
          chrome.storage.local.set({ ignored_items: ignored }, () => {
            currentIgnoredData = ignored;
            if (document.querySelector('.tab.active')?.dataset?.tab === 'ignored') {
              renderIgnored(currentIgnoredData);
            }
          });
        }
        
        // Remove existing items that match this criteria
        chrome.storage.local.get(null, (all) => {
          const keysToRemove = Object.keys(all).filter(k => 
            k.startsWith(LOG_PREFIX) && all[k].status === logItem.status && all[k].text === logItem.text
          );
          if (keysToRemove.length) {
            chrome.storage.local.remove(keysToRemove, () => {
              currentLogData = currentLogData.filter(i => !(i.status === logItem.status && i.text === logItem.text));
              renderLog(currentLogData);
              logCountLbl.textContent = currentLogData.length;
            });
          }
        });
      });
    }
  } else if (e.target.classList.contains('restore-ignored-btn')) {
    const index = parseInt(e.target.dataset.index, 10);
    chrome.storage.local.get(['ignored_items'], (res) => {
      let ignored = res.ignored_items || [];
      ignored.splice(index, 1);
      chrome.storage.local.set({ ignored_items: ignored }, () => {
        currentIgnoredData = ignored;
        renderIgnored(currentIgnoredData);
      });
    });
  }
});

// ---- Import Data ----
importDataBtn.addEventListener('click', () => importFileInp.click());

importFileInp.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const importedData = JSON.parse(event.target.result);
      // Merge với storage hiện tại
      chrome.storage.local.set(importedData, () => {
        alert('Nhập dữ liệu thành công!');
        window.location.reload();
      });
    } catch(err) {
      alert('File JSON lỗi: ' + err.message);
    }
  };
  reader.readAsText(file);
});

// ---- Xoá log toàn bộ hiện tại ----
clearLogBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_LOG' }).catch(() => {});
  renderLog([]);
  renderDebug([]);
  keystrokeLbl.textContent = 0;
  logCountLbl.textContent  = 0;
});

// ---- Mở Dashboard ----
document.getElementById('openDashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
});

// ---- Test API ----
testApiBtn.addEventListener('click', () => {
  testApiBtn.disabled = true;
  testApiBtn.textContent = '...';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="debug"]').classList.add('active');
  panelDebug.classList.add('active');
  chrome.runtime.sendMessage({ type: 'TEST_API' });
  setTimeout(() => { testApiBtn.disabled = false; testApiBtn.textContent = 'Test API'; }, 5000);
});

// ---- Tóm tắt ngay ----
summarizeBtn.addEventListener('click', async () => {
  summarizeBtn.disabled = true;
  summarizeBtn.textContent = '⏳';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: 'FORCE_SUMMARIZE' }).catch(() => {});
  setTimeout(() => {
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = '⚡ Tóm tắt';
    loadAll((data) => renderHistory(data.history));
  }, 5000);
});

// ---- Render log ----
const BADGE_LABEL = {
  sent: 'SENT', draft: 'DRAFT', erased: 'ERASED', copied: 'COPIED',
  'clicked-suggestion': 'SUGGEST', clicked: 'CLICKED', 'ai-response': 'AI RESP',
  'visited-page': 'READ'
};

function renderLog(entries) {
  const container = document.getElementById('log-list-container');
  Array.from(container.querySelectorAll('.log-item')).forEach(el => el.remove());
  
  const filtered = currentFilter === 'all' ? entries : entries.filter(e => e.status === currentFilter);
  
  if (!filtered.length) { emptyLog.style.display = 'block'; return; }
  emptyLog.style.display = 'none';
  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = 'log-item';
    const label   = BADGE_LABEL[item.status] || (item.status || '').toUpperCase();
    const trigger = item.trigger ? ` · ${item.trigger}` : '';
    const time    = new Date(item.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    div.innerHTML = `
      <span class="badge ${item.status}">${label}</span>
      <div class="log-body">
        <div class="log-text">${escHtml(item.text)}</div>
        <div class="log-meta">${time} · ${item.url || ''}${trigger}</div>
      </div>
      <button class="skip-log-btn" data-key="${item.storageKey}" title="Bỏ qua (ẩn khỏi danh sách và không ghi nhận nữa)" style="background:none; border:none; color:var(--muted); font-size:14px; cursor:pointer; margin-right: 4px;" onmouseover="this.style.color='#facc15'" onmouseout="this.style.color='var(--muted)'">🚫</button>
      <button class="del-log-btn" data-key="${item.storageKey}" title="Xóa log này" style="background:none; border:none; color:var(--red-dim); font-size:16px; cursor:pointer;" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--red-dim)'">&times;</button>
      `;
    container.appendChild(div);
  });
}

function renderHistory(history) {
  Array.from(panelHistory.querySelectorAll('.history-item')).forEach(el => el.remove());
  if (!history.length) { emptyHistory.style.display = 'block'; return; }
  emptyHistory.style.display = 'none';
  history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const tagHtml = (item.tags && item.tags.length) ? `<div style="margin-bottom:6px;display:flex;flex-wrap:wrap;gap:4px;">${item.tags.map(t => `<span style="background:#2d1f5e;color:#c084fc;padding:2px 6px;border-radius:4px;font-size:10px;">${escHtml(t)}</span>`).join('')}</div>` : '';
    div.innerHTML = `
      <div class="history-time">${new Date(item.time).toLocaleString('vi-VN')} · ${item.messageCount} msgs</div>
      ${tagHtml}
      <div class="history-text">${escHtml(item.summary)}</div>`;
    panelHistory.appendChild(div);
  });
}

function renderIgnored(items) {
  const container = document.getElementById('ignored-list-container');
  if (!container) return;
  Array.from(container.querySelectorAll('.ignored-item')).forEach(el => el.remove());
  if (!items || !items.length) { emptyIgnored.style.display = 'block'; return; }
  emptyIgnored.style.display = 'none';
  items.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'log-item ignored-item';
    const label = BADGE_LABEL[item.status] || (item.status || '').toUpperCase();
    div.innerHTML = `
      <span class="badge ${item.status}">${label}</span>
      <div class="log-body">
        <div class="log-text">${escHtml(item.text)}</div>
      </div>
      <button class="restore-ignored-btn" data-index="${index}" title="Khôi phục (ghi nhận lại bình thường)" style="background:none; border:none; color:#4ade80; font-size:18px; line-height:1; cursor:pointer;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#4ade80'">&#x21BA;</button>
    `;
    container.appendChild(div);
  });
}

function renderDebug(entries) {
  Array.from(panelDebug.querySelectorAll('.debug-item')).forEach(el => el.remove());
  if (!entries.length) { emptyDebug.style.display = 'block'; return; }
  emptyDebug.style.display = 'none';
  entries.forEach(item => {
    const div  = document.createElement('div');
    const msg  = item.msg || '';
    let cls = '';
    if (msg.startsWith('✅') || msg.includes('OK')) cls = 'ok';
    else if (msg.startsWith('❌') || msg.includes('FAILED')) cls = 'err';
    else if (msg.startsWith('⚠️')) cls = 'warn';
    div.className = `debug-item ${cls}`;
    const time = new Date(item.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    div.innerHTML = `<span class="debug-time">${time}</span>${escHtml(msg)}`;
    panelDebug.appendChild(div);
  });
}

function updateApiStatus(key) {
  const ok = key && key.startsWith('sk-or');
  dotApi.className = 'chip-dot ' + (ok ? 'ok' : 'err');
  lblApi.textContent = ok ? 'API: đã cài' : 'API: chưa cài';
  
  if (tabOnboard) {
    if (ok) {
      tabOnboard.style.display = 'none';
      if (tabOnboard.classList.contains('active')) {
        document.querySelector('.tab[data-tab="log"]').click();
      }
    } else {
      tabOnboard.style.display = 'block';
    }
  }
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---- Auto reload mỗi 3s khi popup mở ----
setInterval(() => {
  loadAll((data) => {
    const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
    currentIgnoredData = data.ignored_items;
    currentLogData = data.logEntries.filter(e => !currentIgnoredData.some(i => i.status === e.status && i.text === e.text));
    
    if (activeTab === 'log')     renderLog(currentLogData);
    if (activeTab === 'history') renderHistory(data.history);
    if (activeTab === 'ignored') renderIgnored(currentIgnoredData);
    if (activeTab === 'debug')   renderDebug(data.debugEntries);
    keystrokeLbl.textContent = data.keystrokeCount;
    logCountLbl.textContent  = currentLogData.length;
    updateApiStatus(data.apiKey);
    spinnerSummarizing.style.display = data.is_summarizing ? 'flex' : 'none';
  });
}, 3000);
