import{readFileSync}from'node:fs';import{resolve}from'node:path';
const env={};for(const line of readFileSync(resolve('.env.local'),'utf8').split(/\r?\n/)){if(!line||line.startsWith('#')||!line.includes('='))continue;const at=line.indexOf('=');env[line.slice(0,at)]=line.slice(at+1)}
const base='http://127.0.0.1:9999';
const login=await fetch(base+'/pocket/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:env.POCKET_PASSWORD})});
const set=login.headers.getSetCookie(),cookie=set.map(x=>x.split(';')[0]).join('; '),csrf=decodeURIComponent(set.find(x=>x.startsWith('hp_csrf='))?.split(';')[0].split('=')[1]||'');
const get=async path=>{const r=await fetch(base+path,{headers:{cookie}});return[r.status,await r.json()]};
const[cs,c]=await get('/pocket/settings/config'),[ss,s]=await get('/pocket/settings/schema'),[es,e]=await get('/pocket/settings/env'),threshold=c.config?.compression?.threshold;
const put=await fetch(base+'/pocket/settings/config',{method:'PUT',headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify({config:{compression:{threshold}}})});
const[vs,v]=await get('/pocket/settings/config'),raw=JSON.stringify({c,e}),forbidden=/"(?:api_key|access_token|refresh_token|client_secret|password)"\s*:/i.test(raw);
const out={login:login.status,config:cs,schema:ss,env:es,schemaFields:Object.keys(s.fields||{}).length,envRows:Object.keys(e.env||{}).length,mutation:put.status,roundtrip:vs===200&&v.config?.compression?.threshold===threshold,forbidden};console.log(JSON.stringify(out));
if(!(login.ok&&cs===200&&ss===200&&es===200&&put.ok&&out.roundtrip&&!forbidden))process.exit(1);
