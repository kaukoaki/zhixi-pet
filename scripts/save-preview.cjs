'use strict';
const fs=require('node:fs');
// Functional smoke checks can run without a visible compositor. Never create a fake screenshot.
module.exports=async function savePreview(window,file){
  if(process.argv.includes('--skip-preview-capture'))return false;
  fs.writeFileSync(file,(await window.webContents.capturePage()).toPNG());return true;
};
