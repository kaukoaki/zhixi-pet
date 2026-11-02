'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {TaskRunner}=require('../main/task-runner.cjs');
function transport(name){const runner=new EventEmitter();runner.tasks=new Map();runner.start=()=>{runner.tasks.set(name,{id:name});return name;};runner.cancel=id=>runner.tasks.delete(id);runner.getActiveTasks=()=>[...runner.tasks.values()];runner.dispose=()=>runner.tasks.clear();runner.respondApproval=(...args)=>args;return runner;}
test('tasks route to interactive approval or explicit noninteractive execution and share one active slot',()=>{
  const cli=transport('cli'),interactive=transport('interactive'),runner=new TaskRunner({cli,interactive}),events=[];runner.on('event',e=>events.push(e));
  assert.equal(runner.start('hello'),'interactive');assert.equal(runner.getActiveTasks()[0].id,'interactive');assert.throws(()=>runner.start('other',{runtime:{approvalPolicy:'never'}}),/已有任务/);
  assert.deepEqual(runner.respondApproval('task','request','decline'),['task','request','decline']);interactive.emit('event',{type:'approval-resolved'});assert.equal(events[0].type,'approval-resolved');
  assert.equal(runner.cancel(),true);assert.equal(runner.start('hello',{runtime:{approvalPolicy:'never'}}),'cli');assert.equal(runner.tasks.size,1);runner.dispose();assert.equal(runner.tasks.size,0);
});
