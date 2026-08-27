import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';

type NativeEngineMode = 'native_fused' | 'expo_legacy';
type LocationTier = 'none' | 'coarse' | 'precise';
type AndroidLocationStatus =
  | 'idle'
  | 'requesting_permission'
  | 'settings_required'
  | 'coarse_ready'
  | 'precise_ready'
  | 'denied'
  | 'unavailable'
  | 'error';

type AndroidFusedCapabilities = {
  hasFine: boolean;
  hasCoarse: boolean;
  servicesEnabled: boolean;
  gpsAvailable: boolean;
  settingsResolvable: boolean;
};

type AndroidLocationCoords = {
  lat: number;
  lng: number;
};

type AndroidLocationState = {
  status: AndroidLocationStatus;
  coords: AndroidLocationCoords | null;
  accuracyM: number | null;
  tier: LocationTier;
  message: string | null;
  lastUpdateMs: number | null;
  isLocating: boolean;
  engine: NativeEngineMode;
};

type AndroidTrackingConfig = {
  coarseMaxAgeMs?: number;
  coarseTimeoutMs?: number;
  coarseAcceptAccuracyM?: number;
  preciseTargetAccuracyM?: number;
  intervalMs?: number;
  minUpdateIntervalMs?: number;
  minDistanceM?: number;
};

type NativeStatusEvent = {
  type: 'status';
  status: AndroidLocationStatus;
  message?: string;
};

type NativeFixEvent = {
  type: 'fix';
  tier: 'coarse' | 'precise';
  lat: number;
  lng: number;
  accuracyM?: number | null;
  timestampMs: number;
  provider?: string;
};

type NativeErrorEvent = {
  type: 'error';
  code: string;
  message: string;
};

type NativeLocationEvent = NativeStatusEvent | NativeFixEvent | NativeErrorEvent;

type AndroidFusedLocationModule = {
  getCapabilities: () => Promise<AndroidFusedCapabilities>;
  requestForegroundPermissions: () => Promise<{ fineGranted: boolean; coarseGranted: boolean }>;
  resolveLocationSettings: () => Promise<{ resolved: boolean }>;
  startTracking: (config: AndroidTrackingConfig) => Promise<void>;
  stopTracking: () => Promise<void>;
};

type UseAndroidFusedLocationControllerResult = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  state: AndroidLocationState;
  hasFix: boolean;
  isPrecise: boolean;
};

type UseAndroidFusedLocationControllerOptions = {
  autoStart?: boolean;
};

const NATIVE_EVENT_NAME = 'androidFusedLocationEvent';
// Never present an old provider fix as the phone's current location.
const LOCATION_MAX_AGE_MS = 120000;
const COARSE_ACCEPT_ACCURACY_M = 250;
const PRECISE_TARGET_ACCURACY_M = 30;
const MAX_IMPLAUSIBLE_SPEED_MPS = 120;
const LOCATION_OPERATION_TIMEOUT_MS = 15000;

const nativeModule = (NativeModules.AndroidFusedLocation ?? null) as AndroidFusedLocationModule | null;
// AndroidFusedLocation emits through RCTDeviceEventEmitter in the native
// module, so listen through DeviceEventEmitter rather than constructing a
// NativeEventEmitter around an optional module.
const nativeEventEmitter = nativeModule ? DeviceEventEmitter : null;

function createInitialState(engine: NativeEngineMode): AndroidLocationState {
  return {
    status: 'idle',
    coords: null,
    accuracyM: null,
    tier: 'none',
    message: null,
    lastUpdateMs: null,
    isLocating: false,
    engine,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function distanceMeters(a: AndroidLocationCoords, b: AndroidLocationCoords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRad(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalizeAccuracy(value: unknown): number | null {
  if (!isFiniteNumber(value) || value < 0) {
    return null;
  }
  return value;
}

function deriveMessage(status: AndroidLocationStatus, tier: LocationTier): string | null {
  if (status === 'requesting_permission') {
    return 'Locating...';
  }
  if (status === 'coarse_ready' || tier === 'coarse') {
    return 'Approximate location, refining GPS...';
  }
  if (status === 'settings_required' || status === 'unavailable') {
    return 'GPS/settings required';
  }
  if (status === 'denied') {
    return 'Permission denied';
  }
  if (status === 'error') {
    return 'Location error. Tap retry.';
  }
  return null;
}

async function withLocationTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), LOCATION_OPERATION_TIMEOUT_MS);
    }),
  ]);
}

