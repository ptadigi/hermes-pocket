import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');

const runStatus = (env, cwd = root) => new Promise((resolvePromise, reject) => {
  const child = spawn(process.execPath, ['scripts/status.mjs'], {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', code => resolvePromise({ code, stdout, stderr }));
});

test('status uses configured Pocket host and port when POCKET_URL is absent', async t => {
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'hermes-pocket' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolvePromise => server.close(resolvePromise)));

  const { port } = server.address();
  const env = {
    ...process.env,
    POCKET_HOST: '127.0.0.1',
    POCKET_PORT: String(port),
  };
  delete env.POCKET_URL;

  const result = await runStatus(env);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), {
    reachable: true,
    status: 200,
    service: 'hermes-pocket',
  });
  assert.equal(requests, 1);
});

test('status accepts environment configuration before setup creates .env.local', async t => {
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'hermes-pocket' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolvePromise => server.close(resolvePromise)));

  const cleanRoot = await mkdtemp(resolve(tmpdir(), 'pocket-status-clean-'));
  await mkdir(resolve(cleanRoot, 'scripts'));
  await copyFile(resolve(root, 'scripts/status.mjs'), resolve(cleanRoot, 'scripts/status.mjs'));
  t.after(() => rm(cleanRoot, { recursive: true, force: true }));

  const { port } = server.address();
  const env = {
    ...process.env,
    POCKET_HOST: '127.0.0.1',
    POCKET_PORT: String(port),
  };
  delete env.POCKET_URL;

  const result = await runStatus(env, cleanRoot);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), {
    reachable: true,
    status: 200,
    service: 'hermes-pocket',
  });
  assert.equal(requests, 1);
});

test('status rejects an unrelated HTTP 200 service on the configured port', async t => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'not-hermes-pocket' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolvePromise => server.close(resolvePromise)));

  const env = {
    ...process.env,
    POCKET_HOST: '127.0.0.1',
    POCKET_PORT: String(server.address().port),
  };
  delete env.POCKET_URL;

  const result = await runStatus(env);
  assert.equal(result.code, 1, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), {
    reachable: false,
    status: 200,
    service: 'not-hermes-pocket',
  });
});
