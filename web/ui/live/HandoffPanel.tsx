// SITREP and HANDOFF, the closing surface (docs/05 screens 3 and 4), drawn over the dimmed
// camera: the read-aloud block, the headline metrics, the timeline and the QR of the report.
// Every line is P2's builder output; nothing is composed here. Owned by P4.
import { useEffect, useState } from 'react';
import type { EventLogEntry } from '../../../src/types';
import { MACHINE_LABEL, type Session, type SessionSnapshot } from '../../session';
import { guideFor } from '../guide';

type Props = { snap: SessionSnapshot; session: Session };

/**
 * The timeline a paramedic reads. State ids become the step's title, and lines about the phone
 * itself (recognizer errors, dispatcher plumbing) stay in the log but off this screen.
 */
export function timelineLine(e: EventLogEntry): string | null {
  if (e.kind === 'metric') return null;
  if (e.data?.type === 'state_enter') {
    const key = `${e.data.machineId}.${e.data.stateId}`;
    const title = guideFor(key)?.title ?? e.data.stateId.replace(/_/g, ' ');
    const machine = MACHINE_LABEL[e.data.machineId] ?? e.data.machineId;
    return e.data.machineId === 'triage' ? machine : `${machine}: ${title}`;
  }
  if (e.kind === 'system' && /^(speech recognition error|simulated dispatcher:|already on the line)/.test(e.detail)) return null;
  return e.detail;
}

export function HandoffPanel({ snap, session }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void session.qr().then((url) => {
      if (live) setQr(url);
    });
    return () => {
      live = false;
    };
  }, [session, snap.handoff?.generatedAt]);

  const sitrep = snap.sitrep;
  const handoff = snap.handoff;
  const timeline = (handoff?.timeline ?? []).flatMap((e) => {
    const text = timelineLine(e);
    return text === null ? [] : [{ t: e.t, text }];
  });

  return (
    <div className="live-handoff">
      <h1>Handoff</h1>
      <p className="live-handoff-sub">{handoff?.emergency}</p>

      <section>
        <h2>Say this to the dispatcher</h2>
        <ol className="live-readaloud">
          {(sitrep?.readAloud ?? []).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
        <button className="live-ghost" onClick={() => session.readSitrepAloud()}>
          Read it aloud for me
        </button>
      </section>

      <section>
        <h2>For the paramedics</h2>
        <ul className="live-headline">
          {(handoff?.headline ?? []).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {qr ? <img className="live-qr" src={qr} alt="QR code of the handoff report" /> : <div className="live-qr placeholder">QR</div>}
      </section>

      <section>
        <h2>Timeline</h2>
        <ul className="live-timeline">
          {timeline.map((e, i) => (
            <li key={`${e.t}-${i}`}>
              <span>{clock(e.t, handoff?.startedAt ?? timeline[0]?.t ?? e.t)}</span> {e.text}
            </li>
          ))}
        </ul>
      </section>

      <button className="live-next" onClick={() => session.restart()}>
        Start over
      </button>
    </div>
  );
}

function clock(t: number, from: number): string {
  const total = Math.max(0, Math.round((t - from) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
