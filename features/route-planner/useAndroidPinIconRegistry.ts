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
const TEMPLATE_VERSION = 'v2';
const DEFAULT_CONCURRENCY = 3;

const descriptorCache = new Map<AndroidPinVisualKey, AndroidPinIconDescriptor>();
const inflightCache = new Map<AndroidPinVisualKey, Promise<AndroidPinIconDescriptor | null>>();
const failureLogged = new Set<AndroidPinVisualKey>();

function getNativeModule(): PinIconRendererModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }

  const module = NativeModules[MODULE_NAME] as PinIconRendererModule | undefined;
  return module ?? null;
}

async function generateDescriptor(
  key: AndroidPinVisualKey,
  label: string,
  status: MarkerStatus,
  theme: AndroidPinTheme,
  debug: boolean
): Promise<AndroidPinIconDescriptor | null> {
  const cached = descriptorCache.get(key);
  if (cached) {
    return cached;
  }

  const existingPromise = inflightCache.get(key);
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
        key,
        uri,
        width: ANDROID_PIN_ICON_WIDTH,
        height: ANDROID_PIN_ICON_HEIGHT,
      };
      descriptorCache.set(key, descriptor);
      return descriptor;
    } catch (error) {
      if (debug && !failureLogged.has(key)) {
        failureLogged.add(key);
        console.warn('[MapPins] Pin icon generation failed', { key, error });
      }
      return null;
    }
  })();

  inflightCache.set(key, work);
  try {
    return await work;
  } finally {
    inflightCache.delete(key);
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
      const key = buildAndroidPinVisualKey(normalizedLabel, visual.status, visual.theme);
      if (!dedup.has(key)) {
        dedup.set(key, {
          label: normalizedLabel,
          status: visual.status,
          theme: visual.theme,
        });
      }
    }

    return Array.from(dedup.entries()).map(([key, value]) => ({ key, ...value }));
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

    const seeded = uniqueVisuals.reduce<Record<AndroidPinVisualKey, AndroidPinIconDescriptor>>((acc, visual) => {
      const cached = descriptorCache.get(visual.key);
      if (cached) {
        acc[visual.key] = cached;
      }
      return acc;
    }, {});

    setDescriptors(seeded);

    const queue = uniqueVisuals.filter((visual) => !seeded[visual.key]);
    if (queue.length === 0) {
      setIsPrewarming(false);
      return;
    }

    setIsPrewarming(true);

    const workerCount = Math.min(concurrency, queue.length);
    const runWorker = async () => {
      while (!cancelled) {
        const next = queue.shift();
        if (!next) {
          return;
        }

        const descriptor = await generateDescriptor(
          next.key,
          next.label,
          next.status,
          next.theme,
          debug
        );

        if (cancelled || !descriptor) {
          continue;
        }

        setDescriptors((prev) => {
          if (prev[next.key]) {
            return prev;
          }
          return {
            ...prev,
            [next.key]: descriptor,
          };
        });
      }
    };

    Promise.all(Array.from({ length: workerCount }, () => runWorker())).finally(() => {
      if (!cancelled) {
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
      const key = buildAndroidPinVisualKey(normalizedLabel, status, theme);
      return descriptors[key]?.uri ?? descriptorCache.get(key)?.uri ?? null;
    },
  };
}
