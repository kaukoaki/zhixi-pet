'use strict';
// Explicit offline maintenance. Close Zhixi before using; never run at startup.
const path=require('node:path'),{GardenStore}=require('../main/garden.cjs');
const [amount,reference,label]=process.argv.slice(2);
if(!process.env.APPDATA||!amount||!reference||!label||process.argv.length!==5)throw Error('Usage: node scripts/grant-coins.cjs <amount> <unique-reference> <label>');
const garden=new GardenStore(path.join(process.env.APPDATA,'QiqiCodexPet','garden.json'));
console.log(JSON.stringify(garden.grantCoins({amount:Number(amount),reference,label})));
