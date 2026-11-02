'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const createIdleActions=require('../renderer/idle-actions.js');
const clip=id=>({id,media:{url:id+'.webm'}});
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function fixture(extra={}){
 let time=0,sequence=0,busy=false,visible=true,stops=0;
 const timers=new Map(),plays=[],state={settings:{randomIdle:true},actions:['greeting','drag','working','wallet','pat'].map(clip),pomodoroActions:[clip('pomodoro-study')],task:null};
 const controller=createIdleActions({getState:()=>state,isBusy:()=>busy,isVisible:()=>visible,play:id=>{plays.push(id);busy=true;return true;},stop:()=>{stops++;busy=false;},now:()=>time,random:()=>.2,setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:time+delay});return id;},clearTimeout:id=>timers.delete(id),...extra});
 async function tick(ms){const end=time+ms;while(true){const item=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;timers.delete(item[0]);time=item[1].at;item[1].fn();await flush();}time=end;await flush();}
 return{controller,state,plays,timers,tick,get stops(){return stops;},busy:value=>{busy=value;},visible:value=>{visible=value;},end:()=>{const id=controller.current;busy=false;controller.ended(id);}};
}
test('idle shuffles every installed ordinary action, excludes all pomodoro slots, and never repeats across cycle boundaries',async()=>{
 const f=fixture();f.state.actions.push(clip('pomodoro-start'),clip('custom-study'),{id:'empty',media:null});f.state.pomodoroActions.push(clip('custom-study'));f.controller.sync();
 for(let i=0;i<11;i++){await f.tick(7500);assert.ok(f.controller.current);assert.equal(f.plays.length,i+1);f.end();}
 assert.deepEqual(new Set(f.plays.slice(0,5)),new Set(['greeting','drag','working','wallet','pat']));
 for(let i=1;i<f.plays.length;i++)assert.notEqual(f.plays[i],f.plays[i-1]);assert.ok(!f.plays.some(id=>/study|pomodoro/.test(id)));f.controller.dispose();
});
test('clips finish naturally without polling restarts, then wait before the next random action',async()=>{
 const f=fixture();f.controller.sync();await f.tick(7500);assert.equal(f.plays.length,1);await f.tick(120000);assert.equal(f.plays.length,1);f.end();await f.tick(2500);assert.equal(f.plays.length,1);await f.tick(5000);assert.equal(f.plays.length,2);f.controller.dispose();
});
test('tasks, focused or paused pomodoro sessions, hiding and disabling stop only a scheduler-owned clip',async()=>{
 for(const block of [f=>{f.state.task={status:'running'};},f=>{f.state.pomodoro={phase:'focus',status:'running'};},f=>{f.state.pomodoro={phase:'focus',status:'paused'};},f=>f.visible(false),f=>{f.state.settings.randomIdle=false;}]){
  const f=fixture();f.controller.sync();await f.tick(7500);block(f);f.controller.sync();assert.equal(f.controller.current,null);assert.equal(f.stops,1);await f.tick(120000);assert.equal(f.plays.length,1);f.controller.dispose();
 }
 const manual=fixture();manual.busy(true);manual.state.task={status:'running'};manual.controller.sync();assert.equal(manual.stops,0);manual.controller.dispose();
});
test('manual playback and dragging take priority and stale async completion cannot restore an automatic clip',async()=>{
 let resolvePlay;const f=fixture({play:id=>new Promise(resolve=>{f.plays.push(id);resolvePlay=resolve;})});f.controller.sync();await f.tick(7500);assert.ok(f.controller.current);
 f.controller.interrupt();f.busy(true);resolvePlay(false);await flush();await f.tick(60000);assert.equal(f.plays.length,1);assert.equal(f.stops,0);
 f.busy(false);await f.tick(7500);assert.equal(f.plays.length,2);f.controller.dispose();
});
test('broken media cools down and new or removed library media is reflected immediately',async()=>{
 const f=fixture();f.state.actions=[clip('only')];f.controller.sync();await f.tick(7500);f.busy(false);f.controller.failed('only');await f.tick(30000);assert.equal(f.plays.length,1);
 f.state.actions.push(clip('new'));f.controller.sync();await f.tick(7500);assert.equal(f.plays.at(-1),'new');f.state.actions=[];f.controller.sync();assert.equal(f.stops,1);assert.equal(f.controller.current,null);f.controller.dispose();
});
test('empty libraries keep the default idle, preferences can re-enable playback, and disposal clears timers',async()=>{
 const f=fixture();f.state.actions=[];f.controller.sync();await f.tick(120000);assert.equal(f.plays.length,0);assert.equal(f.timers.size,0);
 f.state.settings.randomIdle=false;f.state.actions=[clip('only')];f.controller.sync();await f.tick(120000);assert.equal(f.plays.length,0);
 f.state.settings.randomIdle=true;f.controller.sync();await f.tick(7500);assert.deepEqual(f.plays,['only']);f.end();f.controller.dispose();await f.tick(120000);assert.equal(f.plays.length,1);assert.equal(f.timers.size,0);
});
