import test from'node:test';import assert from'node:assert/strict';import{sessionFromLocation,sessionUrl}from'../src/lib/session-route.mjs';
const rows=[{id:'newest'},{id:'pinned'}];
test('reload keeps explicit canonical session instead of newest activity',()=>{assert.equal(sessionFromLocation('?session=pinned','newest',rows).id,'pinned')});
test('stored session survives reload without query parameter',()=>{assert.equal(sessionFromLocation('','pinned',rows).id,'pinned')});
test('missing session safely falls back to newest',()=>{assert.equal(sessionFromLocation('?session=gone','gone',rows).id,'newest');assert.equal(sessionUrl('a b'),'?session=a%20b')});
