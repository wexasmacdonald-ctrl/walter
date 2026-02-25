import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  UseWebLocationControllerOptions,
  UseWebLocationControllerResult,
  WebLocationCoords,
  WebLocationErrorCode,
  WebLocationState,
  WebLocationTrigger,
} from './web-location.types';

const DEFAULT_APPROXIMATE_THRESHOLD_M = 50;
const DEFAULT_COARSE_TIMEOUT_MS = 10000;
const DEFAULT_COARSE_MAX_AGE_MS = 120000;
const DEFAULT_PRECISE_TIMEOUT_MS = 25000;
const DEFAULT_PRECISE_MAX_AGE_MS = 0;
const DEFAULT_POLL_INTERVAL_MS = 60000;

function createInitialState(): WebLocationState {
  return {
    status: 'idle',
    coords: null,
    accuracyM: null,
    isApproximate: false,
    statusMessage: null,
    isLocating: false,
    lastErrorCode: null,
    lastUpdateAtMs: null,
    nextPollAtMs: null,
  };
}

function normalizeErrorCode(code: unknown): WebLocationErrorCode {
  return code === 1 || code === 2 || code === 3 ? code : null;
}

function normalizeAccuracy(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function toCoords(position: GeolocationPosition): WebLocationCoords {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
}

function isLocalHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }
  return hostname.endsWith('.local');
}

function buildHostVariants(hostname: string): string[] {
  if (!hostname || isLocalHost(hostname)) {
    return [hostname || 'this site'];
  }

  const variants = new Set<string>([hostname]);
  if (hostname.startsWith('www.')) {
    variants.add(hostname.slice(4));
  } else if (hostname.includes('.')) {
    variants.add(`www.${hostname}`);
  }
  return Array.from(variants);
}

function getDeniedMessage(hostname: string): string {
  const variants = buildHostVariants(hostname);
  if (variants.length <= 1) {
    return `Location was denied for ${variants[0]}. In Safari use aA > Website Settings > Location > Allow, then retry.`;
  }
  return `Location was denied for ${hostname}. In Safari use aA > Website Settings > Location > Allow, then verify both ${variants[0]} and ${variants[1]} are allowed.`;
}

