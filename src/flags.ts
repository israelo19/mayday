// Feature flags for episodic AI (docs/04) and voice upgrades. Owned by P4 (docs/07).
// All default OFF. `?flag=<name>` flips a flag on for the session, `?flag=a,b` flips several
// (the phone demo needs the ElevenLabs voice and the ElevenLabs dispatcher together); nothing
// persists across reloads. Every flagged integration must revert cleanly to its stub when this
// is false or when the real provider fails (docs/04 TODO registry).

export interface Flags {
  elevenLabs: boolean;
  dispatcherSim: boolean;
  visionDescribe: boolean;
  narrationFlavor: boolean;
  /** One frame to a scene model in triage (docs/04 item 7, docs/11). The frame leaves the phone. */
  sceneAssess: boolean;
}

const DEFAULTS: Flags = {
  elevenLabs: false,
  dispatcherSim: false,
  visionDescribe: false,
  narrationFlavor: false,
  sceneAssess: false,
};

/** Flags for a query string such as `?flag=elevenLabs,dispatcherSim`; unknown names are ignored. */
export function parseFlags(search: string): Flags {
  const flags = { ...DEFAULTS };
  const requested = new URLSearchParams(search).get('flag') ?? '';
  for (const name of requested.split(',').map((n) => n.trim())) {
    if (name in DEFAULTS) flags[name as keyof Flags] = true;
  }
  return flags;
}

export const flags: Flags = typeof window === 'undefined' ? { ...DEFAULTS } : parseFlags(window.location.search);
