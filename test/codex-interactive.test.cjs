'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {CodexInteractiveRunner}=require('../main/codex-interactive.cjs');
const THREAD='01234567-89ab-4cde-8f01-23456789abcd';
function fixture(options={}){
 const child=new EventEmitter();child.pid=12345;child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();let buffer='';const sent=[];child.kill=signal=>{child.killed=signal;};child.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){sent.push(JSON.parse(buffer.slice(0,i)));buffer=buffer.slice(i+1);}});
 const runner=new CodexInteractiveRunner({cwd:process.cwd(),codexPath:'codex.exe',platform:'linux',spawnImpl:()=>child,...options}),events=[];runner.on('event',e=>events.push(e));
 const line=value=>child.stdout.write(JSON.stringify(value)+'\n');
 const start=()=>{runner.start('test',{runtime:{model:'chosen-model',effort:'low',sandbox:'read-only',approvalPolicy:'on-request'}});line({id:1,result:{}});line({id:2,result:{thread:{id:THREAD},model:'chosen-model',approvalPolicy:'on-request',approvalsReviewer:'user',sandbox:{type:'readOnly'}}});line({id:3,result:{turn:{id:'turn-1'}}});return runner.tasks.keys().next().value;};
 const request=(kind='command',rpcId=40,permissions)=>line({id:rpcId,method:`item/${kind==='files'?'fileChange':kind==='permissions'?'permissions':'commandExecution'}/requestApproval`,params:{threadId:THREAD,turnId:'turn-1',itemId:'tool-1',command:'node --version',reason:'Review this operation',permissions}});
 return{runner,child,sent,events,line,start,request};
}
test('interactive jobs use actual user approvals and stream summaries and replies without raw reasoning',()=>{
 const f=fixture(),id=f.start();const start=f.sent.find(x=>x.method==='thread/start');assert.equal(start.params.approvalPolicy,'on-request');assert.equal(start.params.approvalsReviewer,'user');assert.equal(start.params.sandbox,'read-only');assert.equal(f.sent.find(x=>x.method==='turn/start').params.effort,'low');
 f.line({method:'item/reasoning/summaryTextDelta',params:{threadId:THREAD,itemId:'r',summaryIndex:0,delta:'Checking'}});
 f.line({method:'item/reasoning/textDelta',params:{threadId:THREAD,itemId:'r',delta:'private reasoning'}});
 f.line({method:'item/agentMessage/delta',params:{threadId:THREAD,itemId:'a',delta:'Hello'}});f.line({method:'item/completed',params:{threadId:THREAD,item:{id:'a',type:'agentMessage',text:'Hello'}}});f.line({method:'turn/completed',params:{threadId:THREAD,turn:{id:'turn-1',status:'completed',items:[]}}});
 assert.equal(f.events.at(-1).type,'task-completed');assert.equal(f.events.at(-1).text,'Hello');assert.equal(f.runner.tasks.size,0);assert.ok(f.events.some(e=>e.isSummary&&e.message==='Checking'));assert.doesNotMatch(JSON.stringify(f.events),/private reasoning/);assert.equal(f.runner.cancel(id),false);
});
test('approval is never answered until a user decision, and a resolved request cannot be replayed',()=>{
 const f=fixture(),id=f.start();f.request();const approval=f.events.at(-1).approval;
 assert.equal(f.sent.some(x=>x.id===40),false);assert.match(approval.detail,/node --version/);
 f.runner.respondApproval(id,approval.id,'accept');assert.deepEqual(f.sent.at(-1),{id:40,result:{decision:'accept'}});assert.throws(()=>f.runner.respondApproval(id,approval.id,'accept'),/失效/);
 f.request('files',41);const fileApproval=f.events.at(-1).approval;assert.throws(()=>f.runner.respondApproval(id,fileApproval.id,'acceptForSession'),/决定/);f.runner.respondApproval(id,fileApproval.id,'decline');assert.equal(f.sent.at(-1).result.decision,'decline');f.runner.cancel(id);f.line({method:'turn/completed',params:{threadId:THREAD,turn:{status:'interrupted'}}});
});
test('permission grants are limited to exactly requested fields and the current turn',()=>{
 const f=fixture(),id=f.start(),permissions={network:{enabled:true},fileSystem:{write:['/reviewed/path']}};f.request('permissions',50,permissions);const approval=f.events.at(-1).approval;
 f.runner.respondApproval(id,approval.id,'accept');assert.deepEqual(f.sent.at(-1),{id:50,result:{permissions,scope:'turn'}});f.runner.cancel(id);f.line({method:'turn/completed',params:{threadId:THREAD,turn:{status:'interrupted'}}});
});
test('approval for another thread and unsupported server requests cannot be granted',()=>{
 const f=fixture(),id=f.start();f.line({id:60,method:'item/commandExecution/requestApproval',params:{threadId:'another',turnId:'turn-1'}});assert.ok(f.sent.at(-1).error);assert.equal(f.events.some(e=>e.type==='approval-requested'),false);
 f.line({id:61,method:'account/chatgptAuthTokens/refresh',params:{}});assert.ok(f.sent.at(-1).error);f.runner.cancel(id);f.line({method:'turn/completed',params:{threadId:THREAD,turn:{status:'interrupted'}}});
});
test('a server policy mismatch stops before turn start instead of silently dropping approval protection',()=>{
 const f=fixture();f.runner.start('test',{runtime:{sandbox:'read-only',approvalPolicy:'on-request'}});f.line({id:1,result:{}});f.line({id:2,result:{thread:{id:THREAD},approvalPolicy:'never',sandbox:{type:'readOnly'}}});assert.equal(f.events.at(-1).type,'task-failed');assert.match(f.events.at(-1).error,/审批方式/);assert.equal(f.sent.some(x=>x.method==='turn/start'),false);
});
test('waiting for a human does not time out, and cancel interrupts without answering pending approvals',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture({connectionTimeoutMs:100,stopTimeoutMs:10}),id=f.start();f.request();t.mock.timers.tick(1000000);assert.equal(f.runner.tasks.size,1);assert.equal(f.sent.some(x=>x.id===40),false);
 f.runner.cancel(id);assert.equal(f.sent.at(-1).method,'turn/interrupt');t.mock.timers.tick(10);assert.equal(f.events.at(-1).type,'task-cancelled');assert.equal(f.sent.some(x=>x.id===40),false);assert.equal(f.runner.tasks.size,0);
});

test('missing policy evidence, a different sandbox, or an automatic reviewer cannot start a turn',()=>{
 for(const patch of [{approvalPolicy:undefined},{sandbox:{type:'dangerFullAccess'}},{approvalsReviewer:'auto_review'}]){
  const f=fixture();f.runner.start('test',{runtime:{sandbox:'read-only',approvalPolicy:'on-request'}});f.line({id:1,result:{}});
  f.line({id:2,result:{thread:{id:THREAD},approvalPolicy:'on-request',sandbox:{type:'readOnly'},approvalsReviewer:'user',...patch}});
  assert.equal(f.events.at(-1).type,'task-failed');assert.equal(f.sent.some(x=>x.method==='turn/start'),false);
 }
});
