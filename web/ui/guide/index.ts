// Public surface of the step guide module. The coach screen needs `guideFor` and
// `StepGuide`; the gallery is the local test surface at `?guide=1`. Owned by P4.
export { COMPRESSION_BPM, GUIDES, guideFor, guideKeys } from './guides';
export { StepGuide, type StepGuideProps } from './StepGuide';
export { RhythmTrace, type LiveSample, type LiveSource } from './RhythmTrace';
export { THRESHOLDS, emphasisFrom, judge, type Emphasis, type Judgement, type RateBand } from './judge';
export { beatPhase, beatPeriodMs, compressionDepth } from './beat';
export { GuideGallery } from './GuideGallery';
export type { Guide, GuideKey, GuideStep, MachineId, SceneId, SceneProps } from './types';
