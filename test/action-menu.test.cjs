'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildActionMenu } = require('../main/action-menu.cjs');
const flatten = items => items.flatMap(item => [item, ...flatten(item.submenu || [])]);

test('random idle toggle uses actual preferences and sends the selected value',()=>{
  const choices=[],state={settings:{randomIdle:false},actions:[]};
  const item=flatten(buildActionMenu(state,()=>{},{setRandomIdle:value=>choices.push(value)})).find(item=>item.id==='pet-random-idle');
  assert.equal(item.checked,false);assert.equal(item.type,'checkbox');item.click({checked:true});assert.deepEqual(choices,[true]);
});

test('idle remains reachable even before any video is installed', () => {
  const played = [];
  const items = buildActionMenu({ idle: { media: null }, actions: [] }, id => played.push(id));
  const idle = flatten(items).find(item => item.id === 'pet-idle-loop');
  const restore = items.find(item => item.id === 'pet-return-idle');
  assert.equal(idle.label, '原画待机');
  assert.notEqual(idle.enabled, false);
  idle.click();
  restore.click();
  assert.deepEqual(played, ['idle', 'idle']);
});

test('only installed ordinary and pomodoro actions are playable and each menu item plays its own slot', () => {
  const played = [];
  const groups = buildActionMenu({
    idle: { media: { file: 'idle.webm' } },
    actions: [
      { id: 'greeting', label: '打招呼', media: { file: 'greeting.webm' } },
      { id: 'drag', label: '被拎起来', media: null },
      { id: 'success', label: '做完啦', media: { file: 'success.webm' } }
    ],
    pomodoroActions: [
      { id: 'pomodoro-start', label: '就位开工', media: { file: 'start.webm' } },
      { id: 'pomodoro-study', label: '安静学习', media: null }
    ]
  }, id => played.push(id));
  const items = flatten(groups);
  assert.equal(items.filter(item => item.id === 'pet-idle-loop').length, 1);
  assert.equal(items.some(item => item.id === 'pet-action-drag'), false);
  items.find(item => item.id === 'pet-action-greeting').click();
  items.find(item => item.id === 'pet-action-success').click();
  const pomodoro = groups.find(item => item.id === 'pet-group-pomodoro');
  assert.equal(pomodoro.label, '番茄钟');
  assert.equal(pomodoro.submenu.find(item => item.id === 'pet-unavailable-pomodoro-study').enabled, false);
  pomodoro.submenu.find(item => item.id === 'pet-action-pomodoro-start').click();
  assert.deepEqual(played, ['greeting', 'success', 'pomodoro-start']);
});

test('actions are grouped and unavailable media is clearly disabled inside its category', () => {
  const ids = ['drag','greeting','thinking','working','success','error','return','focus','celebrate','sleep'];
  const actions = ids.map(id => ({ id, label: id, media: id === 'thinking' ? { file: 'thinking.webm' } : null }));
  const groups = buildActionMenu({ idle: { media: { file: 'idle.webm' } }, actions }, () => {});
  assert.deepEqual(groups.filter(item => item.submenu).map(item => item.label), ['待机','拖拽','点击回应','工作状态','陪伴与心情','休息']);
  const work = groups.find(item => item.id === 'pet-group-work').submenu;
  assert.equal(typeof work.find(item => item.id === 'pet-action-thinking').click, 'function');
  const missing = work.find(item => item.id === 'pet-unavailable-working');
  assert.equal(missing.enabled, false); assert.match(missing.label, /待添加/); assert.equal(missing.click, undefined);
  const allIds = flatten(groups).map(item => item.id).filter(Boolean);
  assert.equal(new Set(allIds).size, allIds.length);
});

test('importing the next action immediately makes it playable in the existing work category', () => {
  const played = [];
  const state = { actions: [{ id: 'working', label: '认真工作', media: null }] };
  assert.equal(flatten(buildActionMenu(state, id => played.push(id))).find(item => item.id === 'pet-unavailable-working').enabled, false);
  state.actions[0].media = { file: 'working.webm' };
  flatten(buildActionMenu(state, id => played.push(id))).find(item => item.id === 'pet-action-working').click();
  assert.deepEqual(played, ['working']);
});

test('pat joins click responses while greeting stays available and each plays its own action', () => {
  const played = [];
  const state = { actions: [
    { id: 'greeting', label: '打招呼', media: { file: 'greeting.webm' } },
    { id: 'pat', label: '摸摸头', media: null }
  ] };
  let click = buildActionMenu(state, id => played.push(id)).find(group => group.id === 'pet-group-click');
  assert.equal(click.submenu.find(item => item.id === 'pet-unavailable-pat').enabled, false);
  state.actions[1].media = { file: 'pat.webm' };
  click = buildActionMenu(state, id => played.push(id)).find(group => group.id === 'pet-group-click');
  assert.deepEqual(click.submenu.map(item => item.label), ['打招呼', '摸摸头']);
  click.submenu.find(item => item.id === 'pet-action-pat').click();
  click.submenu.find(item => item.id === 'pet-action-greeting').click();
  assert.deepEqual(played, ['pat', 'greeting']);
});

test('balance is a separate category with an empty wallet slot that becomes playable after import',()=>{
  const played=[],state={actions:[{id:'wallet',label:'查看钱包',media:null}]};
  let group=buildActionMenu(state,id=>played.push(id)).find(g=>g.id==='pet-group-balance');
  assert.equal(group.label,'余额');assert.equal(group.submenu[0].enabled,false);
  state.actions[0].media={file:'wallet.webm'};
  group=buildActionMenu(state,id=>played.push(id)).find(g=>g.id==='pet-group-balance');
  group.submenu[0].click();assert.deepEqual(played,['wallet']);
});

test('all five wallet actions remain together in the balance menu and play distinct media',()=>{
  const ids=['wallet','wallet-careful','wallet-low','wallet-empty','wallet-wait'],played=[];
  const state={actions:ids.map(id=>({id,label:id,media:{file:id+'.webm'}}))};
  const group=buildActionMenu(state,id=>played.push(id)).find(g=>g.id==='pet-group-balance');
  assert.equal(group.submenu.length,5);for(const item of group.submenu)item.click();assert.deepEqual(played,ids);
});
