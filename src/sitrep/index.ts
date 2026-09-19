// SITREP and handoff report. The bystander reads the top block to the dispatcher; the
// paramedics get the bottom one. Both are built from the event log alone (docs/02).
export { createEventLog, type EventLog } from './log';
export { deriveMetrics, startedAt, currentStateKey, activeMachine, EMPTY_METRICS } from './derive';
export { buildSitrep, buildHandoff, handoffJson, handoffQrPayload, formatDuration } from './build';
export { qrDataUrl } from './qr';
