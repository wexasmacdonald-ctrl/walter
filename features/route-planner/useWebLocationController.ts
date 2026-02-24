import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  UseWebLocationControllerOptions,
  UseWebLocationControllerResult,
  WebLocationCoords,
  WebLocationErrorCode,
  WebLocationState,
  WebLocationStatus,
} from './web-location.types';

const DEFAULT_APPROXIMATE_THRESHOLD_M = 500;
const DEFAULT_PRECISE_THRESHOLD_M = 30;
const DEFAULT_COARSE_TIMEOUT_MS = 10000;
const DEFAULT_COARSE_MAX_AGE_MS = 120000;
const DEFAULT_PRECISE_TIMEOUT_MS = 30000;
const DEFAULT_PRECISE_MAX_AGE_MS = 0;
const DEFAULT_POLL_INTERVAL_MS = 30000;
const MIN_LOCATION_MOVE_UPDATE_M = 8;
const MIN_ACCURACY_DELTA_UPDATE_M = 8;
const MAX_LOCATION_STALE_UPDATE_MS = 4000;

function createInitialState(): WebLocationState {
  return {
    status: 'idle',
    coords: null,
    accuracyM: null,
    isApproximate: false,
    statusMessage: null,
    isLocating: false,
    lastErrorCode: null,
  };
}

function getDeniedMessage(host: string): string {
  return `Location was denied for ${host}. In Safari use aA > Website Settings > Location > Allow, then retry.`;
}

function normalizeErrorCode(code: unknown): WebLocationErrorCode {
  return code === 1 || code === 2 || code === 3 ? code : null;
}

function toCoords(position: GeolocationPosition): WebLocationCoords {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
}

