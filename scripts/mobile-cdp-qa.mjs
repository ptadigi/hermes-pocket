import{spawn,spawnSync}from'node:child_process';
import{writeFile}from'node:fs/promises';
import{randomUUID}from'node:crypto';

const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port=20000+Math.floor(Math.random()*20000);
const profile=`C:\\Users\\Admin\\AppData\\Local\\Temp\\hp-cdp-${randomUUID()}`;
const target='http://127.0.0.1:9999/?cdp-mobile=1';
const child=spawn(chrome,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--headless=new','--disable-gpu','--disable-background-networking','--no-first-run',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0;const pending=new Map();
try{
  let page;
  for(let i=0;i<50;i++){
    try{const r=await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(target)}`,{method:'PUT'});if(r.ok){page=await r.json();break}}catch{}
    await wait(200);
  }
  if(!page)throw Error('CDP target unavailable');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no});
  ws.onmessage=async e=>{const raw=typeof e.data==='string'?e.data:await e.data.text(),m=JSON.parse(raw);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`))},10000);pending.set(id,m=>{clearTimeout(t);m.error?reject(Error(m.error.message)):resolve(m.result)});ws.send(JSON.stringify({id,method,params}))});
  await call('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:1,mobile:true,screenWidth:430,screenHeight:932});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  for(let i=0;i<40;i++){const ready=await call('Runtime.evaluate',{expression:"document.readyState==='complete'&&document.title==='Hermes Pocket'&&!!document.querySelector('.login-card')",returnByValue:true});if(ready.result.value)break;await wait(200)}
  const expression=`JSON.stringify((()=>{const c=document.querySelector('.login-card'),input=document.querySelector('.login input'),button=document.querySelector('.login button');if(!c||!input||!button)return {url:location.href,title:document.title,inner:[innerWidth,innerHeight]};const r=c.getBoundingClientRect(),i=input.getBoundingClientRect(),b=button.getBoundingClientRect();return {url:location.href,inner:[innerWidth,innerHeight],dpr:devicePixelRatio,scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],card:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width},input:{left:i.left,right:i.right,height:i.height},button:{left:b.left,right:b.right,height:b.height},sw:!!navigator.serviceWorker.controller}})())`;
  const metrics=await call('Runtime.evaluate',{expression,returnByValue:true}),value=JSON.parse(metrics.result.value);console.log(JSON.stringify(value));
  if(!value.url?.startsWith(target)||value.inner?.[0]!==430||value.inner?.[1]!==932||value.scroll?.[0]!==430||value.card?.left<0||value.card?.right>430||value.input?.height<44||value.button?.height<44||!value.sw)throw Error('mobile acceptance failed');
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL('../evidence/iphone-cdp.png',import.meta.url),Buffer.from(shot.data,'base64'));
}finally{try{ws?.close()}catch{}if(child.pid)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'})}
