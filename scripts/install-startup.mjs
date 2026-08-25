import { copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const startup = resolve(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup');
const cmd = resolve(startup, 'Hermes-Pocket.cmd');
writeFileSync(cmd, `@echo off\r\ncd /d "${root}"\r\nnode scripts\\start.mjs\r\n`, 'utf8');
console.log(cmd);
