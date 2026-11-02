'use strict';
const fs=require('node:fs'),path=require('node:path');
const {UUID}=require('./conversation-store.cjs');
const DAY=86400000;
const MOODS=Object.freeze([
  {id:'calm',face:'(˶ᵔ ᵕ ᵔ˶)',label:'平静'},
  {id:'happy',face:'٩(ˊᗜˋ*)و',label:'开心'},
  {id:'focused',face:'( •̀ ω •́ )✧',label:'认真'},
  {id:'tired',face:'(｡•́︿•̀｡)',label:'有点累'},
  {id:'proud',face:'(๑˃̵ᴗ˂̵)و',label:'超棒'}
]);
const CARDS=Object.freeze([
  {id:'hello',icon:'✿',title:'知栖的初次相遇',text:'知栖把今天折成一朵小花。从此，你的日常里多了一位小小伙伴。',kind:'days',goal:1,theme:'lilac',motif:'blossom'},
  {id:'first-focus',icon:'✧',title:'知栖的第一颗星',text:'知栖悄悄记住了你第一次认真完成的专注，把它藏进一颗小星星。',kind:'sessions',goal:1,theme:'gold',motif:'star'},
  {id:'three-days',icon:'🌱',title:'知栖的三日新芽',text:'连续三天见到你，知栖心里的小芽，也跟着长高了一点。',kind:'streak',goal:3,theme:'mint',motif:'leaf'},
  {id:'one-hour',icon:'⌛',title:'知栖的一小时星光',text:'一小时的认真被知栖收进掌心，亮成了温柔的小小星光。',kind:'minutes',goal:60,theme:'gold',motif:'star'},
  {id:'seven-days',icon:'🌙',title:'知栖的一周约定',text:'知栖把七个一起度过的日子，串成了窗边的一弯月亮。',kind:'streak',goal:7,theme:'night',motif:'moon'},
  {id:'ten-focus',icon:'🎀',title:'知栖的十次认真',text:'你完成了十轮认真，知栖也准备了十句藏在蝴蝶结里的夸奖。',kind:'sessions',goal:10,theme:'rose',motif:'ribbon'},
  {id:'thirty-days',icon:'💌',title:'知栖的三十日来信',text:'知栖写了一封很短的信：谢谢你，让这三十天都值得记住。',kind:'days',goal:30,theme:'berry',motif:'letter'},
  {id:'harvest-tomato',icon:'🍅',title:'知栖的番茄来信',text:'知栖捧起第一份红番茄，笑着说：这份甜，是我们一起等来的。',kind:'tomato',goal:1,theme:'berry',motif:'tomato'},
  {id:'harvest-strawberry',icon:'🍓',title:'知栖的莓莓心事',text:'知栖把第一份草莓轻轻放进篮子，也把一点点开心藏进了红红脸颊。',kind:'strawberry',goal:1,theme:'rose',motif:'strawberry'},
  {id:'harvest-watermelon',icon:'🍉',title:'知栖的西瓜夏日',text:'抱住第一颗小西瓜的知栖，像抱住了一个只属于你们的清甜夏天。',kind:'watermelon',goal:1,theme:'melon',motif:'watermelon'},
  {id:'harvest-bouquet',icon:'🧺',title:'知栖的三色果篮',text:'番茄、草莓和西瓜都收获过啦。知栖把三种甜，装成一篮共同的回忆。',kind:'harvestTypes',goal:3,theme:'mint',motif:'bouquet'},
  {id:'first-sale',icon:'☀',title:'知栖的小小集市',text:'第一次把收获交给小集市，知栖认真接住金币，也记住了你的成就感。',kind:'sales',goal:1,theme:'gold',motif:'sun'},
  {id:'first-ornament',icon:'✨',title:'知栖的闪光礼物',text:'收到第一件小挂件的知栖，忍不住晃了晃：以后每个动作，都带着你的心意。',kind:'ornaments',goal:1,theme:'lilac',motif:'star'},
  {id:'water-ten',icon:'💧',title:'知栖的十日花语',text:'十个浇水的日子，被知栖收成十滴晨露。你照料的期待，正在慢慢长大。',kind:'waterDays',goal:10,theme:'mint',motif:'leaf'},
  {id:'water-thirty',icon:'🌿',title:'知栖的晨露收藏',text:'知栖数过三十个照料花园的清晨，每一滴水里，都有你温柔的耐心。',kind:'waterDays',goal:30,theme:'melon',motif:'leaf'},
  {id:'harvest-ten',icon:'🧺',title:'知栖的丰收口袋',text:'十份收获装满知栖的小口袋，也装满了她想和你分享的开心。',kind:'harvests',goal:10,theme:'gold',motif:'bouquet'},
  {id:'harvest-thirty',icon:'🌸',title:'知栖的满园甜梦',text:'三十次收获之后，知栖在花园里做了一个很甜的梦，梦里你也在。',kind:'harvests',goal:30,theme:'berry',motif:'blossom'},
  {id:'first-note',icon:'✉',title:'知栖的悄悄话',text:'知栖把你写下的第一件小事，夹进了最柔软的那一页。',kind:'notes',goal:1,theme:'rose',motif:'letter'},
  {id:'five-hours',icon:'🏮',title:'知栖的五小时灯火',text:'五小时的专注慢慢亮起来，知栖就坐在那盏灯旁，安静地陪着你。',kind:'minutes',goal:300,theme:'night',motif:'lantern'},
  {id:'fifty-focus',icon:'✦',title:'知栖的五十颗星',text:'知栖数到第五十颗专注的小星星时，抬头看你，笑得格外认真。',kind:'sessions',goal:50,theme:'lilac',motif:'star'},
  {id:'fourteen-days',icon:'🌙',title:'知栖的两周诗笺',text:'知栖把连续十四天的陪伴写成一首短诗，最后一行是：明天也一起。',kind:'streak',goal:14,theme:'night',motif:'letter'},
  {id:'hundred-days',icon:'☀',title:'知栖的百日晴光',text:'一百个相伴的日子里，知栖最喜欢的，仍然是下一次见到你的那一刻。',kind:'days',goal:100,theme:'gold',motif:'sun'}
]);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const ordinal=date=>Math.round(Date.parse(date+'T00:00:00Z')/DAY);
const shiftDate=(date,amount)=>new Date((ordinal(date)+amount)*DAY).toISOString().slice(0,10);
const freshDay=()=>({visited:false,focusMs:0,sessions:[],note:'',mood:'calm'});
function createCalendar(timeZone){
 const format=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
 return at=>{const p=Object.fromEntries(format.formatToParts(new Date(at)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;};
}
class JournalStore{
 constructor(file,{now=Date.now,timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone}={}){
  this.file=file;this.now=now;this.warning=null;this.readOnly=false;this.dirty=false;this.lastFlush=0;
  this.data={version:1,timeZone,days:{},cards:{},drafts:{},draftVersions:{},cursor:null};
  if(fs.existsSync(file))try{
   if(fs.statSync(file).size>16*1024*1024)throw Error('oversized');
   const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.version!==1||!saved.days||typeof saved.days!=='object')throw Error('unsupported');
   createCalendar(saved.timeZone);this.data.timeZone=saved.timeZone;
   const seen=new Set();
   for(const [date,day]of Object.entries(saved.days)){
    if(!validDate(date)||!day||!Number.isFinite(day.focusMs)||day.focusMs<0||day.focusMs>DAY||!Array.isArray(day.sessions))throw Error('invalid day');
    const sessions=day.sessions.filter(id=>UUID.test(id)&&!seen.has(id));for(const id of sessions)seen.add(id);
    this.data.days[date]={visited:day.visited===true,focusMs:day.focusMs,sessions,note:typeof day.note==='string'?day.note.slice(0,600):'',mood:MOODS.some(m=>m.id===day.mood)?day.mood:'calm'};
   }
   for(const card of CARDS){const savedCard=saved.cards?.[card.id];if(validDate(savedCard?.earnedOn))this.data.cards[card.id]={earnedOn:savedCard.earnedOn,opened:savedCard.opened!==false};}
   for(const [date,revision]of Object.entries(saved.draftVersions||{}))if(validDate(date)&&this.data.days[date]?.visited&&Number.isSafeInteger(revision)&&revision>0)this.data.draftVersions[date]=revision;
   for(const [date,draft]of Object.entries(saved.drafts||{})){
    if(!validDate(date)||!this.data.days[date]?.visited||typeof draft?.note!=='string'||draft.note.length>600||!MOODS.some(mood=>mood.id===draft.mood)||!Number.isSafeInteger(draft.revision)||draft.revision<1)throw Error('invalid draft');
    this.data.drafts[date]={note:draft.note,mood:draft.mood,revision:draft.revision};this.data.draftVersions[date]=Math.max(this.data.draftVersions[date]||0,draft.revision);
   }
   // A restored timer is rebased on first observe; time while closed is never credited.
  }catch{this.warning='手账暂时无法读取，旧文件已保留。';this.readOnly=true;this.data.days={};this.data.cards={};this.data.drafts={};this.data.draftVersions={};}
  this.dayKey=createCalendar(this.data.timeZone);
 }
 _day(date){return this.data.days[date]||(this.data.days[date]=freshDay());}
 _totals(today=this.dayKey(this.now())){
  const dates=Object.keys(this.data.days).filter(date=>this.data.days[date].visited).sort();let best=0,run=0,last=null;
  for(const date of dates){run=last&&ordinal(date)-ordinal(last)===1?run+1:1;best=Math.max(best,run);last=date;}
  let streak=0;for(let date=today;this.data.days[date]?.visited;date=shiftDate(date,-1))streak++;
  const days=Object.values(this.data.days),focusMs=days.reduce((sum,day)=>sum+day.focusMs,0),sessions=days.reduce((sum,day)=>sum+day.sessions.length,0);
  return{days:dates.length,streak,bestStreak:best,focusMs,sessions,minutes:Math.floor(focusMs/60000),notes:days.filter(day=>day.note.trim()).length};
 }
 _unlock(date){
  const total=this._totals(date),values={...total,streak:total.bestStreak,...this.gardenValues};let changed=false;
  for(const card of CARDS)if(!this.data.cards[card.id]&&values[card.kind]>=card.goal){this.data.cards[card.id]={earnedOn:date,opened:false};this.dirty=true;changed=true;}
  return changed;
 }
 syncGarden(memories){
  if(this.readOnly)return false;
  this.gardenValues={};
  for(const key of ['tomato','strawberry','watermelon','harvestTypes','harvests','waterDays','sales','ornaments']){const value=memories?.values?.[key];if(Number.isSafeInteger(value)&&value>=0)this.gardenValues[key]=value;}
  const changed=this._unlock(this.dayKey(this.now()));if(changed)this.flush();return changed;
 }
 visit(at=this.now()){
  if(this.readOnly)return;
  const date=this.dayKey(at),day=this._day(date);if(!day.visited){day.visited=true;this.dirty=true;this._unlock(date);}
 }
 _addFocus(from,to){
  while(from<to){
   const date=this.dayKey(from);let boundary=to;
   if(this.dayKey(to-1)!==date){let lo=from+1,hi=to;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(this.dayKey(mid)===date)lo=mid+1;else hi=mid;}boundary=lo;}
   const day=this._day(date);day.visited=true;day.focusMs=Math.min(DAY,day.focusMs+boundary-from);from=boundary;this.dirty=true;
  }
 }
 observe(timer,{initial=false,persist=false}={}){
  if(this.readOnly)return;
  const at=this.now();this.visit(at);
  const valid=timer?.phase==='focus'&&UUID.test(timer.sessionId)&&['running','paused','completed'].includes(timer.status)&&Number.isFinite(timer.elapsedMs)&&timer.elapsedMs>=0&&timer.elapsedMs<=180*60000;
  if(valid){
   const previous=this.data.cursor,elapsed=timer.elapsedMs;
   let completedAt=at;
   if(!initial&&previous?.sessionId===timer.sessionId&&previous.status==='running'){
    const delta=Math.max(0,Math.min(elapsed-previous.elapsedMs,at-previous.at));
    if(delta>0){this._addFocus(previous.at,previous.at+delta);completedAt=previous.at+delta;}
   }
   this.data.cursor={sessionId:timer.sessionId,elapsedMs:elapsed,at,status:timer.status};
   if(!initial&&timer.status==='completed'&&timer.remainingMs===0&&Number.isFinite(timer.durationMs)&&timer.durationMs>=60000&&elapsed>=timer.durationMs&&!Object.values(this.data.days).some(day=>day.sessions.includes(timer.sessionId))){
    this._day(this.dayKey(completedAt)).sessions.push(timer.sessionId);this.dirty=true;
   }
  }else this.data.cursor=null;
  this._unlock(this.dayKey(at));
  if(persist||at-this.lastFlush>=15000)this.flush();
 }
 flush(){
  if(this.readOnly||!this.dirty)return !this.readOnly;
  try{
   fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data,null,2),'utf8');fs.renameSync(this.file+'.tmp',this.file);
   this.dirty=false;this.lastFlush=this.now();this.warning=null;return true;
  }catch{this.warning='手账还没有保存成功，请检查本地磁盘。';return false;}
 }
 saveDay(input){
  if(this.readOnly)throw Error(this.warning);
  if(!input||!validDate(input.date)||input.date>this.dayKey(this.now())||!this.data.days[input.date]?.visited)throw Error('请选择已经陪伴过的日期。');
  if(typeof input.note!=='string'||input.note.length>600||!MOODS.some(m=>m.id===input.mood))throw Error('小记最多 600 字，请选择一个心情。');
  if(input.draftRevision!==undefined&&(!Number.isSafeInteger(input.draftRevision)||input.draftRevision<1))throw Error('草稿版本无效。');
  const before=structuredClone(this.data),wasDirty=this.dirty;
  Object.assign(this._day(input.date),{note:input.note.trim(),mood:input.mood});this.dirty=true;
  const draft=this.data.drafts[input.date];
  if(input.draftRevision)this.data.draftVersions[input.date]=Math.max(this.data.draftVersions[input.date]||0,input.draftRevision);
  if(draft&&draft.note.trim()===input.note.trim()&&draft.mood===input.mood&&(input.draftRevision===undefined||input.draftRevision===draft.revision))delete this.data.drafts[input.date];
  this._unlock(this.dayKey(this.now()));
  if(!this.flush()){this.data=before;this.dirty=wasDirty;throw Error(this.warning);}
  return this.snapshot(input.date);
 }
 saveDraft(input){
  if(this.readOnly)throw Error(this.warning);
  if(!input||!validDate(input.date)||input.date>this.dayKey(this.now())||!this.data.days[input.date]?.visited)throw Error('请选择已经陪伴过的日期。');
  if(typeof input.note!=='string'||input.note.length>600||!MOODS.some(mood=>mood.id===input.mood)||!Number.isSafeInteger(input.revision)||input.revision<1)throw Error('草稿格式无效。');
  const version=this.data.draftVersions[input.date]||0,current=this.data.drafts[input.date];
  if(input.revision<=version){const same=current?.revision===input.revision&&current.note===input.note&&current.mood===input.mood;return same?{saved:true,revision:version}:{saved:false,stale:true,revision:version};}
  const before=structuredClone(this.data),wasDirty=this.dirty;
  this.data.drafts[input.date]={note:input.note,mood:input.mood,revision:input.revision};this.data.draftVersions[input.date]=input.revision;this.dirty=true;
  if(!this.flush()){this.data=before;this.dirty=wasDirty;throw Error(this.warning);}
  return{saved:true,revision:input.revision};
 }
 summary(){const today=this.dayKey(this.now()),total=this._totals(today),day=this.data.days[today]||freshDay();return{today,streak:total.streak,companionDays:total.days,focusMs:day.focusMs,sessions:day.sessions.length};}
 _cardFace(card,slot){const saved=this.data.cards[card.id];return{id:card.id,slot,locked:false,opened:true,earnedOn:saved.earnedOn,title:card.title,text:card.text,icon:card.icon,theme:card.theme,motif:card.motif};}
 cardDetail(id){
  const slot=CARDS.findIndex(card=>card.id===id),card=CARDS[slot],saved=this.data.cards[id];
  if(!card||!saved?.opened)throw Error('这张纪念卡还没有翻开。');return this._cardFace(card,slot);
 }
 revealCard(id){
  if(this.readOnly)throw Error(this.warning);
  if(typeof id!=='string'||!CARDS.some(card=>card.id===id)||!this.data.cards[id])throw Error('这张纪念卡还没有解锁。');
  if(!this.data.cards[id].opened){
   const before=structuredClone(this.data),wasDirty=this.dirty;this.data.cards[id].opened=true;this.dirty=true;
   if(!this.flush()){this.data=before;this.dirty=wasDirty;throw Error(this.warning);}
  }
  return this.cardDetail(id);
 }
 snapshot(date=this.dayKey(this.now())){
  const today=this.dayKey(this.now());if(!validDate(date)||date>today)date=today;
  const day=this.data.days[date]||freshDay(),total=this._totals(today);
  return{version:1,today,date,timeZone:this.data.timeZone,warning:this.warning,readOnly:this.readOnly,day:{...structuredClone(day),sessions:day.sessions.length},draft:structuredClone(this.data.drafts[date]||null),draftRevision:this.data.draftVersions[date]||0,total,moods:MOODS,
   week:Array.from({length:7},(_,i)=>{const key=shiftDate(date,i-6),record=this.data.days[key]||freshDay();return{date:key,visited:record.visited,focusMs:record.focusMs,sessions:record.sessions.length};}),
   cards:CARDS.map((card,slot)=>{const saved=this.data.cards[card.id];if(!saved)return{slot,locked:true,earnedOn:null};return saved.opened?this._cardFace(card,slot):{slot,id:card.id,locked:false,opened:false,earnedOn:saved.earnedOn};})};
 }
}
function decodeCardImage(data){
 if(typeof data!=='string'||data.length>3*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data))throw Error('纪念卡图片格式无效。');
 const bytes=Buffer.from(data.slice(22),'base64');
 if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)<1||bytes.readUInt32BE(20)<1||bytes.readUInt32BE(16)>2048||bytes.readUInt32BE(20)>2048)throw Error('纪念卡图片无效或尺寸过大。');
 return bytes;
}
module.exports={JournalStore,MOODS,CARDS,validDate,shiftDate,createCalendar,decodeCardImage};
