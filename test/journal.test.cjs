'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {JournalStore,createCalendar,decodeCardImage,CARDS}=require('../main/journal.cjs'),{createPomodoro}=require('../main/pomodoro.cjs');
function fixture(t,start='2026-10-26T00:00:00+08:00'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhixi-journal-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let now=Date.parse(start);
 const file=path.join(root,'journal.json'),journal=new JournalStore(file,{now:()=>now,timeZone:'Asia/Shanghai'}),timer=createPomodoro({now:()=>now,onChange:(value,meta)=>journal.observe(value,meta)});
 journal.observe(timer.snapshot(),{initial:true,persist:true});
 return{journal,timer,file,root,advance:ms=>{now+=ms;timer.tick();},setTime:time=>{now=Date.parse(time);},reload:()=>new JournalStore(file,{now:()=>now,timeZone:'Asia/Shanghai'})};
}
test('a completed focus records actual minutes and exactly one tomato; pause, stop and break are accounted separately',t=>{
 const f=fixture(t);f.timer.command({type:'start',minutes:1});f.advance(20000);f.timer.command({type:'pause'});f.advance(120000);assert.equal(f.journal.snapshot().day.focusMs,20000);
 f.timer.command({type:'resume'});f.advance(40000);f.timer.tick();assert.equal(f.journal.snapshot().day.focusMs,60000);assert.equal(f.journal.snapshot().day.sessions,1);
 f.journal.observe(f.timer.snapshot(),{persist:true});assert.equal(f.journal.snapshot().day.sessions,1);
 f.timer.command({type:'break',minutes:1});f.advance(60000);assert.equal(f.journal.snapshot().day.focusMs,60000);assert.equal(f.journal.snapshot().day.sessions,1);
 f.timer.command({type:'start',minutes:25});f.advance(17000);f.timer.command({type:'stop'});assert.equal(f.journal.snapshot().day.focusMs,77000);assert.equal(f.journal.snapshot().day.sessions,1);
});
test('focus splits at local midnight and a late completion belongs to its actual deadline day',t=>{
 const f=fixture(t,'2026-10-26T23:59:30+08:00');f.timer.command({type:'start',minutes:1});f.advance(60000);
 assert.equal(f.journal.snapshot('2026-10-26').day.focusMs,30000);assert.equal(f.journal.snapshot('2026-10-27').day.focusMs,30000);assert.equal(f.journal.snapshot('2026-10-27').day.sessions,1);
 const late=fixture(t,'2026-10-26T23:58:00+08:00');late.timer.command({type:'start',minutes:1});late.advance(5*60000);assert.equal(late.journal.snapshot('2026-10-26').day.sessions,1);assert.equal(late.journal.snapshot('2026-10-27').day.focusMs,0);
});
test('visit streaks use calendar dates, never duplicate one day or fill gaps, and earned cards survive a streak reset',t=>{
 const f=fixture(t);f.journal.visit();assert.equal(f.journal.summary().companionDays,1);
 for(const date of ['2026-10-27','2026-10-28']){f.setTime(date+'T12:00:00+08:00');f.journal.visit();}
 assert.equal(f.journal.snapshot().total.streak,3);assert.ok(f.journal.snapshot().cards.find(c=>c.id==='three-days').earnedOn);
 f.setTime('2026-10-30T12:00:00+08:00');f.journal.visit();f.journal.flush();const next=f.reload();assert.equal(next.snapshot().total.streak,1);assert.equal(next.snapshot().total.bestStreak,3);assert.equal(next.snapshot().total.days,4);assert.equal(next.snapshot('2026-10-29').day.visited,false);assert.ok(next.snapshot().cards.find(c=>c.id==='three-days').earnedOn);
});
test('restarts retain records, exclude closed time and do not fabricate historical focus',t=>{
 const f=fixture(t);f.timer.command({type:'start',minutes:25});f.advance(60000);f.timer.shutdown();const saved=f.timer.snapshot();f.journal.flush();f.advance(3*86400000);
 const next=f.reload();next.observe(saved,{initial:true,persist:true});assert.equal(next.snapshot().total.focusMs,60000);assert.equal(next.snapshot().total.sessions,0);assert.equal(next.snapshot().total.days,2);assert.equal(next.snapshot().total.streak,1);
});
test('notes and moods persist as plain text, reject future dates and roll back on a write failure',t=>{
 const f=fixture(t),date=f.journal.snapshot().today;f.journal.saveDay({date,note:'<img src=x onerror=alert(1)> 做好了小任务。',mood:'happy'});const next=f.reload();assert.match(next.snapshot().day.note,/<img/);assert.equal(next.snapshot().day.mood,'happy');
 assert.throws(()=>next.saveDay({date:'2099-01-01',note:'future',mood:'calm'}),/日期/);assert.throws(()=>next.saveDay({date,note:'x'.repeat(601),mood:'happy'}),/600/);
 const before=next.snapshot().day;t.mock.method(fs,'renameSync',()=>{throw Error('disk full');});assert.throws(()=>next.saveDay({date,note:'not saved',mood:'tired'}),/保存/);assert.deepEqual(next.snapshot().day,before);
});
test('damaged journals remain untouched and read only',t=>{
 const f=fixture(t);fs.writeFileSync(f.file,'broken original');const next=f.reload();next.visit();next.observe({phase:'focus',sessionId:randomUUID(),status:'completed',durationMs:60000,remainingMs:0,elapsedMs:60000},{persist:true});assert.equal(next.readOnly,true);assert.equal(next.snapshot().total.sessions,0);assert.equal(fs.readFileSync(f.file,'utf8'),'broken original');
});
test('calendar and streak dates are independent of the host timezone and handle DST dates',()=>{
 assert.equal(createCalendar('Asia/Shanghai')(Date.parse('2026-10-25T16:01:00Z')),'2026-10-26');assert.equal(createCalendar('America/New_York')(Date.parse('2026-03-08T06:59:00Z')),'2026-03-08');
});

test('focus milestone cards unlock at actual thresholds and remain unlocked on reload',t=>{
 const f=fixture(t);f.timer.command({type:'start',minutes:60});f.advance(60*60000);f.journal.flush();const cards=f.reload().snapshot().cards;
 assert.ok(cards.find(c=>c.id==='first-focus').earnedOn);assert.ok(cards.find(c=>c.id==='one-hour').earnedOn);assert.deepEqual(cards[CARDS.findIndex(c=>c.id==='ten-focus')],{slot:CARDS.findIndex(c=>c.id==='ten-focus'),locked:true,earnedOn:null});
});

test('card faces and exports remain unavailable before the unlocked card is explicitly opened',t=>{
 const f=fixture(t);assert.throws(()=>f.journal.cardDetail('hello'),/翻开/);assert.throws(()=>f.journal.cardDetail('harvest-tomato'),/翻开/);const opened=f.journal.revealCard('hello');assert.equal(opened.opened,true);assert.equal(opened.title,'知栖的初次相遇');assert.deepEqual(f.journal.cardDetail('hello'),opened);
});
test('card exports accept bounded PNGs and reject arbitrary data or oversized dimensions',()=>{
 const header=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(header);header.write('IHDR',12);header.writeUInt32BE(1000,16);header.writeUInt32BE(650,20);assert.equal(decodeCardImage('data:image/png;base64,'+header.toString('base64')).length,24);
 assert.throws(()=>decodeCardImage('file:///private/file'));header.writeUInt32BE(9000,16);assert.throws(()=>decodeCardImage('data:image/png;base64,'+header.toString('base64')),/尺寸/);
});
