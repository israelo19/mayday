// React binding for the session: one external store, one snapshot. Owned by P4 (docs/07).
import { useSyncExternalStore } from 'react';
import type { Session, SessionSnapshot } from '../../session';

export function useSession(session: Session): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
}
