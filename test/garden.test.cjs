'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GardenStore}=require('../main/garden.cjs');
function fixture(t,quote=()=>80){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhixi-garden-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let time=Date.parse('2026-10-26T10:00:00+08:00');const file=path.join(root,'garden.json'),options={now:()=>time,timeZone:'Asia/Shanghai',quote};let store=new GardenStore(file,options);
 const plant=(crop='tomato',plotId='plot-1')=>store.command({type:'plant',plotId,crop});
 const grow=()=>{for(let i=0;i<10;i++){if(i)time+=86400000;store.command({type:'water'});}};
 return{file,root,get store(){return store;},plant,grow,day:(days=1)=>{time+=days*86400000;},reload:()=>store=new GardenStore(file,options)};
}
test('three free planting slots grow only on distinct watering check-in days; gaps do not wilt plants',t=>{
 const f=fixture(t);for(const[crop,id]of[['tomato','plot-1'],['strawberry','plot-2'],['watermelon','plot-3']])f.plant(crop,id);
 f.store.command({type:'water'});assert.equal(f.store.snapshot().checkIns,1);assert.deepEqual(f.store.snapshot().plots.map(p=>p.progress),[1,1,1]);assert.throws(()=>f.store.command({type:'water'}),/今天/);
 f.day(30);assert.deepEqual(f.store.snapshot().plots.map(p=>p.progress),[1,1,1]);f.store.command({type:'water'});assert.equal(f.store.snapshot().plots[0].progress,2);assert.equal(f.store.snapshot().coins,0);assert.throws(()=>f.store.command({type:'harvest',plotId:'plot-1'}),/成熟/);
});
test('ten check-in days mature a crop, harvest quotes remain fixed after restart, and a sale credits exactly once',t=>{
 const f=fixture(t,()=>100);f.plant();f.grow();assert.equal(f.store.snapshot().plots[0].ready,true);f.store.command({type:'harvest',plotId:'plot-1'});const batch=f.store.snapshot().inventory[0];assert.equal(batch.price,100);
 f.reload();assert.equal(f.store.snapshot().inventory[0].price,100);f.store.command({type:'sell',batchId:batch.id});assert.equal(f.store.snapshot().coins,100);assert.throws(()=>f.store.command({type:'sell',batchId:batch.id}),/重复/);f.reload();assert.equal(f.store.snapshot().coins,100);assert.equal(f.store.snapshot().inventory.length,0);assert.equal(f.store.snapshot().ledger[0].delta,100);
});
test('harvesting and replanting cannot grant the same plot a second growth day on that date',t=>{
 const f=fixture(t,()=>50);f.plant();f.grow();f.store.command({type:'harvest',plotId:'plot-1'});f.plant('strawberry');assert.throws(()=>f.store.command({type:'water',plotId:'plot-1'}),/今天/);f.day();f.store.command({type:'water'});assert.equal(f.store.snapshot().plots[0].progress,1);assert.equal(f.store.snapshot().inventory[0].price,50);
});
test('purchases cannot overdraw, ownership and equipment persist, and owned goods never charge again',t=>{
 const f=fixture(t,()=>100);assert.throws(()=>f.store.command({type:'buy',itemId:'pot-mint'}),/不够/);f.plant();f.grow();f.store.command({type:'harvest',plotId:'plot-1'});f.store.command({type:'sell',batchId:f.store.snapshot().inventory[0].id});f.store.command({type:'buy',itemId:'pot-mint'});assert.equal(f.store.snapshot().coins,20);assert.equal(f.store.snapshot().appearance.pot,'mint');
 f.store.command({type:'buy',itemId:'pot-mint'});assert.equal(f.store.snapshot().coins,20);f.store.command({type:'equip',itemId:'pot-clay'});f.reload();assert.equal(f.store.snapshot().coins,20);assert.equal(f.store.snapshot().appearance.pot,'clay');f.store.command({type:'equip',itemId:'pot-mint'});assert.equal(f.store.snapshot().appearance.pot,'mint');assert.equal(f.store.snapshot().ledger.filter(e=>e.kind==='purchase').length,1);
});
test('failed saves do not consume inventory, grant coins, or change the published state, and retain a previous backup',t=>{
 const f=fixture(t);f.plant();f.grow();f.store.command({type:'harvest',plotId:'plot-1'});const before=fs.readFileSync(f.file,'utf8'),batch=f.store.snapshot().inventory[0];assert.ok(fs.existsSync(f.file+'.bak'));
 t.mock.method(fs,'renameSync',()=>{throw Error('disk full');});assert.throws(()=>f.store.command({type:'sell',batchId:batch.id}),/尚未生效/);assert.equal(f.store.snapshot().coins,0);assert.equal(f.store.snapshot().inventory[0].id,batch.id);assert.equal(fs.readFileSync(f.file,'utf8'),before);
});
test('corrupt coin ledgers are read only and never reset or overwrite the original account',t=>{
 const f=fixture(t);f.plant();const edited=JSON.parse(fs.readFileSync(f.file,'utf8'));edited.coins=999;fs.writeFileSync(f.file,JSON.stringify(edited));const original=fs.readFileSync(f.file,'utf8');f.reload();assert.equal(f.store.snapshot().coins,null);assert.equal(f.store.snapshot().readOnly,true);assert.throws(()=>f.store.command({type:'water'}),/存档/);assert.equal(fs.readFileSync(f.file,'utf8'),original);
});
test('clock rollback, invalid identifiers and client-supplied prices cannot mint rewards',t=>{
 const f=fixture(t);f.plant();f.store.command({type:'water'});f.day(-1);assert.throws(()=>f.store.command({type:'water'}),/日期/);f.day();assert.throws(()=>f.store.command({type:'sell',batchId:'fake',price:100000}),/无效/);assert.throws(()=>f.store.command({type:'plant',plotId:'plot-9',crop:'fake'}),/请选择/);
});
