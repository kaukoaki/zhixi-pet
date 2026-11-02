'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { normalizeUsage, readUsage, UsageService } = require('../main/codex-usage.cjs');
const { buildUsageMenu } = require('../main/usage-menu.cjs');
const { displayBuckets } = require('../renderer/usage-view.js');

test('Plus shows actual five-hour and weekly remaining, clamped and without invented missing values', () => {
  const result = normalizeUsage({ planType: 'plus' }, { rateLimits: { primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: 123 }, secondary: { usedPercent: null } } }, 100);
  assert.equal(result.planLabel, 'Plus');
  assert.equal(result.buckets[0].windows[0].label, '5 小时额度');
  assert.equal(result.buckets[0].windows[0].remainingPercent, 70);
  assert.equal(result.buckets[0].windows[1].remainingPercent, null);
  assert.equal(result.buckets[0].windows[1].resetsAt, null);
  const invalid = normalizeUsage({}, { rateLimits: { primary: { usedPercent: 130 }, secondary: { usedPercent: -4, windowDurationMins: 10080 } } });
  assert.deepEqual(invalid.buckets[0].windows.map(w => w.remainingPercent), [0, 100]);
  assert.equal(invalid.buckets[0].windows[1].label, '每周额度');
});
test('Pro variants do not invent a five-hour quota; server-provided windows remain authoritative', () => {
  for (const planType of ['pro', 'prolite', 'promax']) {
    const result = normalizeUsage({ planType }, { rateLimits: { secondary: { usedPercent: 40, windowDurationMins: 10080 } } });
    assert.equal(result.buckets[0].windows.length, 1);
    assert.doesNotMatch(result.note, /Plus|Pro|五小时/);
    const windows = normalizeUsage({ planType }, { rateLimits: { primary: { usedPercent: 5, windowDurationMins: 300 } } });
    assert.equal(windows.buckets[0].windows[0].remainingPercent, 95);
    assert.equal(windows.buckets[0].windows[0].durationMins, 300);
  }
});
test('multi-bucket view wins over legacy and keeps zero credits distinct from unlimited', () => {
  const result = normalizeUsage({}, { ordinaryUsageAllowed: false, rateLimits: { limitId: 'old' }, rateLimitsByLimitId: { model_a: { planType: 'plus', primary: { usedPercent: 20, windowDurationMins: 60 }, credits: { balance: '0', hasCredits: false, unlimited: false } }, model_b: { primary: { usedPercent: 60, windowDurationMins: 15 }, credits: { unlimited: true } } } });
  assert.deepEqual(result.buckets.map(b => b.id), ['model_a','model_b']);
  assert.equal(result.planType, 'plus'); assert.equal(result.ordinaryUsageAllowed, false);
  assert.equal(result.buckets[0].credits.balance, '0'); assert.equal(result.buckets[1].credits.unlimited, true);
  assert.equal(result.buckets[1].windows[0].label, '15 分钟额度');
});

