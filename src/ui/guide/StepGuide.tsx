// The step guide player: one protocol state's pictures, walked step by step like a
// workout app. Uncontrolled it auto-advances on each step's hold time; controlled (the
// coach screen passing `step`) it shows exactly the line the voice is on. Owned by P4.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CoachingEvent, PerceptionFacts } from '../../types';
import { COMPRESSION_BPM } from './guides';
import { emphasisFrom, judge, type Emphasis } from './judge';
import { RhythmTrace, type LiveSource } from './RhythmTrace';
import { sceneFor } from './scenes/registry';
import type { Guide, SceneId } from './types';
import './guide.css';

// =============================================================================
// Module Overview
// =============================================================================
// `StepGuide` renders the step bar, the scene, the caption and, for a beat guide, the
// rhythm trace. The caption is the step's docs/02 line, or the engine's active
// `CoachingEvent` text while one is in force: the guide shows what the voice says and
// never composes a line of its own.

/** Corrections that have a picture of their own; while one is active that picture shows, whatever step the voice is on. */
const SCENE_FOR_EMPHASIS: Partial<Record<Emphasis, SceneId>> = { 'hands-off': 'dont_lift' };

export type StepGuideProps = {
  guide: Guide;
  /** Controlled step index; when set the guide never advances by itself. */
  step?: number;
  onStepChange?: (index: number) => void;
  /** Auto-advance through the steps (default true). Ignored when `step` is controlled. */
  autoplay?: boolean;
  /** Beat rate override, for when the metronome runs at something other than the guide's default. */
  bpm?: number;
  /** A `performance.now()` timestamp of one metronome tick; the figure pushes on that phase. */
  beatOriginMs?: number;
  facts?: PerceptionFacts | null;
  /** The engine's latest active correction for this state, shown as the caption while it lasts. */
  coaching?: CoachingEvent | null;
  live?: LiveSource;
  showControls?: boolean;
  compact?: boolean;
  className?: string;
};

export function StepGuide({
  guide,
  step,
  onStepChange,
  autoplay = true,
  bpm,
  beatOriginMs = 0,
  facts = null,
  coaching = null,
  live,
  showControls = false,
  compact = false,
  className,
}: StepGuideProps) {
  const steps = guide.steps;
  const controlled = step !== undefined;
  const [inner, setInner] = useState(0);
  const [paused, setPaused] = useState(false);
  const index = clampIndex(controlled ? step : inner, steps.length);

  // A new guide starts from its first step.
  useEffect(() => {
    setInner(0);
  }, [guide.key]);

  const go = useCallback(
    (i: number) => {
      const next = clampIndex(i, steps.length);
      setInner(next);
      onStepChange?.(next);
    },
    [steps.length, onStepChange],
  );

  useEffect(() => {
    if (controlled || !autoplay || paused) return;
    const id = window.setTimeout(() => go((index + 1) % steps.length), steps[index].holdMs);
    return () => window.clearTimeout(id);
  }, [controlled, autoplay, paused, index, steps, go, guide.key]);

  const judgement = useMemo(() => judge(facts), [facts]);
  const emphasis = emphasisFrom(coaching);
  const current = steps[index];
  const emphasisScene = emphasis === null ? undefined : SCENE_FOR_EMPHASIS[emphasis];
  const scene = emphasisScene !== undefined && steps.some((s) => s.scene === emphasisScene) ? emphasisScene : current.scene;
  const SceneComponent = sceneFor(scene);
  const beatBpm = bpm ?? guide.beat?.bpm ?? COMPRESSION_BPM;
  const priority = coaching?.priority ?? null;
  const captionClass = priority === 'critical' ? 'is-critical' : priority === 'correction' ? 'is-correction' : '';
  const rootClass = ['gd', paused ? 'is-paused' : '', compact ? 'is-compact' : '', className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={rootClass} data-guide={guide.key}>
      <div className="gd-steps" role="tablist" aria-label={`${guide.title} steps`}>
        {steps.map((s, i) => {
          const state = i < index ? 'is-done' : i === index ? (controlled || !autoplay ? 'is-held' : 'is-active') : '';
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Step ${i + 1}: ${s.caption}`}
              className={`gd-step ${state}`}
              style={{ '--hold': `${s.holdMs}ms` } as React.CSSProperties}
              onClick={() => go(i)}
            >
              <span className="gd-step-track">
                {/* Keyed on the index so re-entering a step restarts its fill. */}
                <span key={i === index ? `active-${index}` : 'idle'} className="gd-step-fill" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="gd-stage">
        {/* Keyed on the scene so consecutive steps that share a picture keep it running without a restart. */}
        <div key={`${guide.key}:${scene}`} className="gd-scene">
          <SceneComponent bpm={beatBpm} beatOriginMs={beatOriginMs} paused={paused} judgement={judgement} emphasis={emphasis} />
        </div>
        {priority && <span className={`gd-badge is-${priority}`}>{priority}</span>}
      </div>

      {!compact && (
        <div className="gd-meta">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          <span>{guide.title}</span>
        </div>
      )}

      <p className={`gd-caption ${captionClass}`} aria-live="polite">
        {coaching ? coaching.text : current.caption}
      </p>

      {guide.beat && <RhythmTrace bpm={beatBpm} beatOriginMs={beatOriginMs} paused={paused} judgement={judgement} live={live} height={compact ? 72 : 96} />}

      {showControls && (
        <div className="gd-controls">
          <button type="button" onClick={() => go((index - 1 + steps.length) % steps.length)} aria-label="Previous step">
            Back
          </button>
          <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? 'Play' : 'Pause'}
          </button>
          <button type="button" onClick={() => go((index + 1) % steps.length)} aria-label="Next step">
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function clampIndex(i: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(Math.trunc(i), 0), length - 1);
}
