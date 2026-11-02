'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const createJournalDrafts=require('../renderer/journal-drafts.js');
const date='2026-10-26',remote=(draft=null,revision=0)=>({date,day:{note:'',mood:'calm'},draft,draftRevision:revision});
function fixture(save){let id=0;const timers=new Map();return createJournalDrafts({save,setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key)});}
test('autosaves serialize edits made during an in-flight write and acknowledge the newest revision',async()=>{
 const calls=[];let resolveFirst;const drafts=fixture(input=>{calls.push(input);return calls.length===1?new Promise(resolve=>{resolveFirst=resolve;}):Promise.resolve({saved:true,revision:input.revision});});drafts.accept(remote());drafts.edit(date,{note:'A'});const flush=drafts.flush(date);drafts.edit(date,{note:'B'});resolveFirst({saved:true,revision:1});await flush;assert.deepEqual(calls.map(input=>[input.note,input.revision]),[['A',1],['B',2]]);assert.equal(drafts.get(date).acknowledgedRevision,2);assert.equal(drafts.get(date).note,'B');
});
test('a delayed background snapshot cannot replace local pending input',async()=>{
 const drafts=fixture(async input=>({saved:true,revision:input.revision}));drafts.accept(remote());drafts.edit(date,{note:'not yet saved'});drafts.accept(remote());assert.equal(drafts.get(date).note,'not yet saved');await drafts.flushAll();
});
test('a formal-save acknowledgement for an earlier revision cannot clear a later edit',async()=>{
 const drafts=fixture(async input=>({saved:true,revision:input.revision}));drafts.accept(remote());drafts.edit(date,{note:'A'});await drafts.flush(date);const capture=drafts.get(date);drafts.edit(date,{note:'B'});drafts.committed(date,capture);assert.equal(drafts.get(date).note,'B');assert.equal(drafts.get(date).dirty,true);await drafts.flushAll();
});
test('persisted drafts reload as acknowledged drafts and a newer committed tombstone clears them',()=>{
 const drafts=fixture(async input=>({saved:true,revision:input.revision}));drafts.accept(remote({note:'restored',mood:'happy',revision:4},4));assert.equal(drafts.get(date).note,'restored');assert.equal(drafts.get(date).acknowledgedRevision,4);assert.equal(drafts.get(date).dirty,true);drafts.accept({...remote(null,4),day:{note:'restored',mood:'happy'}});assert.equal(drafts.get(date).dirty,false);
});
test('failed flushes retain pending input and a later retry succeeds without discarding it',async()=>{
 let fail=true;const drafts=fixture(async input=>{if(fail)throw Error('disk full');return{saved:true,revision:input.revision};});drafts.accept(remote());drafts.edit(date,{note:'keep me'});assert.equal(await drafts.flushAll(),false);assert.equal(drafts.get(date).note,'keep me');assert.equal(drafts.get(date).error,true);fail=false;assert.equal(await drafts.flushAll(),true);assert.equal(drafts.get(date).acknowledgedRevision,1);
});
