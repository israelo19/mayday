// Episodic AI: narration flavor, docs/04 item 5. The one thing principle 1 lets a model do
// with a medical line: paraphrase it. The session hands over ONE canonical line and a little
// context (what the person just said, what the camera measures, how many times the line has
// been said) and gets back a rewording; src/protocol/validate.ts then checks the numbers, the
// required words, the length and the forbidden terms, and the canonical line speaks on any
// miss. Never on the hot path: a step's lines are reworded before the step is reached and a
// nag's first firing is always canonical (web/session.ts). Owned by P4 (docs/07).

export type FlavorContext = {
  /** The machine's label: 'CPR', 'Severe bleeding'. */
  situation: string;
  step: string;
  /** What the person said in the last few seconds, or null. */
  heard: string | null;
  /** Live facts as short plain phrases, e.g. "pushing at about 85 a minute". Empty when none. */
  observations: string[];
  /** The only numbers, besides the line's own, the rewording may use: the ones in `observations`. */
  numbers: number[];
  /** Times this line has already been said on this step. */
  repeat: number;
  /** The validator's length budget for this line. */
  maxChars: number;
};

export interface NarrationFlavor {
  /** A rewording of `canonical` for this moment, or null to keep the line. The caller validates. */
  flavor(canonical: string, ctx: FlavorContext): Promise<string | null>;
}

/** Never rewords. What the app runs offline and whenever the flag or the key is missing. */
class StubNarrationFlavor implements NarrationFlavor {
  async flavor(): Promise<null> {
    return null;
  }
}

/** The stub; web/providers.ts constructs GrokNarrationFlavor behind ?flag=narrationFlavor. */
export function createNarrationFlavor(): NarrationFlavor {
  return new StubNarrationFlavor();
}

export type GrokFlavorDeps = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** The proxy route (docs/04 TODO 1); same origin as the page. */
  url?: string;
};

const TIMEOUT_MS = 3000;
const SYSTEM = [
  'You rewrite one line of emergency first-aid coaching so it sounds like a calm, warm 911 dispatcher speaking to this one person right now.',
  'Keep every instruction and every number from the line. Do not add, drop, soften or reorder an instruction. Add no advice of your own.',
  'Use no number except those in the line or in the facts you are given.',
  'If you are given what the person said or a measurement, you may open with a few words that acknowledge it. Never mention a camera or a model; say "I can see" or say nothing.',
  'Plain words a frightened person can follow. One or two short sentences.',
  'Output only the rewritten line, with no quotes.',
].join(' ');

/** The user turn, exported so the tests can hold it to the rules. */
export function flavorPrompt(canonical: string, ctx: FlavorContext): string {
  const lines = [
    `Line: "${canonical}"`,
    `Situation: ${ctx.situation}, step ${ctx.step}.`,
    ctx.heard ? `They just said: "${ctx.heard}"` : 'They have not said anything recently.',
    ctx.observations.length > 0 ? `Measured: ${ctx.observations.join('; ')}.` : 'Nothing measured.',
  ];
  if (ctx.repeat > 0) lines.push(`This line has been said ${ctx.repeat} time${ctx.repeat === 1 ? '' : 's'} already; say it a fresh way.`);
  lines.push(`At most ${ctx.maxChars} characters.`);
  return lines.join('\n');
}

/** One line: surrounding quotes and any second paragraph gone; nothing left becomes null. */
export function cleanFlavor(text: string): string | null {
  const first = text.trim().split(/\n\s*\n/)[0] ?? '';
  const line = first.replace(/\s+/g, ' ').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  return line.length > 0 ? line : null;
}

export class GrokNarrationFlavor implements NarrationFlavor {
  private readonly deps: Required<GrokFlavorDeps>;
  /** A 404 means no key behind the proxy; stop asking for the rest of the session. */
  private dead = false;

  constructor(deps?: GrokFlavorDeps) {
    this.deps = {
      fetch: deps?.fetch ?? ((...a) => fetch(...a)),
      timeoutMs: deps?.timeoutMs ?? TIMEOUT_MS,
      url: deps?.url ?? '/api/proxy/grok/chat',
    };
  }

  async flavor(canonical: string, ctx: FlavorContext): Promise<string | null> {
    if (this.dead || canonical.trim().length === 0) return null;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.deps.timeoutMs);
    try {
      const res = await this.deps.fetch(this.deps.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ system: SYSTEM, user: flavorPrompt(canonical, ctx), maxTokens: Math.min(120, Math.ceil(ctx.maxChars / 3) + 10) }),
        signal: abort.signal,
      });
      if (res.status === 404) {
        this.dead = true;
        return null;
      }
      if (!res.ok) return null;
      const { text } = (await res.json()) as { text?: string };
      return cleanFlavor(text ?? '');
    } catch {
      return null; // timeout, offline, bad JSON: the canonical line speaks
    } finally {
      clearTimeout(timer);
    }
  }
}
