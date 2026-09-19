#!/usr/bin/env node
// Creates the SIMULATED 911 dispatcher agent in the team's ElevenLabs account (docs/04
// TODO item 3) and prints the line to add to .env.local. Run once per account; the key
// proxy then hands the browser a signed session URL for it, so the id never ships in the
// bundle. Re-running creates a second agent: delete the old one in the dashboard first.
//
//   node scripts/create-dispatcher-agent.mjs
//
// The persona is a stage character for the demo. It asks the three things a real
// call-taker asks first (location, nature, patient status: the order of P2's SITREP block),
// and it is told in its prompt that it gives NO medical instructions, because those come
// from the machines alone (CLAUDE.md principle 1). The app labels it SIMULATED throughout.
import { readFileSync } from 'node:fs';

const ENV_LOCAL = new URL('../.env.local', import.meta.url);
const DISPATCHER_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah, see src/voice/providers/voices.ts

function readLocalEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(ENV_LOCAL, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim() || null;
  } catch {
    return null;
  }
}

const PROMPT = `You are playing a 911 emergency dispatcher in a TRAINING SIMULATION for a first-aid coaching app called Mayday. The caller is a bystander at a medical emergency. A separate coaching system is already giving them first-aid instructions out loud; you never give medical instructions of any kind. Do not tell them how to do CPR, how to stop bleeding, or what to do with the patient. If they ask, say "Keep following the coaching you are hearing."

Your job, in this order, one question at a time, in short calm sentences:
1. Confirm the address or location of the emergency.
2. Ask what happened and what they see.
3. Ask whether the patient is awake and whether they are breathing.
Then say help is on the way, tell them to stay on the line and keep following the coaching, and answer any further replies with brief steady acknowledgements. Never say you are an AI unless asked; if asked, say this is a simulation. Keep every reply under two sentences.`;

async function main() {
  const apiKey = readLocalEnv('ELEVENLABS_API_KEY');
  if (!apiKey) {
    console.error('No key. Set ELEVENLABS_API_KEY in the environment or .env.local.');
    process.exit(1);
  }
  const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Mayday simulated dispatcher',
      conversation_config: {
        agent: {
          first_message: '9 1 1, what is the address of your emergency?',
          language: 'en',
          prompt: { prompt: PROMPT, temperature: 0.3 },
        },
        tts: {
          voice_id: DISPATCHER_VOICE_ID,
          model_id: 'eleven_flash_v2_5',
          agent_output_audio_format: 'pcm_16000',
        },
        asr: { user_input_audio_format: 'pcm_16000' },
        conversation: { max_duration_seconds: 600 },
      },
    }),
  });
  if (!res.ok) {
    console.error(`create failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const { agent_id: agentId } = await res.json();
  console.log(`Agent created. Add this line to .env.local and restart npm run dev:\n\nELEVENLABS_AGENT_ID=${agentId}\n`);
}

void main();
