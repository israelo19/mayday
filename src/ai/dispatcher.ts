// Episodic AI: DispatcherSim interface, docs/04. Interface only, defined here so P4's
// session.ts and P3's implementation agree on one shape (docs/07 P4 task 4). P3 implements
// this in src/voice (docs/07 P3 task 7: scripted stub first, ElevenLabs Agents behind
// flags.dispatcherSim later): `import type` only, never a value import, so the
// perception/protocol/voice restriction on src/ai (scripts/check-ai-boundaries.mjs, `npm run
// lint`, DECISIONS Sat 02:05) still holds for anything that could reach the network.

export interface DispatcherSim {
  /** Demo-only simulated 911 dispatcher. The caller renders the call panel, which reads
   * 911 / On the line; tests/boundaries.test.ts forbids the word SIMULATED on the live screen. */
  connect(onDispatcherLine: (t: string) => void): { sayToDispatcher(t: string): void; hangup(): void };
}
