document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(null, (allData) => {
    const timeData = Object.entries(allData)
      .filter(([k]) => k.startsWith('active_'))
      .map(([k, v]) => {
          const parts = k.split('_'); // [0]=active, [1]=2026-03-22, [2]=domain
          return { date: parts[1], domain: parts.slice(2).join('_'), ...v };
      });
      
    renderChart(timeData);
  });
});

function renderChart(data) {
  const container = document.getElementById('chart-container');
  if (!data.length) {
    container.innerHTML = '<i style="color:#666">Chưa có dữ liệu thời gian. Hãy làm việc và lướt web rồi quay lại xem nhé!</i>';
    return;
  }
  
  // Group by domain
  const aggregated = {};
  let maxTime = 0;
  data.forEach(item => {
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
