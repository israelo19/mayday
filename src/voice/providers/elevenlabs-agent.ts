// ElevenLabs Agents dispatcher, docs/04 TODO item 3 and docs/07 P3 task 7: the simulated
// 911 call-taker as a live voice agent. The phone mic streams to the agent, the agent's
// voice plays back, and its words land on the SIMULATED panel. Lives under
// src/voice/providers/ because it is a network path (src/voice/boundaries.test.ts), and it
// exists only behind `flags.dispatcherSim`; the scripted dispatcher is the floor it falls
// back to at every step, so the wifi-off demo never depends on this file.
//
// Shape of the deal:
//   - The agent id lives in the key proxy, not here: GET {baseUrl}/dispatcher/session
//     returns a signed WebSocket URL, which is all the browser ever holds.
//   - Audio both ways is base64 PCM16 at 16 kHz, the agent's default, so the browser mic
//     runs an AudioContext at that rate and the agent's chunks are queued back to back.
//   - Any miss before the session is live (no agent configured, socket refused, no
//     initiation metadata within the budget) or a drop mid-call hands the call to the
//     scripted dispatcher with the same panel callback; replies typed meanwhile are replayed.
//   - The bystander's words have no authority anywhere (CLAUDE.md principle 1): this agent
//     is a stage character. The coaching lines come from the machines, never from here.
//
// Owned by P3 (docs/07).
import type { DispatcherSim } from '../../ai/dispatcher';

// =============================================================================
// Injectable seams: the socket, the mic and the speaker
// =============================================================================

/** The subset of WebSocket this module drives; a fake stands in for it in tests. */
export type AgentSocket = {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export type AgentSocketFactory = (url: string) => AgentSocket;

/** Microphone capture delivering base64 PCM16 chunks until stopped. */
export type MicSource = {
  start(onChunk: (pcm16Base64: string) => void): Promise<void>;
  stop(): void;
};

/** Gapless playback of base64 PCM16 chunks; flush() drops whatever has not played yet. */
export type PcmPlayer = {
  play(pcm16Base64: string): void;
  flush(): void;
  unlock?(): Promise<void>;
};

export type AgentDispatcherStatus = 'connecting' | 'live' | 'fallback' | 'ended';

export type AgentDispatcherOptions = {
  /** The key proxy base. Same-origin in production so nothing here knows about keys. */
  baseUrl?: string;
  /** The scripted dispatcher (src/voice/dispatcher.ts). Required: it is the floor. */
  fallback: DispatcherSim;
  /** Budget from connect() to the agent's initiation metadata before falling back. */
  connectTimeoutMs?: number;
  /** For the panel: a "listening" chip while live, a "scripted" chip after a fallback. */
  onStatus?: (s: AgentDispatcherStatus) => void;
  /** What the agent heard the bystander say, for the EventLog (kind 'user', docs/04). */
  onTranscript?: (t: string) => void;
  /** Test seams; the browser adapters below are the defaults. */
  fetchFn?: typeof fetch;
  socketFactory?: AgentSocketFactory;
  mic?: MicSource;
  player?: PcmPlayer;
};

const DEFAULTS = {
  baseUrl: '/api/proxy',
  connectTimeoutMs: 4000,
} as const;

/** The agent's default rate for both directions; the agent is created with these formats. */
export const AGENT_SAMPLE_RATE = 16_000;

// =============================================================================
// PCM16 codecs (pure, exported for tests)
// =============================================================================

/** Float samples in [-1, 1] to little-endian int16, base64. Out-of-range samples clip. */
export function pcm16Base64FromFloat32(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    // int16 is asymmetric: +1 maps to 32767 and -1 to -32768, so scale each side to its edge.
    view.setInt16(i * 2, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true);
  }
  return bytesToBase64(bytes);
}

