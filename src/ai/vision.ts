// Episodic AI: vision scene description, docs/04. Owned by P4 (docs/07).
// Stubbed until the key proxy (docs/04 TODO #1) and Gemini wiring (TODO #4) land. The real
// provider is called at most once per bleeding.find_wound / cardiac.handoff entry, never on
// the perception->engine->voice hot path, and must fall back to this stub on any error.

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

/** flags.visionDescribe will gate a real Gemini-backed implementation later (docs/04 TODO #4);
 * until that lands, this always returns the stub. */
export function createVisionDescriber(): VisionDescriber {
  return new StubVisionDescriber();
}
