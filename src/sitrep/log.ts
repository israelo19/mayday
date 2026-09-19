// Append-only event log. Everything the SITREP and the handoff report claim is derived from
// here, so the report can never say something the session did not actually record.
import type { EventLogEntry } from '../types';

export interface EventLog {
  append(e: EventLogEntry): void;
  entries(): readonly EventLogEntry[];
  subscribe(cb: () => void): () => void;
  clear(): void;
}

export function createEventLog(): EventLog {
  const entries: EventLogEntry[] = [];
  const subs = new Set<() => void>();
  return {
    append(e) {
      entries.push(e);
      for (const cb of subs) cb();
    },
    entries: () => entries,
    subscribe(cb) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    clear() {
      entries.length = 0;
      for (const cb of subs) cb();
    },
  };
}
