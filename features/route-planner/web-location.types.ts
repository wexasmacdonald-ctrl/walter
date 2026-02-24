export type WebLocationStatus =
  | 'idle'
  | 'requesting'
  | 'ready_approx'
  | 'ready_precise'
  | 'denied'
  | 'timeout'
  | 'unavailable'
  | 'unsupported'
  | 'insecure_context'
  | 'error';

export type WebLocationErrorCode = 1 | 2 | 3 | null;

export type WebLocationTrigger = 'manual' | 'poll' | 'auto';

export type WebLocationCoords = {
  lat: number;
  lng: number;
};

export type WebLocationState = {
  status: WebLocationStatus;
  coords: WebLocationCoords | null;
  accuracyM: number | null;
  isApproximate: boolean;
  statusMessage: string | null;
  isLocating: boolean;
  lastErrorCode: WebLocationErrorCode;
  lastUpdateAtMs: number | null;
  nextPollAtMs: number | null;
};

export type UseWebLocationControllerOptions = {
  autoStart?: boolean;
  pollIntervalMs?: number;
  approximateThresholdM?: number;
  coarseTimeoutMs?: number;
  coarseMaximumAgeMs?: number;
  preciseTimeoutMs?: number;
  preciseMaximumAgeMs?: number;
};

export type UseWebLocationControllerResult = {
  startLocate: () => void;
  stop: () => void;
  state: WebLocationState;
  hasFix: boolean;
  isPrecise: boolean;
};
