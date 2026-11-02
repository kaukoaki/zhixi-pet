'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const createPetGestures = require('../renderer/gestures.js');
function fixture() {
  let time=0,id=0;const timers=new Map(),events=[];
  const gestures=createPetGestures({now:()=>time,setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),getDoubleClickMs:()=>500,
    onSingleClick:()=>events.push('single'),onDoubleClick:()=>events.push('double'),onDragStart:()=>events.push('start'),onDragMove:d=>events.push(d),onDragEnd:()=>events.push('end')});
  function tick(ms){time+=ms;for(const [id,t]of timers)if(t.at<=time){timers.delete(id);t.fn();}}
  const e=(x=100,y=100,more={})=>({button:0,buttons:1,pointerId:1,isPrimary:true,screenX:x,screenY:y,...more});
  return {g:gestures,events,e,tick};
}
test('repeated small hand jitter remains a single click without pausing or moving the pet',()=>{
  const f=fixture();f.g.down(f.e());for(let i=0;i<100;i++)f.g.move(f.e(100+(i%2?2:-2),100));f.g.up(f.e());f.tick(499);assert.deepEqual(f.events,[]);f.tick(1);assert.deepEqual(f.events,['single']);
});
test('drag starts promptly at displacement threshold and never clicks even after returning to origin',()=>{
  const f=fixture();f.g.down(f.e());f.g.move(f.e(108,100));f.g.move(f.e(100,100));f.g.up(f.e());f.tick(1000);
  assert.deepEqual(f.events,['start',{dx:8,dy:0},{dx:-8,dy:0},{dx:0,dy:0},'end']);
});
test('double click respects Windows timing and never opens the usage bubble first',()=>{
  const f=fixture();f.g.down(f.e());f.g.up(f.e());f.tick(380);f.g.down(f.e(102));f.tick(20);f.g.up(f.e(102));f.tick(1000);assert.deepEqual(f.events,['double']);
});
test('a drag on the second press cancels a pending click and releases once on capture loss',()=>{
  const f=fixture();f.g.down(f.e());f.g.up(f.e());f.tick(30);f.g.down(f.e());f.g.move(f.e(120));f.g.abort();f.g.abort();f.tick(1000);assert.deepEqual(f.events,['start',{dx:20,dy:0},'end']);
});
test('long hold, right click, unrelated pointer, cancelled input and missing buttons do not become clicks',()=>{
  const f=fixture();assert.equal(f.g.down(f.e(100,100,{button:2})),false);
  f.g.down(f.e());f.g.move(f.e(150,100,{pointerId:2}));f.tick(700);f.g.up(f.e());f.tick(1000);assert.deepEqual(f.events,[]);
  f.g.down(f.e());f.g.abort();f.g.up(f.e());f.tick(1000);assert.deepEqual(f.events,[]);
  f.g.down(f.e());f.g.move(f.e(120));f.g.move(f.e(121,100,{buttons:0}));f.g.up(f.e(121));f.tick(1000);assert.equal(f.events.filter(e=>e==='end').length,1);assert.equal(f.g.held,false);
});
test('coalesced final movement on pointerup is treated as a drag',()=>{
  const f=fixture();f.g.down(f.e());f.g.up(f.e(120,110));f.tick(1000);assert.deepEqual(f.events,['start',{dx:20,dy:10},'end']);
});
