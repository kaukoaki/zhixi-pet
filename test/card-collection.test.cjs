'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {JournalStore}=require('../main/journal.cjs'),{GardenStore}=require('../main/garden.cjs');
const FACE_FIELDS=['title','text','icon','goal','label','progress','theme','motif'];
const CROP_CARDS=['harvest-tomato','harvest-strawberry','harvest-watermelon'];
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'zhixi-cards-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 let time=Date.parse('2026-10-26T10:00:00+08:00');const now=()=>time,timeZone='Asia/Shanghai';
 const journalFile=path.join(directory,'journal.json'),gardenFile=path.join(directory,'garden.json');
 let journal=new JournalStore(journalFile,{now,timeZone}),garden=new GardenStore(gardenFile,{now,timeZone,quote:()=>100});
 journal.visit();assert.equal(journal.flush(),true);
 const card=id=>journal.snapshot().cards.find(card=>card.id===id);
 const sync=()=>journal.syncGarden(garden.memories());
 const plantAll=(crops=['tomato','strawberry','watermelon'])=>crops.forEach((crop,i)=>garden.command({type:'plant',plotId:'plot-'+(i+1),crop}));
 const grow=()=>{for(let day=0;day<10;day++){if(day)time+=86400000;garden.command({type:'water'});}};
 const harvest=plotId=>garden.command({type:'harvest',plotId});
 const sellAll=()=>{for(const batch of garden.snapshot().inventory)garden.command({type:'sell',batchId:batch.id});};
 return{directory,journalFile,gardenFile,get journal(){return journal;},get garden(){return garden;},card,sync,plantAll,grow,harvest,sellAll,
  nextDay:()=>{time+=86400000;},reload:()=>{journal=new JournalStore(journalFile,{now,timeZone});garden=new GardenStore(gardenFile,{now,timeZone,quote:()=>100});}
 };
}
function assertNoFace(card){for(const key of FACE_FIELDS)assert.equal(Object.hasOwn(card,key),false,`sealed card exposed ${key}`);}
function assertUnlocked(f,id){const card=f.card(id);assert.ok(card,`${id} should be unlocked`);assert.equal(card.locked,false);assert.ok(card.earnedOn);return card;}

test('locked snapshots reveal only opaque slots, and freshly earned cards still withhold their faces until opened',t=>{
 const f=fixture(t),cards=f.journal.snapshot().cards,locked=cards.filter(card=>card.locked);
 assert.ok(locked.length>=CROP_CARDS.length);
 for(const card of locked){assert.deepEqual(Object.keys(card).sort(),['earnedOn','locked','slot']);assert.equal(card.earnedOn,null);assertNoFace(card);}
 const hello=assertUnlocked(f,'hello');assert.equal(hello.opened,false);assert.deepEqual(Object.keys(hello).sort(),['earnedOn','id','locked','opened','slot']);assertNoFace(hello);
 for(const id of CROP_CARDS)assert.throws(()=>f.journal.revealCard(id));
});

test('each fruit unlocks only when harvested, all three unlock a collection card, and selling never removes the reward',t=>{
 const f=fixture(t);f.plantAll();f.grow();f.sync();
 assert.equal(f.garden.snapshot().plots.filter(plot=>plot.ready).length,3);
 for(const id of [...CROP_CARDS,'harvest-bouquet']){assert.equal(f.card(id),undefined);assert.throws(()=>f.journal.revealCard(id));}
 for(let i=0;i<3;i++){
  f.harvest('plot-'+(i+1));f.sync();assertUnlocked(f,CROP_CARDS[i]);
  for(let pending=i+1;pending<3;pending++)assert.equal(f.card(CROP_CARDS[pending]),undefined);
  if(i<2)assert.equal(f.card('harvest-bouquet'),undefined);
 }
 assertUnlocked(f,'harvest-bouquet');const earned=Object.fromEntries([...CROP_CARDS,'harvest-bouquet'].map(id=>[id,f.card(id).earnedOn]));
 assert.equal(f.garden.snapshot().coins,0);f.sellAll();const coins=f.garden.snapshot().coins;assert.equal(coins,300);f.sync();assert.equal(f.garden.snapshot().coins,coins);
 f.reload();f.sync();assert.equal(f.garden.snapshot().inventory.length,0);
 for(const[id,date]of Object.entries(earned))assert.equal(assertUnlocked(f,id).earnedOn,date);
 assert.deepEqual(f.garden.memories().values,{tomato:1,strawberry:1,watermelon:1,harvestTypes:3,harvests:3,waterDays:10,sales:3,ornaments:0});
});

