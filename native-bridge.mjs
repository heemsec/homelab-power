// Bundled only into the native Android assets. Not loaded by the web build.
import {Capacitor,registerPlugin} from '@capacitor/core';
import {Filesystem,Directory,Encoding} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
if(Capacitor.isNativePlatform())window.NativeExportCSV=async text=>{const {uri}=await Filesystem.writeFile({path:'homelab-power-costs.csv',data:text,directory:Directory.Cache,encoding:Encoding.UTF8});await Share.share({title:'Homelab power costs',url:uri,dialogTitle:'Save or share your CSV'});};

if(Capacitor.isNativePlatform()){const Printer=registerPlugin('ReportPrinter');window.NativePrintReport=()=>Printer.print();}

// Google Play Billing (Android only). Entitlement comes from the native PlayBilling plugin.
// getState, purchase, restore, and billingUpdate all carry pendingTips: an array of product ids
// (tip_small, tip_medium, tip_large) that are still pending or not yet consumed.
if(Capacitor.isNativePlatform()&&Capacitor.isPluginAvailable('PlayBilling')){const Billing=registerPlugin('PlayBilling');window.NativeBilling={getState:()=>Billing.getState(),purchase:productId=>Billing.purchase({productId}),restore:()=>Billing.restore(),onUpdate:fn=>Billing.addListener('billingUpdate',fn)};}
