// The SIMULATED dispatcher, floating over the camera. The bystander answers by tapping a
// SITREP line (or types nothing: any reply advances the script). Never a real line. Owned by P4.
import { useState } from 'react';
import type { Sitrep } from '../../../src/types';

type Props = {
  lines: readonly string[];
  sitrep: Sitrep | null;
  onReply: (text: string) => void;
  onHangUp: () => void;
};

export function DispatcherPanel({ lines, sitrep, onReply, onHangUp }: Props) {
  const [open, setOpen] = useState(true);
  const last = lines[lines.length - 1] ?? '';
  return (
    <div className={`live-dispatch${open ? '' : ' collapsed'}`}>
      <div className="live-dispatch-head" onClick={() => setOpen((o) => !o)}>
        <span className="live-sim-tag">Simulated 911</span>
        <span className="live-dispatch-toggle">{open ? 'Hide' : 'Show'}</span>
      </div>
      {open && (
        <>
          <p className="live-dispatch-line">{last}</p>
          <div className="live-dispatch-replies">
            {(sitrep?.readAloud ?? []).slice(0, 4).map((l) => (
              <button key={l} className="live-reply" onClick={() => onReply(l)}>
                {l}
              </button>
            ))}
            <button className="live-reply" onClick={() => onReply('Okay.')}>
              Okay
            </button>
          </div>
          <button className="live-ghost small" onClick={onHangUp}>
            Hang up
          </button>
        </>
      )}
    </div>
  );
}
