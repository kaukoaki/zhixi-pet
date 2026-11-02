'use strict';
const path=require('node:path'),fs=require('node:fs'),{GardenStore}=require('../main/garden.cjs'),{JournalStore,decodeCardImage}=require('../main/journal.cjs');
module.exports=async function({ROOT,store,pause,menu,getWindow,petWindow,getGarden,setGarden,getJournal,setJournal,push,broadcast,playAction,diagnostics}){
 const saved=getGarden(),file=path.join(ROOT,'.cache','garden-smoke-'+Date.now()+'.json');let time=Date.parse('2026-10-26T10:00:00+08:00');
 const savedJournal=getJournal(),journal=new JournalStore(file.replace('.json','-journal.json'),{now:()=>time,timeZone:'Asia/Shanghai'});journal.visit();journal.flush();setJournal(journal);
 let garden=new GardenStore(file,{now:()=>time,timeZone:'Asia/Shanghai',quote:()=>100});setGarden(garden);menu().getMenuItemById('pet-journal').click();const win=getWindow();
 if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
 const js=source=>win.webContents.executeJavaScript(source),wait=async predicate=>{const end=Date.now()+5000;while(Date.now()<end){if(await predicate())return;await pause(40);}throw Error('Garden UI did not reach expected state.');};
 try{
  push(true);await pause(120);await js(`document.getElementById('tab-garden').click()`);
  const sceneCount=await js(`Object.keys(snapshot.garden.sceneLibrary.clips).length`);if(sceneCount!==11)throw Error('Garden built-in scene library missing');
  const mediaQA=await require('./verify-garden-media.cjs')(win);
  const routing=[];
  for(let i=0;i<3;i++){
   await js(`document.querySelectorAll('.plot-button')[${i}].click();document.querySelectorAll('.seed-choice')[${i}].click()`);
   await wait(()=>garden.snapshot().plots[i].plant!==null);
  }
  await js(`document.getElementById('water-garden').click()`);await wait(()=>garden.snapshot().plots.every(plot=>plot.progress===1));
  await wait(()=>js(`window.qiqiGardenScene.current?.id==='garden-water'&&document.getElementById('garden-video').currentTime>.05`));
  const stageOwnsScene=await js(`document.querySelectorAll('.garden-plot.in-scene').length===1&&getComputedStyle(document.querySelector('.garden-plot.in-scene .plant-art svg')).visibility==='hidden'`);
  const desktopNotGarden=await petWindow.webContents.executeJavaScript(`!window.qiqiPlayback.current?.id?.startsWith('garden-')`);
  const dailyButtonDisabled=await js(`document.getElementById('water-garden').disabled`);
  for(let day=2;day<=10;day++){
   time+=86400000;push(true);await wait(()=>js(`!document.getElementById('water-garden').disabled`));await js(`document.getElementById('water-garden').click()`);await wait(()=>garden.snapshot().plots.every(plot=>plot.progress===day));
   await wait(()=>js(`window.qiqiGardenScene.current?.phase===${JSON.stringify(({3:'leaf',6:'bloom',10:'ripe'})[day]||(day<3?'soil':day<6?'leaf':'bloom'))}`));
   routing.push(await js(`({day:${day},id:window.qiqiGardenScene.current?.id,kind:window.qiqiGardenScene.current?.kind})`));
  }
  await wait(()=>js(`document.querySelectorAll('.garden-plot.ripe').length===3`));
  await js(`document.querySelector('.garden-plot .plot-button').click()`);await wait(()=>garden.snapshot().inventory.length===1);
  await js(`(()=>{const button=document.querySelector('.sell-fruit');button.click();button.click();})()`);await wait(()=>garden.snapshot().coins===100);
  await js(`document.getElementById('tab-shop').click();document.querySelectorAll('.shop-filter')[2].click();document.querySelector('[data-item-id="ornament-star"] .shop-buy').click()`);await wait(()=>garden.snapshot().coins===10);
  await wait(()=>petWindow.webContents.executeJavaScript(`document.body.dataset.gardenOrnament==='star'&&getComputedStyle(document.querySelector('.companion-charm')).display==='block'`));
  const duplicateSaleBlocked=garden.snapshot().ledger.filter(entry=>entry.kind==='sale').length===1;
  await wait(()=>js(`snapshot.cards.some(card=>card.id==='harvest-tomato'&&!card.opened)`));
  const harvestCard=journal.snapshot().cards.find(card=>card.id==='harvest-tomato'),sealedPrivacy=await js(`(()=>{const locked=[...document.querySelectorAll('.keepsake.locked')];return locked.length>0&&locked.every(button=>button.disabled&&!button.querySelector('img')&&!button.textContent.includes('番茄')&&!button.textContent.includes('草莓')&&!button.textContent.includes('西瓜'));})()`);
  await js(`document.getElementById('tab-cards').click();document.querySelector('[data-card-slot="${harvestCard.slot}"]').click()`);
  await wait(()=>js(`!document.getElementById('card-dialog').hidden&&window.qiqiCards.currentCard?.id==='harvest-tomato'`));
  const harvestFace=await js(`document.getElementById('card-title').textContent.includes('知栖')&&!!document.querySelector('.postcard img').naturalWidth`);
  const harvestPng=decodeCardImage(await js(`window.qiqiCards.createCardImage(window.qiqiCards.currentCard)`));fs.writeFileSync(path.join(ROOT,'.cache/019-harvest-card.png'),harvestPng);
  const revealPreservedCoins=garden.snapshot().coins===10&&journal.snapshot().cards.find(card=>card.id==='harvest-tomato').opened===true;
  await js(`window.qiqiCards.close();document.getElementById('tab-shop').click()`);
  const layout=await js(`({garden:document.getElementById('garden-page').scrollWidth<=document.getElementById('garden-page').clientWidth,shop:document.getElementById('shop-page').scrollWidth<=document.getElementById('shop-page').clientWidth,errors:window.__qiqiErrors})`);
  garden=new GardenStore(file,{now:()=>time,timeZone:'Asia/Shanghai'});setGarden(garden);
  const reloaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await reloaded;await pause(150);
  const persisted=await js(`document.getElementById('garden-coins').textContent==='10'`);
  const slots=menu().getMenuItemById('pet-group-garden').submenu.items.length;
  const phaseRouting=routing.every(item=>[3,6,10].includes(item.day)?item.id===`garden-tomato-${{3:'grow',6:'bloom',10:'ripe'}[item.day]}`:item.day<3?item.id==='garden-water':item.kind==='water'&&item.id===null);
  const savedData=JSON.stringify(garden.data);menu().getMenuItemById('pet-action-garden-watermelon-ripe').click();await wait(()=>js(`window.qiqiGardenScene.current?.id==='garden-watermelon-ripe'&&document.getElementById('garden-video').currentTime>.05`));
  const previewDoesNotMutate=JSON.stringify(garden.data)===savedData;await js(`document.getElementById('skip-garden-scene').click()`);
  const decoderReleased=await js(`document.getElementById('garden-video').paused&&!document.getElementById('garden-video').getAttribute('src')&&!window.qiqiGardenScene.playing`);
  menu().getMenuItemById('pet-action-garden-watermelon-bloom').click();await wait(()=>js(`document.getElementById('garden-video').currentTime>.05`));win.hide();await wait(()=>js(`document.getElementById('garden-video').paused&&!document.getElementById('garden-video').getAttribute('src')`));const hiddenDecoderReleased=true;win.show();
  const playableMenu=menu().getMenuItemById('pet-group-garden').submenu.items.every(item=>item.enabled);
  const result={mediaQA,hiddenDecoderReleased,sceneCount,stageOwnsScene,desktopNotGarden,phaseRouting,previewDoesNotMutate,decoderReleased,playableMenu,routing,dailyButtonDisabled,threeCropsMatured:true,duplicateSaleBlocked,coins:garden.snapshot().coins,ornamentVisible:true,persisted,slots,layout,sealedPrivacy,harvestFace,revealPreservedCoins};
  if(!stageOwnsScene||!desktopNotGarden||!phaseRouting||!previewDoesNotMutate||!decoderReleased||!playableMenu||!dailyButtonDisabled||!duplicateSaleBlocked||!persisted||!sealedPrivacy||!harvestFace||!revealPreservedCoins||slots!==14||!layout.shop||layout.errors.length)throw Error('Garden verification failed: '+JSON.stringify(result));
  diagnostics.push({check:'garden-ten-days-sale-shop-persistence-and-ornament',...result});
  await js(`document.getElementById('tab-garden').click();window.qiqiGardenScene.select('plot-2')`);await pause(250);
  await require('./save-preview.cjs')(win,path.join(ROOT,'docs/images/garden.png'));
 }finally{setGarden(saved);setJournal(savedJournal);push(true);broadcast();playAction('idle');}
};
