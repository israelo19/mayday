// Controls for ?fake=1: drive the pretend rescuer so the whole loop demos on a laptop with no
// camera and no one on a pillow. Dev surface only. Owned by P2 (fake) / P4 (screen).
import { useState } from 'react';
import type { FakePerceptionHandle } from '../../../src/perception/fake';

export function FakeControls({ perception }: { perception: FakePerceptionHandle }) {
  const [, force] = useState(0);
  const c = perception.controls;
  const set = (patch: Parameters<FakePerceptionHandle['setControls']>[0]) => {
    perception.setControls(patch);
    force((n) => n + 1);
  };
  return (
    <div className="live-fake">
      <span>fake rescuer</span>
      <label>
        {c.rate}/min
        <input type="range" min={60} max={150} value={c.rate} onChange={(e) => set({ rate: Number(e.target.value) })} />
      </label>
      <button onClick={() => set({ compressing: !c.compressing })}>{c.compressing ? 'stop pushing' : 'push'}</button>
      <button onClick={() => set({ cameraCovered: !c.cameraCovered })}>{c.cameraCovered ? 'uncover' : 'cover lens'}</button>
      <button onClick={() => set({ handsOn: c.handsOn === false ? true : false })}>{c.handsOn === false ? 'hands on' : 'lift hands'}</button>
      <button onClick={() => set({ personDown: !c.personDown })}>{c.personDown ? 'person up' : 'person down'}</button>
    </div>
  );
}
