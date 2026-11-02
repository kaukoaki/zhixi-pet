'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {JournalStore}=require('../main/journal.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhixi-drafts-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'journal.json'),options={timeZone:'Asia/Shanghai',now:()=>Date.parse('2026-10-26T12:00:00+08:00')};const journal=new JournalStore(file,options);journal.visit();journal.flush();return{file,journal,reload:()=>new JournalStore(file,options)};}
const draft=(note,revision,date='2026-10-26')=>({date,note,mood:'happy',revision});
test('drafts survive restart without becoming a journal entry or unlocking the first-note reward',t=>{
 const f=fixture(t);assert.equal(f.journal.saveDraft(draft(' 还没写完 <b>  ',1)).saved,true);const loaded=f.reload().snapshot();assert.equal(loaded.draft.note,' 还没写完 <b>  ');assert.equal(loaded.day.note,'');assert.equal(loaded.draftRevision,1);assert.ok(!loaded.cards.some(card=>card.id==='first-note'));
});
test('out-of-order autosaves cannot replace a newer draft and retrying the same revision is idempotent',t=>{
 const f=fixture(t);f.journal.saveDraft(draft('newest',3));assert.equal(f.journal.saveDraft(draft('old',2)).stale,true);assert.equal(f.journal.saveDraft(draft('newest',3)).saved,true);assert.equal(f.journal.saveDraft(draft('conflicting',3)).stale,true);assert.equal(f.journal.snapshot().draft.note,'newest');
});
test('a formal save clears its exact draft and late autosaves cannot resurrect it after restart',t=>{
 const f=fixture(t);f.journal.saveDraft(draft('done',4));f.journal.saveDay({date:'2026-10-26',note:'done',mood:'happy',draftRevision:4});let loaded=f.reload();assert.equal(loaded.snapshot().draft,null);assert.equal(loaded.snapshot().day.note,'done');assert.equal(loaded.snapshot().draftRevision,4);assert.equal(loaded.saveDraft(draft('done',4)).stale,true);assert.ok(loaded.snapshot().cards.some(card=>card.id==='first-note'));
});
test('newer input survives when an earlier formal save completes',t=>{
 const f=fixture(t);f.journal.saveDraft(draft('new text while saving',6));f.journal.saveDay({date:'2026-10-26',note:'earlier captured text',mood:'calm',draftRevision:5});const loaded=f.reload().snapshot();assert.equal(loaded.day.note,'earlier captured text');assert.equal(loaded.draft.note,'new text while saving');assert.equal(loaded.draft.revision,6);
});
test('drafts belong to separate visited dates and invalid or future inputs cannot change them',t=>{
 const f=fixture(t);f.journal.visit(Date.parse('2026-10-25T12:00:00+08:00'));f.journal.saveDraft(draft('today',1));f.journal.saveDraft(draft('yesterday',1,'2026-10-25'));assert.equal(f.journal.snapshot('2026-10-25').draft.note,'yesterday');assert.equal(f.journal.snapshot().draft.note,'today');assert.throws(()=>f.journal.saveDraft(draft('future',1,'2026-10-27')),/日期/);assert.throws(()=>f.journal.saveDraft(draft('bad revision',0)),/格式/);assert.throws(()=>f.journal.saveDraft(draft('x'.repeat(601),2)),/格式/);
});
test('failed draft writes do not report success or replace a previously saved draft',t=>{
 const f=fixture(t);f.journal.saveDraft(draft('safe',1));const before=fs.readFileSync(f.file,'utf8');t.mock.method(fs,'renameSync',()=>{throw Error('disk full');});assert.throws(()=>f.journal.saveDraft(draft('not saved',2)),/保存/);assert.equal(f.journal.snapshot().draft.note,'safe');assert.equal(f.journal.snapshot().draftRevision,1);assert.equal(fs.readFileSync(f.file,'utf8'),before);
});
