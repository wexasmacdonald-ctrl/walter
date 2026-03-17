import { useEffect, useMemo, useState } from 'react';
import { NativeModules, Platform } from 'react-native';

import {
  ANDROID_PIN_ICON_HEIGHT,
  ANDROID_PIN_ICON_WIDTH,
  buildAndroidPinVisualKey,
  normalizeMarkerLabel,
  type AndroidPinIconDescriptor,
  type AndroidPinTheme,
  type AndroidPinVisualKey,
  type MarkerStatus,
} from './marker-icon-cache';

export type AndroidMarkerVisualInput = {
  label: string;
  status: MarkerStatus;
  theme: AndroidPinTheme;
};

type AndroidPinIconRegistryOptions = {
  debug?: boolean;
  concurrency?: number;
};

type AndroidPinIconRegistryResult = {
  descriptors: Record<AndroidPinVisualKey, AndroidPinIconDescriptor>;
  isPrewarming: boolean;
  getIconUri: (label: string, status: MarkerStatus, theme: AndroidPinTheme) => string | null;
};

type PinIconRendererModule = {
  generatePinIcon: (
    label: string,
    status: MarkerStatus,
    theme: AndroidPinTheme,
    templateVersion: string
  ) => Promise<string>;
};

const MODULE_NAME = 'PinIconRenderer';
const TEMPLATE_VERSION = 'v3';
const DEFAULT_CONCURRENCY = 3;

const descriptorCache = new Map<string, AndroidPinIconDescriptor>();
const inflightCache = new Map<string, Promise<AndroidPinIconDescriptor | null>>();
const failureLogged = new Set<string>();

function buildRegistryCacheKey(label: string, status: MarkerStatus, theme: AndroidPinTheme): string {
  const normalizedLabel = normalizeMarkerLabel(label) || '?';
  const visualKey = buildAndroidPinVisualKey(normalizedLabel, status, theme);
  return `${visualKey}|${TEMPLATE_VERSION}`;
}

function getNativeModule(): PinIconRendererModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }

  const module = NativeModules[MODULE_NAME] as PinIconRendererModule | undefined;
  return module ?? null;
}

async function generateDescriptor(
  cacheKey: string,
  visualKey: AndroidPinVisualKey,
  label: string,
  status: MarkerStatus,
  theme: AndroidPinTheme,
  debug: boolean
): Promise<AndroidPinIconDescriptor | null> {
  const cached = descriptorCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const existingPromise = inflightCache.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const nativeModule = getNativeModule();
  if (!nativeModule) {
    return null;
  }

  const work = (async () => {
    try {
      const uri = await nativeModule.generatePinIcon(label, status, theme, TEMPLATE_VERSION);
      const descriptor: AndroidPinIconDescriptor = {
        key: visualKey,
        uri,
        width: ANDROID_PIN_ICON_WIDTH,
        height: ANDROID_PIN_ICON_HEIGHT,
      };
      descriptorCache.set(cacheKey, descriptor);
      return descriptor;
    } catch (error) {
      if (debug && !failureLogged.has(cacheKey)) {
        failureLogged.add(cacheKey);
        if (__DEV__) console.warn('[MapPins] Pin icon generation failed', { cacheKey, error });
      }
      return null;
    }
  })();

  inflightCache.set(cacheKey, work);
  try {
    return await work;
  } finally {
    inflightCache.delete(cacheKey);
  }
}

export function useAndroidPinIconRegistry(
  visuals: AndroidMarkerVisualInput[],
  options: AndroidPinIconRegistryOptions = {}
): AndroidPinIconRegistryResult {
  const debug = Boolean(options.debug);
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const [isPrewarming, setIsPrewarming] = useState(false);
  const [descriptors, setDescriptors] = useState<Record<AndroidPinVisualKey, AndroidPinIconDescriptor>>({});

  const uniqueVisuals = useMemo(() => {
    const dedup = new Map<AndroidPinVisualKey, AndroidMarkerVisualInput>();

    for (const visual of visuals) {
      const normalizedLabel = normalizeMarkerLabel(visual.label) || '?';
      const visualKey = buildAndroidPinVisualKey(normalizedLabel, visual.status, visual.theme);
      if (!dedup.has(visualKey)) {
        dedup.set(visualKey, {
          label: normalizedLabel,
          status: visual.status,
          theme: visual.theme,
        });
      }
    }

    return Array.from(dedup.entries()).map(([visualKey, value]) => ({
      visualKey,
      cacheKey: buildRegistryCacheKey(value.label, value.status, value.theme),
      ...value,
    }));
  }, [visuals]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setDescriptors({});
      setIsPrewarming(false);
      return;
    }

    if (uniqueVisuals.length === 0) {
      setDescriptors({});
      setIsPrewarming(false);
      return;
    }

    let cancelled = false;

    const seeded = uniqueVisuals.reduce<Record<AndroidPinVisualKey, AndroidPinIconDescriptor>>(
      (acc, visual) => {
        const cached = descriptorCache.get(visual.cacheKey);
        if (cached) {
          acc[visual.visualKey] = cached;
        }
        return acc;
      },
      {}
    );

    setDescriptors(seeded);

    const queue = uniqueVisuals.filter((visual) => !seeded[visual.visualKey]);
    if (queue.length === 0) {
      setIsPrewarming(false);
      return;
    }

    setIsPrewarming(true);

    const workerCount = Math.min(concurrency, queue.length);
    const resolved: Record<AndroidPinVisualKey, AndroidPinIconDescriptor> = { ...seeded };
    const runWorker = async () => {
      while (!cancelled) {
        const next = queue.shift();
        if (!next) {
          return;
        }

        const descriptor = await generateDescriptor(
          next.cacheKey,
          next.visualKey,
          next.label,
          next.status,
          next.theme,
          debug
        );

        if (cancelled || !descriptor) {
          continue;
        }
        resolved[next.visualKey] = descriptor;
      }
    };

    Promise.all(Array.from({ length: workerCount }, () => runWorker())).finally(() => {
      if (!cancelled) {
        setDescriptors(resolved);
        setIsPrewarming(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [concurrency, debug, uniqueVisuals]);

  return {
    descriptors,
    isPrewarming,
    getIconUri: (label, status, theme) => {
      const normalizedLabel = normalizeMarkerLabel(label) || '?';
      const visualKey = buildAndroidPinVisualKey(normalizedLabel, status, theme);
      const cacheKey = buildRegistryCacheKey(normalizedLabel, status, theme);
      return descriptors[visualKey]?.uri ?? descriptorCache.get(cacheKey)?.uri ?? null;
    },
  };
}
