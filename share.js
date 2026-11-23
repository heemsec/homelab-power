/* Build links live in the URL hash. No server, and nothing is fetched to make one. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(root);else root.PowerShare=factory(root);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const PLACEMENTS=['rack','shelf','frame','zerou'];
function b64url(bytes){
 let str='';
 bytes.forEach(b=>{str+=String.fromCharCode(b);});
 return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromB64url(text){
 const pad=text.length%4===0?'': '='.repeat(4-(text.length%4));
 const bin=atob(text.replace(/-/g,'+').replace(/_/g,'/')+pad);
 const out=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
 return out;
}
function num(v,lo,hi){
 const n=Number(v);
 if(!Number.isFinite(n))return null;
 return Math.max(lo,Math.min(hi,n));
}
function compact(build){
 const items=(build.items||[]).slice(0,80).map(it=>[
  String(it.partId||''),
  it.qty||1,
  it.placement||'shelf',
  it.startU==null?'':it.startU,
  it.idleOverride==null?'':it.idleOverride,
  it.typicalOverride==null?'':it.typicalOverride,
  it.batteryWh==null?'':it.batteryWh,
  it.ownSlot?1:0
 ]);
 const out={v:1,n:String(build.name||'Shared build').slice(0,60),w:build.width===19?19:10,h:build.heightU,i:items};
 if(Number.isFinite(+build.rate))out.r=+build.rate;
 if(build.currency)out.c=String(build.currency).slice(0,8);
 if(Array.isArray(build.periods)&&build.periods.length)out.p=build.periods;
 return out;
}
const MINILAB_NAME='8U 10" minilab';
const MINILAB_PRESET='nicks-8u-minilab';
function isLegacyMinilabName(name){
 return /^Nick['\u2018\u2019\u02BC\u2032]s 8U 10["\u201C\u201D\u2033\u2032] minilab$/.test(String(name??'').trim());
}
function migrateMinilabName(name, presetId){
 if(presetId&&presetId!==MINILAB_PRESET)return name;
 return isLegacyMinilabName(name)?MINILAB_NAME:name;
}
function sanitize(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.v!==1)throw Error('This link is not a build.');
 const name=migrateMinilabName(String(raw.n??'Shared build').replace(/[<>]/g,'').slice(0,60)||'Shared build');
 const width=raw.w===19?19:10;
 const height=num(raw.h,1,52);
 if(height==null)throw Error('The rack height in that link is missing.');
 if(!Array.isArray(raw.i)||raw.i.length>80)throw Error('That link has a bad parts list.');
 const items=raw.i.map(row=>{
  if(!Array.isArray(row))throw Error('A part in that link is unreadable.');
  const partId=String(row[0]||'');
  if(!/^[\w.-]{1,120}$/.test(partId))throw Error('A part id in that link was rejected.');
  const qty=Math.round(num(row[1],1,99)??1);
  const placement=PLACEMENTS.includes(row[2])?row[2]:'shelf';
  const start=row[3]===''||row[3]==null?null:num(row[3],0,52);
  const idle=row[4]===''||row[4]==null?null:num(row[4],0,100000);
  const typical=row[5]===''||row[5]==null?null:num(row[5],0,100000);
  const battery=row[6]===''||row[6]==null?null:num(row[6],0,100000);
  return {partId,qty,placement,startU:start,idleOverride:idle,typicalOverride:typical,batteryWh:battery,ownSlot:row[7]===1};
 });
 const build={name,width,heightU:height,items};
 if(raw.r!=null){const rate=num(raw.r,0,1000);if(rate!=null)build.rate=rate;}
 if(typeof raw.c==='string'&&/^[A-Z]{3}$/.test(raw.c))build.currency=raw.c;
 if(Array.isArray(raw.p))build.periods=raw.p;
 return build;
}
async function gzip(bytes){
 if(typeof CompressionStream==='undefined')return null;
 const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes){
 if(typeof DecompressionStream==='undefined')throw Error('This browser cannot open a compressed link.');
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function encode(build){
 const json=JSON.stringify(compact(build));
 const plain=new TextEncoder().encode(json);
 let prefix='j.',bytes=plain;
 if(plain.length>60){
  const zipped=await gzip(plain);
  if(zipped&&zipped.length+2<plain.length){prefix='z.';bytes=zipped;}
 }
 return prefix+b64url(bytes);
}
async function decode(token){
 const text=String(token||'').replace(/^#b=/,'');
 if(text.length>20000)throw Error('That link is too long.');
 if(!/^[jz]\.[A-Za-z0-9_-]+$/.test(text))throw Error('That link is not a build.');
 let bytes=fromB64url(text.slice(2));
 if(text.startsWith('z.'))bytes=await gunzip(bytes);
 let raw;
 try{raw=JSON.parse(new TextDecoder().decode(bytes));}
 catch{throw Error('That link is damaged.');}
 return sanitize(raw);
}
const NOTEBOOK_TYPES=new Set(['router','switch','firewall','proxmox-node','vm','lxc','pi','nas','other']);
const CATEGORY_TYPE={sbc:'pi',nas:'nas',switch:'switch','router-firewall':'router','mini-pc':'proxmox-node','used-server':'proxmox-node','rack-server':'proxmox-node'};
const NOTEBOOK_ORIGIN='https://heemsec.github.io/homelab-notebook/#p=';
// Stay off until Notebook and Nick want Power to emit v:2. v1 links can still carry the extra fields.
const EMIT_INTEROP_V2=false;
// Idle guesses already used by the starter packs. A device flags when it idles at more than twice this, and above 15 W.
const TYPICAL_IDLE={pi:3,switch:8,router:6,firewall:8,nas:15,'proxmox-node':8,other:10};
function clampNum(v,lo,hi){
 const n=Number(v);
 if(!Number.isFinite(n))return null;
 return Math.max(lo,Math.min(hi,n));
}
function typeForCategory(category){
 return CATEGORY_TYPE[category]||(category?'other':'');
}
function cleanInteropDevice(d){
 if(!d||typeof d!=='object'||Array.isArray(d))return null;
 const name=String(d.name??'').replace(/[<>]/g,'').trim().slice(0,100);
 if(!name)return null;
 const type=NOTEBOOK_TYPES.has(d.type)?d.type:'';
 const idle=clampNum(d.idleW,0,100000);
 const typical=clampNum(d.typicalW,0,100000);
 const idleW=idle==null?0:idle;
 const typicalW=typical==null?0:typical;
 let qty=Math.round(clampNum(d.qty,1,99)??1);
 if(!Number.isFinite(qty)||qty<1)qty=1;
 const id=/^[A-Za-z0-9_-]{1,80}$/.test(String(d.id||''))?String(d.id):'';
 const row={name,idleW,typicalW,qty};
 if(id)row.id=id;
 if(type)row.type=type;
 if(d.partId!=null)row.partId=String(d.partId).slice(0,120);
 if(typeof d.ip==='string'&&d.ip)row.ip=d.ip.slice(0,80);
 if(typeof d.mac==='string'&&d.mac)row.mac=d.mac.slice(0,40);
 const stamp=cleanStamp(d.updatedAt);
 if(stamp)row.updatedAt=stamp;
 if(d.linked===true)row.linked=true;
 return row;
}
function cleanStamp(v){
 const s=String(v??'').trim();
 if(!s||s.length>40||/[<>]/.test(s))return '';
 return s;
}
function cleanUps(list){
 if(!Array.isArray(list))return null;
 const out=[];
 for(const u of list.slice(0,20)){
  if(!u||typeof u!=='object'||Array.isArray(u))continue;
  const name=String(u.name??'').replace(/[<>]/g,'').trim().slice(0,100);
  if(!name)continue;
  const row={name};
  if(/^[A-Za-z0-9_-]{1,80}$/.test(String(u.id||'')))row.id=String(u.id);
  if(typeof u.model==='string'&&u.model)row.model=u.model.replace(/[<>]/g,'').slice(0,80);
  const va=clampNum(u.va,0,100000);if(u.va!=null&&va!=null)row.va=va;
  const watts=clampNum(u.watts,0,100000);if(u.watts!=null&&watts!=null)row.watts=watts;
  const battery=clampNum(u.batteryWh,0,100000);if(u.batteryWh!=null&&battery!=null)row.batteryWh=battery;
  if(Array.isArray(u.hostIds))row.hostIds=u.hostIds.map(id=>String(id)).filter(id=>/^[A-Za-z0-9_-]{1,80}$/.test(id)).slice(0,100);
  out.push(row);
 }
 return out;
}
function cleanUpgrade(u){
 if(!u||typeof u!=='object'||Array.isArray(u))return null;
 const currentW=clampNum(u.currentW,0,100000),newW=clampNum(u.newW,0,100000),price=clampNum(u.price,0,1e9);
 if(currentW==null||newW==null||price==null)return null;
 const row={currentW,newW,price};
 if(/^[A-Za-z0-9_-]{1,80}$/.test(String(u.hostId||'')))row.hostId=String(u.hostId);
 const name=String(u.name??'').replace(/[<>]/g,'').trim().slice(0,100);
 if(name)row.name=name;
 const rate=clampNum(u.rate,0,1000);if(u.rate!=null&&rate!=null)row.rate=rate;
 const hours=clampNum(u.hours,0,24);if(u.hours!=null&&hours!=null)row.hours=hours;
 return row;
}
function cleanInterop(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||(raw.v!==1&&raw.v!==2))throw Error('This link uses a lab format this app doesn\'t read.');
 if(raw.source!=='homelab-notebook'&&raw.source!=='homelab-power')throw Error('This link is not a lab from Homelab Notebook or Homelab Power.');
 if(!Array.isArray(raw.devices)||raw.devices.length>100)throw Error('A lab link can carry at most 100 devices.');
 const devices=[];
 for(const item of raw.devices){
  const row=cleanInteropDevice(item);
  if(row)devices.push(row);
 }
 const out={v:raw.v,source:raw.source,devices};
 const name=String(raw.name??'').replace(/[<>]/g,'').trim().slice(0,60);
 if(name)out.name=name;
 if(raw.voltageMode==='120'||raw.voltageMode==='230'||raw.voltageMode==='custom')out.voltageMode=raw.voltageMode;
 const voltage=clampNum(raw.voltage,50,480);
 if(voltage!=null)out.voltage=voltage;
 const breaker=clampNum(raw.breaker,1,200);
 if(breaker!=null)out.breaker=breaker;
 const rate=clampNum(raw.rate,0,1000);if(raw.rate!=null&&rate!=null)out.rate=rate;
 if(typeof raw.touEnabled==='boolean')out.touEnabled=raw.touEnabled;
 for(const key of ['peakRate','offRate']){const n=clampNum(raw[key],0,1000);if(raw[key]!=null&&n!=null)out[key]=n;}
 for(const key of ['peakStart','peakEnd']){const n=clampNum(raw[key],0,24);if(raw[key]!=null&&n!=null)out[key]=n;}
 const stamp=cleanStamp(raw.updatedAt);if(stamp)out.updatedAt=stamp;
 if(Array.isArray(raw.ups))out.ups=cleanUps(raw.ups);
 const upgrade=cleanUpgrade(raw.upgrade);if(raw.upgrade!=null&&upgrade)out.upgrade=upgrade;
 return out;
}
function decodeInterop(token){
 const text=String(token||'').replace(/^#?p=/,'');
 if(!text)throw Error('That link didn\'t include a lab.');
 if(text.length>100000)throw Error('That link is too long.');
 if(!/^[jz]\.[A-Za-z0-9_-]+$/.test(text))throw Error('That link is not a lab.');
 return decodePrefixed(text).then(raw=>cleanInterop(raw));
}
async function decodePrefixed(text){
 let bytes=fromB64url(text.slice(2));
 if(text.startsWith('z.'))bytes=await gunzip(bytes);
 let raw;
 try{raw=JSON.parse(new TextDecoder().decode(bytes));}
 catch{throw Error('That link is damaged.');}
 return raw;
}
async function encodeInterop(payload,options){
 const emitV2=!!(options&&options.v2)||EMIT_INTEROP_V2;
 const source=payload&&typeof payload==='object'?{...payload,v:emitV2?2:1}:payload;
 const clean=cleanInterop(source);
 if(clean.devices.length>100)throw Error('A lab link can carry at most 100 devices.');
 const json=JSON.stringify(clean);
 const plain=new TextEncoder().encode(json);
 let prefix='j.',bytes=plain;
 if(plain.length>40){
  const zipped=await gzip(plain);
  if(zipped&&zipped.length+2<plain.length){prefix='z.';bytes=zipped;}
 }
 const token=prefix+b64url(bytes);
 if(token.length>100000)throw Error('That lab is too big to send in a link.');
 return token;
}
function devicesFromInterop(payload){
 const clean=payload&&payload.devices?payload:null;
 const list=clean?payload.devices:[];
 const out=[];
 for(const d of list){
  if((d.type==='vm'||d.type==='lxc')&&(d.idleW||0)===0&&(d.typicalW||0)===0)continue;
  const qty=Math.min(99,Math.max(1,Math.round(d.qty||1)));
  for(let n=1;n<=qty&&out.length<100;n++){
   const linkId=d.id?(n===1?d.id:`${d.id}-${n}`.slice(0,80)):'';
   const name=n===1?d.name:`${d.name} ${n}`.slice(0,100);
   const device={id:linkId||`nb${out.length+1}`,name,idle:d.idleW||0,load:d.typicalW||0,loadPct:20,hours:24,start:0,selected:true};
   if(linkId)device.linkId=linkId;
   if(d.partId)device.partId=d.partId;
   if(d.type)device.type=d.type;
   if(d.linked===true)device.linked=true;
   if(d.updatedAt)device.updatedAt=d.updatedAt;
   out.push(device);
  }
 }
 return out;
}
function circuitFromInterop(payload){
 const out={};
 if(payload.voltageMode==='120'||payload.voltageMode==='230'||payload.voltageMode==='custom')out.voltageMode=payload.voltageMode;
 if(payload.voltage!=null)out.voltage=payload.voltage;
 if(payload.breaker!=null)out.breaker=payload.breaker;
 return out;
}
function interopAccess({pro,profiles}){
 const count=Math.max(0,Number(profiles)||0);
 return {view:'free',load:(pro?count<20:count===0)?'free':'pro',merge:'pro',resync:'pro'};
}
function shouldApplyRate(state){
 return !!state&&state.region==null&&Math.abs(Number(state.rate)-0.2)<1e-9;
}
function upsRuntimeHours(batteryWh,loadW,usable,efficiency){
 const wh=Number(batteryWh),load=Number(loadW);
 if(!(wh>0)||!(load>0))return null;
 return wh*(usable==null?0.8:usable)*(efficiency==null?0.9:efficiency)/load;
}
function upgradePayback(upgrade){
 if(!upgrade)return null;
 const hours=upgrade.hours==null?24:Number(upgrade.hours);
 const rate=upgrade.rate==null?0.2:Number(upgrade.rate);
 const delta=Number(upgrade.currentW)-Number(upgrade.newW);
 const month=delta*hours/1000*(365/12)*rate;
 if(!(month>0))return null;
 return Number(upgrade.price)/month;
}
function paybackPhrase(months){
 if(months==null||!(months>0))return '';
 if(months<0.5)return 'less than a month';
 if(months<24){
  const n=Math.max(1,Math.round(months));
  return `about ${n} month${n===1?'':'s'}`;
 }
 const years=months/12;
 const whole=Math.round(years);
 if(Math.abs(years-whole)<0.25)return `about ${whole} year${whole===1?'':'s'}`;
 const half=Math.round(years*2)/2;
 if(Math.abs(years-half)<0.15&&half%1!==0){
  const y=Math.floor(half);
  return y<1?'about 6 months':`about ${y} and a half years`;
 }
 const shown=Math.round(years*10)/10;
 return `about ${shown} years`;
}
function wasteFlags(device){
 if(!device||device.type==='vm'||device.type==='lxc')return [];
 const flags=[];
 const typical=TYPICAL_IDLE[device.type];
 const idle=Number(device.idle!=null?device.idle:device.idleW);
 if(typical!=null&&idle>typical*2&&idle>15)flags.push('high-idle');
 const loadPct=device.loadPct==null?20:Number(device.loadPct);
 const hours=device.hours==null?24:Number(device.hours);
 if(loadPct<=5||hours<=4)flags.push('low-use');
 return flags;
}
function deviceKey(d){
 const id=String((d&&(d.linkId||d.id))||'');
 const idle=d&&d.idleW!=null?d.idleW:d&&d.idle;
 const typical=d&&d.typicalW!=null?d.typicalW:d&&d.load;
 return [id,String(d&&d.name||''),String(d&&d.type||''),String(idle??''),String(typical??'')].join('\u001f');
}
function deviceFingerprint(devices){
 return (devices||[]).map(deviceKey).sort().join('\n');
}
function changedDeviceCount(saved,devices){
 const prev=new Map(String(saved||'').split('\n').filter(Boolean).map(line=>{const i=line.indexOf('\u001f');return [line.slice(0,i),line];}));
 const next=(devices||[]).map(deviceKey);
 const nextIds=new Set(next.map(line=>line.slice(0,line.indexOf('\u001f'))));
 let n=0;const seen=new Set();
 for(const line of next){
  const id=line.slice(0,line.indexOf('\u001f'));
  if(seen.has(id))continue;seen.add(id);
  if(prev.get(id)!==line)n++;
 }
 for(const id of prev.keys())if(!nextIds.has(id))n++;
 return n;
}
function encryptedLinkMessage(){
 return 'This link is an encrypted Homelab Notebook file. Open it in Homelab Notebook.';
}
async function sendToNotebook(payload){
 const token=await encodeInterop(payload);
 const url=NOTEBOOK_ORIGIN+token;
 const host=root||globalThis;
 try{
  if(typeof host.NativeOpenExternal==='function'){await host.NativeOpenExternal(url);return url;}
  const doc=host.document;
  if(!doc||!doc.body)throw Error('no document');
  const link=doc.createElement('a');
  link.href=url;link.target='_blank';link.rel='noopener noreferrer';
  doc.body.appendChild(link);link.click();link.remove();
  return url;
 }catch{throw Error('Couldn\'t open Homelab Notebook.');}
}
return {compact,sanitize,encode,decode,migrateMinilabName,isLegacyMinilabName,encodeInterop,decodeInterop,devicesFromInterop,circuitFromInterop,interopAccess,typeForCategory,sendToNotebook,NOTEBOOK_ORIGIN,EMIT_INTEROP_V2,shouldApplyRate,upsRuntimeHours,upgradePayback,paybackPhrase,wasteFlags,deviceFingerprint,changedDeviceCount,encryptedLinkMessage,TYPICAL_IDLE};
});
