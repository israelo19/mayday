// Episodic AI: vision scene description, docs/04. Owned by P4 (docs/07).
// The key proxy exists (src/voice/providers/devproxy.mjs); the Gemini wiring for this item
// (docs/04 TODO 4) was never implemented, so this stays a stub and nothing reads
// flags.visionDescribe. The one photo that does leave the phone is src/ai/assess.ts (item 7).
// A real provider would be called at most once per bleeding.find_wound / cardiac.handoff
// entry, never on the perception->engine->voice hot path, and must fall back to this stub on
// any error.

export interface VisionDescriber {
  /** One frame in, called on bleeding.find_wound entry and cardiac.handoff. */
  describeScene(frameJpegB64: string): Promise<{ sceneLine: string; materials: string[] }>;
}

/** Hardcoded demo data. Never touches the network. */
class StubVisionDescriber implements VisionDescriber {
  async describeScene(_frameJpegB64: string): Promise<{ sceneLine: string; materials: string[] }> {
    return {
      sceneLine: 'I can see the patient lying on the floor near a couch.',
      materials: ['shirt', 'towel', 'belt'],
    };
  }
}

/** flags.visionDescribe is reserved to gate a Gemini-backed implementation (docs/04 TODO 4);
 * it is parsed by src/flags.ts and read nowhere, and this always returns the stub. */
export function createVisionDescriber(): VisionDescriber {
  return new StubVisionDescriber();
}
