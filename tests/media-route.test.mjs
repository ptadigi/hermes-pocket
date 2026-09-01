import test from'node:test';import assert from'node:assert/strict';import{tmpdir}from'node:os';import{mkdtempSync,writeFileSync,rmSync}from'node:fs';import{join}from'node:path';import{safeMediaFile,expandPathEnv}from'../server/media-route.mjs';

const root=mkdtempSync(join(tmpdir(),'pocket-media-'));
writeFileSync(join(root,'a.png'),Buffer.from([0x89,0x50,0x4e,0x47]));
writeFileSync(join(root,'active.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
writeFileSync(join(root,'secret.txt'),'nope');
test.after(()=>rmSync(root,{recursive:true,force:true}));

test('serves an existing image under an allowed root',()=>{const f=safeMediaFile(join(root,'a.png'),[root]);assert.equal(f,join(root,'a.png'))});
test('rejects non-image extension',()=>assert.equal(safeMediaFile(join(root,'secret.txt'),[root]),null));
test('rejects active SVG content from the same-origin media route',()=>assert.equal(safeMediaFile(join(root,'active.svg'),[root]),null));
test('rejects path traversal escaping the root',()=>assert.equal(safeMediaFile(join(root,'..','..','etc','x.png'),[root]),null));
test('rejects a path outside every allowed root',()=>assert.equal(safeMediaFile('C:\\\\Windows\\\\system32\\\\x.png',[root]),null));
test('rejects a missing file',()=>assert.equal(safeMediaFile(join(root,'missing.png'),[root]),null));
test('empty / non-string input is null',()=>{assert.equal(safeMediaFile('',[root]),null);assert.equal(safeMediaFile(null,[root]),null)});
test('expands Windows-style environment variables in configured roots',()=>{assert.equal(expandPathEnv('%POCKET_TEST_ROOT%\\images',{POCKET_TEST_ROOT:'C:\\Users\\demo'}),'C:\\Users\\demo\\images')});
