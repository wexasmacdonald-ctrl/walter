// This worker is a thin wrapper around the deployed worker under walter/worker/.
// Keeping a single source of truth prevents the two copies from drifting again.
export { default } from '../../walter/worker/src/index';
