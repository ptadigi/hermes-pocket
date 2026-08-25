import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const env={};for(const line of readFileSync(resolve(import.meta.dirname,'..','.env.local'),'utf8').split(/\r?\n/)){if(!line||line.startsWith('#')||!line.includes('='))continue;const i=line.indexOf('=');env[line.slice(0,i)]=line.slice(i+1)}
const base=env.HERMES_API_BASE, headers={authorization:`Bearer ${env.API_SERVER_KEY}`,'content-type':'application/json'};
const id=`pocket_e2e_${Date.now()}`;
const events=[];
try{
 let r=await fetch(base+'/api/sessions',{method:'POST',headers,body:JSON.stringify({id,title:'Hermes Pocket E2E',source:'api_server'})});if(r.status!==201)throw new Error(`create ${r.status}: ${await r.text()}`);
 r=await fetch(`${base}/api/sessions/${id}/chat/stream`,{method:'POST',headers,body:JSON.stringify({message:'Trả lời đúng một từ: POCKET_OK'})});if(!r.ok)throw new Error(`stream ${r.status}: ${await r.text()}`);
 const text=await r.text();for(const block of text.replace(/\r\n/g,'\n').split('\n\n')){let name='message',data='';for(const line of block.split('\n')){if(line.startsWith('event:'))name=line.slice(6).trim();if(line.startsWith('data:'))data+=line.slice(5).trim()}if(data){try{events.push({event:name,data:JSON.parse(data)})}catch{events.push({event:name,data})}}}
 const delta=events.filter(e=>e.event==='assistant.delta').map(e=>e.data.delta||'').join('');
 const completed=events.find(e=>e.event==='run.completed');
 r=await fetch(`${base}/api/sessions/${id}/messages`,{headers});const messages=(await r.json()).data||[];
 console.log(JSON.stringify({session:id,http:200,eventNames:[...new Set(events.map(e=>e.event))],delta,runCompleted:Boolean(completed),persistedMessages:messages.length,roles:messages.map(m=>m.role)},null,2));
 if(!delta.includes('POCKET_OK')||!completed||messages.length<2)process.exitCode=1;
}finally{await fetch(`${base}/api/sessions/${id}`,{method:'DELETE',headers}).catch(()=>{})}
