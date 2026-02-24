export type WebLocationStatus =
  | 'idle'
  | 'requesting_coarse'
  | 'coarse_ready'
  | 'requesting_precise'
  | 'precise_ready'
  | 'denied'
  | 'timeout'
  | 'unavailable'
  | 'unsupported'
  | 'insecure_context'
  | 'error';

export type WebLocationErrorCode = 1 | 2 | 3 | null;

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
};

export type UseWebLocationControllerOptions = {
  autoStart?: boolean;
  approximateThresholdM?: number;
  preciseThresholdM?: number;
  coarseTimeoutMs?: number;
  coarseMaximumAgeMs?: number;
  preciseTimeoutMs?: number;
  preciseMaximumAgeMs?: number;
};

export type UseWebLocationControllerResult = {
  startLocate: () => void;
  state: WebLocationState;
  hasFix: boolean;
  isPrecise: boolean;
};
