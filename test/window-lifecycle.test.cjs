'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {isWindowAlive,useWindow,hideWindow,sendWindow}=require('../main/window-lifecycle.cjs');
test('closed windows and destroyed web contents are ignored without calling native methods',()=>{
  for(const win of [null,{isDestroyed:()=>true},{isDestroyed:()=>false,webContents:{isDestroyed:()=>true}},{isDestroyed:()=>false,get webContents(){throw new TypeError('Object has been destroyed');}}]){
    assert.equal(isWindowAlive(win),false);assert.equal(hideWindow(win),false);assert.equal(sendWindow(win,'state',{}),false);
  }
});
test('a native destruction during an operation does not escape, but other programming errors do',()=>{
  const win={isDestroyed:()=>false,webContents:{isDestroyed:()=>false}};
  assert.equal(useWindow(win,()=>{throw new TypeError('Object has been destroyed');}),false);
  assert.equal(useWindow(win,()=>{throw new Error('Render frame was disposed before WebFrameMain could be accessed');}),false);
  assert.throws(()=>useWindow(win,()=>{throw new Error('unrelated bug');}),/unrelated bug/);
  let payload;win.webContents.send=(...args)=>{payload=args;};assert.equal(sendWindow(win,'state',{ready:true}),true);assert.deepEqual(payload,['state',{ready:true}]);
});
