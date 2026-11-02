'use strict';
window.gardenPlantSvg=function(crop,days,pot='clay'){
 const palettes={clay:['#d89c83','#bc7e69'],mint:['#9acbb7','#6da68d'],cloud:['#e5def3','#b7a5d0']},[paint,rim]=palettes[pot]||palettes.clay;
 const stage=days>=10?'ripe':days>=6?'bloom':days>=3?'leaf':'soil';
 const leaf=(x,y,flip=1)=>`<path d="M${x} ${y}q${22*flip} -28 ${34*flip} -13q${-6*flip} 23 ${-34*flip} 13" fill="#81bc87" stroke="#629a70" stroke-width="2"/>`;
 const flower=(x,y,white=false)=>`<g data-bloom="1" transform="translate(${x} ${y})" fill="${white?'#fffdf4':'#f6d779'}" stroke="${white?'#ddd5b5':'#dcc16b'}" stroke-width="1">${[0,72,144,216,288].map(a=>`<ellipse cy="-6" rx="4" ry="6" transform="rotate(${a})"/>`).join('')}<circle r="3" fill="#d6b251"/></g>`;
 const strawberry=(x,y)=>`<g data-fruit="1" transform="translate(${x} ${y})"><path d="M0-12q-18-6-16 8T0 20Q17 7 16-4T0-12" fill="#e88d9e" stroke="#c67d8b" stroke-width="1.5"/><path d="m0-10-9-6 3 8-8 2 14 4 13-5-9-1 3-8z" fill="#78a979"/><g fill="#fbe4a9"><ellipse cx="-7" cy="0" rx="1.2" ry="2"/><ellipse cx="6" cy="3" rx="1.2" ry="2"/><ellipse cy="12" rx="1.2" ry="2"/></g></g>`;
 let plant='',fruit='',front='';
 if(stage!=='soil'){
  if(crop==='watermelon')plant=`<path d="M85 128Q38 127 44 94T91 78q45-13 39 39t12 18" fill="none" stroke="#75a878" stroke-width="3"/>${leaf(46,108)+leaf(84,82,-1)}<path d="m104 104 4-17 9 7 7-10 5 15 11 5-16 5-9-5z" fill="#8ec596" stroke="#6ba777" stroke-width="2"/>`;
  else if(crop==='strawberry')plant=`<path d="M85 130Q67 108 64 91m21 39q6-42 20-47" fill="none" stroke="#75a878" stroke-width="3"/>${leaf(85,119)+leaf(85,120,-1)+leaf(64,111,-1)}<path d="M75 103q-17-12-10-25q16-5 22 12q8-16 22-8q5 18-15 22z" fill="#8dc194" stroke="#6eaa7b" stroke-width="2"/>`;
  else plant=`<path d="M85 130V45m0 48-28-21m28 4 29-20" fill="none" stroke="#75a878" stroke-width="4" stroke-linecap="round"/>${leaf(85,89)+leaf(85,66,-1)}`;
 }
 if(stage==='bloom'){
  if(crop==='watermelon')plant+=flower(131,112);
  else if(crop==='strawberry')plant+=[[54,101],[88,85],[117,107]].map(([x,y])=>flower(x,y,true)).join('');
  else plant+=[[58,73],[106,51],[121,96]].map(([x,y])=>flower(x,y)).join('');
 }
 if(stage==='ripe'){
  if(crop==='watermelon')front='<g data-fruit="1"><ellipse cx="132" cy="143" rx="29" ry="22" fill="#8dbd80" stroke="#689b68" stroke-width="2"/><path d="M122 123q-10 18 0 40m10-42q-5 23 0 44m10-42q8 18 0 40" fill="none" stroke="#649361" stroke-width="4"/><path d="M131 121q-8-13-15-9" fill="none" stroke="#75a878" stroke-width="3"/></g>';
  else if(crop==='strawberry')fruit=[[51,99],[89,88],[122,107]].map(([x,y])=>strawberry(x,y)).join('');
  else fruit=[[58,89],[109,73],[86,112],[126,104]].map(([x,y])=>`<g data-fruit="1"><circle cx="${x}" cy="${y}" r="14" fill="#e88982" stroke="#c96f70" stroke-width="1.5"/><path d="m${x} ${y-14} 3 6 7 1-7 3-5-3-6 1 4-6z" fill="#72a77d"/><ellipse cx="${x-5}" cy="${y-3}" rx="2" ry="4" fill="#fff" opacity=".45"/></g>`).join('');
 }
 const cloudRim=pot==='cloud'?`<g fill="#f9f4ff" stroke="${rim}" stroke-width="1.2">${[49,61,73,85,97,109,121].map(x=>`<circle cx="${x}" cy="135" r="6.2"/>`).join('')}</g>`:'';
 const stamp=pot==='mint'?'<path d="M85 153q-16-3-15-13q13-2 15 13m0 0q-1-15 12-17q4 12-12 17" fill="#eaf9ed" stroke="#79ad96" stroke-width="1"/>':pot==='cloud'?'<path d="m85 144 3 5 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#cab9e2"/>':'<path d="m80 146 5-4 5 4-2 6h-6z" fill="#fff" opacity=".6"/>';
 const potBody=`<path d="${pot==='cloud'?'M44 130h82l-9 28q-32 17-64 0z':pot==='mint'?'M46 128h78l-5 30q-34 12-68 0z':'M45 128h80l-10 31q-30 13-60 0z'}" fill="${paint}" stroke="${rim}" stroke-width="2"/><ellipse cx="85" cy="128" rx="43" ry="9" fill="${rim}"/><ellipse cx="85" cy="126" rx="35" ry="5" fill="#ab8b73"/>${cloudRim}<path d="M57 140q5 12 7 13" fill="none" stroke="#fff" opacity=".5" stroke-width="3" stroke-linecap="round"/>${stamp}`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 180" data-phase="${stage}" data-pot="${pot}" aria-hidden="true"><ellipse cx="85" cy="165" rx="48" ry="6" fill="#beacbc" opacity=".14"/>${plant}${fruit}${potBody}${front}</svg>`;
};
