'use strict';
window.createGardenView=function({api,notice}){
 const $=id=>document.getElementById(id),names={pot:'小花盆',scene:'花园背景',ornament:'特效装扮',paper:'手账纸'};
 let current,selectedPlot=null,busy=false,category='ornament',signature='',previewId=null;
 const theme=window.qiqiGardenTheme=window.createGardenTheme();
 const scene=window.qiqiGardenScene=window.createGardenScene({onChange(){$('garden-plots').parentElement.classList.toggle('has-performance',!$('garden-performance').hidden);for(const card of $('garden-plots').children)card.classList.toggle('in-scene',card.dataset.plotId===scene.plotId&&!$('garden-performance').hidden);}});
 const previewEffects=window.createCompanionEffects($('shop-preview-effects'));
 api.onGardenPreview(event=>scene.preview(event));
 const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 function button(label,action,disabled=false,className='secondary-button'){const el=node('button',label,className);el.type='button';el.disabled=disabled;el.addEventListener('click',action);return el;}
 async function command(input){
  if(busy||!current)return;scene.cancel();scene.prepare();busy=true;render(current,true);let feedback=[];
  try{const result=await api.gardenCommand(input);selectedPlot=null;current=result.garden;if(current.shop.some(item=>item.id===previewId&&item.equipped))previewId=null;feedback=result.feedback||[];notice(result.message);}
  catch(error){notice(String(error.message||error).replace(/^Error invoking remote method '[^']+': Error: /,''));}
  finally{busy=false;render(current,true);}
  if(feedback.length)void scene.play(feedback);else scene.cancel();
  window.dispatchEvent(new Event('garden-updated'));
 }
 function render(data,force=false){
  if(!data||busy&&!force)return;current=data;const key=JSON.stringify([data,selectedPlot,busy,category,previewId]);if(!force&&key===signature)return;signature=key;
  for(const [name,value]of Object.entries(data.appearance))document.body.dataset['garden'+name[0].toUpperCase()+name.slice(1)]=value;
  for(const id of ['garden-coins','shop-coins'])$(id).textContent=data.coins===null?'—':String(data.coins);
  $('garden-warning').textContent=data.warning||'';$('garden-warning').hidden=!data.warning;
  document.querySelector('.garden-heading h1').textContent=data.shop.find(item=>item.category==='scene'&&item.equipped)?.name||'知栖小花园';
  $('garden-checkin').textContent=data.checkedToday?'今天已经浇水打卡 ✿':`累计浇水打卡 ${data.checkIns} 天`;
  const canWater=data.plots.some(plot=>plot.canWater);$('water-garden').disabled=busy||data.readOnly||!canWater;
  $('water-garden').textContent=canWater?'浇水打卡 ♧':data.checkedToday?'今天浇好啦 ✓':'等待一颗种子';
  $('garden-plots').replaceChildren(...data.plots.map((plot,index)=>{
   const card=node('article',undefined,'garden-plot'+(plot.ready?' ripe':'')+(selectedPlot===plot.id?' selected':''));card.dataset.plotId=plot.id;
   const crop=data.crops.find(crop=>crop.id===plot.plant?.crop),art=node('div',undefined,'plant-art');
   if(crop){art.innerHTML=window.gardenPlantSvg(crop.id,plot.progress,data.appearance.pot);art.tabIndex=0;art.setAttribute('role','button');art.setAttribute('aria-label',`看看小田${index+1}的${crop.name}`);art.addEventListener('click',()=>scene.select(plot.id));art.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();scene.select(plot.id);}});}else{art.innerHTML=window.gardenPlantSvg('tomato',0,data.appearance.pot);art.append(node('span','＋','empty-plant-sign'));art.tabIndex=0;art.setAttribute('role','button');art.setAttribute('aria-label',`在小田${index+1}种下种子`);const choose=()=>{if(busy||data.readOnly)return;selectedPlot=plot.id;render(current,true);};art.addEventListener('click',choose);art.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});}
   card.append(node('small',`小田 ${index+1}`,'plot-number'),art,node('strong',crop?crop.name:'空空的小田'));
   card.append(node('span',crop?(plot.ready?'成熟啦！':`浇水 ${plot.progress} / 10 天`):'种子免费','plot-progress'));
   if(crop){const meter=node('div',undefined,'plant-meter'),fill=node('i');fill.style.width=`${plot.progress*10}%`;meter.append(fill);card.append(meter);}
   card.append(button(crop?(plot.ready?'收获 ♡':plot.lastWatered===data.today?'今日已浇水':'慢慢长大'):'种点什么',()=>{
    if(plot.ready)void command({type:'harvest',plotId:plot.id});else{selectedPlot=plot.id;render(current,true);}
   },busy||data.readOnly||Boolean(crop&&!plot.ready),'plot-button'));
   return card;
  }));
  scene.update(data);
  $('seed-picker').hidden=!selectedPlot;
  $('seed-options').replaceChildren(...data.crops.map(crop=>button(`${crop.icon} ${crop.name}`,()=>void command({type:'plant',plotId:selectedPlot,crop:crop.id}),busy||data.readOnly,'seed-choice')));
  $('harvest-section').hidden=data.inventory.length===0;
  $('harvest-count').textContent=`${data.inventory.length} 份`;
  $('harvest-box').replaceChildren(...(data.inventory.length?data.inventory.map(batch=>{
   const crop=data.crops.find(crop=>crop.id===batch.crop),row=node('div',undefined,'harvest-row'),icon=node('span',crop.icon,'fruit-icon'),label=node('div');label.append(node('strong',crop.name),node('small',batch.harvestedOn+' 收获'));row.append(icon,label,button(`卖出 +${batch.price}`,()=>void command({type:'sell',batchId:batch.id}),busy||data.readOnly,'sell-fruit'));return row;
  }):[]));
  const chosen=data.shop.find(item=>item.id===previewId)||data.shop.find(item=>item.category===category&&item.equipped),look={...data.appearance};
  if(chosen)look[chosen.category]=chosen.style;
  theme.render(data.appearance,previewId?look:null);
  $('shop-preview').dataset.paper=look.paper;$('shop-preview-art').dataset.scene=look.scene;
  $('shop-preview-pot').dataset.pot=look.pot;
  $('shop-preview-pot').innerHTML=window.gardenPlantSvg('strawberry',6,look.pot);previewEffects.set(look.ornament);
  $('shop-preview-name').textContent=chosen?.name||'轻轻陪伴';$('shop-preview-detail').textContent=chosen?.description||'';
  $('shop-preview-status').textContent=previewId?'免费试穿中':'当前搭配';$('shop-reset-preview').hidden=!previewId;
  $('shop-filters').replaceChildren(...Object.entries(names).map(([id,name])=>button(name,()=>{category=id;previewId=null;render(current,true);},false,'shop-filter'+(id===category?' selected':''))));
  $('shop-items').replaceChildren(...data.shop.filter(item=>item.category===category).map(item=>{
   const card=node('article',undefined,'shop-item'+(item.equipped?' equipped':'')+(previewId===item.id?' previewing':''));card.dataset.itemId=item.id;card.dataset.category=item.category;
   const top=node('div',undefined,'shop-item-top'),swatch=node('span',item.icon,'shop-swatch');swatch.dataset.category=item.category;swatch.dataset.style=item.style;swatch.setAttribute('aria-hidden','true');if(item.category==='scene')window.gardenThemes.paint(swatch,item.style);if(item.category==='pot')swatch.innerHTML=window.gardenPlantSvg('strawberry',3,item.style);if(item.category==='paper')swatch.textContent='';
   top.append(swatch,node('small',item.equipped?'已装备':item.owned?'已拥有':item.price+' 金币','shop-price'));card.append(top,node('strong',item.name),node('p',item.description));
   const actions=node('div',undefined,'shop-actions');actions.append(button('预览',()=>{previewId=item.id;render(current,true);},busy,'shop-try'),button(item.equipped?'使用中':item.owned?'装备':!item.canAfford?'金币不足':item.price===0?'免费使用':'兑换',()=>void command({type:item.owned?'equip':'buy',itemId:item.id}),busy||data.readOnly||item.equipped||!item.owned&&!item.canAfford,'shop-buy'));card.append(actions);return card;
  }));
  $('coin-ledger').replaceChildren(...(data.ledger.length?data.ledger.map(entry=>{
   const row=node('div',undefined,'ledger-row');row.append(node('span',entry.date+' · '+entry.name),node('strong',(entry.delta>0?'+':'')+entry.delta,entry.delta>0?'positive':'negative'));return row;
  }):[node('p','还没有金币收支。第一份收获正在路上。','garden-empty')]));
 }
 $('shop-reset-preview').addEventListener('click',()=>{previewId=null;render(current,true);});
 $('water-garden').addEventListener('click',()=>void command({type:'water'}));
 $('close-seeds').addEventListener('click',()=>{selectedPlot=null;render(current,true);});
 return{render,command};
};
