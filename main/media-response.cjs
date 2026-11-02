'use strict';
const fs=require('node:fs'),path=require('node:path'),{Readable}=require('node:stream');
const MIME={'.webm':'video/webm','.mp4':'video/mp4','.mov':'video/quicktime','.png':'image/png'};
function parseRange(value,size){
  if(!value)return {start:0,end:size-1,partial:false};
  const match=/^bytes=(\d*)-(\d*)$/.exec(value.trim());if(!match||(!match[1]&&!match[2]))return null;
  let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  let end=match[1]&&match[2]?Number(match[2]):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||(!match[1]&&Number(match[2])<=0))return null;
  return {start,end:Math.min(end,size-1),partial:true};
}
async function mediaResponse(request,file,onError=()=>{}){
  const headers={'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes','Cache-Control':'no-store'};
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers});
  try{
    const stat=await fs.promises.stat(file);if(!stat.isFile()||!stat.size)throw new Error('Media file unavailable');
    headers['Content-Type']=MIME[path.extname(file).toLowerCase()]||'application/octet-stream';
    const range=parseRange(request.headers.get('range'),stat.size);
    if(!range)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${stat.size}`}});
    headers['Content-Length']=String(range.end-range.start+1);
    if(range.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${stat.size}`;
    if(request.method==='HEAD')return new Response(null,{status:range.partial?206:200,headers});
    if(request.signal?.aborted)return new Response(null,{status:499,headers});
    const input=fs.createReadStream(file,{start:range.start,end:range.end});
    const abort=()=>input.destroy();request.signal?.addEventListener('abort',abort,{once:true});
    input.once('close',()=>request.signal?.removeEventListener('abort',abort));
    input.on('error',error=>{if(!request.signal?.aborted&&error.code!=='ABORT_ERR'&&error.name!=='AbortError')onError(`read-failed:${error.code||'unknown'}`);});
    return new Response(Readable.toWeb(input),{status:range.partial?206:200,headers});
  }catch(error){onError(error.code==='ENOENT'?'file-missing':'open-failed');return new Response(null,{status:404,headers});}
}
module.exports={parseRange,mediaResponse};
