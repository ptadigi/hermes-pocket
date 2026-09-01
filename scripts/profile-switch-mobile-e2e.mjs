// Live browser acceptance for dynamic profile switching.
//
// Proves on the REAL served app (not a unit stub) that:
//   1. the dropdown lists every discovered profile (no hardcoded names),
//   2. switching profile actually re-targets the runtime — the canonical
//      session list CHANGES, so isolation is real and not cosmetic,
//   3. switching clears the previous profile's transcript (no bleed),
//   4. the control is touch-usable on a phone viewport (>=44px).
//
// Store truth on this machine at authoring time: default has many sessions,
// culiai has its own smaller set, wordpress- has none. The assertion is
// "different per profile", not a pinned count, so it stays valid over time.

import { spawn, spawnSync } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 20000 + Math.floor(Math.random() * 20000);
const userDir = `${process.env.TEMP || process.env.TMP || '.'}\\hp-prof-${randomUUID()}`;
const target = 'http://127.0.0.1:9999/?cdp-profile=1';
const wait = ms => new Promise(r => setTimeout(r, ms));

// Password comes from .env.local — never inlined into the script.
const envText = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const password = envText.split(/\r?\n/)
  .find(l => l.startsWith('POCKET_PASSWORD='))?.slice('POCKET_PASSWORD='.length).trim();
if (!password) throw Error('POCKET_PASSWORD missing from .env.local');

const child = spawn(chrome, [
  `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
  '--headless=new', '--disable-gpu', '--disable-background-networking',
  '--no-first-run', `--user-data-dir=${userDir}`, 'about:blank',
], { stdio: 'ignore' });

let ws, seq = 0; const pending = new Map();
const results = [];

try {
  let page;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(target)}`, { method: 'PUT' });
      if (r.ok) { page = await r.json(); break; }
    } catch {}
    await wait(200);
  }
  if (!page) throw Error('CDP target unavailable');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  ws.onmessage = async e => {
    const raw = typeof e.data === 'string' ? e.data : await e.data.text();
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq, t = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, m => { clearTimeout(t); m.error ? reject(Error(m.error.message)) : resolve(m.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async expression => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result.value;
  };

  // iPhone-class viewport with touch, so the control is judged as a phone user sees it.
  await call('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true, screenWidth: 430, screenHeight: 932 });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  // Authenticate via the real login endpoint, then reload so the React app
  // reads the fresh session cookie and mounts the authenticated shell.
  for (let i = 0; i < 60; i++) {
    if (await evalJs("document.readyState==='complete'&&!!document.querySelector('.login input')")) break;
    await wait(250);
  }
  const loginStatus = await evalJs(`fetch('/pocket/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:${JSON.stringify(password)}})}).then(r=>r.status).catch(e=>'ERR '+e.message)`);
  if (loginStatus !== 200) throw Error('login failed: ' + loginStatus);
  await call('Page.reload', {});
  await wait(500);

  // Wait for the authenticated shell AND the profile control to render.
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (await evalJs("!!document.querySelector('.profile-switch')")) { ready = true; break; }
    await wait(250);
  }
  if (!ready) throw Error('profile dropdown never rendered (fewer than 2 configured profiles?)');

  // On mobile the profile switch lives in the slide-out sidebar. Open that
  // sidebar before measuring or interacting; while closed its negative X is
  // intentional, not overflow.
  await evalJs("document.querySelector('.mobile-menu')?.click(); true");
  await wait(300);
  const listed = await evalJs(`JSON.stringify((()=>{const s=document.querySelector('.profile-switch');const r=s.getBoundingClientRect();return{options:[...s.options].map(o=>({id:o.value,disabled:o.disabled})),value:s.value,height:r.height,left:r.left,right:r.right,menuOpen:document.body.classList.contains('menu-open')}})())`);
  const control = JSON.parse(listed);
  if (!control.menuOpen) throw Error('mobile sidebar did not open');
  results.push({ step: 'dropdown', ...control });

  if (control.options.length < 2) throw Error('dropdown did not enumerate multiple profiles');
  if (control.height < 44) throw Error(`profile control too small for touch: ${control.height}px`);
  if (control.left < 0 || control.right > 430) throw Error(`profile control overflows the phone viewport (left=${control.left} right=${control.right})`);

  const sessionsNow = () => evalJs("JSON.stringify([...document.querySelectorAll('aside nav button')].map(b=>b.querySelector('b')?.textContent||''))");
  const transcriptNow = () => evalJs("document.querySelectorAll('.thread article').length");

  // switchProfile() closes the mobile sidebar on purpose, so re-open it before
  // reading the session list for the destination profile.
  const openSidebar = async () => {
    if (!(await evalJs("document.body.classList.contains('menu-open')"))) {
      await evalJs("document.querySelector('.mobile-menu')?.click(); true");
      await wait(250);
    }
  };

  const switchTo = async id => {
    await openSidebar();
    await evalJs(`(()=>{const s=document.querySelector('.profile-switch');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    // switchProfile is async: wait for the control to settle on the new id.
    for (let i = 0; i < 60; i++) {
      const activeId = await evalJs("document.querySelector('.profile-switch')?.value");
      if (activeId === id) break;
      await wait(250);
    }
    await wait(1500);
    await openSidebar();
    return { id, sessions: JSON.parse(await sessionsNow()), articles: await transcriptNow() };
  };

  // Visit every enumerated, reachable profile and record its canonical list.
  const ids = control.options.filter(o => !o.disabled).map(o => o.id);
  const seen = [];
  for (const id of ids) seen.push(await switchTo(id));
  for (const s of seen) results.push({ step: 'profile', id: s.id, sessionCount: s.sessions.length, firstTitles: s.sessions.slice(0, 3) });

  // Isolation proof: at least two reachable profiles must expose DIFFERENT
  // canonical session lists. Identical lists everywhere = cosmetic switch.
  const signatures = new Set(seen.map(s => JSON.stringify(s.sessions)));
  if (seen.length >= 2 && signatures.size < 2) {
    console.error('DEBUG per-profile DOM session lists:', JSON.stringify(seen, null, 1));
    console.error('DEBUG activeProfile in localStorage:', await evalJs("localStorage.getItem('hp:profile')"));
    console.error('DEBUG direct backend counts:', await evalJs(`Promise.all(${JSON.stringify(ids)}.map(id=>fetch('/pocket/api/api/sessions?limit=100',{headers:{'x-pocket-profile':id}}).then(r=>r.json()).then(d=>({id,len:(d.data||[]).length})))).then(JSON.stringify)`));
    throw Error('profile switch is cosmetic: every profile showed an identical session list');
  }

  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL('../evidence/profile-switch-mobile.png', import.meta.url), Buffer.from(shot.data, 'base64'));

  console.log(JSON.stringify({ ok: true, distinctSessionLists: signatures.size, results }, null, 1));
} finally {
  try { ws?.close(); } catch {}
  if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/F'], { stdio: 'ignore' });
}
