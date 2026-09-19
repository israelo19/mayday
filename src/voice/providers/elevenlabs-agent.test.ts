// The ElevenLabs Agents dispatcher (docs/04 item 3) in test form: the phone mic streams to
// the agent once the session is live, the agent's words reach the panel and its audio the
// speaker, pings are answered, and any failure to get live hands the call to the scripted
// dispatcher so the SIMULATED exchange always happens. Socket, mic, player and fetch are
// fakes, so it all runs in node.
import { describe, expect, it } from 'vitest';
import type { DispatcherSim } from '../../ai/dispatcher';
import {
  createAgentDispatcher,
  float32FromPcm16Base64,
  pcm16Base64FromFloat32,
  type AgentSocket,
  type MicSource,
  type PcmPlayer,
} from './elevenlabs-agent';

class FakeSocket implements AgentSocket {
  sent: string[] = [];
  closed = 0;
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed++;
    this.onclose?.();
  }
  /** Server side of the fake: deliver one JSON event to the client. */
  receive(event: unknown): void {
    this.onmessage?.(JSON.stringify(event));
  }
  sentJson(): unknown[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

function fakeMic() {
  let onChunk: ((pcm16Base64: string) => void) | null = null;
  let stopped = 0;
  const mic: MicSource = {
    start: (cb) => {
      onChunk = cb;
      return Promise.resolve();
    },
    stop: () => stopped++,
  };
  return { mic, speak: (b64: string) => onChunk?.(b64), stopped: () => stopped, listening: () => onChunk !== null };
}

function fakePlayer() {
  const played: string[] = [];
  let flushed = 0;
  const player: PcmPlayer = {
    play: (b64) => played.push(b64),
    flush: () => flushed++,
  };
  return { player, played, flushed: () => flushed };
}

function fakeScripted() {
  const lines: string[] = [];
  const replies: string[] = [];
  let connects = 0;
  let hangups = 0;
  const sim: DispatcherSim = {
    connect(onLine) {
      connects++;
      onLine('9 1 1, what is the address of your emergency?');
      return {
        sayToDispatcher: (t) => replies.push(t),
        hangup: () => hangups++,
      };
    },
  };
  return { sim, lines, replies, connects: () => connects, hangups: () => hangups };
}

const sessionOk = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({ signedUrl: 'wss://agent.test/session?token=abc', firstMessage: '9 1 1, where are you?' }),
      { status: 200 },
    ),
  );
const sessionMissing = () => Promise.resolve(new Response(JSON.stringify({ error: 'no agent' }), { status: 404 }));

