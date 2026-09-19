// The step guide gallery at `?guide=1` (or `?guide=cardiac.position`): browse every
// picture, drive a pretend bystander to watch the guide react, and preview the coach
// layout on a phone frame. It is the local test surface for this module, not a product
// screen (docs/05 has four and this is not a fifth). Owned by P4.
import { useEffect, useMemo, useState } from 'react';
import type { CoachingEvent, PerceptionFacts } from '../../../src/types';
import { DemoBystander, demoCoaching, type DemoControls } from './demo';
import { COMPRESSION_BPM, GUIDES, guideFor } from './guides';
import type { LiveSource } from './RhythmTrace';
import { StepGuide } from './StepGuide';
import type { Guide, MachineId } from './types';
import './gallery.css';

// =============================================================================
// Module Overview
// =============================================================================
// `GuideGallery` owns the selection, the simulator toggle and the coach preview toggle.
// `CoachPreview` shows a guide the way docs/05's COACH screen will: CALL 911 on top, the
// picture and the line, the live metric, NEXT at the bottom.

type Props = { initialKey?: string | null };

const MACHINES: readonly { id: MachineId; label: string }[] = [
  { id: 'cardiac', label: 'Cardiac' },
  { id: 'bleeding', label: 'Bleeding' },
];

/** How often the simulator's facts reach React; the judgement changes slowly, the pictures do not need more. */
const FACTS_UI_MS = 200;