/** Base64 little-endian int16 back to float samples in [-1, 1]. */
export function float32FromPcm16Base64(pcm16Base64: string): Float32Array<ArrayBuffer> {
  const bytes = base64ToBytes(pcm16Base64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.byteLength >> 1);
  for (let i = 0; i < samples.length; i++) {
    const v = view.getInt16(i * 2, true);
    samples[i] = v / (v < 0 ? 32768 : 32767);
  }
  return samples;
}

// btoa/atob exist in browsers and node 16+; chunked so a long buffer never blows the
// argument list of String.fromCharCode.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// =============================================================================
// The dispatcher
// =============================================================================

/** The server events this module acts on; everything else is ignored on purpose. */
type ServerEvent =
  | { type: 'conversation_initiation_metadata' }
  | { type: 'audio'; audio_event: { audio_base_64: string } }
  | { type: 'agent_response'; agent_response_event: { agent_response: string } }
  | { type: 'user_transcript'; user_transcript_event: { user_transcript: string } }
  | { type: 'interruption' }
  | { type: 'ping'; ping_event: { event_id: number } }
  | { type: string };

export function createAgentDispatcher(options: AgentDispatcherOptions): DispatcherSim {
  const o = { ...DEFAULTS, ...options };
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const socketFactory = options.socketFactory ?? browserSocket;
  const mic = options.mic ?? browserMic();
  const player = options.player ?? browserPcmPlayer();

  return {
    connect(onDispatcherLine: (t: string) => void) {
      let status: AgentDispatcherStatus = 'connecting';
      let socket: AgentSocket | null = null;
      let micStarted = false;
      let scripted: ReturnType<DispatcherSim['connect']> | null = null;
      /** Replies typed before the call settled; replayed to whichever side wins. */
      const pending: string[] = [];

      const setStatus = (s: AgentDispatcherStatus): void => {
        status = s;
        o.onStatus?.(s);
      };

      const teardownAgent = (): void => {
        if (micStarted) mic.stop();
        micStarted = false;
        player.flush();
        const s = socket;
        socket = null;
        if (s) {
          // Detach first: closing must not re-enter fallBack through onclose.
          s.onclose = null;
          s.onerror = null;
          s.close();
        }
      };

      const fallBack = (): void => {
        if (status === 'fallback' || status === 'ended') return;
        clearTimeout(liveTimer);
        teardownAgent();
        setStatus('fallback');
        scripted = o.fallback.connect(onDispatcherLine);
        for (const text of pending.splice(0)) scripted.sayToDispatcher(text);
      };

      // No initiation metadata in time means no live call: hand over, do not wait on hope.
      const liveTimer = setTimeout(fallBack, o.connectTimeoutMs);
      setStatus('connecting');

      const onServerEvent = (raw: string): void => {
        let event: ServerEvent;
        try {
          event = JSON.parse(raw) as ServerEvent;
        } catch {
          return; // not ours to interpret
        }
        switch (event.type) {
          case 'conversation_initiation_metadata':
            clearTimeout(liveTimer);
            setStatus('live');
            for (const text of pending.splice(0)) sendUserMessage(text);
            break;
          case 'audio':
            player.play((event as { audio_event: { audio_base_64: string } }).audio_event.audio_base_64);
            break;
          case 'agent_response':
            onDispatcherLine((event as { agent_response_event: { agent_response: string } }).agent_response_event.agent_response);
            break;
          case 'user_transcript':
            o.onTranscript?.((event as { user_transcript_event: { user_transcript: string } }).user_transcript_event.user_transcript);
            break;
          case 'interruption':
            player.flush();
            break;
          case 'ping':
            socket?.send(JSON.stringify({ type: 'pong', event_id: (event as { ping_event: { event_id: number } }).ping_event.event_id }));
            break;
        }
      };

      const sendUserMessage = (text: string): void => {
        socket?.send(JSON.stringify({ type: 'user_message', text }));
      };

      const open = async (): Promise<void> => {
        const res = await fetchFn(`${o.baseUrl}/dispatcher/session`);
        if (!res.ok) throw new Error(`dispatcher session ${res.status}`);
        const { signedUrl } = (await res.json()) as { signedUrl: string };
        if (status !== 'connecting') return; // fell back or hung up while fetching
        const s = socketFactory(signedUrl);
        socket = s;
        s.onmessage = onServerEvent;
        s.onclose = fallBack;
        s.onerror = fallBack;
        s.onopen = () => {
          if (status !== 'connecting' && status !== 'live') return;
          // Mic before metadata: the agent's first words are its own, and the bystander
          // often answers before our state machine notices the session is live.
          micStarted = true;
          void mic.start((pcm16Base64) => socket?.send(JSON.stringify({ user_audio_chunk: pcm16Base64 })));
        };
      };
      void player.unlock?.();
      open().catch(fallBack);

      return {
        sayToDispatcher(text: string): void {
          if (status === 'ended') return;
          if (status === 'live') return sendUserMessage(text);
          if (status === 'fallback') return scripted?.sayToDispatcher(text);
          pending.push(text);
        },
        hangup(): void {
          if (status === 'ended') return;
          clearTimeout(liveTimer);
          teardownAgent();
          scripted?.hangup();
          setStatus('ended');
        },
      };
    },
  };
}

