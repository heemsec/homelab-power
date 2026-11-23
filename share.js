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
 return row;
}
function cleanInterop(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.v!==1)throw Error('This link uses a lab format this app doesn\'t read.');
 if(raw.source!=='homelab-notebook'&&raw.source!=='homelab-power')throw Error('This link is not a lab from Homelab Notebook or Homelab Power.');
 if(!Array.isArray(raw.devices)||raw.devices.length>100)throw Error('A lab link can carry at most 100 devices.');
 const devices=[];
 for(const item of raw.devices){
  const row=cleanInteropDevice(item);
  if(row)devices.push(row);
 }
 const out={v:1,source:raw.source,devices};
 const name=String(raw.name??'').replace(/[<>]/g,'').trim().slice(0,60);
 if(name)out.name=name;
 if(raw.voltageMode==='120'||raw.voltageMode==='230'||raw.voltageMode==='custom')out.voltageMode=raw.voltageMode;
 const voltage=clampNum(raw.voltage,50,480);
 if(voltage!=null)out.voltage=voltage;
 const breaker=clampNum(raw.breaker,1,200);
 if(breaker!=null)out.breaker=breaker;
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
async function encodeInterop(payload){
 const clean=cleanInterop(payload);
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
return {compact,sanitize,encode,decode,migrateMinilabName,isLegacyMinilabName,encodeInterop,decodeInterop,devicesFromInterop,circuitFromInterop,interopAccess,typeForCategory,sendToNotebook,NOTEBOOK_ORIGIN};
});
