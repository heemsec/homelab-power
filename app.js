'use strict';
(() => {
const M=window.PowerMath, $=id=>document.getElementById(id), STORE='homelab-power-v1';
const regions=window.RegionRates.regions;
const currencies=['USD','EUR','GBP','CAD','AUD','JPY','INR'];
const num=(v,lo,hi,fallback=0)=>Number.isFinite(M.parse(v))?M.clamp(v,lo,hi):fallback;
let nextId=Date.now();
const uid=()=>`d${nextId++}`;
const presets={pi:['Raspberry Pi (estimate)',3,8],mini:['Mini PC (estimate)',8,35],rack:['Rack server (estimate)',120,280],nas:['NAS (estimate)',35,57],switch:['Network switch (estimate)',8,15],blank:['Custom device',0,0]};
function makeDevice(kind){const p=presets[kind]||presets.blank;const drives=num($('drives').value,0,48,4);return {id:uid(),name:kind==='nas'?`NAS, ${drives} drives (estimate)`:p[0],idle:kind==='nas'?15+drives*5:p[1],load:kind==='nas'?25+drives*8:p[2],loadPct:20,hours:24,start:0,selected:true};}
function defaults(){return {version:1,region:null,currency:'USD',rate:.20,tou:false,offRate:.15,peakRate:.35,peakStart:16,peakEnd:21,offStart:0,offEnd:7,consolidateWatts:55,replacementWatts:25,price:350,voltageMode:'120',voltage:120,breaker:15,devices:[makeDevice('rack'),makeDevice('nas'),makeDevice('mini'),makeDevice('switch'),makeDevice('pi')]};}
function normalize(raw){
 if(!raw||typeof raw!=='object'||raw.version!==1||!Array.isArray(raw.devices)||raw.devices.length>100)throw Error('Invalid calculator data');
 const s={version:1,region:null,currency:currencies.includes(raw.currency)?raw.currency:'USD',tou:raw.tou===true};
 for(const key of ['rate','offRate','peakRate'])s[key]=num(raw[key],0,1000,.2);
 for(const key of ['peakStart','peakEnd','offStart','offEnd'])s[key]=num(raw[key],0,23.99);
 for(const key of ['consolidateWatts','replacementWatts'])s[key]=num(raw[key],0,100000);
 s.price=num(raw.price,0,1e9);
 s.region=regions.some(r=>r.id===raw.region&&r.currency===s.currency&&r.rate===s.rate)&&!s.tou?raw.region:null;
 const eu=!!(s.region&&!String(s.region).startsWith('US'));
 s.voltageMode=raw.voltageMode==='120'||raw.voltageMode==='230'||raw.voltageMode==='custom'?raw.voltageMode:(eu?'230':'120');
 s.voltage=s.voltageMode==='120'?120:s.voltageMode==='230'?230:num(raw.voltage,50,480,eu?230:120);
 s.breaker=raw.breaker==null?(s.voltage>=200?16:15):num(raw.breaker,1,200,15);
 const ids=new Set();
 s.devices=raw.devices.map(d=>{if(!d||typeof d!=='object')throw Error('Invalid device');let id=String(d.id??'');if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(id))id=uid();ids.add(id);return {id,name:String(d.name??'Device').slice(0,100),idle:num(d.idle,0,100000),load:num(d.load,0,100000),loadPct:num(d.loadPct,0,100),hours:num(d.hours,0,24),start:num(d.start,0,23.99),selected:d.selected===true,...(Object.hasOwn(d,'separateWeekend')?{separateWeekend:d.separateWeekend===true,weekendHours:num(d.weekendHours??d.hours,0,24),weekendStart:num(d.weekendStart??d.start,0,23.99)}:{})};});return s;
}
function encode(s){const bytes=new TextEncoder().encode(JSON.stringify(s));return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(hash){if(hash.length>100000)throw Error('Link too large');let str=hash.replace(/^#s=/,'').replace(/-/g,'+').replace(/_/g,'/');return normalize(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(str),c=>c.charCodeAt(0)))));}
let state,loadMessage='',stateOrigin='demo';
try { if(location.hash.startsWith('#s=')){state=decode(location.hash);stateOrigin='share';} }catch {loadMessage='That share link didn\'t load. Opened your saved lab instead.';}
if(!state){try{const saved=localStorage.getItem(STORE);if(saved){state=normalize(JSON.parse(saved));stateOrigin='saved';}}catch{loadMessage=loadMessage||'Couldn\'t read the saved lab, so the demo is loaded.';}}
if(!state)state=defaults();
applySettingsDefaults();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function numLocale(){try{const s=JSON.parse(localStorage.getItem('homelab-power-settings-v1')||'null');if(s?.numberFormat==='us')return 'en-US';if(s?.numberFormat==='eu')return 'de-DE';}catch{}return undefined;}
const money=v=>new Intl.NumberFormat(numLocale(),{style:'currency',currency:state.currency,maximumFractionDigits:2}).format(v);
const number=(v,digits=2)=>new Intl.NumberFormat(numLocale(),{maximumFractionDigits:digits}).format(v);
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4500);}
const SAVE_PAUSE=400;
let saveTimer=0;
function writeState(){
 saveTimer=0;
 let local=true;try{localStorage.setItem(STORE,JSON.stringify(state));}catch{local=false;}
 $('saveStatus').textContent=local?'Saved on this device.':'Couldn\'t save on this device. Copy a share link so you don\'t lose it.';
}
// Typing updates memory and the share hash immediately. localStorage waits until typing pauses. Closing, hiding, or leaving the tab flushes that same write.
function flushState(){if(!saveTimer)return;clearTimeout(saveTimer);writeState();}
function persist(){
 try{history.replaceState(null,'',`${location.pathname}${location.search}#s=${encode(state)}`);}catch{/* Share still works. */}
 window.dispatchEvent(new Event('power:change'));
 clearTimeout(saveTimer);saveTimer=setTimeout(writeState,SAVE_PAUSE);
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushState();});
window.addEventListener('pagehide',flushState);
function applySettingsDefaults(){
 if(stateOrigin!=='demo')return;
 let s;try{s=JSON.parse(localStorage.getItem('homelab-power-settings-v1')||'null');}catch{return;}
 if(!s||s.version!==1)return;
 if(['USD','EUR','GBP','CAD','AUD','JPY','INR'].includes(s.currency))state.currency=s.currency;
 if(Number.isFinite(+s.rate))state.rate=num(+s.rate,0,1000,state.rate);
 if(s.voltageMode==='230'){state.voltageMode='230';state.voltage=230;state.breaker=16;}
 else if(s.voltageMode==='custom'){state.voltageMode='custom';state.voltage=num(s.voltage,50,480,120);}
 else if(s.voltageMode==='120'){state.voltageMode='120';state.voltage=120;state.breaker=15;}
}
function renderInputs(){
 for(const key of ['currency','rate','offRate','peakRate','peakStart','peakEnd','offStart','offEnd','consolidateWatts','replacementWatts','price'])$(key).value=state[key];
 $('tou').checked=state.tou;renderRegion();toggleRates();renderDevices();renderResults();
}
function toggleRates(){$('flatField').hidden=state.tou;document.querySelectorAll('.touField').forEach(el=>el.hidden=!state.tou);}
function deviceInput(d,key,label,max,step='1'){return `<input data-id="${d.id}" data-key="${key}" aria-label="${esc(label)} for ${esc(d.name)}" type="text" inputmode="decimal" data-min="0" data-max="${max}" value="${d[key]}">`;}
function renderDevices(){
 $('devices').innerHTML=state.devices.map(d=>`<tr><td><input data-id="${d.id}" data-key="selected" type="checkbox" aria-label="Include ${esc(d.name)} in the what-ifs" ${d.selected?'checked':''}></td><td><input data-id="${d.id}" data-key="name" aria-label="Name of this device" type="text" maxlength="100" value="${esc(d.name)}"></td><td>${deviceInput(d,'idle','Idle watts',100000,'.1')}</td><td>${deviceInput(d,'load','Load watts',100000,'.1')}</td><td>${deviceInput(d,'loadPct','Percent of time at load',100,'.1')}</td><td>${deviceInput(d,'hours','Hours on per day',24,'.5')}</td><td>${deviceInput(d,'start','Hour it starts',23.99,'.5')}</td><td class="avg" id="avg-${d.id}">${number(M.watts(d),1)}</td><td><button class="remove" data-remove="${d.id}" aria-label="Remove ${esc(d.name)}">×</button></td></tr>`).join('')||'<tr><td colspan="9" class="help">Nothing here yet. Add a preset, or start with a blank device.</td></tr>';
}
function savingResult(id,scenario,baseline,extra=''){
 const delta=baseline.cost-scenario.cost;
 const deltaKwh=baseline.kwh-scenario.kwh;
 $(id).innerHTML=`<strong class="${delta< -1e-9?'warning':''}">${money(Math.abs(delta)*365)} / year</strong><span>${delta< -1e-9?'Costs more':delta>1e-9?'You\'d save':'No change'}, ${number(Math.abs(deltaKwh)*365)} kWh ${deltaKwh<0?'more':'less'}</span><span>Yearly total ${money(scenario.cost*365)}</span>${extra}`;
}
function renderCircuit(){
 const preset=state.voltageMode==='230'?'230':state.voltageMode==='custom'?'custom':'120';
 const presetEl=$('voltagePreset');
 if(document.activeElement!==presetEl)presetEl.value=preset;
 $('voltageCustomField').hidden=preset!=='custom';
 if(document.activeElement!==$('voltage'))$('voltage').value=state.voltage;
 const choices=state.voltage>=200?[10,16]:[15,20];
 const breakerEl=$('breakerPreset');
 const sig=choices.join(',');
 if(breakerEl.dataset.choices!==sig){
  breakerEl.innerHTML=choices.map(a=>`<option value="${a}">${a} A</option>`).join('')+'<option value="custom">Custom amps</option>';
  breakerEl.dataset.choices=sig;
 }
 if(document.activeElement!==breakerEl)breakerEl.value=choices.includes(state.breaker)?String(state.breaker):'custom';
 $('breakerCustomField').hidden=breakerEl.value!=='custom';
 if(document.activeElement!==$('breaker'))$('breaker').value=state.breaker;
 const volts=state.voltage;
 const rows=state.devices.map(d=>({name:d.name,watts:d.load,amps:d.load/volts}));
 const watts=rows.reduce((a,r)=>a+r.watts,0),amps=watts/volts,limit=state.breaker*0.8,over=amps>limit+1e-9;
 $('circuitStats').innerHTML=`<article class="circuit-stat"><p>Load watts combined</p><strong>${number(watts,1)} W</strong></article><article class="circuit-stat"><p>Amps at load</p><strong>${number(amps,2)} A</strong></article><article class="circuit-stat"><p>80% of a ${esc(number(state.breaker,2))} A breaker</p><strong>${number(limit,2)} A</strong></article>`;
 const status=$('circuitStatus');
 status.className=over?'circuit-warning':'circuit-ok';
 status.dataset.amps=String(amps);status.dataset.limit=String(limit);status.dataset.over=String(over);status.dataset.watts=String(watts);status.dataset.voltage=String(volts);status.dataset.breaker=String(state.breaker);
 status.innerHTML=over
  ?`<strong>Warning.</strong> ${esc(number(amps,2))} A at load is past 80% of this breaker (${esc(number(limit,2))} A on a ${esc(number(state.breaker,2))} A breaker). Load watts are what trip it. The bill doesn't change.`
  :`<strong>Under the limit.</strong> ${esc(number(amps,2))} A at load, and 80% of this ${esc(number(state.breaker,2))} A breaker is ${esc(number(limit,2))} A. Checked with load watts, not the average the bill uses.`;
 $('circuitRows').innerHTML=rows.length?`<div class="table-scroll" tabindex="0" role="region" aria-label="Amps at load for each device"><table class="amp-table"><caption class="sr-only">Amps at load for each device. That's load watts divided by the mains voltage.</caption><thead><tr><th scope="col">Device</th><th scope="col">Load W</th><th scope="col">Amps</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${number(r.watts,1)}</td><td>${number(r.amps,2)} A</td></tr>`).join('')}</tbody></table></div>`:'<p class="help">Add a device and the amps show up here.</p>';
}
function renderResults(){
 renderCircuit();
 const base=M.integrate(state.devices,state), periods=[['Per day',1],['Per month',M.MONTH_DAYS],['Per year',365]];
 $('totals').innerHTML=periods.map(([label,days])=>`<article class="total-card"><p>${label}</p><strong>${money(base.cost*days)}</strong><p class="energy">${number(base.kwh*days)} kWh</p></article>`).join('');
 const items=base.devices.map((r,i)=>({...r,name:state.devices[i].name}));
 $('costRows').innerHTML=items.map(d=>`<tr><td>${esc(d.name)}</td>${periods.map(([,days])=>`<td>${money(d.cost*days)}<span>${number(d.kwh*days)} kWh</span></td>`).join('')}</tr>`).join('')||'<tr><td colspan="4">Add a device and its cost shows up here.</td></tr>';
 const sorted=[...items].sort((a,b)=>b.cost-a.cost),max=sorted[0]?.cost||1;
 $('breakdown').innerHTML=sorted.map(d=>`<div class="bar-item"><div class="bar-label"><span>${esc(d.name)}</span><span>${money(d.cost*365)} (${base.cost?number(d.cost/base.cost*100,0):0}%)</span></div><div class="bar-track"><div class="bar-fill" style="width:${d.cost/max*100}%"></div></div></div>`).join('')||'<p class="help">Costs land here once you\'ve added gear.</p>';
 const selected=state.devices.filter(d=>d.selected).length;$('selection').textContent=selected?`${selected} device${selected===1?'':'s'} checked`:'None checked';
 if(!selected){for(const id of ['shutdownResult','consolidateResult','replacementResult'])$(id).innerHTML='<span>Check at least one device if you want a comparison.</span>';return;}
 savingResult('shutdownResult',M.integrate(state.devices,state,{shutdown:true,offStart:state.offStart,offEnd:state.offEnd}),base);
 savingResult('consolidateResult',M.integrate(state.devices,state,{replacement:true,replacementWatts:state.consolidateWatts}),base);
 const replacement=M.integrate(state.devices,state,{replacement:true,replacementWatts:state.replacementWatts});
 const payback=M.payback(state.price,base.cost-replacement.cost);
 const paybackText=payback===null?'Energy savings never cover this':state.price===0?'Nothing to buy, so it\'s paid for now':`Pays for itself in ${number(payback,1)} months (${number(payback/12,1)} ${number(payback/12,1)==='1'?'year':'years'})`;
 savingResult('replacementResult',replacement,base,`<span>${paybackText}</span>`);
}
const topLimits={rate:[0,1000],offRate:[0,1000],peakRate:[0,1000],peakStart:[0,23.99],peakEnd:[0,23.99],offStart:[0,23.99],offEnd:[0,23.99],consolidateWatts:[0,100000],replacementWatts:[0,100000],price:[0,1e9]};
for(const [key,[min,max]] of Object.entries(topLimits)){
 $(key).addEventListener('input',()=>{state[key]=num($(key).value,min,max);if(['rate','offRate','peakRate'].includes(key)){state.region=null;renderRegion();}renderResults();persist();});
 $(key).addEventListener('change',()=>{$(key).value=state[key];});
}
$('currency').addEventListener('change',()=>{state.currency=$('currency').value;state.region=null;renderRegion();renderResults();persist();});
$('tou').addEventListener('change',()=>{state.tou=$('tou').checked;state.region=null;renderRegion();toggleRates();renderResults();persist();});
$('preset').addEventListener('change',()=>{$('driveLabel').hidden=$('preset').value!=='nas';});
$('add').addEventListener('click',()=>{if(state.devices.length>=100){toast('100 devices is the cap.');return;}state.devices.push(makeDevice($('preset').value));renderDevices();renderResults();persist();$('devices').querySelector('tr:last-child [data-key="name"]').focus();});
const deviceMax={idle:100000,load:100000,loadPct:100,hours:24,start:23.99};
$('devices').addEventListener('input',e=>{const el=e.target,d=state.devices.find(d=>d.id===el.dataset.id);if(!d)return;const key=el.dataset.key;if(key==='name'){d.name=el.value.slice(0,100);const row=el.closest('tr');row.querySelector('[data-key="selected"]').setAttribute('aria-label',`Include ${d.name} in the what-ifs`);row.querySelector('[data-remove]').setAttribute('aria-label',`Remove ${d.name}`);for(const input of row.querySelectorAll('[inputmode="decimal"]')){const title={idle:'Idle watts',load:'Load watts',loadPct:'Percent of time at load',hours:'Hours on per day',start:'Hour it starts'}[input.dataset.key];input.setAttribute('aria-label',`${title} for ${d.name}`);}}else if(key==='selected')d.selected=el.checked;else if(key in deviceMax)d[key]=num(el.value,0,deviceMax[key]);else return;$(`avg-${d.id}`).textContent=number(M.watts(d),1);renderResults();persist();});
$('devices').addEventListener('change',e=>{const el=e.target,d=state.devices.find(d=>d.id===el.dataset.id);if(d&&el.dataset.key in deviceMax)el.value=d[el.dataset.key];});
$('devices').addEventListener('click',e=>{const button=e.target.closest('[data-remove]');if(!button)return;const index=state.devices.findIndex(d=>d.id===button.dataset.remove);state.devices=state.devices.filter(d=>d.id!==button.dataset.remove);renderDevices();renderResults();persist();const buttons=$('devices').querySelectorAll('[data-remove]');(buttons[Math.min(index,buttons.length-1)]||$('add')).focus();});
$('reset').addEventListener('click',()=>{if(!confirm('Swap this for the demo devices and the default rates?'))return;state=defaults();renderInputs();persist();toast('Demo\'s loaded again.');});
$('share').addEventListener('click',async()=>{const url=new URL(location.href);url.hash=`s=${encode(state)}`;try{history.replaceState(null,'',url.href);}catch{}try{await navigator.clipboard.writeText(url.href);toast('Link copied. It includes your device names and settings.');}catch{toast('Couldn\'t copy it. Grab the URL from the address bar.');}});
// Region choices use only the checked local snapshot, never live network requests.
$('country').innerHTML+='<option value="US">United States</option>'+window.RegionRates.countries.filter(([id])=>id!=='US').map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
$('usState').innerHTML=regions.filter(r=>r.country==='US').map(r=>`<option value="${r.id}">${r.name}</option>`).join('');
function renderRegion(){const r=regions.find(r=>r.id===state.region);$('country').value=r?.country||'';$('stateField').hidden=r?.country!=='US';$('usState').value=r?.country==='US'?r.id:'US';$('regionSource').innerHTML=r?`Published average: ${esc(r.currency)} ${r.rate} per kWh. <a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.source}</a>, ${r.period}, published ${r.published}. ${r.note} Swap in the number from your own bill if this isn't it.`:'Pick a checked average, or type the rate from your bill. US numbers are EIA for August 2026, published 2026-10-23. Europe is Eurostat for January to June 2026, published 2026-10-30. An average is a starting point, not your tariff.';}
function applyRegion(id){const r=regions.find(r=>r.id===id);if(!r){state.region=null;renderRegion();persist();return;}const eu=!String(r.id).startsWith('US');state.region=r.id;state.rate=r.rate;state.currency=r.currency;state.tou=false;state.voltageMode=eu?'230':'120';state.voltage=eu?230:120;state.breaker=eu?16:15;renderInputs();persist();toast(`Loaded the ${r.name} average, and set ${eu?'230 V with a 16 A breaker':'120 V with a 15 A breaker'}. Use your own bill if it disagrees.`);}
$('voltagePreset').addEventListener('change',()=>{const mode=$('voltagePreset').value;if(mode==='120'){state.voltageMode='120';state.voltage=120;if(![15,20].includes(state.breaker))state.breaker=15;}else if(mode==='230'){state.voltageMode='230';state.voltage=230;if(![10,16].includes(state.breaker))state.breaker=16;}else state.voltageMode='custom';renderCircuit();persist();});
$('voltage').addEventListener('input',()=>{state.voltageMode='custom';state.voltage=num($('voltage').value,50,480,120);renderCircuit();persist();});
$('voltage').addEventListener('change',()=>{$('voltage').value=state.voltage;});
$('breakerPreset').addEventListener('change',()=>{const v=$('breakerPreset').value;if(v!=='custom')state.breaker=num(v,1,200,15);renderCircuit();persist();});
$('breaker').addEventListener('input',()=>{state.breaker=num($('breaker').value,1,200,15);renderCircuit();persist();});
$('breaker').addEventListener('change',()=>{$('breaker').value=state.breaker;});
$('country').addEventListener('change',()=>applyRegion($('country').value));
$('usState').addEventListener('change',()=>applyRegion($('usState').value));
const packDefinitions={pi:[['Raspberry Pi (estimate)',3,8],['Small NAS, 2 drives (estimate)',25,41]],cluster:[['Mini PC 1 (estimate)',8,35],['Mini PC 2 (estimate)',8,35],['Mini PC 3 (estimate)',8,35],['Network switch (estimate)',8,15]],rack:[['Old Dell rack server (estimate)',120,280],['Network switch (estimate)',8,15]],media:[['Media server, 8 drives (estimate)',55,89],['Network switch (estimate)',8,15]]};
$('starterPacks').addEventListener('click',e=>{const button=e.target.closest('[data-pack]');if(!button)return;const definitions=packDefinitions[button.dataset.pack];if(!definitions)return;const add=$('packMode').value==='add';if(add&&state.devices.length+definitions.length>100){toast('That pack would push you past 100 devices. Drop one, or replace the list.');return;}if(!add&&!confirm(`Replace your devices with ${button.textContent}? Rates and the other settings stay.`))return;const devices=definitions.map(([name,idle,load])=>({id:uid(),name,idle,load,loadPct:20,hours:24,start:0,selected:true}));state.devices=add?[...state.devices,...devices]:devices;renderDevices();renderResults();persist();toast(`${button.textContent} ${add?'added':'loaded'}. Treat the watts as a guess until you measure.`);});
$('exportCSV').addEventListener('click',async()=>{if(window.NativeExportCSV){try{await window.NativeExportCSV(window.PowerCSV.export(state));toast('CSV is ready to save or share.');}catch{toast('CSV share was cancelled.');}return;}const blob=new Blob([window.PowerCSV.export(state)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='homelab-power-costs.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV downloaded. It has names, energy, costs, your rate, and the circuit settings.');});
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#s='))return;try{state=decode(location.hash);renderInputs();persist();toast('That shared setup is loaded.');}catch{toast('That share link didn\'t work. Kept what you already had.');}});
window.PowerApp={getStateOrigin:()=>stateOrigin,getState:()=>JSON.parse(JSON.stringify(state)),normalize,defaults,replaceState:raw=>{state=normalize(raw);renderInputs();persist();},toast};
renderInputs();persist();if(loadMessage)toast(loadMessage);
})();
