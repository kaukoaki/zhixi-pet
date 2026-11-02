'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPomodoro}=require('../main/pomodoro.cjs');
const {pomodoroBounds,buildPomodoroMenu}=require('../main/pomodoro-window.cjs');
const createCompanion=require('../renderer/pomodoro-companion.js');
function clock(saved){let now=100000;const events=[],completed=[];const timer=createPomodoro({now:()=>now,saved,onChange:(state,meta)=>events.push({state,meta}),onComplete:s=>completed.push(s)});return{timer,events,completed,advance:ms=>{now+=ms;return timer.tick();}};}
test('pomodoro uses a real deadline across delayed ticks and completes exactly once',()=>{
  const f=clock();f.timer.command({type:'start',minutes:25});assert.equal(f.advance(10000).remainingMs,1490000);
  assert.equal(f.advance(2000000).status,'completed');for(let i=0;i<5;i++)f.timer.tick();
  assert.equal(f.completed.length,1);assert.equal(f.completed[0].phase,'focus');assert.equal(f.timer.snapshot().remainingMs,0);
});
test('pause excludes paused time, resume preserves remaining duration, stop does not award completion',()=>{
  const f=clock();f.timer.command({type:'start',minutes:1});f.advance(12000);const paused=f.timer.command({type:'pause'});
  assert.equal(paused.remainingMs,48000);f.advance(100000);assert.equal(f.timer.snapshot().remainingMs,48000);
  f.timer.command({type:'resume'});assert.equal(f.advance(10000).remainingMs,38000);f.timer.command({type:'stop'});f.advance(100000);
  assert.equal(f.completed.length,0);assert.equal(f.timer.snapshot().status,'idle');
});
test('invalid durations and conflicting starts cannot reset an active session',()=>{
  const f=clock();for(const minutes of [0,-1,1.5,181,NaN,'25'])assert.throws(()=>f.timer.command({type:'start',minutes}),/时长/);
  const started=f.timer.command({type:'start',minutes:45});assert.throws(()=>f.timer.command({type:'start',minutes:25}),/结束/);
  assert.equal(f.timer.snapshot().sessionId,started.sessionId);assert.throws(()=>f.timer.command({type:'resume'}),/状态/);
});
test('restored sessions resume as paused and expired sessions never fabricate a completed tomato',()=>{
  const f=clock({version:1,status:'running',phase:'focus',sessionId:'old',durationMs:60000,remainingMs:60000,deadline:135000});
  assert.equal(f.timer.snapshot().status,'paused');assert.equal(f.timer.snapshot().remainingMs,35000);assert.equal(f.completed.length,0);
  const expired=clock({version:1,status:'running',phase:'focus',durationMs:60000,deadline:1});assert.equal(expired.timer.snapshot().status,'idle');assert.equal(expired.completed.length,0);
  f.timer.command({type:'resume'});f.timer.shutdown();assert.equal(f.timer.snapshot().status,'paused');
});
test('a short break is a distinct phase and completion remains tagged as a break',()=>{
  const f=clock();f.timer.command({type:'break',minutes:5});assert.equal(f.timer.snapshot().phase,'break');f.advance(300000);
  assert.equal(f.completed[0].phase,'break');assert.equal(f.completed.filter(s=>s.phase==='focus').length,0);
});
test('countdown positioning chooses available side and stays inside negative-coordinate monitor work areas',()=>{
  const area={x:-1920,y:0,width:1920,height:1040};
  const right=pomodoroBounds({x:-1800,y:800,width:264,height:347},area,182);assert.equal(right.side,'right');
  const left=pomodoroBounds({x:-280,y:20,width:264,height:347},area);assert.equal(left.side,'left');
  for(const {bounds:b}of[right,left]){assert.ok(b.x>=area.x&&b.x+b.width<=area.x+area.width);assert.ok(b.y>=area.y&&b.y+b.height<=area.height);}
});
test('native pomodoro menu reflects pause state and contains timer controls only',()=>{
  const called=[];const menu=buildPomodoroMenu({status:'paused'},{open(){},command:c=>called.push(c)});
  assert.equal(menu.submenu.find(i=>i.id==='pet-pomodoro-start-25').enabled,false);
  menu.submenu.find(i=>i.id==='pet-pomodoro-pause').click();assert.equal(called[0].type,'resume');
  assert.equal(menu.submenu.length,6);
  assert.equal(menu.submenu.some(i=>i.id?.startsWith('pet-action-')||i.id?.startsWith('pet-unavailable-')),false);
});
function companionFixture(){
  const calls=[],defaults=[];
  const state={idle:{media:{url:'normal.webm'}},actions:[{id:'working',media:{url:'work.webm'}},{id:'focus',media:{url:'cheer.webm'}},{id:'success',media:{url:'success.webm'}}],pomodoroActions:['start','study','remind','doze','peek','finish'].map(id=>({id:'pomodoro-'+id,media:{url:id+'.webm'}})),task:null};
  let busy=false;const companion=createCompanion({getState:()=>state,setDefault:(url,opts)=>defaults.push({url,...opts}),play:id=>calls.push(id),isBusy:()=>busy,random:()=>0});
  const sync=(status,elapsedMs=0,sessionId='one',phase='focus')=>companion.sync({status,elapsedMs,sessionId,phase});
  return{companion,state,calls,defaults,sync,setBusy:value=>busy=value};
}
test('focus start and completion transition once, with a stable study default and no opening replay on renderer reload',()=>{
  const f=companionFixture();f.sync('idle',0,null);f.sync('running');assert.equal(f.calls[0],'pomodoro-start');assert.equal(f.defaults.at(-1).url,'study.webm');assert.equal(f.defaults.at(-1).defer,true);
  f.sync('paused',1000);f.sync('running',1000);assert.equal(f.calls.length,1);
  f.sync('completed',25000);f.sync('completed',25000);assert.equal(f.calls.at(-1),'pomodoro-finish');assert.equal(f.calls.length,2);assert.equal(f.defaults.at(-1).url,'normal.webm');
  const restored=companionFixture();restored.sync('running',500000);assert.deepEqual(restored.calls,[]);assert.equal(restored.defaults.at(-1).url,'study.webm');
});
test('occasional study gestures never interrupt dragging or a real task and avoid consecutive repeats',()=>{
  const f=companionFixture();f.sync('idle',0,null);f.sync('running');f.sync('running',150000);assert.equal(f.calls.at(-1),'pomodoro-remind');
  f.sync('running',300000);assert.equal(f.calls.at(-1),'pomodoro-doze');
  const count=f.calls.length;f.setBusy(true);f.state.task={status:'running'};f.sync('running',450000);assert.equal(f.calls.length,count);assert.equal(f.defaults.at(-1).url,'normal.webm');
  f.setBusy(false);f.state.task=null;f.sync('running',480000);assert.equal(f.calls.at(-1),'pomodoro-remind');
});
test('unmade study clips use existing work media without claiming the video pack is installed',()=>{
  const f=companionFixture();f.state.pomodoroActions=[];f.sync('idle',0,null);f.sync('running');assert.equal(f.calls[0],'focus');assert.equal(f.defaults.at(-1).url,'work.webm');
  f.sync('running',200000);assert.equal(f.calls.length,1);f.sync('idle',0,null);assert.equal(f.calls.at(-1),'idle');
});

test('a partially installed pack can repeat its sole reminder at spaced intervals',()=>{
  const f=companionFixture();f.state.pomodoroActions=f.state.pomodoroActions.filter(a=>!['pomodoro-doze','pomodoro-peek'].includes(a.id));
  f.sync('idle',0,null);f.sync('running');f.sync('running',150000);f.sync('running',300000);
  assert.equal(f.calls.filter(id=>id==='pomodoro-remind').length,2);
});
