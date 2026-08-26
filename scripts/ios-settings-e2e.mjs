import{readFileSync,mkdirSync,writeFileSync,mkdtempSync}from'node:fs';
import{tmpdir}from'node:os';
import{join,resolve}from'node:path';
import{spawn}from'node:child_process';

const env={};
for(const line of readFileSync(resolve('.env.local'),'utf8').split(/\r?\n/)){
  if(!line||line.startsWith('#')||!line.includes('='))continue;
  const at=line.indexOf('=');env[line.slice(0,at)]=line.slice(at+1);
}
if(!env.POCKET_PASSWORD)throw new Error('POCKET_PASSWORD is required in .env.local');
mkdirSync('evidence',{recursive:true});
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile=mkdtempSync(join(tmpdir(),'hp-ios-e2e-')),port=9337;
const child=spawn(chrome,[`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function retry(fn,attempts=60){let last;for(let i=0;i<attempts;i++){try{return await fn()}catch(e){last=e;await sleep(100)}}throw last}
let ws,id=0;const pending=new Map(),events=[];
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))})}
async function value(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.result.value}
async function waitFor(expression,label,attempts=100){for(let i=0;i<attempts;i++){if(await value(`Boolean(${expression})`))return;await sleep(80)}throw new Error(`Timeout waiting for ${label}`)}
async function click(expression){const ok=await value(`(()=>{const e=${expression};if(!e)return false;e.click();return true})()`);if(!ok)throw new Error(`Click target missing: ${expression}`)}
try{
 const target=await retry(async()=>{const rows=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());const page=rows.find(x=>x.type==='page');if(!page)throw new Error('No page target');return page});
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m)}else events.push(m)};
 await Promise.all([send('Page.enable'),send('Runtime.enable'),send('Network.enable')]);
 await send('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:3,mobile:true,screenWidth:430,screenHeight:932,positionX:0,positionY:0});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 let safeAreaEmulated=true;try{await send('Emulation.setSafeAreaInsetsOverride',{insets:{top:59,left:0,bottom:34,right:0}})}catch{safeAreaEmulated=false}
 await send('Page.navigate',{url:'http://127.0.0.1:9999/?ios-e2e=1'});await waitFor(`document.readyState==='complete'`,'page load');
 await waitFor(`document.querySelector('.shell,input[type=password]')`,'login or shell');
 if(await value(`Boolean(document.querySelector('input[type=password]'))`)){
   const pass=JSON.stringify(env.POCKET_PASSWORD);
   await value(`(()=>{const e=document.querySelector('input[type=password]'),s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,${pass});e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form button').click()})()`);
 }
 await waitFor(`document.querySelector('.shell')`,'authenticated shell');
 const open=async()=>{await click(`[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Cài đặt'))`);await waitFor(`document.querySelector('.settings-overlay')`,'settings');await sleep(100)};
 await open();
 const layout=await value(`(()=>{const h=document.querySelector('.settings-overlay>header').getBoundingClientRect(),b=document.querySelector('.settings-back').getBoundingClientRect(),m=document.querySelector('.settings-layout>main'),s=getComputedStyle(m);return{url:location.search,viewport:[innerWidth,innerHeight],header:{top:h.top,height:h.height,bottom:h.bottom},back:{top:b.top,height:b.height,bottom:b.bottom},mainPaddingBottom:parseFloat(s.paddingBottom),bodyOverflow:document.documentElement.scrollWidth>innerWidth,overlayOverflow:document.querySelector('.settings-overlay').scrollWidth>innerWidth}})()`);
 const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});writeFileSync('evidence/iphone-settings-safe-area.png',Buffer.from(shot.result.data,'base64'));
 await click(`document.querySelector('.settings-back')`);await waitFor(`document.querySelector('.shell')`,'button back');const buttonBack=await value(`!new URLSearchParams(location.search).has('settings')`);
 await open();await value(`history.back()`);await waitFor(`document.querySelector('.shell')`,'history back');const historyBack=await value(`!new URLSearchParams(location.search).has('settings')`);
 await open();
 const nativeBackEntry=await value(`history.state?.hpSettings===true&&new URLSearchParams(location.search).get('settings')==='1'`);
 await value(`history.back()`);await waitFor(`document.querySelector('.shell')`,'native history back');
 const consoleErrors=events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Runtime.consoleAPICalled'&&e.params.type==='error')).map(e=>e.method);
 const networkErrors=events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status>=400).map(e=>`${e.params.response.status} ${new URL(e.params.response.url).pathname}`).filter(x=>x!=='401 /pocket/auth/session');
 const css=readFileSync(resolve('src/styles.css'),'utf8'),safeAreaContract=['safe-area-inset-top','safe-area-inset-right','safe-area-inset-bottom','safe-area-inset-left'].every(x=>css.includes(`env(${x}`));
 const expectedTop=safeAreaEmulated?59:0,expectedBottom=safeAreaEmulated?64:30;
 const out={safeAreaEmulated,safeAreaContract,layout,buttonBack,historyBack,nativeBackEntry,consoleErrors,networkErrors};
 writeFileSync('evidence/ios-settings-e2e.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
 if(!safeAreaContract||!layout.url.includes('settings=1')||layout.header.top!==0||layout.header.height<58+expectedTop||layout.back.top<expectedTop||layout.back.height<44||layout.mainPaddingBottom<expectedBottom||layout.bodyOverflow||layout.overlayOverflow||!buttonBack||!historyBack||!nativeBackEntry||consoleErrors.length||networkErrors.length)process.exitCode=1;
}finally{try{ws?.close()}catch{}child.kill()}
