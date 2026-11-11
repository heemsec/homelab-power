/* Build links live in the URL hash. No server, and nothing is fetched to make one. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PowerShare=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
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
function sanitize(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.v!==1)throw Error('This link is not a build.');
 const name=String(raw.n??'Shared build').replace(/[<>]/g,'').slice(0,60)||'Shared build';
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
return {compact,sanitize,encode,decode};
});
