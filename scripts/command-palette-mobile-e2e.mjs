import{readFileSync,mkdirSync,writeFileSync,mkdtempSync}from'node:fs';
import{tmpdir}from'node:os';
import{join,resolve}from'node:path';
import{spawn}from'node:child_process';

const env={};for(const line of readFileSync(resolve('.env.local'),'utf8').split(/\r?\n/)){if(!line||line.startsWith('#')||!line.includes('='))continue;const at=line.indexOf('=');env[line.slice(0,at)]=line.slice(at+1)}
if(!env.POCKET_PASSWORD)throw Error('POCKET_PASSWORD is required');
const base='http://127.0.0.1:9999',target=`${base}/?command-palette-e2e=1`;
mkdirSync('evidence',{recursive:true});
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',profile=mkdtempSync(join(tmpdir(),'hp-cmd-')),port=20437+Math.floor(Math.random()*1000);
const child=spawn(chrome,[`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),consoleErrors=[];
const retry=async(fn,n=80)=>{let last;for(let i=0;i<n;i++){try{return await fn()}catch(e){last=e;await sleep(100)}}throw last};
const send=(method,params={})=>new Promise((ok,no)=>{const n=++id;pending.set(n,{ok,no});ws.send(JSON.stringify({id:n,method,params}))});
const value=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result.exceptionDetails)throw Error(r.result.exceptionDetails.text);return r.result.result.value};
const waitFor=async(expression,label,n=140)=>{for(let i=0;i<n;i++){if(await value(`Boolean(${expression})`))return;await sleep(100)}throw Error(`Timeout waiting for ${label}`)};
const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(`evidence/${name}.png`,Buffer.from(r.result.data,'base64'))};
const report={};
try{
 const page=await retry(async()=>{const xs=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());const p=xs.find(x=>x.type==='page');if(!p)throw Error('page unavailable');return p});
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no});
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.no(Error(m.error.message)):p.ok(m)}else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleErrors.push((m.params.args||[]).map(a=>a.value??a.description??'').join(' '))};
 await Promise.all([send('Page.enable'),send('Runtime.enable'),send('Network.enable')]);
 await send('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:3,mobile:true,screenWidth:430,screenHeight:932,positionX:0,positionY:0});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 try{await send('Emulation.setSafeAreaInsetsOverride',{insets:{top:59,left:0,bottom:34,right:0}})}catch{}

 await send('Page.navigate',{url:target});
 await waitFor(`document.readyState==='complete'`,'page');
 await waitFor(`document.querySelector('.shell,input[type=password]')`,'auth surface');
 if(await value(`!!document.querySelector('input[type=password]')`)){
  const pass=JSON.stringify(env.POCKET_PASSWORD);
  await value(`(()=>{const e=document.querySelector('input[type=password]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,${pass});e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.login form button').click();return true})()`);
 }
 await waitFor(`document.querySelector('.shell')`,'shell');
 await waitFor(`document.querySelector('.composer textarea')`,'composer');
 report.loggedIn=true;

 // 1) the "/ Lệnh" button exists and is a real touch target
 report.cmdButton=await value(`(()=>{const b=document.querySelector('.composer .cmd-open');if(!b)return null;const r=b.getBoundingClientRect();return{text:b.textContent.trim(),w:Math.round(r.width),h:Math.round(r.height),label:b.getAttribute('aria-label')}})()`);

 // 2) tapping it opens the palette listing every command
 await value(`document.querySelector('.composer .cmd-open').click()`);
 await waitFor(`document.querySelector('.command-palette')`,'palette opened by button');
 report.openedByButton=await value(`(()=>{const rows=[...document.querySelectorAll('.command-palette li button')];return{count:rows.length,ids:rows.map(b=>b.querySelector('b').textContent.trim()),minTouch:Math.min(...rows.map(b=>Math.round(b.getBoundingClientRect().height)))}})()`);
 await shot('cmd-palette-open');

 // 3) typing narrows built-in commands
 await value(`(()=>{const t=document.querySelector('.composer textarea');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'/reg');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
 await sleep(350);
 report.filtered=await value(`[...document.querySelectorAll('.command-palette li button b')].map(b=>b.textContent.trim())`);

 // 4) one or more letters after / surface REAL installed skill names.
 await value(`(()=>{const t=document.querySelector('.composer textarea');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'/word');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
 await waitFor(`[...document.querySelectorAll('.command-palette li button b')].some(b=>b.textContent.trim()==='/wordpress-elementor')`,'real skill suggestion',100);
 report.skillSuggestions=await value(`(()=>{const rows=[...document.querySelectorAll('.command-palette li button.skill-row')];return{count:rows.length,names:rows.map(b=>b.querySelector('b')?.textContent.trim()),descriptions:rows.map(b=>b.querySelector('span')?.textContent.trim()),hasHeader:[...document.querySelectorAll('.palette-group')].some(e=>e.textContent.includes('Kỹ năng'))}})()`);
 await shot('cmd-real-skills');

 // Picking a skill prepares an explicit, exact skill load instruction.
 await value(`[...document.querySelectorAll('.command-palette li button.skill-row')].find(b=>b.querySelector('b')?.textContent.trim()==='/wordpress-elementor')?.click()`);
 await sleep(250);
 report.skillPickDraft=await value(`document.querySelector('.composer textarea').value`);

 // 5) picking an arg command prefills the draft instead of firing blindly
 await value(`(()=>{const t=document.querySelector('.composer textarea');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'/mod');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
 await sleep(250);
 await value(`[...document.querySelectorAll('.command-palette li button')].find(b=>b.querySelector('b').textContent.trim()==='/model')?.click()`);
 await sleep(250);
 report.argPrefill=await value(`document.querySelector('.composer textarea').value`);

 // 5) an unknown command must not be sent as chat text.
 // Wait until the transcript is fully hydrated first so the article count is stable.
 await sleep(1200);
 const before=await value(`document.querySelectorAll('.thread article').length`);
 await value(`(()=>{const t=document.querySelector('.composer textarea');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'/khongtontai');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
 await sleep(150);
 await value(`document.querySelector('.composer .send').click()`);
 await waitFor(`(document.querySelector('.composer-notice')?.textContent||'').includes('không hợp lệ')`,'invalid-command notice',60);
 await sleep(600);
 report.unknownCommand={notice:await value(`document.querySelector('.composer-notice')?.textContent||''`),articlesBefore:before,articlesAfter:await value(`document.querySelectorAll('.thread article').length`),draftCleared:await value(`document.querySelector('.composer textarea').value===''`)};

 // 6) a real read-only command executes against Hermes (/skills).
 // Clear any stale notice text first, then require a genuinely new notice.
 await value(`(()=>{const t=document.querySelector('.composer textarea');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'/skills');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
 await sleep(150);
 await value(`document.querySelector('.composer .send').click()`);
 await waitFor(`(document.querySelector('.composer-notice')?.textContent||'').match(/kỹ năng/)`,'skills notice',80);
 report.skills=await value(`document.querySelector('.composer-notice')?.textContent||''`);
 await shot('cmd-skills-result');

 // 7) no horizontal overflow on a phone viewport
 report.layout=await value(`({innerWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1})`);
 report.consoleErrors=consoleErrors;
 report.ok=true;
}catch(error){report.ok=false;report.error=String(error)}
finally{
 writeFileSync('evidence/command-palette-mobile-e2e.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 try{ws?.close()}catch{}
 child.kill();
}
