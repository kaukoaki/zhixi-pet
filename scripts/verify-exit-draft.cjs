'use strict';
// Dedicated smoke profile only. The caller verifies the file after Electron exits.
const fs=require('node:fs'),path=require('node:path');
module.exports=async function({ROOT,app,createJournalWindow,journal}){
 const win=createJournalWindow(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
 const until=Date.now()+5000;while(Date.now()<until){if(await win.webContents.executeJavaScript(`!!window.qiqiJournalDrafts&&!document.getElementById('note').disabled`))break;await pause(40);}
 const note='正常退出前最后输入的草稿 · '+Date.now();
 const value=await win.webContents.executeJavaScript(`(()=>{document.getElementById('tab-days').click();const field=document.getElementById('note');if(field.disabled)throw Error('Journal editor is unavailable');field.value=${JSON.stringify(note)};field.dispatchEvent(new Event('input'));return{date:document.getElementById('date').value,note:field.value};})()`);
 if(journal.snapshot(value.date).draft?.note===note)throw Error('Quit test must begin before the autosave debounce finishes.');
 fs.writeFileSync(path.join(ROOT,'.cache/020-expected-exit-draft.json'),JSON.stringify(value));app.quit();
};
