// The machine registry. Machines are static typed data compiled into the bundle and never
// fetched at runtime, which is the structural answer to "tampering with medical content"
// in the docs/01 threat model.
import type { Machine } from '../../types';
import { bleeding } from './bleeding';
import { cardiac } from './cardiac';
import { choking } from './choking';
import { triage } from './triage';

export const machines: readonly Machine[] = [triage, cardiac, bleeding, choking];

export { bleeding, cardiac, choking, triage };
export { HANDS_OFF_MS } from './bleeding';
