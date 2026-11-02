'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID,randomInt}=require('node:crypto');
const {createCalendar,validDate}=require('./journal.cjs'),{UUID}=require('./conversation-store.cjs');
const CROPS=Object.freeze([
 {id:'tomato',name:'番茄',icon:'🍅',days:10},
 {id:'strawberry',name:'草莓',icon:'🍓',days:10},
 {id:'watermelon',name:'西瓜',icon:'🍉',days:10}
]);
const SHOP=Object.freeze([
 {id:'pot-clay',category:'pot',name:'原色小陶盆',icon:'🪴',price:0,style:'clay',description:'暖暖的原色，陪一颗种子长大。'},
 {id:'pot-mint',category:'pot',name:'薄荷小花盆',icon:'🌿',price:80,style:'mint',description:'薄荷釉色与小叶浮雕，为窗台添一抹清新。'},
 {id:'pot-cloud',category:'pot',name:'云朵瓷花盆',icon:'☁',price:120,style:'cloud',description:'奶白淡紫的瓷色和云朵盆沿，软软盛住期待。'},
 {id:'scene-morning',category:'scene',name:'晨光窗台',icon:'☀',price:0,style:'morning',description:'把今天的种子，种在晨光里。'},
 {id:'scene-moon',category:'scene',name:'月色花园',icon:'🌙',price:120,style:'moon',description:'星空、月牙与银蓝窗台，整本手账披上月光。'},
 {id:'scene-sakura',category:'scene',name:'樱色小院',icon:'🌸',price:150,style:'sakura',description:'花枝垂进粉色小院，手账也染上温柔樱色。'},
 {id:'ornament-none',category:'ornament',name:'轻轻陪伴',icon:'✿',price:0,style:'none',description:'保留清清爽爽的样子。'},
 {id:'ornament-star',category:'ornament',name:'星星小挂件',icon:'✧',price:90,style:'star',description:'三颗金色小星，轻轻悬在知栖身旁。'},
 {id:'ornament-firefly',category:'ornament',name:'萤光小伙伴',icon:'✨',price:100,style:'firefly',description:'薄荷色萤光，像安静陪伴的小精灵。'},
 {id:'ornament-twinkle',category:'ornament',name:'星糖闪闪',icon:'✦',price:160,style:'twinkle',description:'星糖在发梢与裙摆旁交错闪亮，bling bling。'},
 {id:'ornament-petals',category:'ornament',name:'樱雨轻落',icon:'🌸',price:150,style:'petals',description:'粉色花瓣慢慢飘落，像一场迷你春雨。'},
 {id:'ornament-hearts',category:'ornament',name:'心动泡泡',icon:'♡',price:180,style:'hearts',description:'软软的爱心泡泡，悄悄向上飘。'},
 {id:'ornament-moonring',category:'ornament',name:'月光星环',icon:'☾',price:220,style:'moonring',description:'一弯小月亮和细细星轨，围着知栖流光。'},
 {id:'paper-plain',category:'paper',name:'奶油素笺',icon:'▤',price:0,style:'plain',description:'熟悉的奶白色手账纸。'},
 {id:'paper-berry',category:'paper',name:'莓莓手账纸',icon:'🍓',price:70,style:'berry',description:'莓粉底色与细点纸纹，像收藏心事的甜笺。'},
 {id:'paper-mint',category:'paper',name:'薄荷方格纸',icon:'▦',price:70,style:'mint',description:'清清浅浅的薄荷小方格。'}
]);
const defaults=()=>Object.fromEntries(SHOP.filter(item=>item.price===0).map(item=>[item.category,item.id]));
const fresh=timeZone=>({version:1,timeZone,coins:0,lastDate:null,plots:[1,2,3].map(n=>({id:'plot-'+n,plant:null,lastWatered:null})),inventory:[],checkIns:[],ledger:[],owned:Object.values(defaults()),equipped:defaults()});
const cropById=id=>CROPS.find(crop=>crop.id===id),itemById=id=>SHOP.find(item=>item.id===id);
const dates=list=>Array.isArray(list)&&list.every((date,i)=>validDate(date)&&(!i||date>list[i-1]));
function validateGarden(data){
 const assert=(condition)=>{if(!condition)throw Error('花园存档格式或金币流水不一致。');};
 assert(data?.version===1&&typeof data.timeZone==='string');createCalendar(data.timeZone);
 assert(Number.isSafeInteger(data.coins)&&data.coins>=0&&data.coins<=1e9);
 assert(data.lastDate===null||validDate(data.lastDate));assert(dates(data.checkIns)&&data.checkIns.length<=36500&&data.checkIns.every(date=>date<=data.lastDate));
 assert(Array.isArray(data.ledger)&&data.ledger.length<=100000&&Array.isArray(data.owned)&&new Set(data.owned).size===data.owned.length);
 assert(data.owned.every(id=>itemById(id))&&Object.values(defaults()).every(id=>data.owned.includes(id)));
 const ids=new Set(),sold=new Set(),purchases=new Set(),gifts=new Set();let coins=0;
 for(const transaction of data.ledger){
  assert(UUID.test(transaction.id)&&!ids.has(transaction.id)&&validDate(transaction.date)&&transaction.date<=data.lastDate&&Number.isFinite(Date.parse(transaction.at)));ids.add(transaction.id);
  assert(Number.isSafeInteger(transaction.delta)&&transaction.delta!==0);
  if(transaction.kind==='sale'){assert(transaction.delta>=50&&transaction.delta<=100&&UUID.test(transaction.reference)&&!sold.has(transaction.reference)&&cropById(transaction.crop));sold.add(transaction.reference);}
  else if(transaction.kind==='gift'){assert(transaction.delta>0&&transaction.delta<=1000000&&typeof transaction.reference==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(transaction.reference)&&!gifts.has(transaction.reference)&&typeof transaction.label==='string'&&transaction.label.length>0&&transaction.label.length<=60);gifts.add(transaction.reference);}
  else {assert(transaction.kind==='purchase'&&transaction.delta<0&&transaction.delta>=-1000000&&itemById(transaction.reference)?.price>0&&!purchases.has(transaction.reference)&&data.owned.includes(transaction.reference));purchases.add(transaction.reference);}
  coins+=transaction.delta;assert(Number.isSafeInteger(coins)&&coins>=0&&coins<=1e9&&transaction.balanceAfter===coins);
 }
 assert(coins===data.coins&&data.owned.every(id=>itemById(id).price===0||purchases.has(id)));
 assert(data.equipped&&Object.keys(data.equipped).length===4);
 for(const category of Object.keys(defaults()))assert(itemById(data.equipped?.[category])?.category===category&&data.owned.includes(data.equipped[category]));
 const plantIds=new Set(sold),claim=id=>{assert(UUID.test(id)&&!plantIds.has(id));plantIds.add(id);};
 assert(Array.isArray(data.plots)&&data.plots.length===3);
 for(let i=0;i<3;i++){
  const plot=data.plots[i];assert(plot.id==='plot-'+(i+1)&&(plot.lastWatered===null||validDate(plot.lastWatered)&&plot.lastWatered<=data.lastDate));
  if(plot.plant){const plant=plot.plant;claim(plant.id);assert(cropById(plant.crop)&&validDate(plant.plantedOn)&&plant.plantedOn<=data.lastDate&&dates(plant.watered)&&plant.watered.length<=10&&plant.watered.every(date=>date>=plant.plantedOn&&data.checkIns.includes(date)));if(plant.watered.length)assert(plant.watered.at(-1)===plot.lastWatered);}
 }
 assert(Array.isArray(data.inventory)&&data.inventory.length<=10000);
 for(const batch of data.inventory){claim(batch.id);assert(cropById(batch.crop)&&validDate(batch.harvestedOn)&&batch.harvestedOn<=data.lastDate&&Number.isInteger(batch.price)&&batch.price>=50&&batch.price<=100);}
 return data;
}
class GardenStore{
 constructor(file,{now=Date.now,timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,quote=()=>randomInt(50,101)}={}){
  this.file=file;this.now=now;this.quote=quote;this.warning=null;this.readOnly=false;this.data=fresh(timeZone);
  if(fs.existsSync(file))try{if(fs.statSync(file).size>16*1024*1024)throw Error('oversized');this.data=validateGarden(JSON.parse(fs.readFileSync(file,'utf8')));}catch{this.warning='花园存档暂时无法读取，原存档和备份已保留，请先修复存档。';this.readOnly=true;}
  this.dayKey=createCalendar(this.data.timeZone);
 }
 appearance(){return Object.fromEntries(Object.entries(this.data.equipped).map(([category,id])=>[category,itemById(id).style]));}
 memories(){
  if(this.readOnly)return null;
  const harvests=new Map(this.data.inventory.map(batch=>[batch.id,batch.crop]));
  const sales=this.data.ledger.filter(entry=>entry.kind==='sale');for(const sale of sales)harvests.set(sale.reference,sale.crop);
  const values={tomato:0,strawberry:0,watermelon:0,harvests:harvests.size,waterDays:this.data.checkIns.length,sales:sales.length,ornaments:this.data.owned.filter(id=>itemById(id).category==='ornament'&&itemById(id).price>0).length};
  for(const crop of harvests.values())values[crop]++;values.harvestTypes=CROPS.filter(crop=>values[crop.id]>0).length;return{values};
 }
 _commit(next){
  validateGarden(next);fs.mkdirSync(path.dirname(this.file),{recursive:true});
  try{
   fs.writeFileSync(this.file+'.tmp',JSON.stringify(next,null,2),'utf8');
   if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');
   fs.renameSync(this.file+'.tmp',this.file);
  }catch{throw Error('花园没有保存成功，本次操作尚未生效，请检查本地磁盘。');}
  this.data=next;
 }
 // Local maintenance only. Deliberately absent from renderer commands and IPC.
 grantCoins({amount,reference,label}){
  if(this.readOnly)throw Error(this.warning);
  if(!Number.isSafeInteger(amount)||amount<1||amount>1000000||typeof reference!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(reference)||typeof label!=='string'||!label.trim()||label.length>60)throw Error('赠送金币参数无效。');
  const previous=this.data.ledger.find(entry=>entry.kind==='gift'&&entry.reference===reference);
  if(previous){if(previous.delta!==amount||previous.label!==label.trim())throw Error('赠送记录编号已被使用。');return{credited:false,alreadyGranted:true,amount:previous.delta,balance:this.data.coins};}
  const at=this.now(),today=this.dayKey(at);if(this.data.lastDate&&today<this.data.lastDate)throw Error('本地日期早于最近记录，尚未赠送金币。');
  if(this.data.coins+amount>1e9)throw Error('金币超过存储上限，尚未赠送。');
  const next=structuredClone(this.data),before=next.coins;next.coins+=amount;next.lastDate=today;
  next.ledger.push({id:randomUUID(),kind:'gift',reference,label:label.trim(),delta:amount,balanceAfter:next.coins,date:today,at:new Date(at).toISOString()});
  this._commit(next);return{credited:true,alreadyGranted:false,amount,before,balance:next.coins};
 }
 command(input){
  if(this.readOnly)throw Error(this.warning);
  const fields={plant:['type','plotId','crop'],water:['type','plotId'],harvest:['type','plotId'],sell:['type','batchId'],buy:['type','itemId'],equip:['type','itemId']};
  if(!input||!Object.hasOwn(fields,input.type)||Object.keys(input).some(key=>!fields[input.type].includes(key)))throw Error('花园操作无效。');
  const at=this.now(),today=this.dayKey(at);if(this.data.lastDate&&today<this.data.lastDate)throw Error('本地日期早于最近的花园记录，请恢复正确日期后再操作。');
  const next=structuredClone(this.data),plot=next.plots.find(plot=>plot.id===input.plotId),reactions=[];next.lastDate=today;let message='';
  const transaction=(kind,reference,delta,extra={})=>{next.coins+=delta;next.ledger.push({id:randomUUID(),kind,reference,delta,balanceAfter:next.coins,date:today,at:new Date(at).toISOString(),...extra});};
  if(input.type==='plant'){
   if(!plot||plot.plant||!cropById(input.crop))throw Error('请选择空种植位和一颗种子。');
   plot.plant={id:randomUUID(),crop:input.crop,plantedOn:today,watered:[]};message=`${cropById(input.crop).name}种好啦，记得每天浇水。`;reactions.push('garden-plant');
  }else if(input.type==='water'){
   if(input.plotId&&!plot)throw Error('种植位不存在。');
   const eligible=(plot?[plot]:next.plots).filter(plot=>plot.plant&&plot.plant.watered.length<10&&plot.lastWatered!==today);
   if(!eligible.length)throw Error('今天没有需要浇水的小苗，种下种子或明天再来吧。');
   for(const target of eligible){target.plant.watered.push(today);target.lastWatered=today;const stage={3:'grow',6:'bloom',10:'ripe'}[target.plant.watered.length];if(stage)reactions.unshift(`garden-${target.plant.crop}-${stage}`);}
   if(!next.checkIns.includes(today))next.checkIns.push(today);message=`浇水打卡成功，${eligible.length} 株植物长大一点点。`;reactions.push('garden-water');
  }else if(input.type==='harvest'){
   if(!plot?.plant||plot.plant.watered.length!==10)throw Error('还没有成熟，累计浇水 10 天就能收获啦。');
   const price=this.quote();if(!Number.isInteger(price)||price<50||price>100)throw Error('本次收获报价无效，尚未收获。');
   const plant=plot.plant;next.inventory.push({id:plant.id,crop:plant.crop,harvestedOn:today,price});plot.plant=null;message=`收获${cropById(plant.crop).name}啦，放进收获箱了。`;reactions.push(`garden-${plant.crop}-harvest`);
  }else if(input.type==='sell'){
   const index=next.inventory.findIndex(batch=>batch.id===input.batchId);if(index<0)throw Error('这份收获已出售或不存在，未重复发放金币。');
   const [batch]=next.inventory.splice(index,1);transaction('sale',batch.id,batch.price,{crop:batch.crop});message=`卖出${cropById(batch.crop).name}，获得 ${batch.price} 金币。`;
  }else{
   const item=itemById(input.itemId);if(!item)throw Error('商品不存在。');
   if(!next.owned.includes(item.id)){
    if(input.type!=='buy')throw Error('还没有拥有这件物品。');if(next.coins<item.price)throw Error('金币还不够，再攒一份甜甜的收获吧。');
    next.owned.push(item.id);transaction('purchase',item.id,-item.price);
   }
   next.equipped[item.category]=item.id;message=`已经用上${item.name}啦。`;
  }
  this._commit(next);return{message,reactions};
 }
 snapshot(){
  const today=this.dayKey(this.now()),data=this.data;
  return{version:1,today,coins:this.readOnly?null:data.coins,warning:this.warning,readOnly:this.readOnly,crops:CROPS,appearance:this.appearance(),checkIns:data.checkIns.length,checkedToday:data.checkIns.includes(today),
   plots:data.plots.map(plot=>({...structuredClone(plot),progress:plot.plant?.watered.length||0,ready:plot.plant?.watered.length===10,canWater:!this.readOnly&&Boolean(plot.plant&&plot.plant.watered.length<10&&plot.lastWatered!==today)})),
   inventory:structuredClone(data.inventory),shop:SHOP.map(item=>({...item,owned:data.owned.includes(item.id),equipped:data.equipped[item.category]===item.id,canAfford:data.coins>=item.price})),
   ledger:data.ledger.slice(-20).reverse().map(item=>({id:item.id,kind:item.kind,date:item.date,delta:item.delta,balanceAfter:item.balanceAfter,name:item.kind==='sale'?cropById(item.crop).name:item.kind==='gift'?item.label:itemById(item.reference).name}))};
 }
}
module.exports={GardenStore,CROPS,SHOP,validateGarden};