// =============================================================================
// Browser adapters (default seams; kept out of the tests)
// =============================================================================

function browserSocket(url: string): AgentSocket {
  const ws = new WebSocket(url);
  const wrapper: AgentSocket = {
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  ws.onopen = () => wrapper.onopen?.();
  ws.onmessage = (e) => wrapper.onmessage?.(String(e.data));
  ws.onclose = () => wrapper.onclose?.();
  ws.onerror = () => wrapper.onerror?.();
  return wrapper;
}

/**
 * getUserMedia into an AudioContext pinned to the agent's rate, so the browser does the
 * resampling and every chunk we forward is already 16 kHz mono. ScriptProcessorNode is
 * deprecated but universal; an AudioWorklet needs a separate module file the PWA would
 * have to precache, which is not worth it for a demo-only path.
 */
function browserMic(): MicSource {
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let node: ScriptProcessorNode | null = null;
  return {
    async start(onChunk) {
      stream = await navigator.mediaDevices.getUserMedia({
        // The phone speaker is inches from the mic: the agent must not hear itself.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      ctx = new AudioContext({ sampleRate: AGENT_SAMPLE_RATE });
      const source = ctx.createMediaStreamSource(stream);
      // 4096 samples at 16 kHz is a 256 ms chunk: few enough messages, small enough lag.
      node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => onChunk(pcm16Base64FromFloat32(e.inputBuffer.getChannelData(0)));
      source.connect(node);
      node.connect(ctx.destination); // a ScriptProcessor only runs while connected to output
    },
    stop() {
      node?.disconnect();
      node = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      void ctx?.close();
      ctx = null;
    },
  };
}

/** Schedules each chunk right after the previous one on one context, so speech is gapless. */
function browserPcmPlayer(): PcmPlayer {
  let ctx: AudioContext | null = null;
  let playhead = 0;
  let sources: AudioBufferSourceNode[] = [];
  const ensure = () => (ctx ??= new AudioContext({ sampleRate: AGENT_SAMPLE_RATE }));
  return {
    async unlock() {
      await ensure().resume();
    },
    play(pcm16Base64) {
      const audioCtx = ensure();
      const samples = float32FromPcm16Base64(pcm16Base64);
      if (samples.length === 0) return;
      const buffer = audioCtx.createBuffer(1, samples.length, AGENT_SAMPLE_RATE);
      buffer.copyToChannel(samples, 0);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      // Never schedule in the past: after a pause the playhead catches up to now.
      playhead = Math.max(playhead, audioCtx.currentTime);
      source.start(playhead);
      playhead += buffer.duration;
      sources.push(source);
      source.onended = () => {
        sources = sources.filter((s) => s !== source);
      };
    },
    flush() {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          // already ended
        }
      }
      sources = [];
      playhead = 0;
    },
  };
}
