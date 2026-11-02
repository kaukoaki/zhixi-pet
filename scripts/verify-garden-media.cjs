'use strict';
module.exports=async function(win){
 return win.webContents.executeJavaScript(`(async()=>{
  const reports=[];
  for(const clip of Object.values(snapshot.garden.sceneLibrary.clips)){
   const video=document.createElement('video');video.muted=true;video.crossOrigin='anonymous';video.preload='auto';video.style.display='none';document.body.append(video);
   const canvas=document.createElement('canvas');canvas.width=canvas.height=640;const ctx=canvas.getContext('2d',{willReadFrequently:true});
   try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Garden video timeout: '+clip.id)),8000);video.onloadeddata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(Error('Garden video decode: '+clip.id));};video.src=clip.url;});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Garden seek timeout: '+clip.id)),8000);video.onseeked=()=>{clearTimeout(timer);resolve();};video.currentTime=Math.min(video.duration/2,2);});
    ctx.drawImage(video,0,0);const pixels=ctx.getImageData(0,0,640,640).data;let transparent=0,opaque=0;
    for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]===255)opaque++;}
    const image=new Image();image.crossOrigin='anonymous';image.src=clip.poster;await image.decode();
    const report={id:clip.id,width:video.videoWidth,height:video.videoHeight,seconds:video.duration,transparent:transparent/(640*640),opaque:opaque/(640*640),poster:image.naturalWidth===640};
    if(report.width!==640||report.height!==640||report.transparent<.3||report.opaque<.10||!report.poster)throw Error('Garden alpha or poster failed: '+clip.id);
    reports.push(report);
   }finally{video.pause();video.removeAttribute('src');video.load();video.remove();}
  }
  return reports;
 })()`);
};
