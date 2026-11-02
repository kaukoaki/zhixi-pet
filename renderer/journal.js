'use strict';
window.__qiqiErrors=[];
window.addEventListener('error',event=>window.__qiqiErrors.push(event.message));
window.addEventListener('unhandledrejection',event=>window.__qiqiErrors.push(String(event.reason?.message||event.reason)));
const $=id=>document.getElementById(id),api=window.petAPI;
let snapshot,displayedDate=null,requestedDate=null,request=0,navigating=false,saving=false,closing=false,refreshQueued=false,noticeTimer,weekSignature='';
const moodButtons=new Map();
const gardenView=window.createGardenView({api,notice});
const collection=window.qiqiCards=window.createCardCollection({api,notice});
const drafts=window.qiqiJournalDrafts=window.createJournalDrafts({save:input=>api.saveJournalDraft(input),onChange:date=>{if(date===displayedDate)renderEntry();}});
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function notice(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,3500);}
function minutes(ms){return ms>0&&ms<60000?'不足 1':String(Math.floor(ms/60000));}
function metric(id,value,unit){const suffix=document.createElement('span');suffix.textContent=unit;$(id).replaceChildren(document.createTextNode(value),suffix);}
function editable(){return Boolean(snapshot&&snapshot.date===displayedDate&&snapshot.day.visited&&!snapshot.readOnly&&!navigating&&!closing);}
function renderEntry(){
 const entry=drafts.get(displayedDate),canEdit=editable();
 $('note').disabled=!canEdit;$('save').disabled=!canEdit||saving;
 for(const button of moodButtons.values())button.disabled=!canEdit;
 for(const id of ['previous','today','date'])$(id).disabled=!snapshot||closing;
 $('next').disabled=!snapshot||closing||(requestedDate||displayedDate)>=snapshot.today;
 if(validDate(requestedDate||displayedDate))$('date').value=requestedDate||displayedDate;
 if(!entry){$('save-state').textContent=navigating?'正在读取':'尚未载入';return;}
 if($('note').value!==entry.note)$('note').value=entry.note;
 $('note-count').textContent=`${entry.note.length} / 600`;
 $('save-state').textContent=navigating?'正在读取':closing||entry.saving?'正在保存草稿':entry.error?'未保存':entry.dirty?(entry.revision>entry.acknowledgedRevision?'草稿未保存':'草稿已保存'):entry.note?'已保存':'未记录';
 for(const [id,button]of moodButtons){const selected=entry.mood===id;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));}
 const mood=snapshot?.moods.find(mood=>mood.id===entry.mood);if(mood)$('hero-face').textContent=mood.face;
}
function renderMoods(moods){
 const keep=new Set();
 for(const mood of moods){
  keep.add(mood.id);let button=moodButtons.get(mood.id);
  if(!button){button=document.createElement('button');button.type='button';button.className='mood';button.addEventListener('click',()=>{if(!editable())return;try{drafts.edit(displayedDate,{mood:mood.id});}catch(error){notice(error.message);}});moodButtons.set(mood.id,button);}
  button.textContent=mood.face;button.title=mood.label;button.setAttribute('aria-label',mood.label);if(button.parentNode!==$('moods'))$('moods').append(button);
 }
 for(const [id,button]of moodButtons)if(!keep.has(id)){button.remove();moodButtons.delete(id);}
}
function render(data){
 snapshot=data;displayedDate=data.date;requestedDate=data.date;$('date').max=data.today;
 gardenView.render(data.garden);
 $('warning').hidden=!data.warning;$('warning').textContent=data.warning||'';
 $('companion-days').textContent=`陪伴第 ${data.total.days} 天`;
 metric('focus',minutes(data.day.focusMs),'分钟');metric('sessions',String(data.day.sessions),'颗');metric('streak',String(data.total.streak),'天');
 $('hero-quote').textContent=data.day.sessions?'认真努力过的你，今天也很棒。':'一小步，也值得被记住。';
 $('lifetime').textContent=`累计专注 ${minutes(data.total.focusMs)} 分钟 · ${data.total.sessions} 颗番茄 · 最长连续 ${data.total.bestStreak} 天`;
 const weekMs=data.week.reduce((sum,day)=>sum+day.focusMs,0);$('week-total').textContent=weekMs?`这七天 ${minutes(weekMs)} 分钟`:'慢慢来，也很好';
 const nextWeek=JSON.stringify([data.week,data.date]);
 if(weekSignature!==nextWeek){weekSignature=nextWeek;$('week').replaceChildren(...data.week.map(day=>{
  const button=document.createElement('button');button.type='button';button.className='day'+(day.visited?' visited':'')+(day.date===data.date?' selected':'');button.style.setProperty('--fill',`${Math.min(90,day.focusMs?15+day.focusMs/(60*60000)*60:0)}%`);
  button.title=`${day.date} · 专注 ${minutes(day.focusMs)} 分钟 · ${day.sessions} 颗番茄`;button.setAttribute('aria-label',button.title);
  for(const text of [day.visited?'✿':'·',day.date.slice(5)]){const span=document.createElement('span');span.textContent=text;button.append(span);}button.addEventListener('click',()=>void load(day.date));return button;
 }));}
 $('note').placeholder=data.day.visited?'今天完成了什么？也可以只记一件开心的小事。':'这一天还没有陪伴记录。';
 renderMoods(data.moods);drafts.accept(data);renderEntry();
 $('card-count').textContent=`${data.cards.filter(card=>card.earnedOn).length} / ${data.cards.length}`;collection.render(data.cards);
}
async function load(date=requestedDate||displayedDate,{background=false}={}){
 if(background&&navigating){refreshQueued=true;return;}
 const target=validDate(date)?date:snapshot?.today;
 if(date&&!validDate(date)){if(snapshot)$('date').value=displayedDate;return;}
 if(target&&snapshot&&target>snapshot.today)return;
 const ticket=++request;
 if(!background){requestedDate=target||null;navigating=!snapshot||target!==displayedDate;}
 renderEntry();
 try{
  const data=await api.getJournal(target);if(ticket!==request)return;
  if(!validDate(data?.date))throw Error('invalid journal date');
  navigating=false;render(data);
 }catch{
  if(ticket!==request)return;navigating=false;requestedDate=displayedDate;renderEntry();notice('手账暂时打不开，请稍后再试。');
 }finally{
  if(ticket===request&&refreshQueued&&!navigating){refreshQueued=false;void load(displayedDate,{background:true});}
 }
}
function refresh(){return load(displayedDate,{background:true});}
function moveDate(amount){
 const date=requestedDate||displayedDate;if(!snapshot||!validDate(date)||closing)return;
 const day=new Date(date+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+amount);void load(day.toISOString().slice(0,10));
}
async function closeWindow(){
 if(closing)return;closing=true;collection.close();renderEntry();
 const saved=await drafts.flushAll();
 if(saved)window.close();else{closing=false;renderEntry();notice('草稿尚未保存，请稍后再收起。');}
}
$('close').addEventListener('click',()=>void closeWindow());
$('previous').addEventListener('click',()=>moveDate(-1));$('next').addEventListener('click',()=>moveDate(1));$('today').addEventListener('click',()=>{if(snapshot&&!closing)void load(snapshot.today);});$('date').addEventListener('change',event=>void load(event.target.value));
for(const tab of ['garden','days','cards','shop'])$('tab-'+tab).addEventListener('click',()=>{
 collection.close();
 for(const name of ['garden','days','cards','shop']){$(name+'-page').hidden=name!==tab;$('tab-'+name).classList.toggle('selected',name===tab);$('tab-'+name).setAttribute('aria-selected',String(name===tab));}
 window.dispatchEvent(new Event('garden-tab-changed'));
});
$('note').addEventListener('input',event=>{
 if(!editable()){renderEntry();return;}
 try{drafts.edit(displayedDate,{note:event.target.value});}catch(error){notice(error.message);}
});
$('save').addEventListener('click',async()=>{
 if(saving||!editable())return;const date=displayedDate,entry=drafts.get(date);if(!entry)return;
 let capture={note:entry.note,mood:entry.mood,revision:entry.revision};saving=true;renderEntry();
 try{
  await drafts.flush(date);const current=drafts.get(date);if(current&&current.note===capture.note&&current.mood===capture.mood)capture.revision=current.revision;
  await api.saveJournalDay({date,note:capture.note,mood:capture.mood,...(capture.revision>0?{draftRevision:capture.revision}:{})});
  drafts.committed(date,capture);notice('今天的小事，知栖收好啦 ✿');await refresh();
 }catch(error){notice(String(error.message||error).replace(/^Error invoking remote method '[^']+': Error: /,''));}
 finally{saving=false;renderEntry();}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('card-dialog').hidden)collection.close();else void closeWindow();}});
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden){if(closing){closing=false;renderEntry();}return;}
 collection.close();if(closing)return;
 void drafts.flushAll().then(saved=>{if(!saved){void api.openJournal?.();notice('草稿尚未保存，请稍后再收起。');}});
});
api.onJournalChanged(()=>void refresh());renderEntry();void load();
window.addEventListener('garden-updated',()=>void refresh());
window.addEventListener('journal-card-revealed',()=>void refresh());
