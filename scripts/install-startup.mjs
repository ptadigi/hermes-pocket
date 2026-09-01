import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
if (!process.env.APPDATA) throw new Error('APPDATA is required on Windows');
const startup = resolve(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup');
const cmd = resolve(startup, 'Hermes-Pocket.cmd');
mkdirSync(startup, { recursive: true });
writeFileSync(cmd, `@echo off\r\ncd /d "${root}"\r\n"${process.execPath}" scripts\\start.mjs\r\n`, 'utf8');
console.log(cmd);
