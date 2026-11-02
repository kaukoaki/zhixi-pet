'use strict';
// Test candidate WebMs in the real renderer without opening the user's profile.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inside(root, value) {
  if (typeof value !== 'string' || path.isAbsolute(value)) throw Error('Expected a project-relative path');
  const file = path.resolve(root, value), relative = path.relative(root, file);
  const escapes = p => p === '..' || p.startsWith('..'+path.sep) || path.isAbsolute(p);
  if (escapes(relative)) throw Error('Path escapes project');
  // Resolve the closest existing ancestor too: audit output does not exist
  // yet, but an existing junction in its parent must not redirect writes.
  let ancestor=file;
  const tail=[];
  while(!fs.existsSync(ancestor)){
    const parent=path.dirname(ancestor);
    if(parent===ancestor)throw Error('Cannot resolve project path');
    tail.unshift(path.basename(ancestor));ancestor=parent;
  }
  const physical=path.resolve(fs.realpathSync(ancestor),...tail);
  if(escapes(path.relative(fs.realpathSync(root),physical)))throw Error('Path escapes project through a link');
  return physical;
}
function loadCandidates(root, manifest) {
  const seen = new Set();
  if (!Array.isArray(manifest.reports) || !manifest.reports.length) throw Error('No candidate reports');
  return manifest.reports.map(entry => {
    const file = inside(root, entry.path);
    if (digest(file) !== entry.sha256) throw Error('Candidate report changed');
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (seen.has(report.id)) throw Error('Duplicate candidate id');
    seen.add(report.id);
    if (!Number.isInteger(report.frames) || report.frames < 1 || !Number.isFinite(report.fps) || report.fps <= 0) throw Error('Invalid candidate timing');
    const width=report.config?.width || report.width, height=report.config?.height || report.height;
    if (![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=4096)) throw Error('Invalid candidate dimensions');
    if (!report.sourceAlphaPreservedBeforeEncoding || report.encodedAlpha?.verifiedFrames !== report.frames ||
        !Number.isFinite(report.encodedAlpha?.maxError) || report.encodedAlpha.maxError < 0 || report.encodedAlpha.maxError > 1) throw Error('Candidate alpha audit failed');
    for (const [key, hash] of [['source','sourceSha256'], ['output','outputSha256'], ['reference','referenceSha256']]) {
      if (digest(inside(root, report[key])) !== report[hash]) throw Error('Candidate media changed: '+key);
    }
    return {id:report.id, report:entry.path, reportSha256:entry.sha256, output:report.output,
      outputSha256:report.outputSha256, source:report.source, sourceSha256:report.sourceSha256,
      reference:report.reference, referenceSha256:report.referenceSha256,
      frames:report.frames, fps:report.fps, width, height,
      bytes:fs.statSync(inside(root, report.output)).size};
  });
}
module.exports = {loadCandidates, inside};

