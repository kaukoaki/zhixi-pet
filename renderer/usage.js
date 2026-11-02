'use strict';
window.__qiqiErrors = [];
window.addEventListener('error', event => window.__qiqiErrors.push(event.message));
window.addEventListener('unhandledrejection', event => window.__qiqiErrors.push(String(event.reason?.message || event.reason)));
const $ = id => document.getElementById(id);
const api = window.petAPI;
let current;
function node(tag, className, content) { const element = document.createElement(tag); if (className) element.className = className; if (content !== undefined) element.textContent = content; return element; }
function resetText(seconds) {
  if (!seconds) return '';
  const remaining = seconds * 1000 - Date.now();
  if (remaining <= 0) return '待刷新';
  const minutes = Math.ceil(remaining / 60000), hours = Math.floor(minutes / 60);
  const countdown = hours >= 24 ? `${Math.floor(hours / 24)}天${hours % 24 ? ` ${hours % 24}小时` : ''}` : hours ? `${hours}小时${minutes % 60 ? ` ${minutes % 60}分钟` : ''}` : `${minutes}分钟`;
  return `${countdown}后重置`;
}
function quota(win) {
  const card = node('div', `quota${win.remainingPercent !== null && win.remainingPercent < 20 ? ' low' : ''}`);
  const title = node('div', 'quota-title');
  const value = node('div', 'quota-value');
  const percent = node('strong', '', win.remainingPercent === null ? '—' : String(win.remainingPercent));
  if (win.remainingPercent !== null) percent.append(node('span', 'unit', '%'));
  value.append(node('small', '', '剩余'), percent);
  title.append(node('span', '', win.label), value);
  card.append(title);
  if (win.remainingPercent !== null) {
    const meter = node('div', 'meter'), progress = document.createElement('progress'); progress.max = 100; progress.value = win.remainingPercent; progress.setAttribute('aria-label', `${win.label}剩余 ${win.remainingPercent}%`); meter.append(progress); card.append(meter);
  }
  const reset=win.remainingPercent===null?'暂未提供':resetText(win.resetsAt);
  if(reset)card.append(node('p', 'reset', reset));
  return card;
}
function render(usage) {
  if (!usage) return;
  current = usage;
  $('plan').textContent = usage.planLabel;
  $('plan').dataset.status = usage.status;
  $('freshness').textContent = usage.fetchedAt ? `${new Date(usage.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 更新` : '等待更新';
  $('note').textContent = usage.ordinaryUsageAllowed === false ? '额度暂不可用' : '';
  $('note').hidden = !String($('note').textContent);
  $('buckets').replaceChildren();
  const buckets=window.usageView.displayBuckets(usage);
  for (const bucket of buckets) {
    const section = node('div', 'bucket');
    if (buckets.length > 1 || bucket.label !== 'Codex') section.append(node('h2', 'bucket-title', bucket.label));
    for (const win of bucket.windows) section.append(quota(win));
    $('buckets').append(section);
  }
  if (!buckets.length) $('buckets').append(node('p', 'empty', ({ idle: '读取中…', error: '暂未读到，点 ↻ 重试', unsupported: '请使用 ChatGPT 登录' }[usage.status] || (window.usageView.isPro(usage.planType)?'周额度暂未提供':'额度暂未提供'))));
  resize();
}
function resize() { api.resizeUsage(Math.ceil(document.querySelector('.usage-bubble').getBoundingClientRect().height+23)).catch(()=>{}); }
async function refresh() {
  $('refresh').disabled = true;
  try { render(await api.getUsage(true, true)); }
  catch { $('note').textContent = '暂未连接，稍后再试'; $('note').hidden=false;resize(); }
  finally { $('refresh').disabled = false; }
}
$('refresh').addEventListener('click', refresh);
$('close').addEventListener('click', () => window.close());
document.addEventListener('keydown', event => { if (event.key === 'Escape') window.close(); });
api.onUsage(render);
api.getUsage().then(render).catch(() => { $('note').textContent = '暂未连接';$('note').hidden=false;resize(); });
// Keep a visible report current, without polling while the bubble is hidden.
setInterval(() => { if (!document.hidden) api.getUsage().then(render).catch(() => { if (current) render(current); }); }, 60000);
