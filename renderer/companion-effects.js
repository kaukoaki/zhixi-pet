'use strict';
(()=>{
 const presets=Object.freeze({
  none:[],
  star:[[84,32,15,0],[93,53,9,1],[81,74,12,2]],
  firefly:[[14,29,4,0],[88,37,5,1],[17,65,4,2],[84,74,4,.5],[29,85,3,1.5],[73,17,3,2.5]],
  twinkle:[[12,31,17,0],[87,24,15,1.7],[15,58,11,2.3],[88,56,19,.8],[24,81,13,1.2],[77,83,11,2.8],[34,14,9,1],[72,13,10,2]],
  petals:[[14,18,11,0],[88,26,12,1.8],[19,56,9,3],[82,65,10,.7],[30,12,8,2.4]],
  hearts:[[15,62,15,0],[86,55,12,1.1],[23,33,10,2.3],[80,80,16,.6]],
  moonring:[[18,34,12,0],[86,42,10,1.8],[28,78,9,2.7],[77,73,14,.8]]
 });
 const shapes={star:'<path d="m12 1 2.5 8.5L23 12l-8.5 2.5L12 23l-2.5-8.5L1 12l8.5-2.5z"/>',firefly:'<circle cx="12" cy="12" r="7"/>',petals:'<path d="M12 2C0 6 2 19 13 22 23 15 23 4 12 2Z"/>',hearts:'<path d="M12 21C-7 9 5-3 12 5 20-4 31 9 12 21Z"/>',moon:'<path d="M18 2A10 10 0 1 0 22 17 9 9 0 0 1 18 2Z"/>'};
 function glyph(shape){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=shapes[shape]||shapes.star;return svg;}
 window.createCompanionEffects=function(host){
  if(!host)throw Error('Missing companion effect layer');
  host.classList.add('companion-effects');host.setAttribute('aria-hidden','true');let current=null;
  const pause=()=>host.classList.toggle('effects-paused',document.hidden||Boolean(host.parentElement?.closest('[hidden]')));
  document.addEventListener('visibilitychange',pause);window.addEventListener('garden-tab-changed',pause);
  function set(style){
   if(!Object.hasOwn(presets,style))style='none';if(style===current){pause();return;}
   current=style;host.dataset.effect=style;host.hidden=style==='none';host.replaceChildren();
   for(const[x,y,size,delay]of presets[style]){
    const part=document.createElement('i');part.className='effect-particle';part.style.setProperty('--fx-x',x+'%');part.style.setProperty('--fx-y',y+'%');part.style.setProperty('--fx-size',size+'px');part.style.setProperty('--fx-delay',-delay+'s');
    part.append(glyph(['firefly','petals','hearts'].includes(style)?style:'star'));host.append(part);
   }
   if(style==='moonring'){const ring=document.createElement('i');ring.className='effect-orbit';host.prepend(ring);const moon=document.createElement('i');moon.className='effect-moon';moon.append(glyph('moon'));host.append(moon);}
   pause();
  }
  set('none');return{set,get current(){return current;},destroy(){document.removeEventListener('visibilitychange',pause);window.removeEventListener('garden-tab-changed',pause);host.replaceChildren();host.hidden=true;}};
 };
 window.companionEffectStyles=Object.freeze(Object.keys(presets));
})();
