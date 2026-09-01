import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),env={};
for(const line of readFileSync(resolve(root,'.env.local'),'utf8').split(/\r?\n/)){if(!line||line.startsWith('#')||!line.includes('='))continue;const i=line.indexOf('=');env[line.slice(0,i)]=line.slice(i+1)}
const api=env.HERMES_API_BASE,apiHeaders={authorization:`Bearer ${env.API_SERVER_KEY}`,'content-type':'application/json'};
const sid=`pocket_browser_ws_${Date.now()}`,chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',port=21000+Math.floor(Math.random()*15000),profile=`${process.env.TEMP||process.env.TMP||'.'}\\hp-ws-${randomUUID()}`;
const target=`http://127.0.0.1:${env.POCKET_PORT||9999}/?session=${sid}`;
const child=spawn(chrome,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--headless=new','--disable-gpu','--disable-background-networking','--no-first-run',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));let ws,seq=0;const pending=new Map(),wsCreated=[],wsFrames=[],consoleErrors=[],exceptions=[];
const evaluate=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
const until=async(fn,ms=30000)=>{const start=Date.now();while(Date.now()-start<ms){const v=await fn();if(v)return v;await wait(200)}throw Error('browser acceptance timeout')};
let call;
try{
 let r=await fetch(api+'/api/sessions',{method:'POST',headers:apiHeaders,body:JSON.stringify({id:sid,title:'Pocket Browser WS E2E',source:'api_server'})});if(r.status!==201)throw Error(`create ${r.status}`);
 let page;for(let i=0;i<50;i++){try{r=await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(target)}`,{method:'PUT'});if(r.ok){page=await r.json();break}}catch{}await wait(200)}if(!page)throw Error('CDP target unavailable');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no});
 ws.onmessage=async e=>{const raw=typeof e.data==='string'?e.data:await e.data.text(),m=JSON.parse(raw);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);return}if(m.method==='Network.webSocketCreated')wsCreated.push(m.params.url);if(m.method==='Network.webSocketFrameReceived')wsFrames.push(m.params.response.payloadData);if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))consoleErrors.push(m.params.type);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text)};
 call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout ${method}`))},15000);pending.set(id,m=>{clearTimeout(t);m.error?reject(Error(m.error.message)):resolve(m.result)});ws.send(JSON.stringify({id,method,params}))});
 await call('Network.enable');await call('Runtime.enable');await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:1,mobile:true,screenWidth:430,screenHeight:932});await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await call('Page.reload',{ignoreCache:true});
 await until(()=>evaluate("!!document.querySelector('.login-card')"),15000);
 const password=JSON.stringify(env.POCKET_PASSWORD);
 await evaluate(`(()=>{const i=document.querySelector('.login input'),set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,${password});i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.login button').click();return true})()`);
 await until(()=>evaluate("!!document.querySelector('.shell')&&!!document.querySelector('textarea')"),20000);
 const pinned=await evaluate("new URL(location.href).searchParams.get('session')");
 await until(()=>Promise.resolve(wsCreated.some(x=>x.includes(`/pocket/ws?session=${sid}`))),10000);
 const thinkingBefore=await evaluate("!!document.querySelector('.thinking-state')");
 await evaluate(`(()=>{const t=document.querySelector('textarea'),set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'Trả lời đúng một từ: BROWSER_WS_OK');t.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('button[aria-label="Gửi tin nhắn"]').click();return true})()`);
 const thinkingSeen=await until(()=>evaluate("!!document.querySelector('.thinking-state')"),10000).catch(()=>false);
 await until(()=>evaluate("!document.querySelector('.thinking-state')&&[...document.querySelectorAll('article.assistant')].some(x=>x.innerText.includes('BROWSER_WS_OK'))"),90000);
 const result=await evaluate(`JSON.stringify((()=>({url:location.href,inner:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth,pinned:new URL(location.href).searchParams.get('session'),thinking:!!document.querySelector('.thinking-state'),assistantTexts:[...document.querySelectorAll('article.assistant')].map(x=>x.innerText),status:document.querySelector('.status')?.textContent||''}))())`);
 const canonicalResponse=await fetch(`${api}/api/sessions/${sid}/messages`,{headers:apiHeaders});const canonical=((await canonicalResponse.json()).data||[]).map(x=>({role:x.role,content:typeof x.content==='string'?x.content.slice(0,120):typeof x.content,finish_reason:x.finish_reason}));
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve(root,'evidence','iphone-ws-e2e.png'),Buffer.from(shot.data,'base64'));
 const parsedFrames=wsFrames.flatMap(x=>{try{return[JSON.parse(x)]}catch{return[]}}),changed=parsedFrames.some(x=>x.type==='session.changed'&&x.sessionId===sid);
 const out={session:sid,pinned,thinkingBefore,thinkingSeen,wsCreated:wsCreated.some(x=>x.includes(`/pocket/ws?session=${sid}`)),wsChanged:changed,consoleErrors,exceptions,canonical,ui:JSON.parse(result)};
 console.log(JSON.stringify(out,null,2));
 if(pinned!==sid||!thinkingSeen||!changed||out.ui.thinking||!out.ui.assistantTexts.some(x=>x.includes('BROWSER_WS_OK'))||out.ui.inner[0]!==430||out.ui.scrollWidth!==430||consoleErrors.length||exceptions.length)process.exitCode=1;
}finally{try{ws?.close()}catch{}if(child.pid)spawnSync('taskkill',['/PID',String(child.pid),'/F'],{stdio:'ignore'});await fetch(`${api}/api/sessions/${sid}`,{method:'DELETE',headers:apiHeaders}).catch(()=>{})}