function isTerminalNonTrackingStatus(status: AndroidLocationStatus): boolean {
  return (
    status === 'idle' ||
    status === 'denied' ||
    status === 'unavailable' ||
    status === 'settings_required' ||
    status === 'error'
  );
}

export function useAndroidFusedLocationController(
  { autoStart = true }: UseAndroidFusedLocationControllerOptions = {}
): UseAndroidFusedLocationControllerResult {
  const isAndroid = Platform.OS === 'android';
  const configuredEngine = process.env.EXPO_PUBLIC_ANDROID_LOCATION_ENGINE as NativeEngineMode | undefined;
  // The custom fused module is not present in every Expo/dev-client runtime.
  // Use the Expo watcher by default so Android location cannot stall inside
  // an unavailable native bridge; production can opt into native_fused via env.
  const engineMode: NativeEngineMode = configuredEngine ?? (__DEV__ ? 'native_fused' : 'expo_legacy');
  const useNativeEngine =
    isAndroid && engineMode === 'native_fused' && Boolean(nativeModule) && Boolean(nativeEventEmitter);

  const [state, setState] = useState<AndroidLocationState>(() => createInitialState(engineMode));
  const nativeSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const legacyWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const mountedRef = useRef(true);
  const activeSessionRef = useRef(0);
  const isStartedRef = useRef(false);

  const applyFix = useCallback((coords: AndroidLocationCoords, accuracyM: number | null, timestampMs: number) => {
    const ageMs = Math.max(0, Date.now() - timestampMs);
    if (ageMs > LOCATION_MAX_AGE_MS) {
      return;
    }

    setState((prev) => {
      if (prev.coords && prev.lastUpdateMs) {
        const elapsedSec = Math.max(0.001, (timestampMs - prev.lastUpdateMs) / 1000);
        const speedMps = distanceMeters(prev.coords, coords) / elapsedSec;
        const hasPoorAccuracy = accuracyM !== null && accuracyM > COARSE_ACCEPT_ACCURACY_M;
        if (speedMps > MAX_IMPLAUSIBLE_SPEED_MPS && hasPoorAccuracy) {
          return prev;
        }
      }

      const tier: LocationTier =
        accuracyM !== null && accuracyM <= PRECISE_TARGET_ACCURACY_M ? 'precise' : 'coarse';
      const status: AndroidLocationStatus = tier === 'precise' ? 'precise_ready' : 'coarse_ready';

      return {
        ...prev,
        coords,
        accuracyM,
        tier,
        lastUpdateMs: timestampMs,
        status,
        isLocating: tier !== 'precise',
        message: deriveMessage(status, tier),
      };
    });
  }, []);

  const cleanupNativeSubscription = useCallback(() => {
    if (nativeSubscriptionRef.current) {
      nativeSubscriptionRef.current.remove();
      nativeSubscriptionRef.current = null;
    }
  }, []);

  const cleanupLegacyWatcher = useCallback(() => {
    if (legacyWatcherRef.current) {
      legacyWatcherRef.current.remove();
      legacyWatcherRef.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    if (!isAndroid) {
      return;
    }

    isStartedRef.current = false;
    activeSessionRef.current += 1;
    cleanupNativeSubscription();
    cleanupLegacyWatcher();

    if (useNativeEngine && nativeModule) {
      try {
        await nativeModule.stopTracking();
      } catch {
        // Keep stop best-effort.
      }
    }

    if (mountedRef.current) {
      setState((prev) => ({
        ...prev,
        isLocating: false,
        status: prev.coords ? prev.status : 'idle',
        message: prev.coords ? prev.message : null,
      }));
    }
  }, [cleanupLegacyWatcher, cleanupNativeSubscription, isAndroid, useNativeEngine]);

  const startNative = useCallback(async () => {
    if (!nativeModule || !nativeEventEmitter) {
      return;
    }

    const session = activeSessionRef.current + 1;
    activeSessionRef.current = session;
    isStartedRef.current = true;
    cleanupNativeSubscription();
    cleanupLegacyWatcher();

    setState((prev) => ({
      ...prev,
      status: 'requesting_permission',
      isLocating: true,
      message: deriveMessage('requesting_permission', prev.tier),
      engine: engineMode,
    }));

    const subscription = nativeEventEmitter.addListener(NATIVE_EVENT_NAME, (event: NativeLocationEvent) => {
      if (!mountedRef.current || activeSessionRef.current !== session) {
        return;
      }

      if (event.type === 'status') {
        if (isTerminalNonTrackingStatus(event.status)) {
          isStartedRef.current = false;
        }
        setState((prev) => {
          const nextTier: LocationTier =
            event.status === 'precise_ready'
              ? 'precise'
              : event.status === 'coarse_ready'
              ? 'coarse'
              : prev.tier;
          return {
            ...prev,
            status: event.status,
            tier: nextTier,
            isLocating: event.status !== 'precise_ready' && event.status !== 'idle',
            message: event.message ?? deriveMessage(event.status, nextTier),
          };
        });
        return;
      }

      if (event.type === 'fix') {
        applyFix(
          { lat: event.lat, lng: event.lng },
          normalizeAccuracy(event.accuracyM),
          isFiniteNumber(event.timestampMs) ? event.timestampMs : Date.now()
        );
        return;
      }

      isStartedRef.current = false;
      setState((prev) => ({
        ...prev,
        status: 'error',
        isLocating: false,
        message: event.message || deriveMessage('error', prev.tier),
      }));
    });
    nativeSubscriptionRef.current = subscription;

    try {
      // Expo owns the Android permission prompt reliably across Expo/RN
      // activity wrappers. The custom native module only needs the resulting
      // grant state to start fused tracking.
      const hasFinePermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      const hasCoarsePermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
      let permissionsGranted = hasFinePermission || hasCoarsePermission;
      if (!permissionsGranted) {
        const requested = await withLocationTimeout(
          PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          ]),
          'Location permission request timed out. Tap retry.'
        );
        permissionsGranted =
          requested[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
          requested[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (activeSessionRef.current !== session || !mountedRef.current) {
        return;
      }
      if (!permissionsGranted) {
        isStartedRef.current = false;
        setState((prev) => ({
          ...prev,
          status: 'denied',
          isLocating: false,
          message: deriveMessage('denied', prev.tier),
        }));
        return;
      }

      let capabilities = await withLocationTimeout(
        nativeModule.getCapabilities(),
        'Location settings check timed out. Tap retry.'
      );
      if (activeSessionRef.current !== session || !mountedRef.current) {
        return;
      }

      const needsServices = !capabilities.servicesEnabled;
      if (needsServices && capabilities.settingsResolvable) {
        const resolution = await withLocationTimeout(
          nativeModule.resolveLocationSettings(),
          'Location settings check timed out. Tap retry.'
        );
        if (activeSessionRef.current !== session || !mountedRef.current) {
          return;
        }
        if (!resolution.resolved) {
          isStartedRef.current = false;
          setState((prev) => ({
            ...prev,
            status: 'settings_required',
            isLocating: false,
            message: deriveMessage('settings_required', prev.tier),
          }));
          return;
        }
        capabilities = await withLocationTimeout(
          nativeModule.getCapabilities(),
          'Location settings check timed out. Tap retry.'
        );
        if (activeSessionRef.current !== session || !mountedRef.current) {
          return;
        }
      }

      if (!capabilities.servicesEnabled) {
        isStartedRef.current = false;
        setState((prev) => ({
          ...prev,
          status: 'unavailable',
          isLocating: false,
          message: deriveMessage('unavailable', prev.tier),
        }));
        return;
      }

      // GPS can be unavailable while network location still works.
      // In that case we still start tracking and allow coarse fixes.
      if (!capabilities.gpsAvailable && capabilities.settingsResolvable) {
        const resolution = await withLocationTimeout(
          nativeModule.resolveLocationSettings(),
          'Location settings check timed out. Tap retry.'
        );
        if (activeSessionRef.current !== session || !mountedRef.current) {
          return;
        }
        if (resolution.resolved) {
          capabilities = await withLocationTimeout(
            nativeModule.getCapabilities(),
            'Location settings check timed out. Tap retry.'
          );
          if (activeSessionRef.current !== session || !mountedRef.current) {
            return;
          }
        } else {
          setState((prev) => ({
            ...prev,
            message: 'GPS is off. Using approximate network location.',
          }));
        }
      }

      await withLocationTimeout(nativeModule.startTracking({
        coarseMaxAgeMs: 15000,
        coarseTimeoutMs: 10000,
        coarseAcceptAccuracyM: COARSE_ACCEPT_ACCURACY_M,
        preciseTargetAccuracyM: PRECISE_TARGET_ACCURACY_M,
        intervalMs: 2000,
        minUpdateIntervalMs: 1000,
        minDistanceM: 1,
      }), 'Location tracking failed to start. Tap retry.');

      // Some Samsung/Google Play Services combinations do not immediately
      // deliver a fused high-accuracy callback indoors. Ask Expo's balanced
      // provider for a network-assisted bootstrap fix as a fallback.
      try {
        const fallbackPosition = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<Location.LocationObject | null>((resolve) => {
            setTimeout(() => resolve(null), 12000);
          }),
        ]);
        if (fallbackPosition && activeSessionRef.current === session && mountedRef.current) {
          applyFix(
            { lat: fallbackPosition.coords.latitude, lng: fallbackPosition.coords.longitude },
            normalizeAccuracy(fallbackPosition.coords.accuracy),
            fallbackPosition.timestamp
          );
        }
      } catch {
        // Native tracking remains active and may still produce a GPS fix.
      }
    } catch (error) {
      if (activeSessionRef.current !== session || !mountedRef.current) {
        return;
      }
      isStartedRef.current = false;
      setState((prev) => ({
        ...prev,
        status: 'error',
        isLocating: false,
        message: error instanceof Error ? error.message : deriveMessage('error', prev.tier),
      }));
    }
  }, [applyFix, cleanupLegacyWatcher, cleanupNativeSubscription, engineMode]);

  const startLegacy = useCallback(async () => {
    const session = activeSessionRef.current + 1;
    activeSessionRef.current = session;
    isStartedRef.current = true;
    cleanupNativeSubscription();
    cleanupLegacyWatcher();

    setState((prev) => ({
      ...prev,
      status: 'requesting_permission',
      isLocating: true,
      message: deriveMessage('requesting_permission', prev.tier),
      engine: 'expo_legacy',
    }));

    try {
      let permissions = await withLocationTimeout(
        Location.getForegroundPermissionsAsync(),
        'Location permission request timed out. Tap retry.'
      );
      if (permissions.status !== 'granted') {
        permissions = await withLocationTimeout(
          Location.requestForegroundPermissionsAsync(),
          'Location permission request timed out. Tap retry.'
        );
      }
      if (activeSessionRef.current !== session || !mountedRef.current) {
        return;
      }
      if (permissions.status !== 'granted') {
        isStartedRef.current = false;
        setState((prev) => ({
          ...prev,
          status: 'denied',
          isLocating: false,
          message: deriveMessage('denied', prev.tier),
        }));
        return;
      }

      legacyWatcherRef.current = await withLocationTimeout(
        Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 2000,
            distanceInterval: 1,
          },
          (position) => {
            if (activeSessionRef.current !== session || !mountedRef.current) {
              return;
            }
            applyFix(
              { lat: position.coords.latitude, lng: position.coords.longitude },
              normalizeAccuracy(position.coords.accuracy),
              position.timestamp
            );
          }
        ),
        'Location tracking failed to start. Tap retry.'
      );
    } catch (error) {
      if (activeSessionRef.current !== session || !mountedRef.current) {
        return;
      }
      isStartedRef.current = false;
      setState((prev) => ({
        ...prev,
        status: 'error',
        isLocating: false,
        message: error instanceof Error ? error.message : deriveMessage('error', prev.tier),
      }));
    }
  }, [applyFix, cleanupLegacyWatcher, cleanupNativeSubscription]);

  const start = useCallback(async () => {
    if (!isAndroid) {
      return;
    }
    if (useNativeEngine) {
      await startNative();
      return;
    }
    await startLegacy();
  }, [isAndroid, startLegacy, startNative, useNativeEngine]);

  useEffect(() => {
    mountedRef.current = true;
    if (isAndroid && autoStart) {
      void start();
    }
    return () => {
      mountedRef.current = false;
      if (isAndroid) {
        void stop();
      }
    };
  }, [autoStart, isAndroid, start, stop]);

  useEffect(() => {
    if (!isAndroid) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!mountedRef.current) {
        return;
      }
      if (nextState === 'active') {
        if (!autoStart || isStartedRef.current) {
          return;
        }
        void start();
        return;
      }
      isStartedRef.current = false;
      void stop();
    });

    return () => {
      subscription.remove();
    };
  }, [autoStart, isAndroid, start, stop]);

  const hasFix = Boolean(state.coords);
  const isPrecise = state.tier === 'precise';

  return useMemo(
    () => ({
      start,
      stop,
      state,
      hasFix,
      isPrecise,
    }),
    [hasFix, isPrecise, start, state, stop]
  );
}

export type {
  AndroidLocationState,
  AndroidLocationStatus,
  LocationTier,
  UseAndroidFusedLocationControllerResult,
};