function server(respond) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  let killed = false, buffer = ''; const sent = [];
  child.kill = () => { killed = true; };
  child.stdin.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) { const request = JSON.parse(buffer.slice(0,end)); buffer = buffer.slice(end+1); sent.push(request); respond(request, child); }
  });
  return { child, sent, get killed() { return killed; } };
}
const reply = (child, id, result) => child.stdout.write(JSON.stringify({ id, result }) + '\n');
test('usage RPC initializes, reads only account/limits and never returns email or credentials', async () => {
  const f = server((request, child) => queueMicrotask(() => {
    if (request.id === 1) reply(child, 1, {});
    if (request.id === 2) reply(child, 2, { account: { type: 'chatgpt', planType: 'plus', email: 'private@example.com', token: 'private-token' } });
    if (request.id === 3) {
      // UTF-8 messages may cross pipe boundaries.
      const data = Buffer.from(JSON.stringify({ id: 3, result: { rateLimits: { limitName: '额度', primary: { usedPercent: 20, windowDurationMins: 300 } } } }) + '\n');
      child.stdout.write(data.subarray(0, 53)); child.stdout.write(data.subarray(53));
    }
  }));
  const env = { HTTPS_PROXY: 'http://localhost:8765', CODEX_HOME: 'custom-profile' };
  const result = await readUsage({ codexPath: 'codex.exe', env, spawnImpl: (_exe, args, options) => { assert.deepEqual(args, ['app-server','--listen','stdio://']); assert.equal(options.windowsHide,true); assert.equal(options.shell,false); assert.deepEqual(options.env, env); return f.child; } });
  assert.equal(result.buckets[0].windows[0].remainingPercent, 80);
  assert.doesNotMatch(JSON.stringify(result), /private/);
  assert.deepEqual(f.sent.map(s => s.method), ['initialize','initialized','account/read','account/rateLimits/read']);
  assert.equal(f.sent[2].params.refreshToken,false); assert.equal(f.killed,true);
});
test('API key login has an explicit unsupported state and makes no limits or inference call', async () => {
  const f = server((r,c) => queueMicrotask(() => { if (r.id === 1) reply(c,1,{}); if (r.id === 2) reply(c,2,{account:{type:'apiKey'}}); }));
  const result = await readUsage({ codexPath:'codex.exe', spawnImpl:()=>f.child });
  assert.equal(result.status,'unsupported'); assert.equal(result.planLabel,'API Key'); assert.equal(f.sent.length,3);
});
test('RPC errors, timeout and abort close only the owned child with friendly messages', async () => {
  const error = server((r,c) => queueMicrotask(() => c.stdout.write(JSON.stringify({ id:r.id,error:{message:'Bearer private-token'} })+'\n')));
  await assert.rejects(readUsage({codexPath:'codex.exe',spawnImpl:()=>error.child}), /初始化失败/); assert.equal(error.killed,true);
  const timed = server(()=>{});
  await assert.rejects(readUsage({codexPath:'codex.exe',spawnImpl:()=>timed.child,timeoutMs:10}),/超时/); assert.equal(timed.killed,true);
  const aborted = server(()=>{}), controller = new AbortController();
  const promise = readUsage({codexPath:'codex.exe',spawnImpl:()=>aborted.child,signal:controller.signal}); controller.abort();
  await assert.rejects(promise,/取消/); assert.equal(aborted.killed,true);
});
test('cache coalesces concurrent reads, refreshes on demand, and clears previous account data on failure', async () => {
  let reads=0, fail=false, time=100;
  const service = new UsageService({now:()=>time,read:async()=>{reads++;if(fail)throw Error('secret');return normalizeUsage({planType:'plus'},{rateLimits:{primary:{usedPercent:10}}},time);}});
  const [a,b]=await Promise.all([service.refresh(),service.refresh(true)]);
  assert.deepEqual(a,b);assert.equal(reads,1);
  await service.refresh();assert.equal(reads,1);
  time+=60001;await service.refresh();assert.equal(reads,2);
  fail=true;const lost=await service.refresh(true);assert.equal(lost.status,'error');assert.deepEqual(lost.buckets,[]);assert.equal(lost.fetchedAt,null);assert.doesNotMatch(JSON.stringify(lost),/secret/);
  await service.refresh();assert.equal(reads,3);
  time+=15001;await service.refresh();assert.equal(reads,4);
});
test('right-click menu uses the same actual windows and supports details and refresh', () => {
  let opened=0,refreshed=0;
  const data=normalizeUsage({planType:'plus'},{rateLimits:{primary:{usedPercent:32,windowDurationMins:300}}});
  const menu=buildUsageMenu(data,()=>opened++,()=>refreshed++);
  assert.match(menu.label,/Plus/);assert.ok(menu.submenu.some(item=>/剩余 68%/.test(item.label)));
  menu.submenu.find(i=>i.id==='pet-usage-details').click();menu.submenu.find(i=>i.id==='pet-usage-refresh').click();assert.equal(opened,1);assert.equal(refreshed,1);
});

test('account changes update plan, windows and menu without retaining Plus copy or quota assumptions',async()=>{
  let account={planType:'plus'},limits={rateLimits:{primary:{usedPercent:9,windowDurationMins:300}}};
  const service=new UsageService({read:async()=>normalizeUsage(account,limits)});
  const plus=await service.refresh();assert.equal(plus.planLabel,'Plus');
  account={planType:'promax'};limits={rateLimits:{secondary:{usedPercent:37,windowDurationMins:10080}}};
  const pro=await service.refresh(true),menu=buildUsageMenu(pro,()=>{},()=>{});
  assert.equal(pro.planLabel,'Pro Max');assert.doesNotMatch(JSON.stringify(menu),/Plus|五小时|5 小时|无限/);assert.match(JSON.stringify(menu),/63%/);
  account={planType:'future_plan'};limits={rateLimits:{}};
  const unknown=await service.refresh(true);assert.equal(unknown.planLabel,'future_plan');assert.deepEqual(unknown.buckets[0].windows,[]);
});

test('Plus keeps actual five-hour and weekly quotas; Pro variants show weekly only without mutating service data',()=>{
  for(const planType of ['plus','pro','prolite','promax']){
    const data=normalizeUsage({planType},{rateLimits:{primary:{usedPercent:32,windowDurationMins:300},secondary:{usedPercent:11,windowDurationMins:10080},credits:{balance:'0',hasCredits:false}}});
    const original=structuredClone(data),buckets=displayBuckets(data),menu=buildUsageMenu(data,()=>{},()=>{});
    assert.deepEqual(buckets[0].windows.map(w=>w.durationMins),planType==='plus'?[300,10080]:[10080]);
    assert.deepEqual(data,original);assert.doesNotMatch(JSON.stringify(menu),/额外点数/);
    if(planType!=='plus')assert.doesNotMatch(JSON.stringify(menu),/5 小时/);
  }
});
test('Pro missing weekly usage reports unavailable instead of substituting a short-term or full quota',()=>{
  const data=normalizeUsage({planType:'pro'},{rateLimits:{primary:{usedPercent:30,windowDurationMins:300}}});
  assert.deepEqual(displayBuckets(data),[]);
  const menu=buildUsageMenu(data,()=>{},()=>{});
  assert.match(JSON.stringify(menu),/周额度暂未提供/);assert.doesNotMatch(JSON.stringify(menu),/70%|100%|无限/);
  const primaryWeek=normalizeUsage({planType:'pro'},{rateLimits:{primary:{usedPercent:12,windowDurationMins:10080}}});
  assert.equal(displayBuckets(primaryWeek)[0].windows[0].remainingPercent,88);
});
