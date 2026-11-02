'use strict';
const { displayBuckets, isPro } = require('../renderer/usage-view.js');
function buildUsageMenu(usage, show, refresh) {
  const rows = [
    { id: 'pet-usage-details', label: '查看额度', click: show },
    { id: 'pet-usage-refresh', label: '刷新额度', click: refresh },
    { type: 'separator' }
  ];
  const buckets=displayBuckets(usage);
  for (const bucket of buckets) {
    if(buckets.length>1 || bucket.label!=='Codex') rows.push({ label: bucket.label, enabled: false });
    for (const win of bucket.windows) rows.push({ label: `${win.label} · ${win.remainingPercent === null ? '暂未提供' : `剩余 ${win.remainingPercent}%`}`, enabled: false });
  }
  if(!buckets.length) rows.push({label:usage.status==='idle'?'正在读取…':isPro(usage.planType)?'周额度暂未提供':'额度暂未提供',enabled:false});
  return { id: 'pet-usage', label: `查看额度 · ${usage.planLabel}`, submenu: rows };
}
module.exports = { buildUsageMenu };
