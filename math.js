/* Shared deterministic math; no DOM or network dependencies. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PowerMath=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MONTH_DAYS=365/12;
// A lone comma is a decimal comma (12,5). If both comma and dot appear, the later one is the decimal mark.
function parse(v){
 if(typeof v==='number')return v;
 let s=String(v??'').trim().replace(/\s/g,'');
 if(!s)return NaN;
 const comma=s.lastIndexOf(','), dot=s.lastIndexOf('.');
 if(comma!==-1&&dot!==-1)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(comma!==-1){
  const bits=s.split(',');
  s=bits.length>2?s.replace(/,/g,''):s.replace(',','.');
 }
 const n=Number(s);
 return n;
}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,parse(v)||0));
function inWindow(t,start,hours){return hours>=24 || (hours>0 && ((t-start+24)%24)<hours);}
function windowHours(start,end){return (end-start+24)%24;}
function watts(d){return d.idle+(d.load-d.idle)*d.loadPct/100;}
function rateAt(t,s,isWeekend=false){
 if(!s)return 0;
 if(s.tou&&Array.isArray(s.periods)&&s.periods.length){
  const day=isWeekend?'weekend':'weekday';
  for(const p of s.periods){
   if(!p||!Number.isFinite(+p.price))continue;
   if(p.days!=='all'&&p.days!==day)continue;
   if(p.allDay||inWindow(t,p.start,windowHours(p.start,p.end)))return +p.price;
  }
  return s.rate;
 }
 return s.tou&&inWindow(t,s.peakStart,windowHours(s.peakStart,s.peakEnd))?s.peakRate:s.tou?s.offRate:s.rate;
}
// Exact integration at every daily schedule/rate boundary, including wrapped intervals.
function integrateDay(devices,s,options={}){
 const selected=devices.filter(d=>d.selected), replacement=options.replacement;
 const boundaries=new Set([0,24,s.peakStart,s.peakEnd,options.offStart??0,options.offEnd??0]);
 if(Array.isArray(s.periods))s.periods.forEach(p=>{if(!p||p.allDay)return;boundaries.add(+p.start||0);boundaries.add(+p.end||0);});
 devices.forEach(d=>{boundaries.add(d.start);boundaries.add((d.start+d.hours)%24);});
 const points=[...boundaries].filter(x=>x>=0&&x<=24).sort((a,b)=>a-b);
 const results=devices.map(d=>({id:d.id,kwh:0,cost:0}));let newKwh=0,newCost=0;
 for(let i=0;i<points.length-1;i++){
  const duration=points[i+1]-points[i],t=(points[i]+points[i+1])/2,rate=rateAt(t,s,options.weekend===true);
  devices.forEach((d,j)=>{
   let on=inWindow(t,d.start,d.hours);
   if(options.shutdown&&d.selected&&inWindow(t,options.offStart,windowHours(options.offStart,options.offEnd)))on=false;
   if(replacement&&d.selected)on=false;
   if(on){const kwh=watts(d)*duration/1000;results[j].kwh+=kwh;results[j].cost+=kwh*rate;}
  });
  if(replacement&&selected.some(d=>inWindow(t,d.start,d.hours))){const kwh=options.replacementWatts*duration/1000;newKwh+=kwh;newCost+=kwh*rate;}
 }
 return {devices:results,kwh:results.reduce((a,d)=>a+d.kwh,0)+newKwh,cost:results.reduce((a,d)=>a+d.cost,0)+newCost};
}
// A normalized average day: five weekday patterns plus two weekend patterns.
// Each day type uses its own repeating 24-hour window, including midnight wraps.
function integrate(devices,s,options={}){
 const weekday=integrateDay(devices,s,{...options,weekend:false});
 const weekendRates=Array.isArray(s.periods)&&s.periods.some(p=>p&&(p.days==='weekday'||p.days==='weekend'));
 if(!devices.some(d=>d.separateWeekend)&&!weekendRates)return weekday;
 const weekend=integrateDay(devices.map(d=>d.separateWeekend?{...d,hours:d.weekendHours??d.hours,start:d.weekendStart??d.start}:d),s,{...options,weekend:true});
 const average=(a,b)=>(5*a+2*b)/7;
 return {kwh:average(weekday.kwh,weekend.kwh),cost:average(weekday.cost,weekend.cost),devices:weekday.devices.map((d,i)=>({id:d.id,kwh:average(d.kwh,weekend.devices[i].kwh),cost:average(d.cost,weekend.devices[i].cost)}))};
}
function payback(price,dailySavings){return dailySavings>0?price/(dailySavings*MONTH_DAYS):null;}
// Continuous draw. Month length matches the calculator: 365/12.
function energyCost(watts, rate){
 const w=Math.max(0,Number(watts)||0), r=Math.max(0,Number(rate)||0), kwhDay=w*24/1000;
 return {kwhDay, kwhMonth:kwhDay*MONTH_DAYS, kwhYear:kwhDay*365, month:kwhDay*MONTH_DAYS*r, year:kwhDay*365*r};
}
function btuPerHour(watts){return Math.max(0,Number(watts)||0)*3.412;}
function yearlySavings(fromWatts,toWatts,rate){
 const delta=energyCost(fromWatts,rate).year-energyCost(toWatts,rate).year;
 return {year:delta,month:delta/12};
}
// Linear between published points. Outside the curve we only say longer or shorter than the nearest point.
function interpolateRuntime(curve,loadW){
 const pts=[...curve].filter(p=>Number.isFinite(+p.loadW)&&Number.isFinite(+p.minutes)).map(p=>({loadW:+p.loadW,minutes:+p.minutes})).sort((a,b)=>a.loadW-b.loadW);
 if(!pts.length||!(loadW>0))return null;
 if(Math.abs(loadW-pts[0].loadW)<1e-9)return {minutes:pts[0].minutes,bound:'exact'};
 if(loadW<pts[0].loadW)return {minutes:pts[0].minutes,bound:'longer'};
 const last=pts[pts.length-1];
 if(Math.abs(loadW-last.loadW)<1e-9)return {minutes:last.minutes,bound:'exact'};
 if(loadW>last.loadW)return {minutes:last.minutes,bound:'shorter'};
 for(let i=0;i<pts.length-1;i++){
  const a=pts[i],b=pts[i+1];
  if(loadW>=a.loadW&&loadW<=b.loadW+1e-9){
   const t=(loadW-a.loadW)/(b.loadW-a.loadW||1);
   return {minutes:a.minutes+(b.minutes-a.minutes)*t,bound:'exact'};
  }
 }
 return null;
}
// Lead-acid UPS energy when the sheet gives watt-hours (or VAh treated as that published energy) and no curve.
// Mid uses 85% inverter efficiency and 80% of the pack. The range is 80%/70% through 90%/90%.
function runtimeFromEnergy(wh,loadW){
 if(!(wh>0)||!(loadW>0))return null;
 const minutes=(eff,dod)=>wh*eff*dod/loadW*60;
 return {low:minutes(0.8,0.7),mid:minutes(0.85,0.8),high:minutes(0.9,0.9),efficiency:0.85,dod:0.8};
}
function periodIntervals(start,end){
 const hours=windowHours(start,end);
 if(!(hours>0))return [];
 if(start+hours<=24+1e-9)return [[start,Math.min(24,start+hours)]];
 return [[start,24],[0,(start+hours)%24]];
}
function touIssues(periods){
 const overlaps=[],gaps=[];
 const all=Array.isArray(periods)?periods:[];
 for(const day of ['weekday','weekend']){
  const relevant=all.filter(p=>p&&(p.days==='all'||p.days===day)&&(p.allDay||windowHours(p.start,p.end)>0));
  const points=new Set([0,24]);
  for(const p of relevant){if(p.allDay)continue;for(const [s,e] of periodIntervals(p.start,p.end)){points.add(Math.round(s*1000)/1000);points.add(Math.round(e*1000)/1000);}}
  const uniq=[...points].sort((a,b)=>a-b);
  for(let i=0;i<uniq.length-1;i++){
   const len=uniq[i+1]-uniq[i];
   if(len<=1e-6)continue;
   const mid=(uniq[i]+uniq[i+1])/2;
   const hits=relevant.filter(p=>p.allDay||inWindow(mid,p.start,windowHours(p.start,p.end)));
   if(hits.length===0)gaps.push({day,start:uniq[i],end:uniq[i+1]});
   else if(hits.length>1)overlaps.push({day,start:uniq[i],end:uniq[i+1],names:hits.map(p=>p.name||'Period')});
  }
 }
 return {overlaps,gaps};
}
function cleanPeriods(raw){
 if(!Array.isArray(raw))return [];
 const out=[];
 for(const p of raw.slice(0,8)){
  if(!p||typeof p!=='object')continue;
  const days=['all','weekday','weekend'].includes(p.days)?p.days:'all';
  const id=/^[\w-]{1,40}$/.test(String(p.id||''))?String(p.id):`p${out.length+1}`;
  out.push({id,name:String(p.name||'Period').replace(/[<>]/g,'').slice(0,40),price:clamp(p.price??0,0,1000),start:clamp(p.start??0,0,23.99),end:clamp(p.end??0,0,23.99),days,allDay:p.allDay===true});
 }
 return out;
}
return {MONTH_DAYS,parse,clamp,inWindow,windowHours,watts,rateAt,integrateDay,integrate,payback,energyCost,btuPerHour,yearlySavings,interpolateRuntime,runtimeFromEnergy,touIssues,cleanPeriods};
});
