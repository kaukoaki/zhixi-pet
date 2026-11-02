'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,output=path.join(root,'releases');
function git(args){const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stderr||'Git source archive failed');return result.stdout.trim();}
if(git(['diff','--name-only']))throw new Error('Stage intended changes before creating the source archive');
fs.mkdirSync(output,{recursive:true});if(fs.lstatSync(output).isSymbolicLink())throw new Error('Release directory must not be a symlink');
const tree=git(['write-tree']),target=path.join(output,`Zhixi-${version}-source.zip`);
git(['archive','--format=zip','--prefix=Zhixi-source/','-o',target,tree]);
const sha=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');fs.writeFileSync(target+'.sha256',`${sha}  ${path.basename(target)}\n`);
console.log(JSON.stringify({archive:target,sha256:sha,bytes:fs.statSync(target).size,indexTree:tree}));