async function run() {
  const {app, BrowserWindow, protocol, net, ipcMain} = require('electron');
  const {pathToFileURL} = require('node:url');
  const arg = name => process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
  const manifestFile = inside(ROOT, arg('manifest'));
  const out = inside(ROOT, arg('output'));
  const cacheRelative=path.relative(fs.realpathSync(path.join(ROOT,'.cache')),out);
  if (!cacheRelative || cacheRelative.startsWith('..') || path.isAbsolute(cacheRelative) || fs.existsSync(out)) throw Error('Choose a fresh audit directory under .cache');
  const clips = loadCandidates(ROOT, JSON.parse(fs.readFileSync(manifestFile,'utf8')));
  fs.mkdirSync(out,{recursive:true});
  const report = {status:'running',visualApproval:false,productionModified:false,userProfileOpened:false,
    manifestSha256:digest(manifestFile),clips,checks:[],events:[],memory:[]};
  const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  app.setName('ZhixiBrandingPreinstallAudit');
  app.setPath('userData',path.join(out,'profile'));
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  protocol.registerSchemesAsPrivileged([{scheme:'pet-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
  app.on('child-process-gone',(_e,d)=>{report.events.push({event:'child-process-gone',...d});save();});
  await app.whenReady();
  const media = new Map(clips.map(c=>[c.id,inside(ROOT,c.output)]));
  protocol.handle('pet-media',async request=>{
    const file=media.get(new URL(request.url).pathname.slice(1));
    if(!file)return new Response('Not found',{status:404});
    const response=await net.fetch(pathToFileURL(file).href,{headers:request.headers});
    const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','*');
    return new Response(response.body,{status:response.status,headers});
  });
  const state = require('../main/store.cjs').freshState(ROOT);
  state.settings.randomIdle=false;state.settings.quietMode=true;
  for(const c of clips){
    const slot=[state.idle,...state.actions,...state.gardenActions,...state.pomodoroActions].find(v=>v.id===c.id);
    if(slot)slot.media={url:'pet-media://candidate/'+c.id,name:path.basename(c.output)};
  }
  const drag=state.actions.find(c=>c.id==='drag');
  if(drag?.media && ['enter','hold','exit'].every(p=>media.has('drag-'+p)))drag.media.phases=Object.fromEntries(['enter','hold','exit'].map(p=>[p,{url:'pet-media://candidate/drag-'+p}]));
  ipcMain.handle('pet:get-state',()=>({...state,task:null,interactions:{doubleClickMs:500}}));
  ipcMain.on('pet:hover',()=>{});ipcMain.on('pet:move',()=>{});
  ipcMain.on('pet:diagnostic',(_e,d)=>{report.events.push(d);save();});
  const win=new BrowserWindow({width:264,height:347,show:false,frame:false,transparent:true,
    backgroundColor:'#00000000',webPreferences:{preload:path.join(ROOT,'main/preload.cjs'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true,zoomFactor:1.65}});
  win.webContents.on('render-process-gone',(_e,d)=>{report.events.push({event:'render-process-gone',...d});save();app.exit(1);});
  const sample=setInterval(()=>{report.memory.push({time:Date.now(),processes:app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu.percentCPUUsage,workingSetKB:p.memory.workingSetSize}))});save();},3000);
  const timeout=setTimeout(()=>{report.status='timeout';report.ok=false;save();app.exit(1);},600000);
  try {
    await win.loadFile(path.join(ROOT,'renderer/index.html'));
    for(const c of clips){
      const result=await win.webContents.executeJavaScript(`(async()=>{
        const p=window.qiqiPlayback,wait=ms=>new Promise(r=>setTimeout(r,ms));
        const start=performance.now(),before=p.frames,recoveries=p.recoveries;
        if(!await p.play(${JSON.stringify('pet-media://candidate/'+c.id)},{id:${JSON.stringify(c.id)},loop:true}))return {ok:false,reason:'first-frame-load'};
        const loadMs=performance.now()-start,v=document.querySelector('video.is-front');
        const canvas=document.getElementById('pet-surface'),ctx=canvas.getContext('2d');
        const alpha=()=>{const a=ctx.getImageData(0,0,canvas.width,canvas.height).data;let zero=0,visible=0;for(let i=3;i<a.length;i+=4){zero+=a[i]===0;visible+=a[i]>32;}return {transparent:zero/(a.length/4),occupied:visible/(a.length/4)};};
        const firstAlpha=alpha();let last=v.currentTime,wraps=0,maxFrameGapMs=0,lastFrames=p.frames,lastProgress=performance.now();
        const budget=(v.duration*1.6+4)*1000;
        while(performance.now()-start<budget){await wait(25);if(v.currentTime<last-v.duration*.5)wraps++;last=v.currentTime;
          if(p.frames!==lastFrames){maxFrameGapMs=Math.max(maxFrameGapMs,performance.now()-lastProgress);lastProgress=performance.now();lastFrames=p.frames;}
          if(wraps>=1&&v.currentTime>.12)break;}
        const lastAlpha=alpha(),quality=v.getVideoPlaybackQuality();
        return {ok:wraps>=1&&p.frames-before>${Math.floor(c.frames*.7)}&&v.videoWidth===${c.width}&&v.videoHeight===${c.height}&&Math.abs(v.duration-${c.frames/c.fps})<.12&&firstAlpha.transparent>.05&&firstAlpha.occupied>.03&&lastAlpha.transparent>.05&&p.recoveries===recoveries,
          duration:v.duration,width:v.videoWidth,height:v.videoHeight,loadMs,elapsedMs:performance.now()-start,wraps,
          presentedFrames:p.frames-before,maxFrameGapMs,quality:{total:quality.totalVideoFrames,dropped:quality.droppedVideoFrames},
          recoveries:p.recoveries-recoveries,firstAlpha,lastAlpha,renderSize:p.renderSize};
      })()`);
      report.checks.push({id:c.id,...result});save();console.log(JSON.stringify(report.checks.at(-1)));
      if(!result.ok)throw Error('Candidate loop playback failed: '+c.id);
    }
    if(drag?.media?.phases){
      const phases=await win.webContents.executeJavaScript(`(async()=>{const r=window.qiqiDragReaction,p=window.qiqiPlayback,wait=ms=>new Promise(x=>setTimeout(x,ms));const events=[];await p.idle();await r.start();let t=Date.now();while(r.phase!=='hold'&&Date.now()-t<4000){events.push(r.phase);await wait(25);}const held=r.phase==='hold';await wait(600);await r.release();t=Date.now();while(r.phase!=='idle'&&Date.now()-t<4000){events.push(r.phase);await wait(25);}return {ok:held&&r.phase==='idle',held,phase:r.phase,current:p.current?.id,events:[...new Set(events)]};})()`);
      report.dragPhases=phases;save();if(!phases.ok)throw Error('Drag phase playback failed');
    }
    report.rendererErrors=await win.webContents.executeJavaScript('window.__qiqiErrors');
    report.ok=!report.events.length&&!report.rendererErrors.length;
    report.status=report.ok?'technical-playback-pass-visual-review-still-required':'failed';
    for(const c of clips){
      for(const [key,hash] of [['output','outputSha256'],['source','sourceSha256'],['reference','referenceSha256'],['report','reportSha256']]){
        if(digest(inside(ROOT,c[key]))!==c[hash])throw Error('Candidate changed during playback: '+key);
      }
    }
    save();clearInterval(sample);clearTimeout(timeout);app.exit(report.ok?0:1);
  } catch(error){report.status='failed';report.ok=false;report.error=String(error.stack||error);save();clearInterval(sample);clearTimeout(timeout);app.exit(1);}
}
if(require.main===module || process.versions.electron && process.type==='browser')run().catch(error=>{
  console.error(error);
  if(process.versions.electron && process.type==='browser')require('electron').app.exit(1);
  else process.exitCode=1;
});