function normalizeAccuracy(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function distanceMeters(a: WebLocationCoords, b: WebLocationCoords): number {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function hasMeaningfulLocationChange(
  prev: WebLocationState,
  nextCoords: WebLocationCoords,
  nextAccuracyM: number | null,
  nextStatus: WebLocationStatus,
  nextApproximate: boolean,
  lastEmitAtMs: number
): boolean {
  if (!prev.coords) {
    return true;
  }
  if (prev.status !== nextStatus || prev.isApproximate !== nextApproximate) {
    return true;
  }
  const moved = distanceMeters(prev.coords, nextCoords);
  if (moved >= MIN_LOCATION_MOVE_UPDATE_M) {
    return true;
  }
  if (prev.accuracyM !== null && nextAccuracyM !== null) {
    if (Math.abs(prev.accuracyM - nextAccuracyM) >= MIN_ACCURACY_DELTA_UPDATE_M) {
      return true;
    }
  } else if (prev.accuracyM !== nextAccuracyM) {
    return true;
  }
  return Date.now() - lastEmitAtMs >= MAX_LOCATION_STALE_UPDATE_MS;
}

export function useWebLocationController(
  options: UseWebLocationControllerOptions = {}
): UseWebLocationControllerResult {
  const {
    autoStart = true,
    approximateThresholdM = DEFAULT_APPROXIMATE_THRESHOLD_M,
    preciseThresholdM = DEFAULT_PRECISE_THRESHOLD_M,
    coarseTimeoutMs = DEFAULT_COARSE_TIMEOUT_MS,
    coarseMaximumAgeMs = DEFAULT_COARSE_MAX_AGE_MS,
    preciseTimeoutMs = DEFAULT_PRECISE_TIMEOUT_MS,
    preciseMaximumAgeMs = DEFAULT_PRECISE_MAX_AGE_MS,
  } = options;

  const [state, setState] = useState<WebLocationState>(createInitialState);

  const sessionIdRef = useRef(0);
  const coarseTimeoutRef = useRef<number | null>(null);
  const refineTimeoutRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const lastLocationEmitAtRef = useRef(0);

  const clearCoarseTimeout = useCallback(() => {
    if (coarseTimeoutRef.current !== null) {
      window.clearTimeout(coarseTimeoutRef.current);
      coarseTimeoutRef.current = null;
    }
  }, []);

  const clearRefineTimeout = useCallback(() => {
    if (refineTimeoutRef.current !== null) {
      window.clearTimeout(refineTimeoutRef.current);
      refineTimeoutRef.current = null;
    }
  }, []);

  const clearPollInterval = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const clearAllTracking = useCallback(() => {
    clearCoarseTimeout();
    clearRefineTimeout();
    clearPollInterval();
  }, [clearCoarseTimeout, clearPollInterval, clearRefineTimeout]);

  const beginPreciseTracking = useCallback(
    (sessionId: number, host: string) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return;
      }

      clearRefineTimeout();
      refineTimeoutRef.current = window.setTimeout(() => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }
        setState((prev) => {
          if (prev.coords) {
            const fallbackStatus: WebLocationStatus = prev.isApproximate
              ? 'coarse_ready'
              : 'precise_ready';
            return {
              ...prev,
              status: fallbackStatus,
              statusMessage: 'Using last known location while GPS continues to refine.',
              isLocating: false,
              lastErrorCode: 3,
            };
          }

          return {
            ...prev,
            status: 'timeout',
            statusMessage: 'Location timed out. Move outdoors and tap "Locate me" to retry.',
            isLocating: false,
            lastErrorCode: 3,
          };
        });
      }, preciseTimeoutMs);

      const onPreciseSuccess = (position: GeolocationPosition) => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }

        const coords = toCoords(position);
        const accuracyM = normalizeAccuracy(position.coords.accuracy);

        if (accuracyM !== null && accuracyM <= preciseThresholdM) {
          clearRefineTimeout();
          setState((prev) => {
            if (
              !hasMeaningfulLocationChange(
                prev,
                coords,
                accuracyM,
                'precise_ready',
                false,
                lastLocationEmitAtRef.current
              )
            ) {
              return prev;
            }
            lastLocationEmitAtRef.current = Date.now();
            return {
              status: 'precise_ready',
              coords,
              accuracyM,
              isApproximate: false,
              statusMessage: null,
              isLocating: false,
              lastErrorCode: null,
            };
          });
          return;
        }

        if (accuracyM !== null && accuracyM <= approximateThresholdM) {
          setState((prev) => {
            if (
              !hasMeaningfulLocationChange(
                prev,
                coords,
                accuracyM,
                'coarse_ready',
                true,
                lastLocationEmitAtRef.current
              )
            ) {
              return prev;
            }
            lastLocationEmitAtRef.current = Date.now();
            return {
              status: 'coarse_ready',
              coords,
              accuracyM,
              isApproximate: true,
              statusMessage: 'Using approximate location while refining GPS.',
              isLocating: false,
              lastErrorCode: null,
            };
          });
          return;
        }

        setState((prev) => {
          const hasFix = prev.coords !== null;
          return {
            ...prev,
            status: 'requesting_precise',
            coords: hasFix ? prev.coords : null,
            accuracyM: hasFix ? prev.accuracyM : accuracyM,
            isApproximate: hasFix ? prev.isApproximate : false,
            statusMessage: hasFix
              ? 'Current fix is coarse. Continuing GPS refinement.'
              : 'Searching for a usable GPS fix...',
            isLocating: hasFix ? false : true,
            lastErrorCode: null,
          };
        });
      };

      const onPreciseError = (error: GeolocationPositionError) => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }
        const code = normalizeErrorCode(error.code);
        if (code === 1) {
          clearRefineTimeout();
          setState((prev) => ({
            ...prev,
            status: 'denied',
            statusMessage: getDeniedMessage(host),
            isLocating: false,
            lastErrorCode: code,
          }));
          return;
        }
        if (code === 2) {
          setState((prev) => {
            if (prev.coords) {
              const fallbackStatus: WebLocationStatus = prev.isApproximate
                ? 'coarse_ready'
                : 'precise_ready';
              return {
                ...prev,
                status: fallbackStatus,
                statusMessage: 'GPS is unavailable right now. Using last known location.',
                isLocating: false,
                lastErrorCode: code,
              };
            }
            return {
              ...prev,
              status: 'unavailable',
              statusMessage: 'Location is unavailable. Check GPS/network and try again.',
              isLocating: false,
              lastErrorCode: code,
            };
          });
          return;
        }
        if (code === 3) {
          setState((prev) => {
            if (prev.coords) {
              const fallbackStatus: WebLocationStatus = prev.isApproximate
                ? 'coarse_ready'
                : 'precise_ready';
              return {
                ...prev,
                status: fallbackStatus,
                statusMessage: 'GPS refinement timed out. Using last known location.',
                isLocating: false,
                lastErrorCode: code,
              };
            }
            return {
              ...prev,
              status: 'timeout',
              statusMessage: 'Location timed out. Move outdoors and tap "Locate me" to retry.',
              isLocating: false,
              lastErrorCode: code,
            };
          });
          return;
        }

        setState((prev) => ({
          ...prev,
          status: 'error',
          statusMessage: 'Could not determine location. Tap "Locate me" to retry.',
          isLocating: false,
          lastErrorCode: null,
        }));
      };

      const requestPreciseUpdate = () => {
        if (sessionIdRef.current !== sessionId) {
          return;
        }
        navigator.geolocation.getCurrentPosition(onPreciseSuccess, onPreciseError, {
          enableHighAccuracy: true,
          timeout: preciseTimeoutMs,
          maximumAge: preciseMaximumAgeMs,
        });
      };

      requestPreciseUpdate();
      clearPollInterval();
      pollIntervalRef.current = window.setInterval(requestPreciseUpdate, DEFAULT_POLL_INTERVAL_MS);
    },
    [
      approximateThresholdM,
      clearPollInterval,
      clearRefineTimeout,
      preciseMaximumAgeMs,
      preciseThresholdM,
      preciseTimeoutMs,
    ]
  );

  const startLocate = useCallback(() => {
    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    clearAllTracking();

    if (typeof window === 'undefined') {
      setState({
        status: 'unsupported',
        coords: null,
        accuracyM: null,
        isApproximate: false,
        statusMessage: 'Location is unavailable in this environment.',
        isLocating: false,
        lastErrorCode: null,
      });
      return;
    }

    const host = window.location.host || 'this site';
    if (!window.isSecureContext) {
      setState({
        status: 'insecure_context',
        coords: null,
        accuracyM: null,
        isApproximate: false,
        statusMessage: 'Location requires HTTPS. Open the secure site and try again.',
        isLocating: false,
        lastErrorCode: null,
      });
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        status: 'unsupported',
        coords: null,
        accuracyM: null,
        isApproximate: false,
        statusMessage: 'Browser geolocation is not supported on this device.',
        isLocating: false,
        lastErrorCode: null,
      });
      return;
    }

    setState({
      status: 'requesting_coarse',
      coords: null,
      accuracyM: null,
      isApproximate: false,
      statusMessage: 'Requesting location...',
      isLocating: true,
      lastErrorCode: null,
    });

    coarseTimeoutRef.current = window.setTimeout(() => {
      if (sessionIdRef.current !== sessionId) {
        return;
      }
      setState({
        status: 'timeout',
        coords: null,
        accuracyM: null,
        isApproximate: false,
        statusMessage: 'Location timed out. Tap "Locate me" to retry.',
        isLocating: false,
        lastErrorCode: 3,
      });
    }, coarseTimeoutMs + 1000);

    const onCoarseSuccess = (position: GeolocationPosition) => {
      if (sessionIdRef.current !== sessionId) {
        return;
      }
      clearCoarseTimeout();

      const coords = toCoords(position);
      const accuracyM = normalizeAccuracy(position.coords.accuracy);
      lastLocationEmitAtRef.current = Date.now();

      if (accuracyM !== null && accuracyM <= approximateThresholdM) {
        setState({
          status: 'coarse_ready',
          coords,
          accuracyM,
          isApproximate: true,
          statusMessage: 'Approximate location found. Refining GPS...',
          isLocating: false,
          lastErrorCode: null,
        });
      } else {
        setState({
          status: 'requesting_precise',
          coords: null,
          accuracyM,
          isApproximate: false,
          statusMessage: 'Initial fix is too coarse. Refining GPS...',
          isLocating: true,
          lastErrorCode: null,
        });
      }

      beginPreciseTracking(sessionId, host);
    };

    const onCoarseError = (error: GeolocationPositionError) => {
      if (sessionIdRef.current !== sessionId) {
        return;
      }
      clearCoarseTimeout();

      const code = normalizeErrorCode(error.code);
      if (code === 1) {
        setState({
          status: 'denied',
          coords: null,
          accuracyM: null,
          isApproximate: false,
          statusMessage: getDeniedMessage(host),
          isLocating: false,
          lastErrorCode: code,
        });
        return;
      }

      if (code === 2) {
        setState({
          status: 'unavailable',
          coords: null,
          accuracyM: null,
          isApproximate: false,
          statusMessage: 'Location is unavailable. Check GPS/network and retry.',
          isLocating: false,
          lastErrorCode: code,
        });
        return;
      }

      if (code === 3) {
        setState({
          status: 'timeout',
          coords: null,
          accuracyM: null,
          isApproximate: false,
          statusMessage: 'Location timed out. Move outdoors and tap "Locate me" again.',
          isLocating: false,
          lastErrorCode: code,
        });
        return;
      }

      setState({
        status: 'error',
        coords: null,
        accuracyM: null,
        isApproximate: false,
        statusMessage: 'Could not determine location. Tap "Locate me" to retry.',
        isLocating: false,
        lastErrorCode: null,
      });
    };

    navigator.geolocation.getCurrentPosition(onCoarseSuccess, onCoarseError, {
      enableHighAccuracy: false,
      timeout: coarseTimeoutMs,
      maximumAge: coarseMaximumAgeMs,
    });
  }, [
    approximateThresholdM,
    beginPreciseTracking,
    clearAllTracking,
    clearCoarseTimeout,
    coarseMaximumAgeMs,
    coarseTimeoutMs,
  ]);

  useEffect(() => {
    if (autoStart) {
      startLocate();
    }

    return () => {
      sessionIdRef.current += 1;
      clearAllTracking();
    };
  }, [autoStart, clearAllTracking, startLocate]);

  const hasFix = state.coords !== null;
  const isPrecise = hasFix && !state.isApproximate;

  return useMemo(
    () => ({
      startLocate,
      state,
      hasFix,
      isPrecise,
    }),
    [hasFix, isPrecise, startLocate, state]
  );
}
