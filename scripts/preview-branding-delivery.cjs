'use strict';
// A separate review window. It never loads the desktop pet's user profile.
const {app,BrowserWindow,protocol,net}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const ROOT=path.resolve(__dirname,'..');
const arg=process.argv.find(v=>v.startsWith('--manifest='))?.slice(11);
function contained(base,relative){
  if(typeof relative!=='string'||path.isAbsolute(relative))throw Error('Expected a relative media path');
  const file=fs.realpathSync(path.resolve(base,relative)),inside=path.relative(base,file);
  if(inside.startsWith('..')||path.isAbsolute(inside))throw Error('Media escapes its review directory');
  return file;
}
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const requested=arg==='actions/branding-installation.json'&&fs.existsSync(path.join(ROOT,'local-assets/metadata/branding-installation.json'))?'local-assets/metadata/branding-installation.json':arg;
const manifestFile=contained(ROOT,requested),production=['actions/branding-installation.json','local-assets/metadata/branding-installation.json'].some(name=>fs.existsSync(path.join(ROOT,name))&&manifestFile===fs.realpathSync(path.join(ROOT,name)));
const base=production?ROOT:path.dirname(manifestFile);
if(!production&&!base.startsWith(path.join(ROOT,'.cache')+path.sep))throw Error('Choose the production manifest or a candidate under project .cache');
const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
const installed=manifest.status==='installed-and-running';
const installedVersion=manifest.installedVersion;
if(installed&&!/^\d+\.\d+\.\d+$/.test(installedVersion||''))throw Error('Missing installed preview version');
const productionVersion=require('../package.json').version;
if(production&&!/^\d+\.\d+\.\d+$/.test(productionVersion))throw Error('Invalid production version');
const windowTitle=production?'知栖 · 正式动作对照':installed?'知栖 · 已实装动作对照':'知栖 · 新动作实装前预览';
const files=new Map();
let reviewWindow;
const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'actions/catalog.json'),'utf8'));
const labels=new Map(catalog.actions.map(c=>[c.id,c.label]));
for(const [id,label] of require('../main/store.cjs').GARDEN_DEFINITIONS)labels.set(id,label);
labels.set('drag-enter','拖动 · 进入');labels.set('drag-hold','拖动 · 保持');labels.set('drag-exit','拖动 · 退出');
const clips=manifest.clips.map(original=>{
  const c=production?{...original,posters:{first:{path:original.firstFrame,sha256:original.firstFrameSha256},last:{path:original.lastFrame,sha256:original.lastFrameSha256}}}:original;
  for(const [key,relative,digest,root] of [
    [c.id+'/edited',c.media,c.mediaSha256,base],
    [c.id+'/source',c.source,c.sourceSha256,ROOT],
    [c.id+'/first',c.posters.first.path,c.posters.first.sha256,base],
    [c.id+'/last',c.posters.last.path,c.posters.last.sha256,base]]){
    const file=contained(root,relative);if(sha(file)!==digest)throw Error('Review media changed: '+key);files.set(key,file);
  }
  return {id:c.id,label:labels.get(c.id)||c.id,width:c.width,height:c.height,frames:c.frames,fps:c.fps};
});
app.setName('ZhixiBrandingReview');
app.setPath('userData',path.join(ROOT,'.cache','branding-review-window-'+Date.now()));
protocol.registerSchemesAsPrivileged([{scheme:'branding-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
app.whenReady().then(async()=>{
  protocol.handle('branding-media',async request=>{
    const file=files.get(new URL(request.url).pathname.slice(1));if(!file)return new Response('Not found',{status:404});
    const response=await net.fetch(pathToFileURL(file).href,{headers:request.headers});
    const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','*');
    return new Response(response.body,{status:response.status,headers});
  });
  const nonce=crypto.randomBytes(16).toString('base64');
  const json=JSON.stringify(clips).replace(/</g,'\\u003c');
  const initial=process.argv.find(v=>v.startsWith('--select='))?.slice(9);
  const selected=JSON.stringify(clips.some(c=>c.id===initial)?initial:clips[0]?.id).replace(/</g,'\\u003c');
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src branding-media:; img-src branding-media:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'"><title>${windowTitle}</title>
  <style>*{box-sizing:border-box}body{margin:0;padding:28px;color:#443d4f;background:#f6f3f8;font:15px 'Microsoft YaHei',sans-serif}header{display:flex;align-items:center;gap:20px;margin-bottom:18px}h1{font-size:21px;margin:0}p{line-height:1.65}select,button{font:inherit;padding:8px 12px;border:1px solid #d1c6dc;border-radius:8px;background:white;color:inherit}header span{margin-left:auto;font-size:13px;color:#71677e}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}section h2{font-size:14px;font-weight:500}.stage{border:1px solid #d6cfe0;border-radius:12px;background-color:#e9e5f1;background-image:linear-gradient(45deg,#dcd5e6 25%,transparent 25%),linear-gradient(-45deg,#dcd5e6 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dcd5e6 75%),linear-gradient(-45deg,transparent 75%,#dcd5e6 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}video{display:block;width:100%;aspect-ratio:1;object-fit:contain}.bottom{display:flex;align-items:center;gap:20px;margin-top:22px}.stills{display:flex;gap:12px}.stills figure{margin:0;text-align:center;font-size:12px}.stills img{height:110px;width:110px;object-fit:contain;border-radius:8px;background:#e9e5f1}small{display:block;color:#786e85;line-height:1.8}#meta{font-size:13px}button{cursor:pointer}</style>
  <header><h1>知栖 · 动作复查</h1><select id="choose" aria-label="选择动作"></select><span>${production?`${clips.length} 段 · 正式库 ${productionVersion}`:installed?`${clips.length} 段 · 已实装 ${installedVersion}`:`${clips.length} 段候选 · 尚未实装`}</span></header>
  <div class="pair"><section><h2>修改前的素材</h2><div class="stage"><video id="before" controls muted loop playsinline></video></div></section><section><h2>${production?'正式库新素材':installed?'已实装的新素材':'修改后的候选素材'}</h2><div class="stage"><video id="after" controls muted loop playsinline></video></div></section></div>
  <div class="bottom"><button id="restart">从头对照播放</button><div><p id="meta"></p><small>此窗口使用独立资料目录；现有桌宠与个人资料保持原样。<br>${production||installed?'全部现用动作均已列入，可切换检查胸章、发饰与动作遮挡。':'其他尚未通过的动作未列入本次候选。'}</small></div><div class="stills"><figure><img id="first" alt="新素材首帧"><figcaption>新素材首帧</figcaption></figure><figure><img id="last" alt="新素材结束静态图"><figcaption>新素材结束静态图</figcaption></figure></div></div>
  <script nonce="${nonce}">const clips=${json};const choose=document.getElementById('choose'),before=document.getElementById('before'),after=document.getElementById('after');for(const c of clips){const option=document.createElement('option');option.value=c.id;option.textContent=c.label;choose.append(option)}choose.value=${selected};async function restart(){for(const v of [before,after]){v.currentTime=0;}await Promise.all([before.play(),after.play()]).catch(()=>{})}function select(){const c=clips.find(v=>v.id===choose.value);before.src='branding-media://review/'+c.id+'/source';after.src='branding-media://review/'+c.id+'/edited';document.getElementById('first').src='branding-media://review/'+c.id+'/first';document.getElementById('last').src='branding-media://review/'+c.id+'/last';document.getElementById('meta').textContent=c.width+' × '+c.height+' · '+c.fps+' fps · '+(c.frames/c.fps).toFixed(2)+' 秒';Promise.all([before.play(),after.play()]).catch(()=>{})}choose.addEventListener('change',select);document.getElementById('restart').addEventListener('click',restart);select();</script></html>`;
  const win=reviewWindow=new BrowserWindow({width:1040,height:860,minWidth:820,minHeight:650,title:windowTitle,backgroundColor:'#f6f3f8',webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}});
  globalThis.__brandingReviewWindow=win;
  win.on('closed',()=>{reviewWindow=null;globalThis.__brandingReviewWindow=null;});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  win.setMenuBarVisibility(false);
  win.show();
  const capture=process.argv.find(v=>v.startsWith('--capture='))?.slice(10);
  if(capture){
    const image=path.resolve(ROOT,capture),relative=path.relative(path.join(ROOT,'.cache'),image);
    if(relative.startsWith('..')||path.isAbsolute(relative)||fs.existsSync(image))throw Error('Choose a fresh capture inside .cache');
    const ready=await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let attempts=0;const check=()=>{const v=[...document.querySelectorAll('video')],images=[...document.querySelectorAll('img')];if(v.every(x=>x.readyState>=2&&x.currentTime>.05)&&images.every(x=>x.complete&&x.naturalWidth>0))requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({videos:v.map(x=>({width:x.videoWidth,height:x.videoHeight,paused:x.paused,currentTime:x.currentTime})),images:images.length})));else if(++attempts>100)reject(Error('Review media load timeout'));else setTimeout(check,100)};check()})`);
    fs.mkdirSync(path.dirname(image),{recursive:true});
    fs.writeFileSync(image,(await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(image+'.json',JSON.stringify({manifestSha256:sha(manifestFile),...ready},null,2));
  }
}).catch(error=>{console.error(error);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
app.on('activate',()=>{reviewWindow?.show();});
