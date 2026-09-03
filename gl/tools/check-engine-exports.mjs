#!/usr/bin/env node
// Verify that a patched qsp-engine wasm still exports every name the player's
// emscripten glue reads off the instance.
//
// Why this exists: `gl/tools/build-player.sh` swaps our classic-semantics
// engine over the stock `@qsp/wasm-engine` build by filename glob. The two
// wasms are different compilations; if a qspider bump changes the engine
// version, the glue may start reading an export our patched build does not
// have, and the failure mode is a blank player at runtime rather than a build
// error. This check turns that into an exit 1.
//
//   node gl/tools/check-engine-exports.mjs <glue.js> <engine.wasm>
//
// <glue.js> is the built player bundle (dist/apps/player-standalone/assets/index-*.js).
// Exit 0 = every export the glue reads exists in the wasm.

import { readFileSync } from 'node:fs';

/** Read one LEB128 unsigned integer starting at `o`. Returns [value, nextOffset]. */
function leb(b, o) {
  let r = 0,
    s = 0,
    x;
  do {
    x = b[o++];
    r |= (x & 0x7f) << s;
    s += 7;
  } while (x & 0x80);
  return [r >>> 0, o];
}

/** Names in the wasm export section (section id 7). */
function wasmExports(path) {
  const b = readFileSync(path);
  if (b.length < 8 || b.readUInt32LE(0) !== 0x6d736100) throw new Error(`${path}: not a wasm module`);
  let o = 8;
  const out = new Set();
  while (o < b.length) {
    const id = b[o++];
    let sz;
    [sz, o] = leb(b, o);
    const end = o + sz;
    if (id === 7) {
      let n;
      [n, o] = leb(b, o);
      for (let i = 0; i < n; i++) {
        let l;
        [l, o] = leb(b, o);
        out.add(b.toString('utf8', o, o + l));
        o += l;
        o++; // export kind
        [, o] = leb(b, o); // export index
      }
    }
    o = end;
  }
  return out;
}

/**
 * Names the glue reads off the instance's exports object.
 *
 * Emscripten's minified glue binds every export in one long assignment chain
 * right after instantiation: `A=X.a, B=X.b, ...` where `X` is the exports
 * object. We anchor on emscripten's own error string, take a window after it,
 * collect every `= <obj>.<member>` read, and keep the object read with the most
 * distinct short members -- that is the exports object, and nothing else in the
 * window comes close.
 */
function glueReads(path) {
  const js = readFileSync(path, 'utf8');
  const anchor = js.indexOf('failed to asynchronously prepare wasm');
  if (anchor < 0) throw new Error(`${path}: no emscripten instantiation anchor found`);
  const win = js.slice(anchor, anchor + 12000);
  const counts = new Map();
  for (const s of win.match(/=\s*[A-Za-z_$]{1,3}\.[A-Za-z_$]{1,3}\b/g) || []) {
    const [obj, name] = s.replace(/^=\s*/, '').split('.');
    if (!counts.has(obj)) counts.set(obj, new Set());
    counts.get(obj).add(name);
  }
  const best = [...counts.entries()].sort((a, b) => b[1].size - a[1].size)[0];
  if (!best || best[1].size < 10) throw new Error(`${path}: no exports-object read chain found`);
  return { obj: best[0], names: [...best[1]].sort() };
}

const [gluePath, wasmPath] = process.argv.slice(2);
if (!gluePath || !wasmPath) {
  console.error('usage: node check-engine-exports.mjs <glue.js> <engine.wasm>');
  process.exit(2);
}

const exported = wasmExports(wasmPath);
const { obj, names } = glueReads(gluePath);
const missing = names.filter((n) => !exported.has(n));

console.log(`glue  : ${gluePath}`);
console.log(`wasm  : ${wasmPath} (${exported.size} exports)`);
console.log(`reads : ${names.length} members off exports object "${obj}"`);

if (missing.length) {
  console.error(`FAIL: ${missing.length} export(s) the glue reads are missing: ${missing.join(' ')}`);
  process.exit(1);
}
console.log('OK: every export the glue reads exists in the wasm');
