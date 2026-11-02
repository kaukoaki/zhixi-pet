'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),version=require('../package.json').version,output=path.join(ROOT,'releases'),name=`Zhixi-${version}-win32-x64`,stage=path.join(output,name+'-'+Date.now()),zip=path.join(output,name+'.zip'),temporaryZip=stage+'.zip';
if(process.platform!=='win32')throw new Error('Windows release packaging requires PowerShell on Windows');
if(path.dirname(stage)!==output||path.dirname(output)!==ROOT||fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink())throw new Error('Unsafe release directory');
const runtime=path.join(ROOT,'dist/QiqiCodexPet-win32-x64');if(!fs.existsSync(path.join(runtime,'QiqiCodexPet.exe')))throw new Error('Run npm run package first');
fs.mkdirSync(stage,{recursive:true});fs.cpSync(runtime,path.join(stage,'app'),{recursive:true});
for(const folder of ['codex-plugin','.agents'])fs.cpSync(path.join(ROOT,folder),path.join(stage,folder),{recursive:true});
fs.mkdirSync(path.join(stage,'scripts'));for(const file of ['install-desktop.ps1','install-codex-plugin.ps1'])fs.copyFileSync(path.join(ROOT,'scripts',file),path.join(stage,'scripts',file));
fs.copyFileSync(path.join(ROOT,'install.cmd'),path.join(stage,'install.cmd'));
for(const notice of ['LICENSE','LICENSE-ASSETS.md','NOTICE.md','THIRD_PARTY_NOTICES.md','INSTALL-WINDOWS.md'])fs.copyFileSync(path.join(ROOT,notice),path.join(stage,notice));
fs.mkdirSync(path.join(stage,'docs'));fs.copyFileSync(path.join(ROOT,'docs/RIGHTS.md'),path.join(stage,'docs/RIGHTS.md'));
fs.writeFileSync(path.join(stage,'README.txt'),'知栖 Zhixi / Windows x64\r\n\r\n解压后双击 install.cmd，安装桌面程序与 Codex 本地插件。\r\n需要可运行的 Codex CLI；只安装桌面程序可运行 scripts/install-desktop.ps1。\r\n安装后新开 Codex 聊天，使用 $zhixi-pet 或说“打开知栖桌宠”。\r\n个人数据保存在 %APPDATA%\\QiqiCodexPet，安装升级不覆盖。\r\n代码 MIT；有权授权的原创素材 CC BY 4.0，第三方标志除外。\r\nAI 辅助素材；本项目非 OpenAI 官方产品。当前37段使用小芽抱星胸章与编发挂饰；历史素材和来源说明见 docs/RIGHTS.md。\r\n项目声明在包顶层，Electron/Chromium 原始许可保留在 app/ 内。\r\n','utf8');
// Build into a unique ZIP and atomically replace the published artifact only
// after compression succeeds, keeping previous releases intact on failure.
const result=spawnSync('powershell.exe',['-NoProfile','-Command','Compress-Archive -LiteralPath $env:ZHIXI_RELEASE_STAGE -DestinationPath $env:ZHIXI_RELEASE_ZIP -CompressionLevel Optimal'],{env:{...process.env,ZHIXI_RELEASE_STAGE:stage,ZHIXI_RELEASE_ZIP:temporaryZip},windowsHide:true,stdio:'inherit'});
if(result.status!==0)throw new Error('ZIP creation failed; staging kept for inspection');
fs.renameSync(temporaryZip,zip);
const sha=crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');fs.writeFileSync(zip+'.sha256',`${sha}  ${path.basename(zip)}\n`);
// Only this freshly created, non-symlinked stage below the verified release root.
if(fs.realpathSync(stage)!==stage||path.dirname(stage)!==output)throw new Error('Refusing unsafe stage cleanup');
fs.rmSync(stage,{recursive:true,force:true});console.log(JSON.stringify({archive:zip,sha256:sha,bytes:fs.statSync(zip).size}));
