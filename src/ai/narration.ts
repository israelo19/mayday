// Episodic AI: narration flavor, docs/04. Owned by P4 (docs/07). OPTIONAL, first to cut if
// time is short. Stubbed until TODO #5 lands; the stub trivially satisfies
// src/protocol/validate.ts because it returns the canonical line untouched.

export interface NarrationFlavor {
  /** Paraphrases the canonical line. Must return text that semantically matches one of the
   * state's approvedLines; P2's validator checks required keywords and falls back to the
   * canonical text on any miss. */
  flavor(canonical: string, stateId: string): Promise<string>;
}

class StubNarrationFlavor implements NarrationFlavor {
  async flavor(canonical: string, _stateId: string): Promise<string> {
    return canonical;
  }
}

/** flags.narrationFlavor will gate a real LLM-backed implementation later (docs/04 TODO #5);
 * until that lands, this always returns the canonical line unchanged. */
export function createNarrationFlavor(): NarrationFlavor {
  return new StubNarrationFlavor();
}
