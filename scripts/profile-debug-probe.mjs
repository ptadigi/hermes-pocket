// Throwaway diagnostic: inspect login DOM + login response.
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 20000 + Math.floor(Math.random() * 20000);
const userDir = `${process.env.TEMP || process.env.TMP || '.'}\\hp-dbg-${randomUUID()}`;
const target = 'http://127.0.0.1:9999/?cdp-debug=2';
const wait = ms => new Promise(r => setTimeout(r, ms));

const envText = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const password = envText.split(/\r?\n/).find(l => l.startsWith('POCKET_PASSWORD='))?.slice(16).trim();

const child = spawn(chrome, [
  `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
  '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${userDir}`, 'about:blank',
], { stdio: 'ignore' });

let ws, seq = 0; const pending = new Map();
try {
  let page;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(target)}`, { method: 'PUT' }); if (r.ok) { page = await r.json(); break; } } catch {}
    await wait(200);
  }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  ws.onmessage = async e => { const raw = typeof e.data === 'string' ? e.data : await e.data.text(); const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq, t = setTimeout(() => { pending.delete(id); reject(Error('timeout ' + method)); }, 20000); pending.set(id, m => { clearTimeout(t); m.error ? reject(Error(m.error.message)) : resolve(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async expr => { const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description }; return r.result.value; };

  for (let i = 0; i < 60; i++) { if (await evalJs("!!document.querySelector('.login')||!!document.querySelector('.login-card')")) break; await wait(250); }

  console.log('LOGIN DOM:', await evalJs(`JSON.stringify((()=>{const forms=[...document.querySelectorAll('form')].map(f=>f.className);const inputs=[...document.querySelectorAll('input')].map(i=>({type:i.type,cls:i.className,ph:i.placeholder}));const btns=[...document.querySelectorAll('button')].map(b=>({cls:b.className,txt:b.textContent}));return{forms,inputs,btns,loginSel:!!document.querySelector('.login'),cardSel:!!document.querySelector('.login-card')}})())`));

  // Try logging in by submitting the form directly + capture the network response.
  const loginResp = await evalJs(`fetch('/pocket/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:${JSON.stringify(password)}})}).then(r=>r.status+' set-cookie-visible:'+(document.cookie||'(none)')).catch(e=>'ERR '+e.message)`);
  console.log('DIRECT LOGIN FETCH:', loginResp);
  await wait(500);
  console.log('SESSION CHECK:', await evalJs("fetch('/pocket/auth/session').then(r=>r.status+' '+JSON.stringify(r.ok)).catch(e=>'ERR')"));
  console.log('PROFILES AFTER:', await evalJs("fetch('/pocket/profiles').then(r=>r.text()).catch(e=>'ERR '+e.message)"));
} finally {
  try { ws?.close(); } catch {}
  if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/F'], { stdio: 'ignore' });
}
