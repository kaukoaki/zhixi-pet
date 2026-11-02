'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ConversationStore}=require('../main/conversation-store.cjs');
const THREAD='01234567-89ab-4cde-8f01-23456789abcd';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhixi-conversation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return{root,file:path.join(root,'profile','conversations.json')};}
test('conversation references and last replies survive restart and remain isolated by workspace',t=>{
  const {root,file}=fixture(t),a=path.join(root,'a'),b=path.join(root,'b'),store=new ConversationStore(file);
  store.begin(a,'记住这个暗号',{model:'configured-model',effort:'high'});store.bind(a,THREAD);store.complete(a,'已记住');
  const reloaded=new ConversationStore(file),record=reloaded.begin(a,'上一句是什么');
  assert.equal(record.threadId,THREAD);assert.equal(record.turns,1);assert.equal(record.lastReply,'已记住');
  assert.equal(reloaded.current(b),null);assert.equal(reloaded.begin(b,'另一个目录').threadId,null);
  const copy=reloaded.current(a);copy.threadId=null;assert.equal(reloaded.current(a).threadId,THREAD);
});
test('new conversation disconnects the current workspace without deleting the old record',t=>{
  const {root,file}=fixture(t),store=new ConversationStore(file),old=store.begin(root,'old');store.bind(root,THREAD);store.complete(root,'old reply');
  const fresh=store.startNew(root);assert.notEqual(fresh.id,old.id);assert.equal(fresh.threadId,null);assert.equal(fresh.turns,0);
  const saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.sessions[old.id].lastReply,'old reply');
  assert.equal(new ConversationStore(file).current(root).id,fresh.id);
});
test('failed persistence keeps the prior reference and invalid thread ids cannot escape into resume arguments',t=>{
  const {root,file}=fixture(t),store=new ConversationStore(file);store.begin(root,'first');store.bind(root,THREAD);
  const before=fs.readFileSync(file,'utf8');assert.throws(()=>store.bind(root,'--last'),/编号/);
  t.mock.method(fs,'renameSync',()=>{throw Error('disk full');});
  assert.throws(()=>store.startNew(root),/disk full/);assert.equal(store.current(root).threadId,THREAD);assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('unreadable history is preserved rather than silently overwriting it with an empty session',t=>{
  const {root,file}=fixture(t);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'broken history');
  const store=new ConversationStore(file);assert.ok(store.warning);assert.throws(()=>store.begin(root,'hello'),/无法读取/);assert.equal(fs.readFileSync(file,'utf8'),'broken history');
});
