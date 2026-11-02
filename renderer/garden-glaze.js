'use strict';
(()=>{
 const region=Object.freeze({x:55,y:438,width:196,height:146});
 function recolor(image,style,origin=region){
  if(!['mint','cloud'].includes(style))return 0;
  const a=image.data,target=style==='mint'?[137,195,171]:[228,220,241];let changed=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
   const gx=x+origin.x,gy=y+origin.y;if(gx<55||gx>=251||gy<438||gy>=584)continue;
   const i=(y*image.width+x)*4,r=a[i],g=a[i+1],b=a[i+2];
   if(a[i+3]<100||r<96||r>235||r-g<18||g-b<8||r-b<55||g-b<.18*(r-b))continue;
   // Leave the soil ellipse intact; only inspected terracotta pixels are tinted.
   if(gy<465&&((gx-150)/75)**2+((gy-452)/12)**2<1)continue;
   const light=.299*r+.587*g+.114*b,strength=Math.min(1,(r-g-16)/18,(g-b-6)/14,(light-45)/30);
   if(strength<=0)continue;
   const shade=style==='mint'?.62+light/310:.68+light/430;
   for(let c=0;c<3;c++)a[i+c]=Math.round(a[i+c]*(1-strength)+Math.min(255,target[c]*shade)*strength);
   changed++;
  }
  return changed;
 }
 window.gardenPotGlaze={region,recolor};
 window.createGardenGlaze=function({root,video,still,canvas}){
  const ctx=canvas.getContext('2d',{alpha:true,willReadFrequently:true});canvas.width=canvas.height=640;
  let style='clay',callback=null,usingVideo=false,generation=0,lastStatic='',frames=0,error=null,lastTick=0;
  function stop(){generation++;if(callback!==null){if(usingVideo)video.cancelVideoFrameCallback(callback);else cancelAnimationFrame(callback);}callback=null;}
  function visible(){return!root.hidden&&!root.closest('[hidden]')&&!document.hidden;}
  function draw(source){
   if(!ctx)return false;
   try{ctx.clearRect(0,0,640,640);ctx.drawImage(source,0,0,640,640);const pixels=ctx.getImageData(region.x,region.y,region.width,region.height);recolor(pixels,style);ctx.putImageData(pixels,region.x,region.y);root.classList.add('glazed');frames++;return true;}
   catch(cause){error=String(cause.name||'CanvasError');root.classList.remove('glazed');return false;}
  }
  function pump(ticket){
   if(ticket!==generation||!visible()||style==='clay')return;
   const next=()=>{callback=null;if(ticket!==generation)return;const now=performance.now();if(usingVideo||now-lastTick>=32){lastTick=now;if(!draw(video))return;}pump(ticket);};
   usingVideo=typeof video.requestVideoFrameCallback==='function';callback=usingVideo?video.requestVideoFrameCallback(next):requestAnimationFrame(next);
  }
  function sync(){
   stop();if(style==='clay'||!visible()){root.classList.remove('glazed');return;}
   if(root.classList.contains('playing')&&video.readyState>=2&&!video.paused){
    if(!video.currentSrc.startsWith('pet-media://garden/')){root.classList.remove('glazed');return;}
    lastStatic='';if(draw(video))pump(generation);return;
   }
   if(still.complete&&still.naturalWidth&&still.currentSrc.startsWith('pet-media://garden/')){
    const key=style+still.currentSrc;if(key!==lastStatic||!root.classList.contains('glazed')){if(draw(still))lastStatic=key;}
   }
  }
  still.addEventListener('load',sync);window.addEventListener('garden-tab-changed',sync);document.addEventListener('visibilitychange',sync);
  return{sync,setStyle(value){const next=['mint','cloud'].includes(value)?value:'clay';if(next===style)return;style=next;lastStatic='';error=null;sync();},get frames(){return frames;},get running(){return callback!==null;},get error(){return error;},get style(){return style;},destroy(){stop();still.removeEventListener('load',sync);window.removeEventListener('garden-tab-changed',sync);document.removeEventListener('visibilitychange',sync);root.classList.remove('glazed');}};
 };
})();
