'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const { locateCodex, DEFAULT_PERMISSIONS } = require('./codex-bridge.cjs');
const clean = value => typeof value === 'string' && value ? value.slice(0, 160) : null;
function normalizeModels(models) {
  const result=new Map();
  for(const item of Array.isArray(models)?models:[]) {
    const id=clean(item?.model)||clean(item?.id);
    if(!id||item.hidden)continue;
    const efforts=new Map();
    for(const entry of Array.isArray(item.supportedReasoningEfforts)?item.supportedReasoningEfforts:[]){const value=clean(entry.reasoningEffort);if(value)efforts.set(value,{value,description:clean(entry.description)||''});}
    result.set(id,{id,label:clean(item.displayName)||id,defaultEffort:clean(item.defaultReasoningEffort),efforts:[...efforts.values()]});
  }
  return [...result.values()];
}
function normalizeRequirements(requirements){
  if(!requirements||typeof requirements!=='object')return null;
  const names={onRequest:'on-request',unlessTrusted:'untrusted',onFailure:'on-failure',readOnly:'read-only',workspaceWrite:'workspace-write',dangerFullAccess:'danger-full-access'};
  const result={};for(const key of ['allowedApprovalPolicies','allowedSandboxModes'])if(Array.isArray(requirements[key]))result[key]=requirements[key].filter(x=>typeof x==='string').map(x=>names[x]||x);
  return result;
}

function normalizeRuntime(config, options = {}) {
  const env = options.env || process.env, platform = options.platform || process.platform;
  const hint = env.CODEX_SHELL || env.SHELL || '';
  const executable = /(?:pwsh|powershell|bash|zsh|fish|cmd)(?:\.exe)?$/i.test(hint) ? hint : null;
  return { status: 'ready', cwd: options.cwd, model: clean(config.model), effort: clean(config.model_reasoning_effort),
    summary: clean(config.model_reasoning_summary), provider: clean(config.model_provider),
    platform: platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux',
    shell: executable ? path.win32.basename(path.basename(executable)).replace(/\.exe$/i, '') : null,
    sandbox: DEFAULT_PERMISSIONS.sandbox, approvalPolicy: DEFAULT_PERMISSIONS.approvalPolicy };
}
async function readRuntime(options = {}) {
  const executable = options.codexPath || locateCodex({ env: options.env });
  if (!executable) throw new Error('未找到本机 Codex。');
  return new Promise((resolve, reject) => {
    let child, buffer = '', total = 0, done = false,config=null,models=[],catalogDone=false,catalogError=false,requirements=null,requirementsDone=false,requirementsError=false,pages=0;
    const result=()=>({...normalizeRuntime(config||{},options),models:normalizeModels(models),catalogStatus:catalogDone&&!catalogError?'ready':'error',requirements,requirementsStatus:requirementsDone&&!requirementsError?'ready':'unavailable'});
    const complete=()=>{if(config&&catalogDone&&requirementsDone)finish(null,result());};
    const timer = setTimeout(() => config?finish(null,result()):finish(new Error('读取模型配置超时。')), options.timeoutMs || 8000);
    function finish(error, value) {
      if (done) return;
      done = true; clearTimeout(timer); child?.stdin?.end(); child?.kill();
      if (error) reject(error); else resolve(value);
    }
    const send = value => { if (!done) child.stdin.write(JSON.stringify(value) + '\n'); };
    function message(value) {
      if (value.method && value.id !== undefined) return send({ id: value.id, error: { code: -32601, message: 'Read-only runtime client' } });
      if (value.id === 1) {
        if (value.error) return finish(new Error('Codex 配置连接初始化失败。'));
        send({ method: 'initialized' });
        send({ id: 2, method: 'config/read', params: { includeLayers: false, cwd: options.cwd } });
      } else if (value.id === 2) {
        if (value.error || !value.result?.config) return finish(new Error('Codex 未返回有效模型配置。'));
        config=value.result.config;
        send({id:3,method:'model/list',params:{limit:100,includeHidden:false}});
        send({id:4,method:'configRequirements/read',params:{}});
      }else if(value.id===3){
        if(value.error||!Array.isArray(value.result?.data)){catalogError=true;catalogDone=true;}
        else{
          models.push(...value.result.data);pages++;
          if(value.result.nextCursor&&pages<5)send({id:3,method:'model/list',params:{limit:100,includeHidden:false,cursor:value.result.nextCursor}});
          else {catalogDone=true;if(value.result.nextCursor)catalogError=true;}
        }
        complete();
      }else if(value.id===4){
        requirementsDone=true;requirementsError=Boolean(value.error);
        requirements=normalizeRequirements(value.result?.requirements);complete();
      }
    }
    try {
      child = (options.spawnImpl || spawn)(executable, ['app-server', '--listen', 'stdio://'], { cwd: options.cwd, env: options.env || process.env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      child.once('error', () => finish(new Error('无法读取 Codex 模型配置。')));
      child.once('close', () => config?finish(null,result()):finish(new Error('Codex 配置连接已关闭。')));
      child.stdin.on('error', () => finish(new Error('Codex 配置连接不可用。')));
      child.stderr.on('data', () => {});
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        buffer += chunk; total += Buffer.byteLength(chunk);
        if (total > 4 * 1024 * 1024) return finish(new Error('Codex 配置响应过大。'));
        let end;
        while (!done && (end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let value; try { value = JSON.parse(line); } catch { continue; }
          if (value && typeof value === 'object') message(value);
        }
      });
      send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'zhixi_runtime', version: '0.1.10' } } });
    } catch { finish(new Error('无法读取 Codex 模型配置。')); }
  });
}
module.exports = { readRuntime, normalizeRuntime,normalizeModels,normalizeRequirements };