function getCurrentPositionAsync(
  geolocation: Geolocation,
  options: PositionOptions
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export function useWebLocationController(
  options: UseWebLocationControllerOptions = {}
): UseWebLocationControllerResult {
  const {
    autoStart = false,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    approximateThresholdM = DEFAULT_APPROXIMATE_THRESHOLD_M,
    coarseTimeoutMs = DEFAULT_COARSE_TIMEOUT_MS,
    coarseMaximumAgeMs = DEFAULT_COARSE_MAX_AGE_MS,
    preciseTimeoutMs = DEFAULT_PRECISE_TIMEOUT_MS,
    preciseMaximumAgeMs = DEFAULT_PRECISE_MAX_AGE_MS,
  } = options;

  const [state, setState] = useState<WebLocationState>(createInitialState);
  const sessionIdRef = useRef(0);
  const pollIntervalRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const runLocateCycleRef = useRef<(trigger: WebLocationTrigger) => void>(() => undefined);

  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setState((prev) => {
      if (prev.nextPollAtMs === null) {
        return prev;
      }
      return {
        ...prev,
        nextPollAtMs: null,
      };
    });
  }, []);

  const clearWatching = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (typeof window === 'undefined' || pollIntervalRef.current !== null) {
      return;
    }

    setState((prev) => ({
      ...prev,
      nextPollAtMs: Date.now() + pollIntervalMs,
    }));

    pollIntervalRef.current = window.setInterval(() => {
      setState((prev) => ({
        ...prev,
        nextPollAtMs: Date.now() + pollIntervalMs,
      }));
      runLocateCycleRef.current('poll');
    }, pollIntervalMs);
  }, [pollIntervalMs]);

  const runLocateCycle = useCallback(
    async (trigger: WebLocationTrigger) => {
      const sessionId = sessionIdRef.current + 1;
      sessionIdRef.current = sessionId;

      if (typeof window === 'undefined') {
        clearPolling();
        setState((prev) => ({
          ...prev,
          status: 'unsupported',
          statusMessage: 'Location is unavailable in this environment.',
          isLocating: false,
          lastErrorCode: null,
        }));
        return;
      }

      const hostname = window.location.hostname || 'this site';
      if (!window.isSecureContext) {
        clearPolling();
        setState((prev) => ({
          ...prev,
          status: 'insecure_context',
          statusMessage: 'Location requires HTTPS. Open the secure site and try again.',
          isLocating: false,
          lastErrorCode: null,
        }));
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        clearPolling();
        setState((prev) => ({
          ...prev,
          status: 'unsupported',
          statusMessage: 'Browser geolocation is not supported on this device.',
          isLocating: false,
          lastErrorCode: null,
        }));
        return;
      }

      const geolocation = navigator.geolocation;
      const startLiveWatch = () => {
        if (watchIdRef.current !== null) {
          return;
        }
        watchIdRef.current = geolocation.watchPosition(
          (position) => {
            if (sessionIdRef.current !== sessionId) {
              return;
            }
            const coords = toCoords(position);
            const accuracyM = normalizeAccuracy(position.coords.accuracy);
            const isApprox = accuracyM === null || accuracyM > approximateThresholdM;
            setState((prev) => ({
              ...prev,
              status: isApprox ? 'ready_approx' : 'ready_precise',
              coords,
              accuracyM,
              isApproximate: isApprox,
              statusMessage: isApprox ? 'Using approximate location.' : null,
              isLocating: false,
              lastErrorCode: null,
              lastUpdateAtMs: Date.now(),
            }));
          },
          (error) => {
            const code = normalizeErrorCode(error?.code);
            if (code === 1) {
              clearWatching();
              clearPolling();
              setState((prev) => ({
                ...prev,
                status: 'denied',
                isLocating: false,
                statusMessage: getDeniedMessage(hostname),
                lastErrorCode: code,
              }));
            }
          },
          {
            enableHighAccuracy: true,
            timeout: preciseTimeoutMs,
            maximumAge: 0,
          }
        );
      };
      setState((prev) => ({
        ...prev,
        status: 'requesting',
        statusMessage: trigger === 'poll' ? prev.statusMessage : 'Requesting location...',
        isLocating: true,
        lastErrorCode: null,
      }));

      try {
        const coarsePosition = await getCurrentPositionAsync(geolocation, {
          enableHighAccuracy: false,
          timeout: coarseTimeoutMs,
          maximumAge: coarseMaximumAgeMs,
        });

        if (sessionIdRef.current !== sessionId) {
          return;
        }

        const coarseCoords = toCoords(coarsePosition);
        const coarseAccuracyM = normalizeAccuracy(coarsePosition.coords.accuracy);
        const shouldRefine = coarseAccuracyM === null || coarseAccuracyM > approximateThresholdM;
        const coarseUpdatedAt = Date.now();

        setState((prev) => ({
          ...prev,
          status: shouldRefine ? 'ready_approx' : 'ready_precise',
          coords: coarseCoords,
          accuracyM: coarseAccuracyM,
          isApproximate: shouldRefine,
          statusMessage: shouldRefine ? 'Using approximate location while refining.' : null,
          isLocating: shouldRefine,
          lastErrorCode: null,
          lastUpdateAtMs: coarseUpdatedAt,
        }));

        if (!shouldRefine) {
          startLiveWatch();
          startPolling();
          return;
        }

        try {
          const precisePosition = await getCurrentPositionAsync(geolocation, {
            enableHighAccuracy: true,
            timeout: preciseTimeoutMs,
            maximumAge: preciseMaximumAgeMs,
          });

          if (sessionIdRef.current !== sessionId) {
            return;
          }

          const preciseCoords = toCoords(precisePosition);
          const preciseAccuracyM = normalizeAccuracy(precisePosition.coords.accuracy);
          const isPrecise = preciseAccuracyM !== null && preciseAccuracyM <= approximateThresholdM;

          setState((prev) => ({
            ...prev,
            status: isPrecise ? 'ready_precise' : 'ready_approx',
            coords: preciseCoords,
            accuracyM: preciseAccuracyM,
            isApproximate: !isPrecise,
            statusMessage: isPrecise ? null : 'Using approximate location.',
            isLocating: false,
            lastErrorCode: null,
            lastUpdateAtMs: Date.now(),
          }));
          startLiveWatch();
          startPolling();
        } catch (error) {
          if (sessionIdRef.current !== sessionId) {
            return;
          }

          const code = normalizeErrorCode((error as GeolocationPositionError | undefined)?.code);
          if (code === 1) {
            clearPolling();
            setState((prev) => ({
              ...prev,
              status: 'denied',
              isLocating: false,
              statusMessage: getDeniedMessage(hostname),
              lastErrorCode: code,
            }));
            return;
          }

          setState((prev) => ({
            ...prev,
            status: 'ready_approx',
            isLocating: false,
            statusMessage:
              code === 3
                ? 'Using approximate location. Precise fix timed out.'
                : 'Using approximate location.',
            lastErrorCode: code,
          }));
          startLiveWatch();
          startPolling();
        }
      } catch (error) {
        if (sessionIdRef.current !== sessionId) {
          return;
        }

        const code = normalizeErrorCode((error as GeolocationPositionError | undefined)?.code);

        if (code === 1) {
          clearPolling();
          setState((prev) => ({
            ...prev,
            status: 'denied',
            isLocating: false,
            statusMessage: getDeniedMessage(hostname),
            lastErrorCode: code,
          }));
          return;
        }

        if (code === 2) {
          setState((prev) => ({
            ...prev,
            status: 'unavailable',
            isLocating: false,
            statusMessage: 'Location is unavailable. Check GPS/network and retry.',
            lastErrorCode: code,
          }));
          return;
        }

        if (code === 3) {
          setState((prev) => ({
            ...prev,
            status: 'timeout',
            isLocating: false,
            statusMessage: 'Location timed out. Move outdoors and tap "Locate me" again.',
            lastErrorCode: code,
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          status: 'error',
          isLocating: false,
          statusMessage: 'Could not determine location. Tap "Locate me" to retry.',
          lastErrorCode: null,
        }));
      }
    },
    [
      approximateThresholdM,
      clearPolling,
      clearWatching,
      coarseMaximumAgeMs,
      coarseTimeoutMs,
      preciseMaximumAgeMs,
      preciseTimeoutMs,
      startPolling,
    ]
  );

  useEffect(() => {
    runLocateCycleRef.current = runLocateCycle;
  }, [runLocateCycle]);

  const startLocate = useCallback(() => {
    runLocateCycle('manual');
  }, [runLocateCycle]);

  const stop = useCallback(() => {
    sessionIdRef.current += 1;
    clearPolling();
    clearWatching();
    setState((prev) => ({
      ...prev,
      isLocating: false,
    }));
  }, [clearPolling, clearWatching]);

  useEffect(() => {
    if (autoStart) {
      runLocateCycle('auto');
    }

    return () => {
      sessionIdRef.current += 1;
      if (pollIntervalRef.current !== null) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      clearWatching();
    };
  }, [autoStart, clearWatching, runLocateCycle]);

  const hasFix = state.coords !== null;
  const isPrecise = hasFix && !state.isApproximate;

  return useMemo(
    () => ({
      startLocate,
      stop,
      state,
      hasFix,
      isPrecise,
    }),
    [hasFix, isPrecise, startLocate, state, stop]
  );
}
