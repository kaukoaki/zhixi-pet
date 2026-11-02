'use strict';
window.createCardCollection=function createCardCollection({api,notice}){
 const $=id=>document.getElementById(id),entries=new Map(),details=new Map();
 const palettes={
  lilac:{from:'#fffaf5',to:'#eee3f6',ink:'#80618f',accent:'#b093c3',line:'#cdb6dc'},
  mint:{from:'#fcfff5',to:'#e2f0e7',ink:'#658571',accent:'#89ad99',line:'#b9d3bf'},
  berry:{from:'#fffaf6',to:'#f8dfe8',ink:'#a66e83',accent:'#cb94aa',line:'#e2b9ca'},
  melon:{from:'#fffdf0',to:'#e6f2d9',ink:'#758a5c',accent:'#a2b77f',line:'#c7d6ad'},
  gold:{from:'#fffdf5',to:'#f6ead0',ink:'#9d814c',accent:'#c9ac72',line:'#dfcea6'},
  night:{from:'#fffdf9',to:'#e1e3f4',ink:'#727997',accent:'#a3a9cb',line:'#c4c8e2'},
  rose:{from:'#fff9f7',to:'#f5e2ed',ink:'#9b7694',accent:'#c8a0bd',line:'#e0bfd5'}
 };
 const motifMarks={blossom:'✿',star:'✧',leaf:'❧',moon:'☽',letter:'♡',ribbon:'୨୧',tomato:'🍅',strawberry:'🍓',watermelon:'🍉',bouquet:'✿',sun:'☼',lantern:'✦'};
 let selected=null,exporting=false,dialogIntent=0;
 const element=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 const complete=card=>Boolean(card&&card.opened===true&&!card.locked&&card.id&&card.earnedOn&&typeof card.title==='string'&&typeof card.text==='string');
 const theme=card=>Object.hasOwn(palettes,card.theme)?card.theme:'lilac';
 const imageSource=()=>$('portrait')?.src||new URL('../assets/character/qiqi-chibi-v5-knot-sprout.png',document.baseURI).href;
 const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
 function tint(target,card){
  const name=theme(card),colors=palettes[name];target.dataset.cardTheme=name;
  for(const [key,value]of Object.entries(colors))target.style.setProperty('--card-'+key,value);
 }
 function makeBack(){
  const face=element('span',undefined,'card-side card-back');
  face.append(element('span','ZHIXI','back-brand'),element('span','✿','back-rosette'),element('span','知栖','back-signature'),element('span','尚未相遇','back-caption'));
  return face;
 }
 function fillFront(entry,card){
  tint(entry.button,card);entry.front.replaceChildren();
  const mark=element('span',motifMarks[card.motif]||'✧','front-motif');mark.setAttribute('aria-hidden','true');
  const icon=element('span',card.icon||'✿','front-icon');icon.setAttribute('aria-hidden','true');
  const image=element('img',undefined,'front-portrait');image.src=imageSource();image.alt='知栖';image.draggable=false;
  entry.front.append(mark,icon,element('span','知栖的秘密花笺','front-brand'),image,element('strong',card.title,'front-title'),element('small',card.earnedOn,'front-date'));
 }
 function apply(entry,card){
  const fingerprint=JSON.stringify(card);if(entry.fingerprint===fingerprint)return;
  entry.fingerprint=fingerprint;entry.card=card;
  const opened=complete(card),locked=card.locked===true||!card.earnedOn;
  entry.button.className='keepsake '+(locked?'locked sealed':opened?'is-opened':'is-unopened sealed');
  entry.button.disabled=locked;entry.button.removeAttribute('aria-busy');
  entry.button.setAttribute('aria-label',locked?'尚未解锁的知栖纪念卡':opened?`${card.title}，${card.earnedOn}`:'知栖送来一张新纪念卡，点击翻开');
  entry.button.title='';
  entry.back.querySelector('.back-caption').textContent=locked?'尚未相遇':'点击翻开';
  if(opened){details.set(card.id,card);entry.detail=card;fillFront(entry,card);}
  else{
   if(entry.detail)details.delete(entry.detail.id);entry.detail=null;entry.front.replaceChildren();
   delete entry.button.dataset.cardTheme;
   for(const key of ['from','to','ink','accent','line'])entry.button.style.removeProperty('--card-'+key);
  }
 }
 function makeEntry(slot){
  const button=element('button',undefined,'keepsake sealed');button.type='button';button.dataset.cardSlot=String(slot);
  const turn=element('span',undefined,'card-turn'),back=makeBack(),front=element('span',undefined,'card-side card-front');turn.append(back,front);button.append(turn);
  const entry={slot,button,turn,back,front,card:null,detail:null,fingerprint:'',revealing:false,pending:null};
  button.addEventListener('click',()=>{
   if(entry.revealing||entry.card?.locked||!entry.card?.earnedOn)return;
   if(complete(entry.card)){dialogIntent++;show(entry.card);}else void reveal(entry);
  });return entry;
 }
 function show(card){
  if(!complete(card)||!details.has(card.id))return;
  selected=details.get(card.id);tint($('card-dialog'),selected);
  $('card-icon').textContent=selected.icon||'✿';$('card-title').textContent=selected.title;$('card-text').textContent=selected.text;$('card-date').textContent=selected.earnedOn;
  const picture=$('card-dialog').querySelector('.postcard img');if(picture){picture.src=imageSource();picture.alt='知栖';}
  $('card-dialog').hidden=false;$('close-card').focus();
 }
 async function reveal(entry){
  const card=entry.card,intent=++dialogIntent;entry.revealing=true;entry.button.disabled=true;entry.button.setAttribute('aria-busy','true');entry.back.querySelector('.back-caption').textContent='正在翻开';
  try{
   const result=await api.revealJournalCard(card.id);
   if(!complete(result)||result.id!==card.id||result.slot!==entry.slot)throw Error('invalid reveal');
   details.set(result.id,result);entry.detail=result;entry.card=result;entry.fingerprint=JSON.stringify(result);fillFront(entry,result);
   // Keep the back visible for a painted frame before starting the turn. An
   // overlapping journal refresh must not replace this node or skip the flip.
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   entry.button.className='keepsake is-opened';entry.button.setAttribute('aria-label',`${result.title}，${result.earnedOn}`);
   window.dispatchEvent(new CustomEvent('journal-card-revealed',{detail:{id:result.id}}));
   await new Promise(resolve=>setTimeout(resolve,reduceMotion()?0:560));
   const page=$('cards-page');
   if(intent===dialogIntent&&entry.button.isConnected&&!document.hidden&&(!page||!page.hidden))show(result);
  }catch{
   notice('这份礼物暂时没能打开，请再试一次。');
  }finally{
   entry.revealing=false;entry.button.removeAttribute('aria-busy');entry.button.disabled=entry.card?.locked===true||!entry.card?.earnedOn;
   if(entry.pending){const pending=entry.pending;entry.pending=null;if(complete(pending)||!entry.detail)apply(entry,pending);}
   if(!complete(entry.card))entry.back.querySelector('.back-caption').textContent=entry.card?.locked?'尚未相遇':'点击翻开';
  }
 }
 function render(cards){
  const desired=[],keep=new Set();
  for(const card of Array.isArray(cards)?cards:[]){
   if(!Number.isInteger(card.slot)||card.slot<0)continue;
   let entry=entries.get(card.slot);if(!entry){entry=makeEntry(card.slot);entries.set(card.slot,entry);}
   keep.add(card.slot);desired.push(entry.button);
   if(entry.revealing)entry.pending=card;else apply(entry,card);
  }
  for(const [slot,entry]of entries)if(!keep.has(slot)){if(entry.detail)details.delete(entry.detail.id);entry.button.remove();entries.delete(slot);}
  const host=$('cards');
  // Reordering in place preserves a focused tile and in-flight CSS transforms.
  for(let index=0;index<desired.length;index++)if(host.children[index]!==desired[index])host.insertBefore(desired[index],host.children[index]||null);
 }
 function close(){dialogIntent++;selected=null;$('card-dialog').hidden=true;}
 function wrap(ctx,text,x,y,width,lineHeight,maxLines=8){
  const lines=[];let line='';
  for(const char of String(text)){
   if(char==='\n'){lines.push(line);line='';continue;}
   if(line&&ctx.measureText(line+char).width>width){lines.push(line);line=char;}else line+=char;
  }
  if(line)lines.push(line);
  for(const value of lines.slice(0,maxLines)){ctx.fillText(value,x,y);y+=lineHeight;}return y;
 }
 async function createCardImage(card){
  if(!complete(card)||!details.has(card.id))throw Error('这张纪念卡还没有翻开。');
  const value=details.get(card.id),colors=palettes[theme(value)],image=$('portrait');
  if(!image?.complete)await image?.decode();
  if(!image?.naturalWidth)throw Error('知栖的图片暂时没有加载好。');
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=650;const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,1000,650);gradient.addColorStop(0,colors.from);gradient.addColorStop(1,colors.to);ctx.fillStyle=gradient;ctx.fillRect(0,0,1000,650);
  ctx.strokeStyle=colors.line;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(22,22,956,606,28);ctx.stroke();
  ctx.lineWidth=1;ctx.globalAlpha=.7;ctx.beginPath();ctx.roundRect(34,34,932,582,21);ctx.stroke();ctx.globalAlpha=1;
  ctx.fillStyle=colors.accent;ctx.globalAlpha=.09;ctx.font='170px "Segoe UI Emoji", "Segoe UI"';ctx.fillText(motifMarks[value.motif]||'✿',675,205);ctx.globalAlpha=1;
  ctx.fillStyle=colors.accent;ctx.font='19px "Microsoft YaHei UI"';ctx.fillText('知栖的秘密花笺  ·  ZHIXI',65,82);
  ctx.font='56px "Segoe UI Emoji", "Segoe UI"';ctx.fillText(value.icon||'✿',65,174);
  ctx.fillStyle=colors.ink;ctx.font='bold 40px "Microsoft YaHei UI"';const bodyY=wrap(ctx,value.title,65,248,540,51,2)+28;
  ctx.font='23px "Microsoft YaHei UI"';wrap(ctx,value.text,65,bodyY,515,39,4);
  const height=365,width=height*image.naturalWidth/image.naturalHeight;ctx.drawImage(image,815-width/2,238,width,height);
  ctx.fillStyle=colors.accent;ctx.font='21px "Microsoft YaHei UI"';ctx.fillText(value.earnedOn,65,502);ctx.fillText('知意而栖，与你一起。',65,558);ctx.font='27px "Microsoft YaHei UI"';ctx.fillText('知栖 ✿',65,599);
  return canvas.toDataURL('image/png');
 }
 $('close-card').addEventListener('click',close);
 $('export-card').addEventListener('click',async()=>{
  if(!selected||exporting)return;const card=selected;exporting=true;$('export-card').disabled=true;
  try{const result=await api.saveJournalCard({cardId:card.id,png:await createCardImage(card)});if(result?.saved)notice('纪念卡保存好啦。');}
  catch{notice('纪念卡未能保存，请再试一次。');}
  finally{exporting=false;$('export-card').disabled=false;}
 });
 return{render,close,createCardImage,get currentCard(){return selected;}};
};
