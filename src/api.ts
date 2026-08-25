export type Session={id:string;title?:string;source?:string;model?:string;started_at?:number;last_active?:number};
export type Message={id?:string;role:string;content:unknown;created_at?:number};
const csrf=()=>document.cookie.split('; ').find(v=>v.startsWith('hp_csrf='))?.split('=')[1]||'';
async function request(path:string,init:RequestInit={}){const mutation=!['GET','HEAD'].includes((init.method||'GET').toUpperCase());const response=await fetch('/pocket/api'+path,{...init,headers:{...(mutation?{'x-csrf-token':decodeURIComponent(csrf())}:{}),...(init.body?{'content-type':'application/json'}:{}),...init.headers}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response}
export const api={
 auth:()=>fetch('/pocket/auth/session').then(r=>r.ok),login:(password:string)=>fetch('/pocket/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})}),
 sessions:async()=>((await (await request('/api/sessions?limit=60')).json()).data as Session[]),
 create:async(title:string)=>((await (await request('/api/sessions',{method:'POST',body:JSON.stringify({title})})).json()).session as Session),
 messages:async(id:string)=>((await (await request(`/api/sessions/${encodeURIComponent(id)}/messages`)).json()).data as Message[]),
 stream:(id:string,body:unknown,signal:AbortSignal)=>request(`/api/sessions/${encodeURIComponent(id)}/chat/stream`,{method:'POST',body:JSON.stringify(body),signal}),
};
