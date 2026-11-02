'use strict';
const fs=require('node:fs'),path=require('node:path'),{GardenStore,SHOP}=require('../main/garden.cjs'),{JournalStore}=require('../main/journal.cjs');
module.exports=async function({ROOT,pause,menu,getWindow,petWindow,getGarden,setGarden,getJournal,setJournal,push,broadcast,diagnostics,keepOpen=false,previewOnly=false}){
 const savedGarden=getGarden(),savedJournal=getJournal(),file=path.join(ROOT,'.cache','shop-test-'+Date.now()+'.json');
 let garden=new GardenStore(file,{timeZone:'Asia/Shanghai'});garden.grantCoins({amount:3000,reference:'isolated-shop-test',label:'测试存档额度'});
 const journal=new JournalStore(file.replace('.json','-journal.json'),{timeZone:'Asia/Shanghai'});journal.visit();setGarden(garden);setJournal(journal);broadcast();menu().getMenuItemById('pet-journal').click();const win=getWindow();
 if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
 const js=source=>win.webContents.executeJavaScript(source),wait=async predicate=>{const until=Date.now()+6000;while(Date.now()<until){if(await predicate())return;await pause(45);}throw Error('Shop UI did not reach expected state');};
 try{
  push(true);await wait(()=>js(`snapshot?.garden?.coins===3000`));await js(`document.getElementById('tab-shop').click()`);
  if(previewOnly){
   const selected=process.argv.find(value=>value.startsWith('--scene='))?.slice(8),scene=['morning','moon','sakura'].includes(selected)?selected:'sakura';
   for(const id of ['pot-cloud','scene-'+scene,'paper-mint','ornament-twinkle'])garden.command({type:garden.data.owned.includes(id)?'equip':'buy',itemId:id});
   if(process.argv.includes('--preview-grown')){let at=Date.now();garden.now=()=>at;garden.command({type:'plant',plotId:'plot-1',crop:'strawberry'});for(let i=0;i<3;i++){if(i)at+=86400000;garden.command({type:'water',plotId:'plot-1'});}}
   push(true);broadcast();await wait(()=>js(`snapshot.garden.appearance.scene===${JSON.stringify(scene)}&&snapshot.garden.appearance.pot==='cloud'`));
   win.setAlwaysOnTop(true,'pop-up-menu');win.setTitle('知栖 · 花园主题测试');await js(`document.querySelector('.book-header strong').textContent='知栖花园 · 测试预览';document.getElementById('tab-garden').click()`);return;
  }
  const effects=[],categories=['pot','scene','ornament','paper'];let cost=0;
  for(const item of SHOP){
   await js(`document.querySelectorAll('.shop-filter')[${categories.indexOf(item.category)}].click()`);
   const before=JSON.stringify(garden.data);
   await js(`document.querySelector('[data-item-id="${item.id}"] .shop-try').click()`);
   if(JSON.stringify(garden.data)!==before)throw Error('Shop preview modified account');
   const preview=await js(`({name:document.getElementById('shop-preview-name').textContent,effect:document.getElementById('shop-preview-effects').dataset.effect,paper:document.getElementById('shop-preview').dataset.paper,pot:document.getElementById('shop-preview-pot').dataset.pot,scene:document.getElementById('shop-preview-art').dataset.scene})`);
   if(preview.name!==item.name||preview[item.category==='ornament'?'effect':item.category]!==item.style)throw Error('Wrong product preview '+item.id);
   if(!garden.data.owned.includes(item.id)){
    await js(`(()=>{const b=document.querySelector('[data-item-id="${item.id}"] .shop-buy');b.click();b.click();})()`);cost+=item.price;
   }else if(!garden.snapshot().shop.find(entry=>entry.id===item.id).equipped)await js(`document.querySelector('[data-item-id="${item.id}"] .shop-buy').click()`);
   await wait(()=>garden.data.equipped[item.category]===item.id);
   if(garden.data.coins!==3000-cost)throw Error('Shop double charged or wrong price '+item.id);
   if(item.category==='ornament'){
    await wait(()=>petWindow.webContents.executeJavaScript(`window.qiqiEffects.current===${JSON.stringify(item.style)}`));
    const first=await petWindow.webContents.executeJavaScript(`(()=>{const h=document.querySelector('.companion-charm');const p=h.querySelector('.effect-particle');window.__shopParticle=p;return{hidden:h.hidden,pointer:getComputedStyle(h).pointerEvents,parts:h.querySelectorAll('.effect-particle').length,transform:p&&getComputedStyle(p).transform,opacity:p&&getComputedStyle(p).opacity};})()`);
    await pause(240);
    const second=await petWindow.webContents.executeJavaScript(`(()=>{const p=document.querySelector('.companion-charm .effect-particle');return{same:p===window.__shopParticle,transform:p&&getComputedStyle(p).transform,opacity:p&&getComputedStyle(p).opacity};})()`);
    const reduced=await petWindow.webContents.executeJavaScript(`matchMedia('(prefers-reduced-motion:reduce)').matches`);
    const moving=item.style==='none'||reduced||first.transform!==second.transform||first.opacity!==second.opacity;
    const gardenEffect=await js(`document.getElementById('garden-effects').dataset.effect`);
    if(!moving||gardenEffect!==item.style||first.pointer!=='none'||!second.same||item.style!=='none'&&(first.hidden||first.parts<3))throw Error('Equipped effect failed '+item.id);
    effects.push({id:item.id,style:item.style,particles:first.parts,animated:moving,stableNodes:second.same,pointerTransparent:true,gardenMatches:true});
   }
  }
  if(garden.data.ledger.filter(entry=>entry.kind==='purchase').length!==SHOP.filter(item=>item.price>0).length)throw Error('Shop purchase ledger count mismatch');
  garden=new GardenStore(file);setGarden(garden);push(true);broadcast();await pause(140);
  const persisted=await js(`document.getElementById('shop-coins').textContent===${JSON.stringify(String(3000-cost))}`);
  const owned=SHOP.filter(item=>item.price>0).every(item=>garden.data.owned.includes(item.id));
  const balance=garden.data.coins;await js(`document.querySelectorAll('.shop-filter')[2].click();document.querySelector('[data-item-id="ornament-star"] .shop-buy').click()`);await wait(()=>garden.appearance().ornament==='star');
  if(garden.data.coins!==balance)throw Error('Reequipping charged twice');
  const reloaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await reloaded;await pause(160);await js(`document.getElementById('tab-shop').click()`);
  const resetPreview=await js(`document.getElementById('shop-preview-effects').dataset.effect==='star'&&document.getElementById('shop-reset-preview').hidden`);
  const layout=await js(`({overflow:document.getElementById('shop-page').scrollWidth>document.getElementById('shop-page').clientWidth,errors:window.__qiqiErrors,pointer:getComputedStyle(document.getElementById('shop-preview-effects')).pointerEvents})`);
  await js(`document.querySelector('[data-item-id="ornament-twinkle"] .shop-try').click();document.getElementById('tab-days').click()`);
  const hiddenPaused=await js(`document.getElementById('shop-preview-effects').classList.contains('effects-paused')`);
  const themes=await require('./verify-garden-themes.cjs')({garden,win,js,pause,push,broadcast,menu,wait});
  const result={themes,products:SHOP.length,paidProducts:SHOP.filter(item=>item.price>0).length,freePreviewPreservesAccount:true,effects,persisted,allOwned:owned,oneChargePerPurchase:true,freeReequip:true,resetPreview,hiddenPaused,fixtureCoins:garden.data.coins,layout};
  if(!persisted||!owned||!resetPreview||!hiddenPaused||layout.overflow||layout.errors.length||layout.pointer!=='none')throw Error('Shop verification failed: '+JSON.stringify(result));
  diagnostics.push({check:'shop-preview-purchase-effects-and-persistence',...result});fs.writeFileSync(path.join(ROOT,'.cache/shop-verification.json'),JSON.stringify(result,null,2));
 }finally{if(!keepOpen){setGarden(savedGarden);setJournal(savedJournal);push(true);broadcast();}}
};
