#!/usr/bin/env node
// Try the scene model on a photo without the browser: the same question the app asks
// (src/ai/assess.ts), the same parse, printed. For comparing models on real pictures before
// a demo, and for a teammate to check a prompt change without a phone.
//
//   node scripts/assess-frame.mjs photo.jpg                 # FEATHERLESS_VISION_MODEL or the default
//   node scripts/assess-frame.mjs photo.jpg google/gemma-3-4b-it
//
// Needs FEATHERLESS_API_KEY in the environment or .env.local. Node 24 runs the TypeScript
// module directly (type stripping), so the prompt cannot drift from what the app sends.
import { readFileSync } from 'node:fs';
import { ASSESS_SYSTEM, ASSESS_USER, parseAssessment } from '../src/ai/assess.ts';
import { assessWithFeatherless, DEFAULT_VISION_MODEL, readLocalEnv } from '../src/voice/providers/devproxy.mjs';

const [, , file, modelArg] = process.argv;
if (!file) {
  console.error('usage: node scripts/assess-frame.mjs <photo.jpg> [model]');
  process.exit(2);
}
const key = readLocalEnv('FEATHERLESS_API_KEY');
if (!key) {
  console.error('No key. Set FEATHERLESS_API_KEY in the environment or .env.local.');
  process.exit(1);
}
const model = modelArg ?? readLocalEnv('FEATHERLESS_VISION_MODEL') ?? DEFAULT_VISION_MODEL;
const image = readFileSync(file).toString('base64');
const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';

console.log(`model: ${model}`);
const reply = await assessWithFeatherless({ key, model, image, mime, system: ASSESS_SYSTEM, user: ASSESS_USER });
console.log(`latency: ${reply.latencyMs} ms\n--- raw ---\n${reply.text}\n--- parsed ---`);
// The parser reads pixel boxes for Qwen2.5-VL; without the frame size those come out wrong,
// so it is given here as unknown and the box is reported on the model's own scale.
console.log(JSON.stringify(parseAssessment(reply.text, { model: reply.model, latencyMs: reply.latencyMs, frame: { width: 0, height: 0 } }), null, 2));
