#!/usr/bin/env node
// Copies the MediaPipe WASM runtime from node_modules into public/wasm (gitignored,
// regenerated on install/dev/build) and makes sure the .task model files exist in
// public/models. Models are committed so a fresh clone works with no network; the
// download here only runs when a model is missing. Everything is served same-origin:
// no runtime hotlinking (supply-chain rule + offline demo rule, docs/03).
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/wasm');
const modelsDir = join(root, 'public/models');

const MODELS = [
  {
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
];

if (!existsSync(wasmSrc)) {
  console.error('[assets] @mediapipe/tasks-vision wasm not found. Run `npm install` first.');
  process.exit(1);
}
mkdirSync(wasmDst, { recursive: true });
let copied = 0;
for (const name of readdirSync(wasmSrc)) {
  const src = join(wasmSrc, name);
  const dst = join(wasmDst, name);
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) continue;
  copyFileSync(src, dst);
  copied++;
}
console.log(`[assets] wasm runtime in public/wasm (${copied} file(s) copied, ${readdirSync(wasmDst).length} total)`);

mkdirSync(modelsDir, { recursive: true });
for (const m of MODELS) {
  const dst = join(modelsDir, m.file);
  if (existsSync(dst) && statSync(dst).size > 1_000_000) {
    console.log(`[assets] ${m.file} present (${(statSync(dst).size / 1e6).toFixed(1)} MB)`);
    continue;
  }
  try {
    const res = await fetch(m.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
    console.log(`[assets] downloaded ${m.file}`);
  } catch (err) {
    console.warn(`[assets] could not download ${m.file}: ${err instanceof Error ? err.message : err}. The app will not start without it.`);
  }
}
