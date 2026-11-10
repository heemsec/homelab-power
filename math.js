/* Shared deterministic math; no DOM or network dependencies. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PowerMath=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MONTH_DAYS=365/12;
// Accept a decimal comma, but never guess at mixed decimal/thousands separators.
const parse=v=>typeof v==='number'?v:Number(String(v??'').trim().replace(',', '.'));
const clamp=(v,min,max)=>Math.max(min,Math.min(max,parse(v)||0));
function inWindow(t,start,hours){return hours>=24 || (hours>0 && ((t-start+24)%24)<hours);}
function windowHours(start,end){return (end-start+24)%24;}
function watts(d){return d.idle+(d.load-d.idle)*d.loadPct/100;}
function rateAt(t,s){return s.tou&&inWindow(t,s.peakStart,windowHours(s.peakStart,s.peakEnd))?s.peakRate:s.tou?s.offRate:s.rate;}
// Exact integration at every daily schedule/rate boundary, including wrapped intervals.
function integrateDay(devices,s,options={}){
 const selected=devices.filter(d=>d.selected), replacement=options.replacement;
 const boundaries=new Set([0,24,s.peakStart,s.peakEnd,options.offStart??0,options.offEnd??0]);
 devices.forEach(d=>{boundaries.add(d.start);boundaries.add((d.start+d.hours)%24);});
 const points=[...boundaries].filter(x=>x>=0&&x<=24).sort((a,b)=>a-b);
 const results=devices.map(d=>({id:d.id,kwh:0,cost:0}));let newKwh=0,newCost=0;
 for(let i=0;i<points.length-1;i++){
  const duration=points[i+1]-points[i],t=(points[i]+points[i+1])/2,rate=rateAt(t,s);
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
 const weekday=integrateDay(devices,s,options);
 if(!devices.some(d=>d.separateWeekend))return weekday;
 const weekend=integrateDay(devices.map(d=>d.separateWeekend?{...d,hours:d.weekendHours??d.hours,start:d.weekendStart??d.start}:d),s,options);
 const average=(a,b)=>(5*a+2*b)/7;
 return {kwh:average(weekday.kwh,weekend.kwh),cost:average(weekday.cost,weekend.cost),devices:weekday.devices.map((d,i)=>({id:d.id,kwh:average(d.kwh,weekend.devices[i].kwh),cost:average(d.cost,weekend.devices[i].cost)}))};
}
function payback(price,dailySavings){return dailySavings>0?price/(dailySavings*MONTH_DAYS):null;}
// Continuous draw. Month length matches the calculator: 365/12.
function energyCost(watts, rate){
 const w=Number(watts)||0, r=Number(rate)||0, kwhDay=w*24/1000;
 return {kwhDay, kwhMonth:kwhDay*MONTH_DAYS, kwhYear:kwhDay*365, month:kwhDay*MONTH_DAYS*r, year:kwhDay*365*r};
}
return {MONTH_DAYS,parse,clamp,inWindow,windowHours,watts,rateAt,integrateDay,integrate,payback,energyCost};
});
