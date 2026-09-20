// Controls for ?fake=1: drive the pretend rescuer so the whole loop demos on a laptop with no
// camera and no one on a pillow. Dev surface only. Owned by P2 (fake) / P4 (screen).
import { useState } from 'react';
import type { FakePerceptionHandle } from '../../../src/perception/fake';

export function FakeControls({ perception }: { perception: FakePerceptionHandle }) {
  const [, force] = useState(0);
  const [open, setOpen] = useState(true);
  const c = perception.controls;
  const set = (patch: Parameters<FakePerceptionHandle['setControls']>[0]) => {
    perception.setControls(patch);
    force((n) => n + 1);
  };
  // It floats over the real screen, so it has to get out of the way: collapsed it is a single
  // chip in the corner, and the handoff and the dispatcher are readable behind it again.
  if (!open) {
    return (
      <button className="live-fake collapsed" onClick={() => setOpen(true)}>
        fake rescuer
      </button>
    );
  }
  return (
    <div className="live-fake">
      <button className="live-fake-head" onClick={() => setOpen(false)}>
        <span>fake rescuer</span>
        <span>hide</span>
      </button>
      <label>
        {c.rate}/min
        <input type="range" min={60} max={150} value={c.rate} onChange={(e) => set({ rate: Number(e.target.value) })} />
      </label>
      <button onClick={() => set({ compressing: !c.compressing })}>{c.compressing ? 'stop pushing' : 'push'}</button>
      <button onClick={() => set({ cameraCovered: !c.cameraCovered })}>{c.cameraCovered ? 'uncover' : 'cover lens'}</button>
      <button onClick={() => set({ handsOn: c.handsOn === false ? true : false })}>{c.handsOn === false ? 'hands on' : 'lift hands'}</button>
      <button onClick={() => set({ personDown: !c.personDown })}>{c.personDown ? 'person up' : 'person down'}</button>
      <label>
        model says
        <select value={c.scene} onChange={(e) => set({ scene: e.target.value as typeof c.scene })}>
          <option value="unclear">unclear</option>
          <option value="collapsed">collapsed</option>
          <option value="bleeding">bleeding</option>
          <option value="choking">choking</option>
        </select>
      </label>
    </div>
  );
}
