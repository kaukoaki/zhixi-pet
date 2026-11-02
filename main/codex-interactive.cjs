'use strict';
const fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events'),{spawn,execFile}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {locateCodex}=require('./codex-bridge.cjs'),{validateExecutionOptions}=require('./execution-options.cjs'),{UUID}=require('./conversation-store.cjs');
const safe=(value,limit=64000)=>String(value??'').replace(/\bBearer\s+[^\s"']+/gi,'Bearer [已隐藏]').replace(/\bsk-[A-Za-z0-9_-]{20,}/g,'[已隐藏的密钥]').slice(-limit);
const sandboxName=value=>({readOnly:'read-only',workspaceWrite:'workspace-write',dangerFullAccess:'danger-full-access'}[value]||value);
class CodexInteractiveRunner extends EventEmitter {
  constructor(options={}){super();this.options=options;this.env=options.env||process.env;this.tasks=new Map();this.spawn=options.spawnImpl||spawn;this.execFile=options.execFileImpl||execFile;this.platform=options.platform||process.platform;}
  start(prompt,options={}){
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>200000)throw new Error('请输入有效任务。');
    if(this.tasks.size)throw new Error('已有任务在执行。');
    const cwd=path.resolve(options.cwd||this.options.cwd||process.cwd());if(!fs.statSync(cwd).isDirectory())throw new Error('工作目录无效。');
    if(options.threadId&&!UUID.test(options.threadId))throw new Error('对话编号无效。');
    const runtime=options.runtime||{},execution=validateExecutionOptions(undefined,{sandbox:runtime.sandbox||'workspace-write',approvalPolicy:runtime.approvalPolicy||'on-request'});
    const executable=this.options.codexPath||locateCodex({env:this.env});if(!executable)throw new Error('未找到本机 Codex。');
    const task={id:(this.options.idFactory||randomUUID)(),cwd,prompt,threadId:options.threadId||null,turnId:null,runtime:{...runtime,...execution,model:runtime.model||null,effort:runtime.effort||null},startedAt:Date.now(),buffer:'',total:0,messages:new Map(),items:new Map(),summaries:new Map(),approvals:new Map(),lastMessage:'',responded:false,finished:false,cancelled:false};
    task.child=this.spawn(executable,['app-server','--listen','stdio://'],{cwd,env:this.env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.tasks.set(task.id,task);this._watch(task,this.options.connectionTimeoutMs||90000);
    this._emit(task,'task-started',{status:'running',pid:task.child.pid,resumed:Boolean(options.threadId),runtime:task.runtime,permissions:{sandbox:execution.sandbox,approvalPolicy:execution.approvalPolicy,description:'需要额外权限时由你在桌宠中审批。'}});
    task.child.stdout.setEncoding('utf8');task.child.stderr.setEncoding('utf8');
    task.child.stdout.on('data',chunk=>this._consume(task,chunk));task.child.stderr.on('data',()=>{});
    task.child.stdin.on('error',()=>{if(!task.finished)this._finish(task,'task-failed',{error:'Codex 交互连接已中断。'});});
    task.child.once('error',()=>this._finish(task,'task-failed',{error:'无法启动 Codex 交互连接。'}));
    task.child.once('close',()=>{if(!task.finished)this._finish(task,task.cancelled?'task-cancelled':'task-failed',task.cancelled?{message:'任务已停止。'}:{error:'Codex 连接已结束，任务没有完成。'});});
    this._send(task,{id:1,method:'initialize',params:{clientInfo:{name:'zhixi_pet_interactive',title:'知栖',version:'0.1.10'}}});
    return task.id;
  }
  _send(task,value){if(!task.finished&&!task.cancelled)task.child.stdin.write(JSON.stringify(value)+'\n');}
  _emit(task,type,payload={}){const event={type,taskId:task.id,threadId:task.threadId,cwd:task.cwd,timestamp:Date.now(),...payload};this.emit('event',event);}
  _watch(task,delay){
    clearTimeout(task.timer);if(task.approvals.size)return;
    task.timer=setTimeout(()=>{this._finish(task,'task-failed',{error:task.responded?'任务长时间没有新进展，已停止等待。':'连接模型超时，已停止等待。'});},delay);task.timer.unref?.();
  }
  _progress(task,payload){this._emit(task,'progress',payload);}
  _consume(task,chunk){
    if(task.finished)return;task.buffer+=chunk;task.total+=Buffer.byteLength(chunk);
    if(task.buffer.length>4*1024*1024||task.total>64*1024*1024)return this._finish(task,'task-failed',{error:'Codex 交互输出超出本次任务限制。'});
    let end;while(!task.finished&&(end=task.buffer.indexOf('\n'))>=0){const line=task.buffer.slice(0,end);task.buffer=task.buffer.slice(end+1);let value;try{value=JSON.parse(line);}catch{continue;}try{this._message(task,value);}catch{this._finish(task,'task-failed',{error:'Codex 交互响应无法处理。'});}}
  }
  _message(task,message){
    if(task.finished)return;
    if(task.cancelled){if(message.method==='turn/completed'&&message.params?.threadId===task.threadId)this._finish(task,'task-cancelled',{message:'任务已停止。'});return;}
    if(message.method&&message.id!==undefined)return this._request(task,message);
    if(message.id===1){
      if(message.error)return this._finish(task,'task-failed',{error:'Codex 交互初始化失败。'});
      this._send(task,{method:'initialized'});
      const params={cwd:task.cwd,approvalPolicy:task.runtime.approvalPolicy,approvalsReviewer:'user',sandbox:task.runtime.sandbox,config:{model_reasoning_summary:'auto'}};
      if(task.runtime.model)params.model=task.runtime.model;if(task.runtime.effort)params.config.model_reasoning_effort=task.runtime.effort;
      if(task.threadId){params.threadId=task.threadId;params.excludeTurns=true;}
      this._send(task,{id:2,method:task.threadId?'thread/resume':'thread/start',params});return;
    }
    if(message.id===2){
      if(message.error)return this._finish(task,'task-failed',{error:'无法打开 Codex 对话：'+safe(message.error.message,1500)});
      const result=message.result||{},id=result.thread?.id;
      if(!UUID.test(id))return this._finish(task,'task-failed',{error:'Codex 返回的对话编号无效。'});
      if(result.approvalPolicy!==task.runtime.approvalPolicy)return this._finish(task,'task-failed',{error:'Codex 实际审批方式与选择不符，已停止启动任务。'});
      if(sandboxName(result.sandbox?.type)!==task.runtime.sandbox)return this._finish(task,'task-failed',{error:'Codex 实际执行权限与选择不符，已停止启动任务。'});
      if(result.approvalsReviewer!=='user')return this._finish(task,'task-failed',{error:'Codex 未把审批交给用户，已停止启动任务。'});
      task.threadId=id;if(typeof result.model==='string')task.runtime.model=result.model;
      this._progress(task,{phase:'connecting',message:'已连接对话，正在等待模型响应…',runtime:task.runtime});
      const params={threadId:id,cwd:task.cwd,input:[{type:'text',text:task.prompt}],approvalPolicy:task.runtime.approvalPolicy,approvalsReviewer:'user',summary:'auto'};
      if(task.runtime.model)params.model=task.runtime.model;if(task.runtime.effort)params.effort=task.runtime.effort;
      this._send(task,{id:3,method:'turn/start',params});return;
    }
    if(message.id===3){
      if(message.error)return this._finish(task,'task-failed',{error:'无法开始 Codex 任务：'+safe(message.error.message,1500)});
      task.turnId=message.result?.turn?.id||task.turnId;return;
    }
    const p=message.params||{},method=message.method;
    if(p.threadId&&p.threadId!==task.threadId)return;
    if(method==='turn/started'){task.turnId=p.turn?.id||task.turnId;return;}
    if(method==='item/agentMessage/delta'){
      const text=safe((task.messages.get(p.itemId)||'')+(p.delta||''));task.messages.set(p.itemId,text);task.responded=true;this._watch(task,300000);this._emit(task,'message-delta',{itemId:p.itemId,text,delta:safe(p.delta)});return;
    }
    if(method==='item/reasoning/summaryTextDelta'){
      const key=p.itemId+':'+p.summaryIndex,text=safe((task.summaries.get(key)||'')+(p.delta||''),8000);task.summaries.set(key,text);task.responded=true;this._watch(task,300000);this._progress(task,{phase:'thinking',itemId:p.itemId,isSummary:true,message:text});return;
    }
    if(method==='item/commandExecution/outputDelta'){const item=task.items.get(p.itemId)||{};item.aggregatedOutput=safe((item.aggregatedOutput||'')+(p.delta||''),8000);task.items.set(p.itemId,item);task.responded=true;this._watch(task,900000);this._progress(task,{phase:'command',itemId:p.itemId,message:safe(item.command||'执行命令'),output:item.aggregatedOutput});return;}
    if(method==='item/started'||method==='item/completed'){this._item(task,p.item||{},method==='item/completed');return;}
    if(method==='serverRequest/resolved'){
      for(const [id,request]of task.approvals)if(request.rpcId===p.requestId){task.approvals.delete(id);this._emit(task,'approval-resolved',{approvalId:id});}this._watch(task,300000);return;
    }
    if(method==='turn/completed'){
      const turn=p.turn||{};for(const item of turn.items||[])if(item.type==='agentMessage')this._item(task,item,true);
      if(turn.status==='interrupted')this._finish(task,'task-cancelled',{message:'任务已停止。'});
      else if(turn.status==='failed'||turn.error)this._finish(task,'task-failed',{error:safe(turn.error?.message||'Codex 任务失败。',3000)});
      else if(turn.status==='completed')this._finish(task,'task-completed',{text:task.lastMessage||[...task.messages.values()].at(-1)||''});
      return;
    }
    if(method==='error')this._progress(task,{phase:'error',message:safe(p.error?.message||'Codex 正在重试连接。',1500)});
  }
  _item(task,item,completed){
    task.responded=true;task.items.set(item.id,item);this._watch(task,completed?300000:900000);
    if(item.type==='agentMessage'){
      const text=safe(item.text||task.messages.get(item.id)||'');task.messages.set(item.id,text);
      if(completed){task.lastMessage=text;this._emit(task,'message',{itemId:item.id,text});}
    }else if(item.type==='reasoning'){
      const text=Array.isArray(item.summary)?item.summary.filter(x=>typeof x==='string').join('\n'):'';
      this._progress(task,{phase:'thinking',itemId:item.id,isSummary:Boolean(text),message:safe(text||'正在思考…',8000)});
    }else if(item.type==='commandExecution')this._progress(task,{phase:'command',itemId:item.id,status:item.status,message:safe(item.command),output:safe(item.aggregatedOutput||'',8000)});
    else if(item.type==='fileChange')this._progress(task,{phase:'files',itemId:item.id,message:'正在更新工作区文件。'});
    else this._progress(task,{phase:item.type||'tool',itemId:item.id,message:item.type==='mcpToolCall'?safe(`${item.server} · ${item.tool}`):'正在处理任务…'});
  }
  _request(task,message){
    const p=message.params||{},kinds={'item/commandExecution/requestApproval':'command','item/fileChange/requestApproval':'files','item/permissions/requestApproval':'permissions'},kind=kinds[message.method];
    if(!kind||p.threadId!==task.threadId||task.turnId&&p.turnId!==task.turnId)return this._send(task,{id:message.id,error:{code:-32601,message:'This client cannot handle that request'}});
    if(task.runtime.approvalPolicy!=='on-request')return this._send(task,{id:message.id,result:kind==='permissions'?{permissions:{},scope:'turn'}:{decision:'decline'}});
    const item=task.items.get(p.itemId),details={};
    for(const key of ['reason','command','cwd','grantRoot','additionalPermissions','networkApprovalContext','permissions','kind'])if(p[key]!==undefined&&p[key]!==null)details[key]=p[key];
    if(kind==='files'&&item?.changes)details.changes=item.changes;
    const full=JSON.stringify(details,null,2),id=randomUUID(),canAccept=full.length<=64000&&(kind!=='command'||!p.kind||p.kind==='command')&&(kind!=='permissions'||p.permissions&&typeof p.permissions==='object'&&!Array.isArray(p.permissions))&&(!Array.isArray(p.availableDecisions)||p.availableDecisions.includes('accept'));
    const approval={id,kind,detail:full.length>64000?full.slice(0,63000)+'\n请求过长，无法在此批准。':full,canAccept,acceptLabel:kind==='files'&&p.grantRoot?'允许请求范围':'允许本次'};
    const permissions={};if(kind==='permissions')for(const key of ['network','fileSystem'])if(p.permissions?.[key]!==undefined)permissions[key]=structuredClone(p.permissions[key]);
    task.approvals.set(id,{rpcId:message.id,kind,permissions:kind==='permissions'?permissions:null,approval});
    clearTimeout(task.timer);this._emit(task,'approval-requested',{approval});
  }
  respondApproval(taskId,approvalId,decision){
    const task=this.tasks.get(taskId),request=task?.approvals.get(approvalId);
    if(!task||task.finished||!request)throw new Error('这个审批请求已失效。');
    if(!['accept','decline'].includes(decision))throw new Error('审批决定无效。');
    if(decision==='accept'&&!request.approval.canAccept)throw new Error('这个请求无法在桌宠中批准。');
    const result=request.kind==='permissions'?{permissions:decision==='accept'?request.permissions:{},scope:'turn'}:{decision};
    this._send(task,{id:request.rpcId,result});task.approvals.delete(approvalId);this._emit(task,'approval-resolved',{approvalId});this._watch(task,900000);return true;
  }
  _stop(task){
    try{task.child.stdin.end();}catch{}
    if(this.platform==='win32'&&Number.isInteger(task.child.pid)&&task.child.pid>0)this.execFile('taskkill.exe',['/PID',String(task.child.pid),'/T','/F'],{windowsHide:true},()=>{});
    else task.child.kill('SIGTERM');
  }
  _finish(task,type,payload){
    if(task.finished)return;task.finished=true;clearTimeout(task.timer);clearTimeout(task.cancelTimer);task.approvals.clear();this.tasks.delete(task.id);this._stop(task);this._emit(task,type,{...payload,durationMs:Date.now()-task.startedAt});
  }
  cancel(id=this.tasks.keys().next().value){
    const task=this.tasks.get(id);if(!task||task.finished||task.cancelled)return false;
    task.cancelled=true;clearTimeout(task.timer);this._progress(task,{phase:'cancelling',message:'正在停止任务…'});
    if(!task.turnId){this._finish(task,'task-cancelled',{message:'任务已停止。'});return true;}
    try{task.child.stdin.write(JSON.stringify({id:99,method:'turn/interrupt',params:{threadId:task.threadId,turnId:task.turnId}})+'\n');}catch{}
    task.cancelTimer=setTimeout(()=>this._finish(task,'task-cancelled',{message:'任务已停止。'}),this.options.stopTimeoutMs||3000);task.cancelTimer.unref?.();return true;
  }
  dispose(){for(const id of this.tasks.keys())this.cancel(id);}
  getActiveTasks(){return [...this.tasks.values()].map(t=>({taskId:t.id,cwd:t.cwd,threadId:t.threadId,status:'running',startedAt:t.startedAt}));}
}
module.exports={CodexInteractiveRunner};
