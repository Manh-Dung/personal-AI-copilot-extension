document.addEventListener('DOMContentLoaded', () => {
  const d = new Date();
  const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  chrome.storage.local.get(null, (data) => {
    updateStatusBadge(data.is_recapizing, data.is_weekly_recapizing);

    // Lấy recap Daily mới nhất
    const recaps = Object.entries(data)
      .filter(([k]) => k.startsWith('recap_') && !k.startsWith('recap_weekly_'))
      .sort((a, b) => b[1].generatedAt - a[1].generatedAt);
    
    if (recaps.length > 0) {
      renderDaily(recaps[0][1]);
    } else {
      recapCard.style.display = 'none';
    }
    
    // Lấy recap Weekly mới nhất
    const weeklyRecaps = Object.entries(data)
      .filter(([k]) => k.startsWith('recap_weekly_'))
      .sort((a,b) => b[1].generatedAt - a[1].generatedAt);
      
    if (weeklyRecaps.length > 0) {
      renderWeekly(weeklyRecaps[0][1]);
    } else {
      weeklyCard.style.display = 'none';
    }

    renderChart(data);
  });

  btnGenerate.addEventListener('click', () => {
     chrome.runtime.sendMessage({ type: 'GENERATE_DAILY_RECAP' });
     btnGenerate.disabled = true;
     btnGenerate.textContent = 'Đang phân tích... (Xem AI Pushed)';
  });

  btnGenerateWeekly.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GENERATE_WEEKLY_RECAP' });
    btnGenerateWeekly.disabled = true;
    btnGenerateWeekly.textContent = 'Đang phân tích... (Xem AI Pushed)';
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    const d = new Date();
    const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    if (changes[`recap_${dateStr}`] || changes.is_recapizing || changes[`recap_weekly_${dateStr}`] || changes.is_weekly_recapizing) {
       chrome.storage.local.get([`recap_${dateStr}`, 'is_recapizing', `recap_weekly_${dateStr}`, 'is_weekly_recapizing'], (res) => {
           updateStatusBadge(res.is_recapizing, res.is_weekly_recapizing);
           if (res[`recap_${dateStr}`]) renderDaily(res[`recap_${dateStr}`]);
           if (res[`recap_weekly_${dateStr}`]) renderWeekly(res[`recap_weekly_${dateStr}`]);
       });
    }
  }
});

const btnGenerate = document.getElementById('btnGenerate');
const btnGenerateWeekly = document.getElementById('btnGenerateWeekly');
const statusBadge = document.getElementById('statusBadge');
const recapCard = document.getElementById('recapCard');
const weeklyCard = document.getElementById('weeklyCard');

// Daily UI
const uSkills = document.getElementById('skills');
const coreFocus = document.getElementById('coreFocus');
const dailySummary = document.getElementById('dailySummary');

// Weekly UI
const weeklySkills = document.getElementById('weeklySkills');
const coreWeakness = document.getElementById('coreWeakness');
const productivityTrend = document.getElementById('productivityTrend');
const weeklySummary = document.getElementById('weeklySummary');

function updateStatusBadge(isRecapizing, isWeeklyRecapizing) {
  if (isRecapizing || isWeeklyRecapizing) {
    statusBadge.style.display = 'block';
    statusBadge.textContent = 'Đang phân tích...';
    btnGenerate.disabled = true;
    btnGenerateWeekly.disabled = true;
  } else {
    statusBadge.style.display = 'none';
    btnGenerate.disabled = false;
    btnGenerate.textContent = 'Tạo Recap Hôm Nay';
    btnGenerateWeekly.disabled = false;
    btnGenerateWeekly.textContent = 'Tạo Recap Tuần Này';
  }
}

function renderTags(arr, container, type='skill') {
  container.innerHTML = '';
  if (!arr || arr.length === 0) {
    container.innerHTML = `<span class="tag tag-empty">Chưa có ${type}</span>`;
    return;
  }
  arr.forEach(item => {
    const span = document.createElement('span');
    span.className = `tag tag-${type}`;
    span.textContent = item;
    container.appendChild(span);
  });
}

function renderDaily(recap) {
  recapCard.style.display = 'block';
  renderTags(recap.skills || [], uSkills, 'skill');
  coreFocus.textContent = recap.core_focus || 'Không có';
  dailySummary.textContent = recap.summary || '';
}

function renderWeekly(wk) {
  weeklyCard.style.display = 'block';
  renderTags(wk.weekly_skills || [], weeklySkills, 'skill');
  coreWeakness.textContent = wk.core_weakness || 'Không có';
  productivityTrend.textContent = wk.productivity_trend || '-';
  weeklySummary.textContent = wk.summary || '';
}

function renderChart(allData) {
  const container = document.getElementById('chart-container');
  const timeData = Object.entries(allData)
      .filter(([k]) => k.startsWith('active_'))
      .map(([k, v]) => {
          const parts = k.split('_');
          return { date: parts[1], domain: parts.slice(2).join('_'), ...v };
      });

  if (!timeData.length) {
    container.innerHTML = '<i style="color:#666">Chưa có dữ liệu thời gian. Hãy làm việc và lướt web rồi quay lại xem nhé!</i>';
    return;
  }
  
  // Group by domain
  const aggregated = {};
  let maxTime = 0;
  timeData.forEach(item => {
    if (!aggregated[item.domain]) aggregated[item.domain] = { timeMs: 0, keystrokes: 0 };
    aggregated[item.domain].timeMs += item.timeMs;
    aggregated[item.domain].keystrokes += item.keystrokes;
  });
  
  const sorted = Object.entries(aggregated).sort((a,b) => b[1].timeMs - a[1].timeMs);
  if (sorted.length > 0) maxTime = sorted[0][1].timeMs;
  
  container.innerHTML = '';
  sorted.forEach(([domain, stats]) => {
    let mins = Math.floor(stats.timeMs / 60000);
    // Nếu activeTime < 1 phút nhưng có gõ phím thì vẫn coi là 1 phút để hiển thị
    if (mins < 1 && stats.keystrokes > 0) mins = 1;
    if (mins < 1 && stats.keystrokes === 0) return; 
    
    // Giới hạn UI thanh fill tối đa 100%
    const pct = maxTime > 0 ? Math.min((stats.timeMs / maxTime) * 100, 100) : 0;
    
    const row = document.createElement('div');
    row.className = 'bar-row';
    // Đổi màu thanh dựa vào việc xem đó là trang học tập hay giải trí (cơ bản)
    const isCode = domain.includes('github') || domain.includes('stackoverflow') || domain.includes('localhost');
    let fillStyle = isCode ? 'background: linear-gradient(90deg, #1e3a8a 0%, #3b82f6 100%);' : '';
    
    row.innerHTML = `
      <div class="bar-label" title="${domain}">${domain}</div>
      <div class="bar-wrapper" title="${mins} phút">
        <div class="bar-fill" style="width: ${pct}%; ${fillStyle}"></div>
      </div>
      <div class="bar-value">
        ${mins} phút
        <span class="bar-sub">${stats.keystrokes} phím gõ</span>
      </div>
    `;
    container.appendChild(row);
  });
}
