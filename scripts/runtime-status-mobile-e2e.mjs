import{readFileSync,mkdirSync,writeFileSync,mkdtempSync}from'node:fs';
import{tmpdir}from'node:os';
import{join,resolve}from'node:path';
import{spawn}from'node:child_process';

const env={};for(const line of readFileSync(resolve('.env.local'),'utf8').split(/\r?\n/)){if(!line||line.startsWith('#')||!line.includes('='))continue;const at=line.indexOf('=');env[line.slice(0,at)]=line.slice(at+1)}
if(!env.POCKET_PASSWORD)throw Error('POCKET_PASSWORD is required');
const session='20260825_181013_ef3a36',base='http://127.0.0.1:9999',target=`${base}/?session=${session}&runtime-status-e2e=1`;
mkdirSync('evidence',{recursive:true});
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',profile=mkdtempSync(join(tmpdir(),'hp-status-')),port=19437+Math.floor(Math.random()*1000);
const child=spawn(chrome,[`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),events=[];
const retry=async(fn,n=80)=>{let last;for(let i=0;i<n;i++){try{return await fn()}catch(e){last=e;await sleep(100)}}throw last};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const value=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result.exceptionDetails)throw Error(r.result.exceptionDetails.text);return r.result.result.value};
const waitFor=async(expression,label,n=120)=>{for(let i=0;i<n;i++){if(await value(`Boolean(${expression})`))return;await sleep(100)}throw Error(`Timeout waiting for ${label}`)};
try{
 const page=await retry(async()=>{const xs=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());const p=xs.find(x=>x.type==='page');if(!p)throw Error('page unavailable');return p});
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no});
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m)}else events.push(m)};
 await Promise.all([send('Page.enable'),send('Runtime.enable'),send('Network.enable')]);
 await send('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:3,mobile:true,screenWidth:430,screenHeight:932,positionX:0,positionY:0});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 try{await send('Emulation.setSafeAreaInsetsOverride',{insets:{top:59,left:0,bottom:34,right:0}})}catch{}
 await send('Page.navigate',{url:target});await waitFor(`document.readyState==='complete'`,'page');await waitFor(`document.querySelector('.shell,input[type=password]')`,'auth surface');
 if(await value(`!!document.querySelector('input[type=password]')`)){const pass=JSON.stringify(env.POCKET_PASSWORD);await value(`(()=>{const e=document.querySelector('input[type=password]'),set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,${pass});e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form button').click();return true})()`)}
 await waitFor(`document.querySelector('.shell')`,'authenticated shell');await waitFor(`document.querySelector('.runtime-status.running')`,'running header',150);await sleep(500);
 await value(`document.querySelector('.mobile-menu').click()`);await sleep(300);
 const report=await value(`JSON.stringify((()=>{const root=document.documentElement,body=document.body,header=document.querySelector('.top'),thread=document.querySelector('.thread'),composer=document.querySelector('.composer'),status=document.querySelector('.runtime-status'),pips=[...document.querySelectorAll('nav .session-pip')];const bad=[...thread.querySelectorAll('*')].map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName,cls:typeof el.className==='string'?el.className:'',left:r.left,right:r.right,scroll:el.scrollWidth,client:el.clientWidth}}).filter(x=>x.right>innerWidth+.5||x.left<-.5||x.scroll>x.client+1);return{url:location.href,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,rootWidth:[root.clientWidth,root.scrollWidth],bodyWidth:[body.clientWidth,body.scrollWidth],header:header.getBoundingClientRect().toJSON(),thread:{client:thread.clientWidth,scroll:thread.scrollWidth},composer:composer.getBoundingClientRect().toJSON(),headerState:status.className,headerLabel:status.textContent.trim(),pips:{running:pips.filter(x=>x.classList.contains('running')).length,stopped:pips.filter(x=>x.classList.contains('stopped')).length,unavailable:pips.filter(x=>x.classList.contains('unavailable')).length,total:pips.length},badCount:bad.length,bad:bad.slice(0,10)}})())`);
 const parsed=JSON.parse(report),consoleErrors=events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Runtime.consoleAPICalled'&&e.params.type==='error')).map(e=>e.method),networkErrors=events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status>=400).map(e=>`${e.params.response.status} ${new URL(e.params.response.url).pathname}`).filter(x=>x!=='401 /pocket/auth/session');
 const out={...parsed,consoleErrors,networkErrors};writeFileSync('evidence/runtime-status-mobile-e2e.json',JSON.stringify(out,null,2));
 const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});writeFileSync('evidence/runtime-status-iphone.png',Buffer.from(shot.result.data,'base64'));console.log(JSON.stringify(out));
 if(!out.url.includes(`session=${session}`)||out.viewport[0]!==430||out.viewport[1]!==932||out.rootWidth[1]!==430||out.bodyWidth[1]!==430||!out.headerState.includes('running')||out.pips.running<1||out.pips.stopped<1||out.pips.unavailable!==0||out.badCount||out.thread.scroll>out.thread.client||out.header.left<0||out.header.right>430||out.composer.left<0||out.composer.right>430||consoleErrors.length||networkErrors.length)process.exitCode=1;
}finally{try{ws?.close()}catch{}child.kill()}
