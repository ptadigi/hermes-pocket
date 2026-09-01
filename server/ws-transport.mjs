import{createHash}from'node:crypto';
import{activeSessions,channelKey,createHub,parseChannel,pollDecision,subscribe,subscribersFor,unsubscribe}from'./ws-hub.mjs';
import{parseCookies,verifySession}from'./security.mjs';
import{resolveProfileTarget}from'./profile-registry.mjs';

const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const websocketAccept=key=>createHash('sha1').update(String(key)+GUID).digest('base64');
export const textFrame=value=>{const body=Buffer.from(JSON.stringify(value));if(body.length<126)return Buffer.concat([Buffer.from([0x81,body.length]),body]);if(body.length<65536){const head=Buffer.alloc(4);head[0]=0x81;head[1]=126;head.writeUInt16BE(body.length,2);return Buffer.concat([head,body])}throw new Error('ws_frame_too_large')};
const closeSocket=(socket,status='HTTP/1.1 401 Unauthorized')=>{try{socket.end(`${status}\r\nConnection: close\r\n\r\n`)}catch{socket.destroy()}};
const sameOrigin=req=>{try{const origin=new URL(req.headers.origin);return origin.host===req.headers.host}catch{return false}};
const validSessionId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,96}$/.test(value);

const validProfileId=value=>typeof value==='string'&&/^[A-Za-z0-9._-]{1,64}$/.test(value);

export function attachPocketRealtime(server,{authSecret,hermesKey,hermesBase='http://127.0.0.1:8642',intervalMs=500,profileProvider=null}){
 const hub=createHub();let stopped=false,polling=false;
 // Resolve a channel's owning profile to an upstream {base,key}. Without a
 // provider every channel maps to the single legacy upstream.
 const upstreamFor=async profile=>{if(!profileProvider)return{base:hermesBase,key:hermesKey,prefix:''};return resolveProfileTarget(await profileProvider(),profile)};
 const poll=async()=>{if(stopped||polling)return;polling=true;try{for(const channel of activeSessions(hub)){const parsed=parseChannel(channel);if(!parsed)continue;const{profile,sessionId}=parsed;try{const target=await upstreamFor(profile);if(!target)continue;const upstream=await fetch(new URL(`${target.prefix||''}/api/sessions/${encodeURIComponent(sessionId)}/messages`,target.base),{headers:{authorization:`Bearer ${target.key}`,accept:'application/json'}});if(!upstream.ok)continue;const payload=await upstream.json(),rows=Array.isArray(payload?.data)?payload.data:[];if(!pollDecision(hub,channel,rows))continue;const frame=textFrame({type:'session.changed',sessionId,profile,latestId:Math.max(0,...rows.map(m=>Number(m.id)||0)),count:rows.length});for(const socket of subscribersFor(hub,channel)){if(!socket.destroyed)socket.write(frame)}}catch{}}}finally{polling=false}};
 const timer=setInterval(poll,intervalMs);timer.unref?.();
 server.on('upgrade',(req,socket)=>{const url=new URL(req.url||'','http://localhost');if(url.pathname!=='/pocket/ws')return closeSocket(socket,'HTTP/1.1 404 Not Found');const sessionId=url.searchParams.get('session'),profile=url.searchParams.get('profile')||'default',token=parseCookies(req.headers.cookie).hp_session,key=req.headers['sec-websocket-key'];if(!verifySession(token,authSecret)||!sameOrigin(req)||!validSessionId(sessionId)||!validProfileId(profile)||!key||req.headers.upgrade?.toLowerCase()!=='websocket')return closeSocket(socket);
  const channel=channelKey(profile,sessionId);socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${websocketAccept(key)}\r\n\r\n`);subscribe(hub,socket,channel);socket.write(textFrame({type:'connected',sessionId,profile}));const cleanup=()=>unsubscribe(hub,socket);socket.on('close',cleanup);socket.on('error',cleanup);socket.on('end',cleanup);
 });
 server.on('close',()=>{stopped=true;clearInterval(timer);for(const sessionId of activeSessions(hub))for(const socket of subscribersFor(hub,sessionId))socket.destroy()});
 return{hub,poll,close:()=>{stopped=true;clearInterval(timer)}};
}
