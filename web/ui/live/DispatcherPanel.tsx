// The dispatcher panel, floating over the camera. Scripted by default; behind
// `?flag=dispatcherSim` the ElevenLabs agent hears the phone mic itself, so the reply buttons
// only show while the script is the one asking. Never a real line (CLAUDE.md principle 5): the
// launch screen says so before the session starts, and nothing here repeats it, because a panel
// that calls itself fake mid-emergency is not the panel we are building towards. Owned by P4.
import { useEffect, useState } from 'react';
import type { DispatcherLine, DispatcherStatus } from '../../session';
import type { Sitrep } from '../../../src/types';
import { dispatcherDone, repliesFor } from '../../../src/voice';

type Props = {
  status: DispatcherStatus;
  lines: readonly DispatcherLine[];
  sitrep: Sitrep | null;
  onReply: (text: string) => void;
  onHangUp: () => void;
};

// What the caller sees. Which engine is answering (script or agent) is a build detail, so both
// read 'On the line'; the distinction stays in the event log for the debug screen.
const STATUS_LABEL: Record<DispatcherStatus, string> = {
  scripted: 'On the line',
  connecting: 'Connecting',
  live: 'Listening to you',
  fallback: 'On the line',
  ended: 'Call ended',
};

export function DispatcherPanel({ status, lines, sitrep, onReply, onHangUp }: Props) {
  const [open, setOpen] = useState(true);
  const recent = lines.slice(-3);
  const scripted = status === 'scripted' || status === 'fallback';
  // The script has asked everything it has: fold the panel so the coaching underneath is
  // visible again, and stop offering replies there is nothing left to answer.
  const said = lines.filter((l) => l.who === 'dispatcher').map((l) => l.text);
  const done = status === 'ended' || (scripted && dispatcherDone(said));
  // Answers fit the question just asked; the bystander picks the true one (docs/04 item 3).
  const replies = scripted && !done ? repliesFor(said[said.length - 1] ?? null, sitrep) : [];
  const showReplies = replies.length > 0;
  useEffect(() => {
    if (done) setOpen(false);
  }, [done]);
  return (
    <div className={`live-dispatch${open ? '' : ' collapsed'}`}>
      <div className="live-dispatch-head" onClick={() => setOpen((o) => !o)}>
        <span className="live-sim-tag">911</span>
        <span className="live-dispatch-toggle">
          {done && status !== 'ended' ? 'On the line' : STATUS_LABEL[status]} · {open ? 'Hide' : 'Show'}
        </span>
      </div>
      {open && (
        <>
          {/* Head and Hang up stay put; only the exchange scrolls. On a 320 px phone the whole
              panel used to scroll as one, which pushed Hang up out of reach exactly when the
              screen was most crowded. */}
          <div className="live-dispatch-scroll">
            <div className="live-dispatch-lines">
            {recent.length === 0 && <p className="live-dispatch-line muted">Connecting you to a call-taker</p>}
              {recent.map((l, i) => (
                <p key={`${i}-${l.text}`} className={`live-dispatch-line${l.who === 'you' ? ' you' : ''}`}>
                  <b>{l.who === 'you' ? 'You' : 'Dispatcher'}</b> {l.text}
                </p>
              ))}
            </div>
            {showReplies && (
              <div className="live-dispatch-replies">
                {replies.map((l) => (
                  <button key={l} className="live-reply" onClick={() => onReply(l)}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="live-ghost small" onClick={onHangUp}>
            Hang up
          </button>
        </>
      )}
    </div>
  );
}