test('first sale and first purchased ornament unlock independently without changing coins during card synchronization',t=>{
 const f=fixture(t);f.plantAll(['tomato','tomato','tomato']);f.grow();f.harvest('plot-1');f.sync();assert.equal(f.card('first-sale'),undefined);assert.equal(f.card('first-ornament'),undefined);
 const batch=f.garden.snapshot().inventory[0];f.garden.command({type:'sell',batchId:batch.id});f.sync();assertUnlocked(f,'first-sale');assert.equal(f.garden.snapshot().coins,100);assert.equal(f.card('first-ornament'),undefined);
 f.garden.command({type:'buy',itemId:'ornament-star'});const before=f.garden.snapshot().coins;assert.equal(before,10);f.sync();assertUnlocked(f,'first-ornament');assert.equal(f.garden.snapshot().coins,before);
 assert.equal(f.garden.memories().values.ornaments,1);f.garden.command({type:'equip',itemId:'ornament-none'});f.sync();assertUnlocked(f,'first-ornament');assert.equal(f.garden.memories().values.ornaments,1);
});

test('first fruit evidence remains available beyond the twenty-entry public ledger window',t=>{
 const f=fixture(t);
 for(let cycle=0;cycle<7;cycle++){
  if(cycle)f.nextDay();f.plantAll(cycle?['strawberry','strawberry','strawberry']:['tomato','strawberry','strawberry']);f.grow();
  for(let i=1;i<=3;i++)f.harvest('plot-'+i);f.sellAll();
 }
 assert.equal(f.garden.snapshot().ledger.length,20);assert.ok(!f.garden.snapshot().ledger.some(entry=>entry.name==='番茄'));
 f.reload();const values=f.garden.memories().values;assert.equal(values.tomato,1);assert.equal(values.strawberry,20);assert.equal(values.harvests,21);assert.equal(values.sales,21);assert.equal(values.harvestTypes,2);
 f.sync();assertUnlocked(f,'harvest-tomato');assert.equal(f.card('harvest-watermelon'),undefined);
});

test('watering and harvest milestones use their actual totals and never the number of plots watered',t=>{
 const f=fixture(t);
 for(let cycle=0;cycle<10;cycle++){
  if(cycle)f.nextDay();f.plantAll();f.grow();f.sync();
  if(cycle===0){assert.equal(f.garden.memories().values.waterDays,10);assertUnlocked(f,'water-ten');assert.equal(f.card('water-thirty'),undefined);}
  if(cycle===2){assertUnlocked(f,'water-thirty');assert.equal(f.card('harvest-ten'),undefined);}
  for(let i=1;i<=3;i++){
   f.harvest('plot-'+i);f.sync();const count=f.garden.memories().values.harvests;
   if(count===9)assert.equal(f.card('harvest-ten'),undefined);
   if(count===10)assertUnlocked(f,'harvest-ten');
   if(count===29)assert.equal(f.card('harvest-thirty'),undefined);
  }
 }
 assert.equal(f.garden.memories().values.harvests,30);assert.equal(f.garden.memories().values.waterDays,100);assertUnlocked(f,'harvest-thirty');
});

test('opening a card persists its face and cannot change its original earned date on a repeat open',t=>{
 const f=fixture(t),earned=f.card('hello').earnedOn,opened=f.journal.revealCard('hello');
 for(const key of ['id','slot','title','text','icon','theme','motif','earnedOn','opened','locked'])assert.ok(Object.hasOwn(opened,key),`opened card missing ${key}`);
 assert.equal(opened.opened,true);assert.equal(opened.locked,false);assert.equal(opened.earnedOn,earned);assert.ok(opened.title&&opened.text&&opened.icon);
 f.reload();assert.equal(f.card('hello').opened,true);assert.equal(f.card('hello').title,opened.title);f.nextDay();assert.equal(f.journal.revealCard('hello').earnedOn,earned);
});

test('old earned cards migrate as already opened without changing existing dates or journal notes',t=>{
 const f=fixture(t),saved=JSON.parse(fs.readFileSync(f.journalFile,'utf8')),oldDate='2026-10-20';
 saved.cards.hello={earnedOn:oldDate};saved.days['2026-10-26'].note='老版本留下的小记';fs.writeFileSync(f.journalFile,JSON.stringify(saved));f.reload();
 const card=f.card('hello');assert.equal(card.earnedOn,oldDate);assert.equal(card.opened,true);assert.ok(card.title);assert.equal(f.journal.snapshot().day.note,'老版本留下的小记');assert.equal(f.journal.revealCard('hello').earnedOn,oldDate);
});

test('a failed card-open save leaves both the persisted and public card sealed',t=>{
 const f=fixture(t),before=fs.readFileSync(f.journalFile,'utf8');assert.equal(f.card('hello').opened,false);
 t.mock.method(fs,'renameSync',()=>{throw Error('disk full');});assert.throws(()=>f.journal.revealCard('hello'));
 assert.equal(fs.readFileSync(f.journalFile,'utf8'),before);const sealed=f.card('hello');assert.equal(sealed.opened,false);assertNoFace(sealed);
});
