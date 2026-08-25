import{canonicalProvider}from'./lib/model-route.mjs';
export type Session={id:string;title?:string;source?:string;model?:string;provider?:string;started_at?:number;last_active?:number};
export type Message={id?:string;role:string;content:unknown;created_at?:number;tool_name?:string;finish_reason?:string;reasoning?:string;reasoning_content?:string;display_kind?:string;display_metadata?:Record<string,unknown>};
export type ModelOptions={model:string;provider:string;providers?:Array<{slug:string;name:string;is_current?:boolean;authenticated?:boolean;models?:string[]}>};
const csrf=()=>document.cookie.split('; ').find(v=>v.startsWith('hp_csrf='))?.split('=')[1]||'';
async function request(path:string,init:RequestInit={}){const mutation=!['GET','HEAD'].includes((init.method||'GET').toUpperCase());const response=await fetch('/pocket/api'+path,{...init,headers:{...(mutation?{'x-csrf-token':decodeURIComponent(csrf())}:{}),...(init.body?{'content-type':'application/json'}:{}),...init.headers}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response}
export const api={
 auth:()=>fetch('/pocket/auth/session').then(r=>r.ok),login:(password:string)=>fetch('/pocket/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})}),
 sessions:async()=>((await (await request('/api/sessions?limit=60')).json()).data as Session[]),
 modelOptions:async()=>(await (await request('/api/model/options')).json()) as ModelOptions,
 setModel:async(id:string,model:string,provider:string)=>(await (await request(`/api/sessions/${encodeURIComponent(id)}/model`,{method:'POST',body:JSON.stringify({model,provider:canonicalProvider(provider),require_model_lock:true})})).json()),
 create:async(title:string)=>{const options=await (await request('/api/model/options')).json();return (await (await request('/api/sessions',{method:'POST',body:JSON.stringify({title,model:options.model,provider:canonicalProvider(options.provider),require_model_lock:true})})).json()).session as Session},
 messages:async(id:string)=>((await (await request(`/api/sessions/${encodeURIComponent(id)}/messages`)).json()).data as Message[]),
 stream:(id:string,body:unknown,signal:AbortSignal)=>request(`/api/sessions/${encodeURIComponent(id)}/chat/stream`,{method:'POST',body:JSON.stringify(body),signal}),
};
