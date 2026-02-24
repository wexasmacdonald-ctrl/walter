import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  UseWebLocationControllerOptions,
  UseWebLocationControllerResult,
  WebLocationErrorCode,
  WebLocationState,
} from './web-location.types';

const DEFAULT_PRECISE_THRESHOLD_M = 30;
const DEFAULT_COARSE_TIMEOUT_MS = 10000;
const DEFAULT_COARSE_MAX_AGE_MS = 120000;

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

function normalizeErrorCode(code: unknown): WebLocationErrorCode {
  return code === 1 || code === 2 || code === 3 ? code : null;
}

function getDeniedMessage(host: string): string {
  return `Location was denied for ${host}. In Safari use aA > Website Settings > Location > Allow, then retry.`;
}

function normalizeAccuracy(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function useWebLocationController(
  options: UseWebLocationControllerOptions = {}
): UseWebLocationControllerResult {
  const {
    autoStart = false,
    preciseThresholdM = DEFAULT_PRECISE_THRESHOLD_M,
    coarseTimeoutMs = DEFAULT_COARSE_TIMEOUT_MS,
    coarseMaximumAgeMs = DEFAULT_COARSE_MAX_AGE_MS,
  } = options;

  const [state, setState] = useState<WebLocationState>(createInitialState);
  const requestIdRef = useRef(0);
  const coarseTimeoutRef = useRef<number | null>(null);

  const clearCoarseTimeout = useCallback(() => {
    if (coarseTimeoutRef.current !== null) {
      window.clearTimeout(coarseTimeoutRef.current);
      coarseTimeoutRef.current = null;
    }
  }, []);

  const startLocate = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    clearCoarseTimeout();

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
      if (requestIdRef.current !== requestId) {
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

    const onSuccess = (position: GeolocationPosition) => {
      if (requestIdRef.current !== requestId) {
        return;
      }
      clearCoarseTimeout();

      const accuracyM = normalizeAccuracy(position.coords.accuracy);
      const precise = accuracyM !== null && accuracyM <= preciseThresholdM;

      setState({
        status: precise ? 'precise_ready' : 'coarse_ready',
        coords: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
        accuracyM,
        isApproximate: !precise,
        statusMessage: precise ? null : 'Using approximate location.',
        isLocating: false,
        lastErrorCode: null,
      });
    };

    const onError = (error: GeolocationPositionError) => {
      if (requestIdRef.current !== requestId) {
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

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: false,
      timeout: coarseTimeoutMs,
      maximumAge: coarseMaximumAgeMs,
    });
  }, [clearCoarseTimeout, coarseMaximumAgeMs, coarseTimeoutMs, preciseThresholdM]);

  useEffect(() => {
    if (autoStart) {
      startLocate();
    }
    return () => {
      requestIdRef.current += 1;
      clearCoarseTimeout();
    };
  }, [autoStart, clearCoarseTimeout, startLocate]);

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
