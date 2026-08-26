import{canonicalProvider}from'./lib/model-route.mjs';
export type Session={id:string;title?:string;source?:string;model?:string;provider?:string;started_at?:number;last_active?:number};
export type Message={id?:string;role:string;content:unknown;created_at?:number;tool_name?:string;finish_reason?:string;reasoning?:string;reasoning_content?:string;display_kind?:string;display_metadata?:Record<string,unknown>};
export type ModelOptions={model:string;provider:string;providers?:Array<{slug:string;name:string;is_current?:boolean;authenticated?:boolean;models?:string[]}>};
export type ConfigSchema={fields:Record<string,{type?:string;label?:string;description?:string;options?:unknown[];min?:number;max?:number}>;category_order:string[]};
export type EnvInfo={is_set:boolean;redacted_value?:string;description?:string;url?:string;category?:string;is_password?:boolean;provider_label?:string;channel_managed?:boolean;custom?:boolean};
export type EnvMap=Record<string,EnvInfo>;
export type CustomEndpoint={id:string;name:string;base_url:string;model:string;context_length?:number;is_active?:boolean;has_api_key?:boolean};
const csrf=()=>document.cookie.split('; ').find(v=>v.startsWith('hp_csrf='))?.split('=')[1]||'';
async function requestBase(base:string,path:string,init:RequestInit={}){const mutation=!['GET','HEAD'].includes((init.method||'GET').toUpperCase());const response=await fetch(base+path,{...init,headers:{...(mutation?{'x-csrf-token':decodeURIComponent(csrf())}:{}),...(init.body?{'content-type':'application/json'}:{}),...init.headers}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response}
const request=(path:string,init:RequestInit={})=>requestBase('/pocket/api',path,init),settingsRequest=(path:string,init:RequestInit={})=>requestBase('/pocket/settings',path,init);
export const api={
 auth:()=>fetch('/pocket/auth/session').then(r=>r.ok),login:(password:string)=>fetch('/pocket/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})}),
 sessions:async()=>((await (await request('/api/sessions?limit=60')).json()).data as Session[]),
 modelOptions:async()=>(await (await request('/api/model/options')).json()) as ModelOptions,
 setModel:async(id:string,model:string,provider:string)=>(await (await request(`/api/sessions/${encodeURIComponent(id)}/model`,{method:'POST',body:JSON.stringify({model,provider:canonicalProvider(provider),require_model_lock:true})})).json()),
 create:async(title:string)=>{const options=await (await request('/api/model/options')).json();return (await (await request('/api/sessions',{method:'POST',body:JSON.stringify({title,model:options.model,provider:canonicalProvider(options.provider),require_model_lock:true})})).json()).session as Session},
 messages:async(id:string)=>((await (await request(`/api/sessions/${encodeURIComponent(id)}/messages`)).json()).data as Message[]),
 stream:(id:string,body:unknown,signal:AbortSignal)=>request(`/api/sessions/${encodeURIComponent(id)}/chat/stream`,{method:'POST',body:JSON.stringify(body),signal}),
};
export const settingsApi={
 snapshot:async()=>(await (await settingsRequest('/snapshot')).json()) as{config:Record<string,unknown>;schema:ConfigSchema;env:EnvMap},
 config:async()=>(await (await settingsRequest('/config')).json()) as{config:Record<string,unknown>},
 defaults:async()=>(await (await settingsRequest('/defaults')).json()) as{config:Record<string,unknown>},
 schema:async()=>(await (await settingsRequest('/schema')).json()) as ConfigSchema,
 saveConfig:async(config:Record<string,unknown>)=>(await (await settingsRequest('/config',{method:'PUT',body:JSON.stringify({config})})).json()),
 env:async()=>(await (await settingsRequest('/env')).json()) as{env:EnvMap},
 setEnv:async(key:string,value:string)=>(await (await settingsRequest('/env',{method:'PUT',body:JSON.stringify({key,value})})).json()),
 deleteEnv:async(key:string)=>(await (await settingsRequest('/env',{method:'DELETE',body:JSON.stringify({key})})).json()),
 customEndpoints:async()=>(await (await settingsRequest('/providers/custom')).json()) as{endpoints:CustomEndpoint[];current?:Record<string,unknown>},
 saveCustomEndpoint:async(endpoint:Record<string,unknown>)=>(await (await settingsRequest('/providers/custom',{method:'POST',body:JSON.stringify({endpoint})})).json()),
 deleteCustomEndpoint:async(id:string)=>(await (await settingsRequest(`/providers/custom/${encodeURIComponent(id)}`,{method:'DELETE'})).json()),
 activateCustomEndpoint:async(id:string)=>(await (await settingsRequest(`/providers/custom/${encodeURIComponent(id)}/activate`,{method:'POST'})).json()),
};
