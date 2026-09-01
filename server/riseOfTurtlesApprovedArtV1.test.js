'use strict';
const assert=require('assert'),fs=require('fs'),crypto=require('crypto');
const path='public/rise-of-turtles-approved-final.png.png';
assert(fs.existsSync(path),'approved Rise artwork file must exist');
const hash=crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
assert.strictEqual(hash,'851d3fd0ff1d77786bf7cf0a6310799e86b8d86658114633a4ff7e79c4444c26','approved Rise artwork must remain byte-for-byte exact');
console.log('Rise of the Turtles Approved Art V1: PASS');
