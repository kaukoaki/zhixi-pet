'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),createView=require('../renderer/task-view.js');
test('streaming and completed replies replace the same message instead of duplicating it',()=>{
  const v=createView();v.apply({type:'message-delta',itemId:'a',text:'你好',delta:'你好'});v.apply({type:'message-delta',itemId:'a',text:'你好，知栖',delta:'，知栖'});v.apply({type:'message',itemId:'a',text:'你好，知栖'});v.apply({type:'task-completed',text:'你好，知栖'});
  assert.equal(v.snapshot().reply,'你好，知栖');assert.equal(v.snapshot().finished,true);
});
test('public summaries and command output are visible separately and do not replace the reply',()=>{
  const v=createView();v.apply({type:'progress',phase:'thinking',isSummary:true,message:'检查目录和依赖'});v.apply({type:'progress',phase:'command',message:'node --version',output:'v24.0.0'});v.apply({type:'message',text:'完成'});
  const view=v.snapshot();assert.equal(view.thought,'检查目录和依赖');assert.match(view.activity,/node --version\nv24.0.0/);assert.equal(view.reply,'完成');
});
test('no summary is invented for a simple answer and failures remain visible after transport progress',()=>{
  const v=createView();v.apply({type:'progress',phase:'thinking',isSummary:false,message:'正在思考…'});assert.equal(v.snapshot().thought,'');
  v.apply({type:'task-failed',error:'连接模型超时'});assert.equal(v.snapshot().display,'连接模型超时');
  v.reset('上次回复');assert.equal(v.snapshot().reply,'上次回复');assert.equal(v.snapshot().failure,'');assert.equal(v.snapshot().activity,'');
});
