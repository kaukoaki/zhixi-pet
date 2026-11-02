'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeUsage}=require('../main/codex-usage.cjs');
const {selectWalletAction,createWalletReactions}=require('../main/wallet-reactions.cjs');
const now=2000000000000;
function usage(remaining,resetMinutes=120,extra={}){
  return normalizeUsage({planType:'plus'},{rateLimits:{limitId:'codex',primary:{usedPercent:100-remaining,windowDurationMins:300,resetsAt:now/1000+resetMinutes*60},secondary:{usedPercent:10,windowDurationMins:10080,resetsAt:now/1000+86400}},...extra},now);
}
test('wallet reactions follow actual remaining boundaries and nearby depleted reset times',()=>{
  for(const [remaining,minutes,id] of [[100,120,'wallet'],[51,120,'wallet'],[50,120,'wallet-careful'],[21,120,'wallet-careful'],[20,120,'wallet-low'],[1,120,'wallet-low'],[0,120,'wallet-empty'],[0,30,'wallet-wait'],[0,1,'wallet-wait'],[0,0,'wallet']])assert.equal(selectWalletAction(usage(remaining,minutes),{now}),id);
});
test('weekly restrictions also matter for Plus; Pro uses its displayed weekly window only',()=>{
  const data=usage(0,10);data.buckets[0].windows[1].remainingPercent=0;
  assert.equal(selectWalletAction(data,{now}),'wallet-empty');
  data.planType='pro';data.buckets[0].windows[1].remainingPercent=80;
  assert.equal(selectWalletAction(data,{now}),'wallet');
  data.buckets[0].windows[1].remainingPercent=12;
  assert.equal(selectWalletAction(data,{now}),'wallet-low');
});
test('missing, stale, failed, or ambiguous model-only usage stays neutral, without invented full/empty states',()=>{
  const incomplete=usage(10);incomplete.buckets[0].windows[0].remainingPercent=null;
  const stale=usage(10);stale.fetchedAt-=120001;
  const expired=usage(0,0);
  const multiple=usage(10);multiple.buckets=[{...multiple.buckets[0],id:'model_a'},{...multiple.buckets[0],id:'model_b'}];
  for(const data of [undefined,{status:'error'},incomplete,stale,expired,multiple])assert.equal(selectWalletAction(data,{now}),'wallet');
  const noReset=usage(0);noReset.buckets[0].windows[0].resetsAt=null;
  assert.equal(selectWalletAction(noReset,{now}),'wallet-empty');
});
test('backend usage restrictions and missing media use safe available fallbacks',()=>{
  assert.equal(selectWalletAction(usage(70,120,{ordinaryUsageAllowed:false}),{now}),'wallet-empty');
  assert.equal(selectWalletAction(usage(10),{now,hasMedia:id=>id==='wallet'}),'wallet');
  assert.equal(selectWalletAction(usage(10),{now,hasMedia:()=>false}),null);
});
test('a cancelled or superseded pending query cannot play a late wallet action',async()=>{
  const pending=[],played=[];
  const reactions=createWalletReactions({refresh:()=>new Promise(resolve=>pending.push(resolve)),hasMedia:()=>true,play:id=>played.push(id),now:()=>now});
  const first=reactions.query(),second=reactions.query();pending[1](usage(10));await second;pending[0](usage(80));await first;
  assert.deepEqual(played,['wallet-low']);
  const hidden=reactions.query();reactions.cancel();pending[2](usage(35));await hidden;
  assert.deepEqual(played,['wallet-low']);
});
test('query feedback never interrupts a task, including tasks that begin or finish during lookup',async()=>{
  let busy=true,resolve;const played=[];
  const reactions=createWalletReactions({refresh:()=>new Promise(r=>{resolve=r;}),isBusy:()=>busy,hasMedia:()=>true,play:id=>played.push(id),now:()=>now});
  const running=reactions.query();busy=false;resolve(usage(10));await running;
  const startsLater=reactions.query();busy=true;resolve(usage(10));await startsLater;
  assert.deepEqual(played,[]);
});