const LIVE = {
  type: 'conversation_initiation_metadata',
  conversation_initiation_metadata_event: {
    conversation_id: 'c1',
    agent_output_audio_format: 'pcm_16000',
    user_input_audio_format: 'pcm_16000',
  },
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function build(fetchScript: () => Promise<Response>, extra?: { connectTimeoutMs?: number }) {
  const sockets: FakeSocket[] = [];
  const { mic, speak, stopped, listening } = fakeMic();
  const { player, played, flushed } = fakePlayer();
  const scripted = fakeScripted();
  const statuses: string[] = [];
  const lines: string[] = [];
  const transcripts: string[] = [];
  const dispatcher = createAgentDispatcher({
    baseUrl: 'https://proxy.test',
    fallback: scripted.sim,
    fetchFn: fetchScript as unknown as typeof fetch,
    socketFactory: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    mic,
    player,
    connectTimeoutMs: extra?.connectTimeoutMs ?? 50,
    onStatus: (s) => statuses.push(s),
    onTranscript: (t) => transcripts.push(t),
  });
  const call = dispatcher.connect((line) => lines.push(line));
  return { call, sockets, speak, stopped, listening, played, flushed, scripted, statuses, lines, transcripts };
}

/** Fetch the session, open the socket, and get the initiation metadata: the happy path. */
async function goLive(b: ReturnType<typeof build>): Promise<FakeSocket> {
  await tick();
  const socket = b.sockets[0];
  socket.onopen?.();
  socket.receive(LIVE);
  await tick();
  return socket;
}

describe('createAgentDispatcher', () => {
  it('opens the signed socket the proxy hands out, never the agent id itself', async () => {
    const b = build(sessionOk);
    const socket = await goLive(b);
    expect(socket.url).toBe('wss://agent.test/session?token=abc');
    expect(b.statuses).toEqual(['connecting', 'live']);
    expect(b.scripted.connects()).toBe(0);
    // The agent speaks its opening line without an agent_response event; the proxy supplies the text.
    expect(b.lines).toEqual(['9 1 1, where are you?']);
  });

  it('streams mic audio to the agent once live, as base64 user_audio_chunk', async () => {
    const b = build(sessionOk);
    const socket = await goLive(b);
    expect(b.listening()).toBe(true);
    b.speak('AAAA');
    expect(socket.sentJson()).toContainEqual({ user_audio_chunk: 'AAAA' });
  });

  it('shows the agent line, plays its audio, logs the transcript and answers pings', async () => {
    const b = build(sessionOk);
    const socket = await goLive(b);
    socket.receive({ type: 'agent_response', agent_response_event: { agent_response: 'What is your location?' } });
    socket.receive({ type: 'audio', audio_event: { audio_base_64: 'QUJD', event_id: 1 } });
    socket.receive({ type: 'user_transcript', user_transcript_event: { user_transcript: 'Main and 5th' } });
    socket.receive({ type: 'ping', ping_event: { event_id: 7, ping_ms: 12 } });
    expect(b.lines).toEqual(['9 1 1, where are you?', 'What is your location?']);
    expect(b.played).toEqual(['QUJD']);
    expect(b.transcripts).toEqual(['Main and 5th']);
    expect(socket.sentJson()).toContainEqual({ type: 'pong', event_id: 7 });
  });

  it('cuts playback when the agent is interrupted', async () => {
    const b = build(sessionOk);
    const socket = await goLive(b);
    socket.receive({ type: 'interruption', interruption_event: { event_id: 3 } });
    expect(b.flushed()).toBe(1);
  });

  it('forwards a typed reply as a user_message', async () => {
    const b = build(sessionOk);
    const socket = await goLive(b);
    b.call.sayToDispatcher('He is not breathing');
    expect(socket.sentJson()).toContainEqual({ type: 'user_message', text: 'He is not breathing' });
  });

  it('falls back to the scripted dispatcher when the proxy has no agent', async () => {
    const b = build(sessionMissing);
    await tick();
    await tick();
    expect(b.scripted.connects()).toBe(1);
    expect(b.lines).toEqual(['9 1 1, what is the address of your emergency?']);
    expect(b.statuses).toEqual(['connecting', 'fallback']);
    expect(b.sockets.length).toBe(0);
  });

  it('falls back when the socket opens but never goes live in budget, and replays queued replies', async () => {
    const b = build(sessionOk, { connectTimeoutMs: 10 });
    await tick();
    b.sockets[0].onopen?.(); // the mic is already running; the agent never sends its metadata
    b.call.sayToDispatcher('Hello?');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(b.scripted.connects()).toBe(1);
    expect(b.scripted.replies).toEqual(['Hello?']);
    expect(b.sockets[0].closed).toBe(1);
    expect(b.stopped()).toBe(1);
  });

  it('hangup stops the mic, closes the socket and flushes audio', async () => {
    const b = build(sessionOk);
    const socket = await goLive(b);
    b.call.hangup();
    expect(b.stopped()).toBe(1);
    expect(socket.closed).toBe(1);
    expect(b.flushed()).toBe(1);
    expect(b.statuses.at(-1)).toBe('ended');
  });

  it('hangup after fallback hangs up the scripted call too', async () => {
    const b = build(sessionMissing);
    await tick();
    await tick();
    b.call.hangup();
    expect(b.scripted.hangups()).toBe(1);
  });
});

describe('pcm16 codecs', () => {
  it('clips and quantizes float samples to little-endian int16, base64', () => {
    // 0, full scale, negative full scale, and a value beyond range that must clip.
    const b64 = pcm16Base64FromFloat32(new Float32Array([0, 1, -1, 2]));
    const bytes = Buffer.from(b64, 'base64');
    expect(Array.from(new Int16Array(bytes.buffer, bytes.byteOffset, 4))).toEqual([0, 32767, -32768, 32767]);
  });

  it('round-trips within one quantization step', () => {
    const input = new Float32Array([0.5, -0.25, 0.1]);
    const output = float32FromPcm16Base64(pcm16Base64FromFloat32(input));
    for (let i = 0; i < input.length; i++) expect(Math.abs(output[i] - input[i])).toBeLessThan(1 / 32767);
  });
});
