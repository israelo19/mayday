#!/usr/bin/env node
// Try the scene model on a photo without the browser: the same question the app asks
// (src/ai/assess.ts), the same parse, printed. For comparing models on real pictures before
// a demo, and for a teammate to check a prompt change without a phone.
//
//   node scripts/assess-frame.mjs photo.jpg                        # whichever key is in .env.local
//   node scripts/assess-frame.mjs photo.jpg gemini-3.5-flash-lite  # same provider, another model
//   MODEL_PROVIDER=featherless node scripts/assess-frame.mjs photo.jpg
//
// Needs GEMINI_API_KEY or FEATHERLESS_API_KEY in the environment or .env.local. xAI is a
// text-only provider here: the frame route skips it, and so does this script, even with
// MODEL_PROVIDER=xai. Node 24 runs the TypeScript module directly (type stripping), so the
// prompt cannot drift from what the app sends.
import { readFileSync } from 'node:fs';
import { ASSESS_SYSTEM, ASSESS_USER, parseAssessment } from '../src/ai/assess.ts';
import { askModel, resolveProvider } from '../src/voice/providers/devproxy.mjs';

const [, , file, modelArg] = process.argv;
if (!file) {
  console.error('usage: node scripts/assess-frame.mjs <photo.jpg> [model]');
  process.exit(2);
}
// The same resolution as the proxy's frame route: MODEL_PROVIDER still picks between the
// vision providers, and a text-only one (xAI) drops out instead of receiving the photo.
const provider = resolveProvider(undefined, { vision: true });
if (!provider) {
  console.error('No vision key. Set GEMINI_API_KEY or FEATHERLESS_API_KEY in the environment or .env.local; XAI_API_KEY serves the text routes only and never sees a frame.');
  process.exit(1);
}
const model = modelArg ?? provider.model;
const image = readFileSync(file).toString('base64');
const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';

console.log(`provider: ${provider.id}\nmodel: ${model}`);
const reply = await askModel({ provider: provider.id, chat: provider.chat, key: provider.key, model, image, mime, system: ASSESS_SYSTEM, user: ASSESS_USER });
console.log(`latency: ${reply.latencyMs} ms\n--- raw ---\n${reply.text}\n--- parsed ---`);
// The parser reads pixel boxes for Qwen2.5-VL; without the frame size those come out wrong,
// so it is given here as unknown and the box is reported on the model's own scale.
console.log(JSON.stringify(parseAssessment(reply.text, { model: reply.model, latencyMs: reply.latencyMs, frame: { width: 0, height: 0 } }), null, 2));
