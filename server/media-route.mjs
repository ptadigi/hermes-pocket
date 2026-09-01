import { existsSync, statSync, realpathSync } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
export const mediaMime = p => ({ '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.bmp':'image/bmp' }[extname(p).toLowerCase()] || 'application/octet-stream');

export const expandPathEnv = (value, env = process.env) => String(value || '')
  .replace(/%([^%]+)%/g, (_match, name) => env[name] || env[name.toUpperCase()] || '')
  .replace(/^~(?=[\\/]|$)/, env.USERPROFILE || env.HOME || '~');

// Return an absolute image path only if it is a real image file inside one of the allowed roots.
// Guards: image extension, no directory, path must stay within an allowed root after realpath.
export const safeMediaFile = (input, roots) => {
  if (!input || typeof input !== 'string') return null;
  if (!IMAGE_EXT.has(extname(input).toLowerCase())) return null;
  let abs;
  try { abs = realpathSync(resolve(input)); } catch { return null; }
  if (!existsSync(abs) || statSync(abs).isDirectory()) return null;
  for (const configuredRoot of roots) {
    const r = expandPathEnv(configuredRoot);
    if (!r) continue;
    let root; try { root = realpathSync(resolve(r)); } catch { continue; }
    if (abs === root || abs.startsWith(root.endsWith(sep) ? root : root + sep)) return abs;
  }
  return null;
};
