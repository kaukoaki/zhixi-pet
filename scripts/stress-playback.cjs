'use strict';
// Isolated real-Electron playback regression; never opens the user's profile.
const {app,BrowserWindow,ipcMain,protocol,net}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),label=process.argv.find(v=>v.startsWith('--label='))?.slice(8)||'latest';
const rounds=Number(process.argv.find(v=>v.startsWith('--rounds='))?.slice(9)||1);
const report={label,events:[],memory:[],checks:[]};let win;
const output=path.join(root,'.cache',`playback-stress-${label}.json`);
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
app.setPath('userData',path.join(root,'.cache','playback-stress-profile'));app.setName('ZhixiPlaybackRegression');
protocol.registerSchemesAsPrivileged([{scheme:'pet-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
app.on('child-process-gone',(_event,details)=>{report.events.push({event:'child-process-gone',...details});save();});
app.whenReady().then(async()=>{
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'actions/catalog.json'),'utf8'));
  const {freshState}=require('../main/store.cjs'),state=freshState(root);
  const assets=new Map();
  for(const action of catalog.actions){
    const slot=action.id==='idle'?state.idle:state.actions.find(s=>s.id===action.id);
    assets.set(action.id,path.join(root,action.media));slot.media={url:'pet-media://action/'+action.id,name:path.basename(action.media)};
    if(action.phases)slot.media.phases=Object.fromEntries(Object.entries(action.phases).map(([phase,file])=>{
      assets.set('drag:'+phase,path.join(root,file));return [phase,{url:'pet-media://action/drag?phase='+phase}];
    }));
  }
  protocol.handle('pet-media',async request=>{
    const url=new URL(request.url),key=url.pathname.slice(1)+(url.searchParams.has('phase')?':'+url.searchParams.get('phase'):'');
    const file=assets.get(key);if(!file)return new Response('Not found',{status:404});
    const response=await net.fetch(pathToFileURL(file).href,{headers:request.headers});
    const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','*');
    return new Response(response.body,{status:response.status,headers});
  });
  ipcMain.handle('pet:get-state',()=>({...state,task:null,interactions:{doubleClickMs:500}}));
  ipcMain.on('pet:hover',()=>{});ipcMain.on('pet:move',()=>{});
  ipcMain.on('pet:diagnostic',(_event,detail)=>{report.events.push({event:'playback-diagnostic',...detail});save();});
  win=new BrowserWindow({width:264,height:347,frame:false,transparent:true,backgroundColor:'#00000000',show:false,skipTaskbar:true,webPreferences:{preload:path.join(root,'main/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false,zoomFactor:1.65}});
  win.setIgnoreMouseEvents(true,{forward:true});
  win.webContents.on('render-process-gone',(_e,details)=>{report.events.push({event:'render-process-gone',...details});save();app.exit(1);});
  win.on('unresponsive',()=>{report.events.push({event:'unresponsive'});save();});
  await win.loadFile(path.join(root,'renderer/index.html'));win.showInactive();
  const sample=setInterval(()=>{report.memory.push({time:Date.now(),processes:app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu.percentCPUUsage,workingSetKB:p.memory.workingSetSize}))});save();},2000);
  const timeout=setTimeout(()=>{report.events.push({event:'timeout'});save();app.exit(1);},180000);
  const js=source=>win.webContents.executeJavaScript(source);
  await js(`window.__stressWait=ms=>new Promise(r=>setTimeout(r,ms));window.__stressCost={readMs:0,readCalls:0};const read=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(...args){const start=performance.now();try{return read.apply(this,args);}finally{window.__stressCost.readMs+=performance.now()-start;window.__stressCost.readCalls++;}};void 0;`);
  const check=async(name,source)=>{const result=await js(source);report.checks.push({name,...result});save();console.log(JSON.stringify(report.checks.at(-1)));if(result.ok===false)throw new Error(name+' failed');};
  const urls=Object.fromEntries(catalog.actions.map(a=>[a.id,'pet-media://action/'+a.id]));
  for(let round=0;round<rounds;round++){
    await check('sequential-'+round,`(async()=>{const p=window.qiqiPlayback;const actions=${JSON.stringify(Object.entries(urls))};for(const[id,url]of actions){if(!await p.play(url,{id,loop:true}))return {ok:false,id};const before=p.frames;await __stressWait(180);if(p.frames<=before)return {ok:false,id,reason:'frames stopped'};}return {ok:true,frames:p.frames};})()`);
    await check('rapid-switch-'+round,`(async()=>{const p=window.qiqiPlayback,actions=${JSON.stringify(Object.entries(urls))},pending=[];for(let i=0;i<120;i++){const[id,url]=actions[i%actions.length];pending.push(p.play(url,{id,loop:true}));await __stressWait(i%3?25:60);}await Promise.all(pending);await p.idle();const before=p.frames;await __stressWait(500);return {ok:p.current?.id==='idle'&&p.frames>before,pending:p.pending,frames:p.frames};})()`);
  }
  for(const id of ['wallet-careful','wallet-low','wallet-empty','wallet-wait'])await check('complete-'+id,`(async()=>{const p=window.qiqiPlayback;if(!await p.play(${JSON.stringify(urls[id])},{id:${JSON.stringify(id)}}))return {ok:false};const start=Date.now(),first=p.frames;while(Date.now()-start<12500&&p.current?.id!=='idle')await __stressWait(40);return {ok:p.current?.id==='idle'&&p.frames>first+100,frames:p.frames-first,returned:p.current?.id};})()`);
  await check('drag-phases',`(async()=>{const r=window.qiqiDragReaction,p=window.qiqiPlayback;for(let i=0;i<12;i++){await r.start();await __stressWait(80);await r.release();await __stressWait(100);}await __stressWait(1000);return {ok:!r.held&&p.current?.id==='idle',phase:r.phase,current:p.current?.id};})()`);
  report.cost=await js('window.__stressCost');report.render=await js('({size:window.qiqiPlayback.renderSize,recoveries:window.qiqiPlayback.recoveries})');report.errors=await js('window.__qiqiErrors');
  report.ok=!report.events.length&&!report.errors.length;clearInterval(sample);clearTimeout(timeout);save();app.exit(report.ok?0:1);
}).catch(error=>{report.events.push({event:'failed',message:error.stack||String(error)});save();console.error(error);app.exit(1);});
