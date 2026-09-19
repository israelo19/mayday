// Episodic AI: DispatcherSim interface, docs/04. Interface only, defined here so P4's
// session.ts and P3's implementation agree on one shape (docs/07 P4 task 4). P3 implements
// this in src/voice (docs/07 P3 task 7: scripted stub first, ElevenLabs Agents behind
// flags.dispatcherSim later) — `import type` only, never a value import, so eslint.config.js's
// perception/protocol/voice restriction on src/ai still holds for anything that could reach
// the network.

export interface DispatcherSim {
  /** Demo-only simulated 911 dispatcher. Caller renders the big red SIMULATED banner. */
  connect(onDispatcherLine: (t: string) => void): { sayToDispatcher(t: string): void; hangup(): void };
}
