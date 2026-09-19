// Feature flags for episodic AI (docs/04) and voice upgrades. Owned by P4 (docs/07).
// All default OFF. `?flag=<name>` flips exactly one flag on for the session; nothing persists
// across reloads. Every flagged integration must revert cleanly to its stub when this is false
// or when the real provider fails (docs/04 TODO registry).

export interface Flags {
  elevenLabs: boolean;
  dispatcherSim: boolean;
  visionDescribe: boolean;
  narrationFlavor: boolean;
}

const DEFAULTS: Flags = {
  elevenLabs: false,
  dispatcherSim: false,
  visionDescribe: false,
  narrationFlavor: false,
};

function readFlags(): Flags {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  const requested = new URLSearchParams(window.location.search).get('flag');
  if (requested && requested in DEFAULTS) {
    return { ...DEFAULTS, [requested]: true };
  }
  return { ...DEFAULTS };
}

export const flags: Flags = readFlags();
