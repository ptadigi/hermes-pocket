import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port=20000+Math.floor(Math.random()*20000);
const userDir=`${process.env.TEMP||process.env.TMP||'.'}\\hp-gap-${randomUUID()}`;
const target='http://127.0.0.1:9999/?cdp-gap=1';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const env=await readFile(new URL('../.env.local',import.meta.url),'utf8');
const pw=env.split(/\r?\n/).find(l=>l.startsWith('POCKET_PASSWORD='))?.slice(16).trim();
const child=spawn(chrome,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--headless=new','--disable-gpu','--no-first-run',`--user-data-dir=${userDir}`,'about:blank'],{stdio:'ignore'});
let ws,seq=0;const pending=new Map();
try{
 let page;for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(target)}`,{method:'PUT'});if(r.ok){page=await r.json();break}}catch{}await wait(200)}
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no});
 ws.onmessage=async e=>{const raw=typeof e.data==='string'?e.data:await e.data.text();const m=JSON.parse(raw);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
 const call=(method,params={})=>new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);rej(Error('timeout '+method))},20000);pending.set(id,m=>{clearTimeout(t);m.error?rej(Error(m.error.message)):res(m.result)});ws.send(JSON.stringify({id,method,params}))});
 const ev=async expr=>{const r=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)return{__err:r.exceptionDetails.exception?.description};return r.result.value};
 await call('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:1,mobile:true,screenWidth:430,screenHeight:932});
 await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 for(let i=0;i<60;i++){if(await ev("!!document.querySelector('.login input')"))break;await wait(250)}
 await ev(`fetch('/pocket/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:${JSON.stringify(pw)}})}).then(r=>r.status)`);
 await call('Page.reload',{});await wait(600);
 for(let i=0;i<60;i++){if(await ev("!!document.querySelector('.composer')"))break;await wait(250)}
 console.log(await ev(`JSON.stringify((()=>{const c=document.querySelector('.composer');const row=c.querySelector('.composer-row')||c.querySelector('div');const cs=getComputedStyle(c);const cr=c.getBoundingClientRect();const rr=row.getBoundingClientRect();const small=c.querySelector(':scope>small');return{innerH:innerHeight,composerBottom:cr.bottom,composerHeight:cr.height,rowBottom:rr.bottom,gapBelowComposer:innerHeight-cr.bottom,gapBelowRow:innerHeight-rr.bottom,padBottom:cs.paddingBottom,padTop:cs.paddingTop,smallHeight:small?small.getBoundingClientRect().height:0,smallText:small?small.textContent.slice(0,40):null}})())`));
}finally{try{ws?.close()}catch{}if(child.pid)spawnSync('taskkill',['/PID',String(child.pid),'/F'],{stdio:'ignore'})}
