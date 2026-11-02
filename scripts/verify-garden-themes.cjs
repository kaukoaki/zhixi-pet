'use strict';
module.exports=async function({garden,win,js,pause,push,broadcast,menu,wait}){
 const before=JSON.stringify(garden.data),palettes=[];
 await js(`document.getElementById('tab-shop').click();document.querySelectorAll('.shop-filter')[1].click()`);
 for(const scene of ['morning','moon','sakura']){
  await js(`document.querySelector('[data-item-id="scene-${scene}"] .shop-try').click()`);
  palettes.push(await js(`({scene:document.querySelector('.journal').dataset.scene,button:getComputedStyle(document.querySelector('.shop-filter.selected')).backgroundColor,ink:getComputedStyle(document.querySelector('.book-header strong')).color,art:document.querySelector('#shop-scenery svg').dataset.sceneArt,preview:document.querySelector('.journal').dataset.themePreview})`));
 }
 if(new Set(palettes.map(item=>item.button)).size!==3||palettes.some((item,i)=>item.scene!==['morning','moon','sakura'][i]||item.art!==item.scene||item.preview!=='true')||JSON.stringify(garden.data)!==before)throw Error('Scene preview palette or transaction isolation failed');
 await js(`document.getElementById('tab-garden').click()`);
 const restored=await js(`document.querySelector('.journal').dataset.scene===${JSON.stringify(garden.appearance().scene)}&&document.querySelector('.journal').dataset.themePreview==='false'`);
 const emptyGarden=await js(`getComputedStyle(document.querySelector('.garden-vista')).display!=='none'&&document.querySelector('.garden-vista img').naturalWidth>0&&document.querySelectorAll('.garden-plot svg[data-pot="cloud"]').length===3`);
 let time=Date.now();garden.now=()=>time;garden.command({type:'plant',plotId:'plot-1',crop:'strawberry'});
 for(let i=0;i<3;i++){if(i)time+=86400000;garden.command({type:'water',plotId:'plot-1'});}
 push(true);broadcast();await wait(()=>js(`snapshot.garden.plots[0].progress===3`));
 await wait(()=>js(`document.getElementById('garden-still').complete&&document.getElementById('garden-still').naturalWidth===640&&document.getElementById('garden-performance').classList.contains('glazed')`));
 const probe=()=>js(`(()=>{const ref=document.createElement('canvas');ref.width=ref.height=640;const ctx=ref.getContext('2d',{willReadFrequently:true});ctx.drawImage(document.getElementById('garden-still'),0,0);const a=ctx.getImageData(0,0,640,640).data,b=document.getElementById('garden-glaze').getContext('2d').getImageData(0,0,640,640).data;let changed=0,outside=0,alpha=0;const sums=[0,0,0];for(let y=0;y<640;y++)for(let x=0;x<640;x++){const i=(y*640+x)*4;if(a[i+3]!==b[i+3])alpha++;if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]){changed++;if(x<55||x>=251||y<438||y>=584)outside++;for(let c=0;c<3;c++)sums[c]+=b[i+c];}}return{changed,outside,alpha,mean:sums.map(v=>v/Math.max(1,changed)),error:window.qiqiGardenGlaze.error};})()`);
 const cloud=await probe();
 garden.command({type:'equip',itemId:'pot-mint'});push(true);broadcast();await wait(()=>js(`window.qiqiGardenGlaze.style==='mint'&&document.getElementById('garden-performance').classList.contains('glazed')`));const mint=await probe();
 if(cloud.changed<1000||mint.changed<1000||cloud.outside||mint.outside||cloud.alpha||mint.alpha||cloud.error||mint.error||mint.mean[1]<=mint.mean[0]||cloud.mean[2]<=cloud.mean[1])throw Error('Pot recoloring verification failed: '+JSON.stringify({cloud,mint}));
 menu().getMenuItemById('pet-action-garden-strawberry-grow').click();await wait(()=>js(`document.getElementById('garden-video').currentTime>.1&&window.qiqiGardenGlaze.running`));const frames=await js(`window.qiqiGardenGlaze.frames`);await pause(300);const videoAdvances=await js(`window.qiqiGardenGlaze.frames>${frames}+1&&window.qiqiGardenGlaze.error===null`);
 win.hide();await wait(()=>js(`!window.qiqiGardenGlaze.running`));const stopped=await js(`window.qiqiGardenGlaze.frames`);await pause(160);const released=await js(`window.qiqiGardenGlaze.frames===${stopped}&&document.getElementById('garden-scenery').classList.contains('scenery-paused')`);win.show();await pause(100);
 const layout=await js(`({garden:document.getElementById('garden-page').scrollWidth<=document.getElementById('garden-page').clientWidth,errors:window.__qiqiErrors})`);
 if(!restored||!emptyGarden||!videoAdvances||!released||!layout.garden||layout.errors.length)throw Error('Garden theme lifecycle failed');
 return{palettes,previewRestored:restored,emptyGardenVisible:emptyGarden,potColors:{cloud,mint},videoRecolorAdvances:videoAdvances,hiddenPainterReleased:released,layout};
};
