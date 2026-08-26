import{createHash}from'node:crypto';
import{activeSessions,createHub,pollDecision,subscribe,subscribersFor,unsubscribe}from'./ws-hub.mjs';
import{parseCookies,verifySession}from'./security.mjs';

const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const websocketAccept=key=>createHash('sha1').update(String(key)+GUID).digest('base64');
export const textFrame=value=>{const body=Buffer.from(JSON.stringify(value));if(body.length<126)return Buffer.concat([Buffer.from([0x81,body.length]),body]);if(body.length<65536){const head=Buffer.alloc(4);head[0]=0x81;head[1]=126;head.writeUInt16BE(body.length,2);return Buffer.concat([head,body])}throw new Error('ws_frame_too_large')};
const closeSocket=(socket,status='HTTP/1.1 401 Unauthorized')=>{try{socket.end(`${status}\r\nConnection: close\r\n\r\n`)}catch{socket.destroy()}};
const sameOrigin=req=>{try{const origin=new URL(req.headers.origin);return origin.host===req.headers.host}catch{return false}};
const validSessionId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,96}$/.test(value);

export function attachPocketRealtime(server,{authSecret,hermesKey,hermesBase='http://127.0.0.1:8642',intervalMs=500}){
 const hub=createHub();let stopped=false,polling=false;
 const poll=async()=>{if(stopped||polling)return;polling=true;try{for(const sessionId of activeSessions(hub)){try{const upstream=await fetch(new URL(`/api/sessions/${encodeURIComponent(sessionId)}/messages`,hermesBase),{headers:{authorization:`Bearer ${hermesKey}`,accept:'application/json'}});if(!upstream.ok)continue;const payload=await upstream.json(),rows=Array.isArray(payload?.data)?payload.data:[];if(!pollDecision(hub,sessionId,rows))continue;const frame=textFrame({type:'session.changed',sessionId,latestId:Math.max(0,...rows.map(m=>Number(m.id)||0)),count:rows.length});for(const socket of subscribersFor(hub,sessionId)){if(!socket.destroyed)socket.write(frame)}}catch{}}}finally{polling=false}};
 const timer=setInterval(poll,intervalMs);timer.unref?.();
 server.on('upgrade',(req,socket)=>{const url=new URL(req.url||'','http://localhost');if(url.pathname!=='/pocket/ws')return closeSocket(socket,'HTTP/1.1 404 Not Found');const sessionId=url.searchParams.get('session'),token=parseCookies(req.headers.cookie).hp_session,key=req.headers['sec-websocket-key'];if(!verifySession(token,authSecret)||!sameOrigin(req)||!validSessionId(sessionId)||!key||req.headers.upgrade?.toLowerCase()!=='websocket')return closeSocket(socket);
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${websocketAccept(key)}\r\n\r\n`);subscribe(hub,socket,sessionId);socket.write(textFrame({type:'connected',sessionId}));const cleanup=()=>unsubscribe(hub,socket);socket.on('close',cleanup);socket.on('error',cleanup);socket.on('end',cleanup);
 });
 server.on('close',()=>{stopped=true;clearInterval(timer);for(const sessionId of activeSessions(hub))for(const socket of subscribersFor(hub,sessionId))socket.destroy()});
 return{hub,poll,close:()=>{stopped=true;clearInterval(timer)}};
}