export function GuideGallery({ initialKey }: Props) {
  const [key, setKey] = useState<string>(() => (initialKey && guideFor(initialKey) ? initialKey : GUIDES[0].key));
  const guide = guideFor(key) ?? GUIDES[0];
  const [coach, setCoach] = useState(false);
  const [bpm, setBpm] = useState<number>(COMPRESSION_BPM);
  const [simOn, setSimOn] = useState(false);
  const bystander = useMemo(() => new DemoBystander(), []);
  const [controls, setControls] = useState<DemoControls>(() => bystander.get());
  const [facts, setFacts] = useState<PerceptionFacts | null>(null);
  const [coaching, setCoaching] = useState<CoachingEvent | null>(null);

  useEffect(() => {
    if (!simOn) {
      setFacts(null);
      setCoaching(null);
      return;
    }
    bystander.start();
    let last = 0;
    const unsubscribe = bystander.subscribe((f) => {
      const now = performance.now();
      if (now - last < FACTS_UI_MS) return;
      last = now;
      setFacts(f);
      setCoaching(demoCoaching(key, f, bystander.stoppedMs()));
    });
    return () => {
      unsubscribe();
      bystander.stop();
    };
  }, [simOn, bystander, key]);

  useEffect(() => {
    // Keep the deep link current so a picture can be shared as a URL.
    window.history.replaceState(null, '', `?guide=${encodeURIComponent(key)}`);
  }, [key]);

  const live = useMemo<LiveSource>(() => ({ series: bystander.series, peaks: bystander.peaks }), [bystander]);

  const update = (patch: Partial<DemoControls>) => {
    bystander.set(patch);
    setControls(bystander.get());
  };

  const select = (k: string) => {
    setKey(k);
  };

  return (
    <div className="gg">
      <header className="gg-header">
        <strong>Mayday</strong>
        <span className="gg-sub">step guides, one picture per protocol line</span>
        <label className="gg-toggle">
          <input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} />
          Coach preview
        </label>
      </header>

      <div className="gg-body">
        <nav className="gg-nav" aria-label="Guides">
          {MACHINES.map((m) => (
            <section key={m.id} className="gg-group">
              <h2>{m.label}</h2>
              {GUIDES.filter((g) => g.key.startsWith(`${m.id}.`)).map((g) => (
                <button key={g.key} type="button" className={`gg-item ${g.key === key ? 'is-selected' : ''}`} onClick={() => select(g.key)}>
                  <span className="gg-item-title">{g.title}</span>
                  <span className="gg-item-key">{g.key}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>

        <main className="gg-main">
          {coach ? (
            <CoachPreview guide={guide} bpm={bpm} facts={facts} coaching={coaching} live={simOn ? live : undefined} onAdvance={() => select(nextKey(key))} />
          ) : (
            <StepGuide key={guide.key} guide={guide} showControls bpm={bpm} facts={facts} coaching={coaching} live={simOn ? live : undefined} />
          )}

          <section className="gg-sim">
            <div className="gg-sim-head">
              <label className="gg-toggle">
                <input type="checkbox" checked={simOn} onChange={(e) => setSimOn(e.target.checked)} />
                Simulate the bystander
              </label>
              <span className="gg-note">engine stand-in: docs/02 rules without cooldowns, until src/protocol lands</span>
            </div>
            {simOn && (
              <div className="gg-sim-grid">
                <label className="gg-field">
                  <span>
                    Their rate <b>{controls.rate === null ? 'stopped' : `${controls.rate} / min`}</b>
                  </span>
                  <input
                    type="range"
                    min={60}
                    max={160}
                    step={1}
                    value={controls.rate ?? 110}
                    disabled={controls.rate === null}
                    onChange={(e) => update({ rate: Number(e.target.value) })}
                  />
                </label>
                <label className="gg-field">
                  <span>
                    Recoil <b>{controls.recoil.toFixed(2)}</b>
                  </span>
                  <input type="range" min={0} max={100} step={5} value={Math.round(controls.recoil * 100)} onChange={(e) => update({ recoil: Number(e.target.value) / 100 })} />
                </label>
                <label className="gg-field">
                  <span>
                    Metronome <b>{bpm} / min</b>
                  </span>
                  <input type="range" min={80} max={140} step={1} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
                </label>
                <label className="gg-check">
                  <input type="checkbox" checked={controls.rate === null} onChange={(e) => update({ rate: e.target.checked ? null : 110 })} />
                  They stopped pushing
                </label>
                <label className="gg-check">
                  <input type="checkbox" checked={controls.covered} onChange={(e) => update({ covered: e.target.checked })} />
                  Camera covered
                </label>
                <label className="gg-check">
                  <input type="checkbox" checked={!controls.handsOn} onChange={(e) => update({ handsOn: !e.target.checked })} />
                  Hands off the wound
                </label>
                <div className="gg-readout">
                  <div>{describeFacts(facts)}</div>
                  <div>{coaching ? `engine: ${coaching.dedupeKey} (${coaching.priority}) "${coaching.text}"` : 'engine: quiet'}</div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

type CoachPreviewProps = {
  guide: Guide;
  bpm: number;
  facts: PerceptionFacts | null;
  coaching: CoachingEvent | null;
  live?: LiveSource;
  onAdvance: () => void;
};

/** The COACH layout from docs/05 on a phone frame: instruction, picture, metric, the two persistent buttons. */
function CoachPreview({ guide, bpm, facts, coaching, live, onAdvance }: CoachPreviewProps) {
  const rate = facts?.compressionRate;
  return (
    <div className="gg-phone">
      <div className="gg-phone-screen">
        <div className="gg-call">
          <button type="button" className="primary">
            CALL 911
          </button>
          <span className="gg-call-note">opens the simulated dispatcher, never a real line</span>
        </div>
        <StepGuide key={guide.key} guide={guide} bpm={bpm} facts={facts} coaching={coaching} live={live} />
        <div className="gg-metric">
          <span className="gg-metric-value">{rate === null || rate === undefined ? '\u2014' : Math.round(rate)}</span>
          <span className="gg-metric-label">compressions / min</span>
        </div>
        <button type="button" className="gg-next" onClick={onAdvance}>
          NEXT
        </button>
      </div>
    </div>
  );
}

/** The guide after `key` within its machine, wrapping to the machine's first. */
function nextKey(key: string): string {
  const machine = key.split('.')[0];
  const inMachine = GUIDES.filter((g) => g.key.startsWith(`${machine}.`));
  const i = inMachine.findIndex((g) => g.key === key);
  return inMachine[(i + 1) % inMachine.length]?.key ?? key;
}

function describeFacts(f: PerceptionFacts | null): string {
  if (!f) return 'facts: none yet';
  const rate = f.compressionRate === null ? 'rate null' : `rate ${Math.round(f.compressionRate)}`;
  const recoil = f.recoilRatio === null ? 'recoil null' : `recoil ${f.recoilRatio.toFixed(2)}`;
  const hands = f.handsOnRegion === null ? 'hands null' : f.handsOnRegion ? 'hands on' : `hands off ${Math.round(f.handsOffMs ?? 0)} ms`;
  return `facts: ${rate}, ${f.compressionActive ? 'active' : 'inactive'}, ${recoil}, confidence ${f.poseConfidence.toFixed(2)}, ${hands}`;
}
