import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { uninstallStartup } from '../scripts/uninstall-startup.mjs';

test('startup uninstall revokes only the configured Pocket Funnel port before removing shortcut', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pocket-uninstall-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const startup = join(dir, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  await mkdir(startup, { recursive: true });
  const shortcut = join(startup, 'Hermes-Pocket.cmd');
  await writeFile(shortcut, '@echo off\r\n');
  const calls = [];
  const result = await uninstallStartup({
    env: { APPDATA: dir, POCKET_FUNNEL_PORT: '8443', POCKET_PORT: '9999', TAILSCALE_BIN: 'tailscale' },
    runner: async (binary, args) => {
      calls.push([binary, args, existsSync(shortcut)]);
      return '';
    },
  });
  assert.deepEqual(calls, [['tailscale', ['funnel', '--yes', '--https=8443', 'off'], true]]);
  assert.equal(existsSync(shortcut), false);
  assert.equal(result.status, 'uninstalled');
  assert.equal(result.funnel.status, 'disabled');
});
